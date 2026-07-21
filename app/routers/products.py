from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db_warehouse
from app.models.audit_log import AuditLog
from app.models.product import Product
from app.models.product_raw_material import ProductRawMaterial
from app.models.raw_material import RawMaterial
from app.models.user import User
from app.models.warehouse import WarehouseItem
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate


class BulkDeleteRequest(BaseModel):
    ids: list[int]

router = APIRouter(prefix="/products", tags=["products"])


def round2(value: float) -> float:
    """Математическое округление до 2 знаков после запятой (0.005 → 0.01)."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _audit(db: Session, entity_type: str, entity_id: int, action: str, old_data: dict | None, new_data: dict | None, user: User | None = None):
    import json
    log = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_data=json.dumps(old_data, ensure_ascii=False, default=str) if old_data else None,
        new_data=json.dumps(new_data, ensure_ascii=False, default=str) if new_data else None,
        user_id=user.id if user else None,
        user_name=user.full_name or user.username if user else None,
    )
    db.add(log)


@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_products(data: BulkDeleteRequest, db: Session = Depends(get_db_warehouse)):
    deleted = 0
    for pid in data.ids:
        product = db.get(Product, pid)
        if product:
            db.delete(product)
            deleted += 1
    db.commit()
    return {"deleted": deleted}


class CoefficientRequest(BaseModel):
    raw_material_id: int
    product_width_mm: int
    product_height_mm: int


class CoefficientResponse(BaseModel):
    coefficient: int
    raw_material_name: str
    raw_material_width_mm: int
    raw_material_height_mm: int


def calc_coefficient(mat_w: int, mat_h: int, prod_w: int, prod_h: int) -> int:
    if prod_w <= 0 or prod_h <= 0:
        return 1
    layout1 = (mat_w // prod_w) * (mat_h // prod_h)
    layout2 = (mat_w // prod_h) * (mat_h // prod_w)
    return max(layout1, layout2, 1)


def _sync_raw_materials(product: Product, raw_materials_list: list, db: Session):
    """Sync the junction table for multi-material products (components)."""
    db.execute(
        select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
    )
    for prm in list(product.raw_materials):
        db.delete(prm)
    db.flush()
    for i, item in enumerate(raw_materials_list):
        prm = ProductRawMaterial(
            product_id=product.id,
            raw_material_id=getattr(item, "raw_material_id", None),
            component_product_id=getattr(item, "component_product_id", None),
            name=getattr(item, "name", None),
            coefficient=getattr(item, "coefficient", 1.0) or 1.0,
            cut_width_mm=getattr(item, "cut_width_mm", None),
            cut_height_mm=getattr(item, "cut_height_mm", None),
            quantity_per_unit=getattr(item, "quantity_per_unit", 1) or 1,
            price_per_unit=getattr(item, "price_per_unit", None),
            sort_order=getattr(item, "sort_order", i) or i,
        )
        db.add(prm)
    if raw_materials_list and not product.raw_material_id:
        first = raw_materials_list[0]
        if getattr(first, "raw_material_id", None):
            product.raw_material_id = first.raw_material_id
            product.material_coefficient = first.coefficient or 1.0


def _product_has_raw_material(product: Product) -> bool:
    """True if product is linked to any raw material or component product."""
    return bool(product.raw_material_id) or bool(product.raw_materials)


def _detect_cycle(product_id: int, db: Session, _visited: set | None = None) -> bool:
    """DFS to detect cycle in product BOM (component_product_id chain).
    Returns True if a cycle is detected."""
    if _visited is None:
        _visited = set()
    if product_id in _visited:
        return True
    _visited.add(product_id)
    prms = db.execute(
        select(ProductRawMaterial).where(
            ProductRawMaterial.product_id == product_id,
            ProductRawMaterial.component_product_id.is_not(None),
        )
    ).scalars().all()
    for prm in prms:
        if prm.component_product_id is None:
            continue
        if _detect_cycle(prm.component_product_id, db, _visited):
            return True
    _visited.discard(product_id)
    return False


def _calc_auto_unit_price(product: Product, db: Session, _visited: set | None = None) -> float | None:
    """If all components have price (own price_per_unit or recursive auto_unit_price
    of nested product), return sum(price * quantity_per_unit).
    Returns None if no components or any component lacks price."""
    if _visited is None:
        _visited = set()
    if product.id in _visited:
        return None
    _visited.add(product.id)
    prms = db.execute(
        select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
        .order_by(ProductRawMaterial.sort_order, ProductRawMaterial.id)
    ).scalars().all()
    if not prms:
        _visited.discard(product.id)
        return None
    total = 0.0
    for prm in prms:
        if prm.price_per_unit is not None:
            total += (prm.price_per_unit or 0) * (prm.quantity_per_unit or 1)
        elif prm.component_product_id:
            sub = db.get(Product, prm.component_product_id)
            if not sub:
                _visited.discard(product.id)
                return None
            sub_price = _calc_auto_unit_price(sub, db, _visited)
            if sub_price is None:
                _visited.discard(product.id)
                return None
            total += sub_price * (prm.quantity_per_unit or 1)
        else:
            _visited.discard(product.id)
            return None
    _visited.discard(product.id)
    return round2(total)


def _ensure_warehouse_for_product(product: Product, db: Session) -> None:
    """Create a zero-quantity warehouse item for products backed by raw material.
    Removes the warehouse item if the product no longer has any raw material and the stock is empty."""
    existing = db.execute(
        select(WarehouseItem).where(WarehouseItem.product_id == product.id)
    ).scalar_one_or_none()

    has_rm = _product_has_raw_material(product)

    if has_rm and not existing:
        db.add(WarehouseItem(
            product_id=product.id,
            quantity=0,
            min_quantity=0,
        ))
    elif not has_rm and existing and (existing.quantity or 0) <= 0:
        db.delete(existing)


def _remove_warehouse_for_product(product: Product, db: Session) -> None:
    """Delete warehouse item linked to product (used on product delete)."""
    existing = db.execute(
        select(WarehouseItem).where(WarehouseItem.product_id == product.id)
    ).scalar_one_or_none()
    if existing:
        db.delete(existing)


def _enrich(product: Product, db: Session) -> dict:
    raw_material_name = None
    if product.raw_material_id:
        rm = db.get(RawMaterial, product.raw_material_id)
        raw_material_name = rm.name if rm else None

    raw_materials_out = []
    for prm in (product.raw_materials or []):
        rm = db.get(RawMaterial, prm.raw_material_id) if prm.raw_material_id else None
        sub_product = db.get(Product, prm.component_product_id) if prm.component_product_id else None
        raw_materials_out.append({
            "raw_material_id": prm.raw_material_id,
            "component_product_id": prm.component_product_id,
            "coefficient": prm.coefficient,
            "name": prm.name,
            "cut_width_mm": prm.cut_width_mm,
            "cut_height_mm": prm.cut_height_mm,
            "quantity_per_unit": prm.quantity_per_unit,
            "price_per_unit": prm.price_per_unit,
            "sort_order": prm.sort_order,
            "raw_material_name": rm.name if rm else None,
            "raw_material_width_mm": rm.width_mm if rm else None,
            "raw_material_height_mm": rm.height_mm if rm else None,
            "component_product_name": sub_product.name if sub_product else None,
            "component_product_unit_type": sub_product.unit_type if sub_product else None,
        })

    auto_price = _calc_auto_unit_price(product, db)
    final_unit_price = auto_price if auto_price is not None else product.unit_price
    has_components = bool(raw_materials_out)

    return ProductOut(
        id=product.id,
        name=product.name,
        description=product.description,
        unit_price=final_unit_price,
        unit_type=product.unit_type,
        category=product.category,
        formula=product.formula,
        formula_script=product.formula_script,
        raw_material_id=product.raw_material_id,
        material_coefficient=product.material_coefficient,
        created_at=product.created_at,
        raw_material_name=raw_material_name,
        raw_materials=raw_materials_out,
        supplier_url=product.supplier_url,
        default_cut_width_mm=product.default_cut_width_mm,
        default_cut_height_mm=product.default_cut_height_mm,
        auto_unit_price=auto_price,
        has_components=has_components,
    )


@router.get("", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db_warehouse)):
    products = db.execute(select(Product).order_by(Product.id)).scalars().all()
    return [_enrich(p, db) for p in products]


@router.get("/coefficient", response_model=CoefficientResponse)
def get_coefficient(raw_material_id: int, product_width_mm: int, product_height_mm: int, db: Session = Depends(get_db_warehouse)):
    material = db.get(RawMaterial, raw_material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    if not material.width_mm or not material.height_mm:
        raise HTTPException(status_code=400, detail="Raw material has no dimensions set")
    coeff = calc_coefficient(material.width_mm, material.height_mm, product_width_mm, product_height_mm)
    return CoefficientResponse(
        coefficient=coeff,
        raw_material_name=material.name,
        raw_material_width_mm=material.width_mm,
        raw_material_height_mm=material.height_mm,
    )


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db_warehouse)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return _enrich(product, db)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(data: ProductCreate, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    product_data = data.model_dump(exclude={"raw_materials"})
    if "unit_price" in product_data and product_data["unit_price"] is not None:
        product_data["unit_price"] = round2(product_data["unit_price"])
    product = Product(**product_data)
    db.add(product)
    db.flush()
    if data.raw_materials:
        _sync_raw_materials(product, data.raw_materials, db)
    elif data.raw_material_id:
        _sync_raw_materials(product, [type("RM", (), {"raw_material_id": data.raw_material_id, "coefficient": data.material_coefficient})()], db)
    db.flush()
    if _detect_cycle(product.id, db):
        db.rollback()
        raise HTTPException(status_code=400, detail="Циклическая зависимость: продукт не может содержать сам себя через под-продукты")
    _ensure_warehouse_for_product(product, db)
    _audit(db, "product", product.id, "create", None, data.model_dump(), user)
    db.commit()
    db.refresh(product)
    return _enrich(product, db)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    old_data = {c.name: getattr(product, c.name) for c in Product.__table__.columns}
    update_dict = data.model_dump(exclude_unset=True, exclude={"raw_materials"})
    if "unit_price" in update_dict and update_dict["unit_price"] is not None:
        update_dict["unit_price"] = round2(update_dict["unit_price"])
    for key, val in update_dict.items():
        setattr(product, key, val)
    if data.raw_materials is not None:
        _sync_raw_materials(product, data.raw_materials, db)
    db.flush()
    if _detect_cycle(product.id, db):
        db.rollback()
        raise HTTPException(status_code=400, detail="Циклическая зависимость: продукт не может содержать сам себя через под-продукты")
    _ensure_warehouse_for_product(product, db)
    new_data = {c.name: getattr(product, c.name) for c in Product.__table__.columns}
    _audit(db, "product", product.id, "update", old_data, new_data, user)
    db.commit()
    db.refresh(product)
    return _enrich(product, db)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    old_data = {c.name: getattr(product, c.name) for c in Product.__table__.columns}
    _remove_warehouse_for_product(product, db)
    _audit(db, "product", product.id, "delete", old_data, None, user)
    db.delete(product)
    db.commit()
