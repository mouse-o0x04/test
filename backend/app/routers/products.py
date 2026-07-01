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
    """Sync the junction table for multi-material products."""
    db.execute(
        select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
    )
    for prm in list(product.raw_materials):
        db.delete(prm)
    db.flush()
    for item in raw_materials_list:
        prm = ProductRawMaterial(
            product_id=product.id,
            raw_material_id=item.raw_material_id,
            coefficient=item.coefficient,
        )
        db.add(prm)
    if raw_materials_list and not product.raw_material_id:
        product.raw_material_id = raw_materials_list[0].raw_material_id
        product.material_coefficient = raw_materials_list[0].coefficient


def _enrich(product: Product, db: Session) -> dict:
    raw_material_name = None
    if product.raw_material_id:
        rm = db.get(RawMaterial, product.raw_material_id)
        raw_material_name = rm.name if rm else None

    raw_materials_out = []
    for prm in (product.raw_materials or []):
        rm = db.get(RawMaterial, prm.raw_material_id)
        raw_materials_out.append({
            "raw_material_id": prm.raw_material_id,
            "coefficient": prm.coefficient,
            "raw_material_name": rm.name if rm else None,
            "raw_material_width_mm": rm.width_mm if rm else None,
            "raw_material_height_mm": rm.height_mm if rm else None,
        })

    return ProductOut(
        id=product.id,
        name=product.name,
        description=product.description,
        unit_price=product.unit_price,
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
    _audit(db, "product", product.id, "delete", old_data, None, user)
    db.delete(product)
    db.commit()
