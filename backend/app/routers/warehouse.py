from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db_warehouse
from app.models.audit_log import AuditLog
from app.models.order import OrderItem
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.stock_writeoff import StockWriteoff
from app.models.user import User
from app.models.warehouse import WarehouseItem
from app.schemas.warehouse import WarehouseCreate, WarehouseOut, WarehouseUpdate
from app.services.hermes_service import notify_all


class BulkDeleteRequest(BaseModel):
    ids: list[int]

router = APIRouter(prefix="/warehouse", tags=["warehouse"])


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
def bulk_delete_warehouse(data: BulkDeleteRequest, db: Session = Depends(get_db_warehouse)):
    deleted = 0
    for wid in data.ids:
        item = db.get(WarehouseItem, wid)
        if item:
            db.delete(item)
            deleted += 1
    db.commit()
    return {"deleted": deleted}


@router.get("", response_model=list[WarehouseOut])
def list_warehouse(db: Session = Depends(get_db_warehouse)):
    items = db.execute(select(WarehouseItem).order_by(WarehouseItem.id)).scalars().all()

    pending_counts: dict[int, int] = {}
    pending_rows = db.execute(
        select(OrderItem.manual_writeoff_raw_material_id).where(OrderItem.manual_writeoff_pending == True)
    ).scalars().all()
    for rm_id in pending_rows:
        if rm_id:
            pending_counts[rm_id] = pending_counts.get(rm_id, 0) + 1

    return [_enrich(i, db, pending_counts) for i in items]


@router.get("/{item_id}", response_model=WarehouseOut)
def get_warehouse_item(item_id: int, db: Session = Depends(get_db_warehouse)):
    item = db.execute(
        select(WarehouseItem).where(WarehouseItem.id == item_id)
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Warehouse item not found")

    pending_counts: dict[int, int] = {}
    pending_rows = db.execute(
        select(OrderItem.manual_writeoff_raw_material_id).where(OrderItem.manual_writeoff_pending == True)
    ).scalars().all()
    for rm_id in pending_rows:
        if rm_id:
            pending_counts[rm_id] = pending_counts.get(rm_id, 0) + 1

    return _enrich(item, db, pending_counts)


@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse_item(data: WarehouseCreate, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    if data.product_id:
        existing = db.execute(
            select(WarehouseItem).where(WarehouseItem.product_id == data.product_id)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Warehouse item for this product already exists")
    if data.raw_material_id:
        existing = db.execute(
            select(WarehouseItem).where(WarehouseItem.raw_material_id == data.raw_material_id)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Warehouse item for this raw material already exists")
    item = WarehouseItem(**data.model_dump())
    db.add(item)
    db.flush()
    _audit(db, "warehouse", item.id, "create", None, data.model_dump(), user)
    db.commit()
    db.refresh(item)
    return _enrich(item, db)


@router.put("/{item_id}", response_model=WarehouseOut)
def update_warehouse_item(item_id: int, data: WarehouseUpdate, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    item = db.get(WarehouseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Warehouse item not found")

    old_quantity = item.quantity
    old_data = {c.name: getattr(item, c.name) for c in WarehouseItem.__table__.columns}
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(item, key, val)
    new_data = {c.name: getattr(item, c.name) for c in WarehouseItem.__table__.columns}
    _audit(db, "warehouse", item.id, "update", old_data, new_data, user)
    db.commit()
    db.refresh(item)

    if item.min_quantity > 0 and item.quantity <= item.min_quantity and old_quantity > item.min_quantity:
        item_name = f"#{item_id}"
        if item.product_id:
            product = db.get(Product, item.product_id)
            item_name = product.name if product else item_name
        elif item.raw_material_id:
            rm = db.get(RawMaterial, item.raw_material_id)
            item_name = rm.name if rm else item_name
        try:
            notify_all("low_stock", {
                "item_id": item_id,
                "product_id": item.product_id,
                "raw_material_id": item.raw_material_id,
                "item_name": item_name,
                "quantity": item.quantity,
                "min_quantity": item.min_quantity,
            }, db)
        except Exception:
            pass

    return _enrich(item, db)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_warehouse_item(item_id: int, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    item = db.get(WarehouseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Warehouse item not found")
    old_data = {c.name: getattr(item, c.name) for c in WarehouseItem.__table__.columns}
    _audit(db, "warehouse", item.id, "delete", old_data, None, user)
    db.delete(item)
    db.commit()


class ConfirmManualWriteoffRequest(BaseModel):
    order_item_id: int


class ManualWriteoffPendingOut(BaseModel):
    order_id: int
    order_item_id: int
    raw_material_id: int
    raw_material_name: str | None = None
    cut_width_mm: float | None = None
    cut_height_mm: float | None = None
    quantity: float | None = None
    already_written_off: bool = False
    writeoff_id: int | None = None


@router.get("/{item_id}/pending-writeoffs", response_model=list[ManualWriteoffPendingOut])
def get_pending_writeoffs(item_id: int, db: Session = Depends(get_db_warehouse)):
    wh_item = db.get(WarehouseItem, item_id)
    if not wh_item:
        raise HTTPException(status_code=404, detail="Warehouse item not found")
    if not wh_item.raw_material_id:
        return []
    pending = db.execute(
        select(OrderItem).where(
            OrderItem.manual_writeoff_pending == True,
            OrderItem.manual_writeoff_raw_material_id == wh_item.raw_material_id,
        )
    ).scalars().all()
    result = []
    for oi in pending:
        rm = db.get(RawMaterial, oi.manual_writeoff_raw_material_id)
        existing_writeoff = db.execute(
            select(StockWriteoff).where(
                StockWriteoff.order_id == oi.order_id,
                StockWriteoff.raw_material_id == oi.manual_writeoff_raw_material_id,
            )
        ).scalar_one_or_none()
        result.append(ManualWriteoffPendingOut(
            order_id=oi.order_id,
            order_item_id=oi.id,
            raw_material_id=oi.manual_writeoff_raw_material_id,
            raw_material_name=rm.name if rm else None,
            cut_width_mm=oi.manual_writeoff_cut_width_mm,
            cut_height_mm=oi.manual_writeoff_cut_height_mm,
            quantity=oi.manual_writeoff_quantity,
            already_written_off=existing_writeoff is not None,
            writeoff_id=existing_writeoff.id if existing_writeoff else None,
        ))
    return result


@router.post("/{item_id}/confirm-manual-writeoff", response_model=ManualWriteoffPendingOut)
def confirm_manual_writeoff(
    item_id: int,
    data: ConfirmManualWriteoffRequest,
    db: Session = Depends(get_db_warehouse),
    user: User = Depends(get_current_user),
):
    wh_item = db.get(WarehouseItem, item_id)
    if not wh_item:
        raise HTTPException(status_code=404, detail="Warehouse item not found")

    oi = db.get(OrderItem, data.order_item_id)
    if not oi:
        raise HTTPException(status_code=404, detail="Order item not found")
    if not oi.manual_writeoff_pending:
        raise HTTPException(status_code=400, detail="Order item is not pending manual writeoff")
    if oi.manual_writeoff_raw_material_id != wh_item.raw_material_id:
        raise HTTPException(status_code=400, detail="Raw material mismatch")

    rm = db.get(RawMaterial, oi.manual_writeoff_raw_material_id)
    if not rm:
        raise HTTPException(status_code=404, detail="Raw material not found")

    qty_to_writeoff = oi.manual_writeoff_quantity or 0
    if qty_to_writeoff <= 0:
        raise HTTPException(status_code=400, detail="Writeoff quantity must be > 0")
    if wh_item.quantity < qty_to_writeoff:
        raise HTTPException(status_code=400, detail=f"Not enough stock: have {wh_item.quantity}, need {qty_to_writeoff}")

    wh_item.quantity -= qty_to_writeoff

    writeoff = StockWriteoff(
        item_type="raw_material",
        raw_material_id=oi.manual_writeoff_raw_material_id,
        quantity=qty_to_writeoff,
        reason=f"Ручное списание, Заказ #{oi.order_id}",
        order_id=oi.order_id,
        created_by=user.id,
        created_by_name=user.full_name or user.username,
    )
    db.add(writeoff)

    oi.manual_writeoff_pending = False
    db.commit()

    return ManualWriteoffPendingOut(
        order_id=oi.order_id,
        order_item_id=oi.id,
        raw_material_id=oi.manual_writeoff_raw_material_id,
        raw_material_name=rm.name,
        cut_width_mm=oi.manual_writeoff_cut_width_mm,
        cut_height_mm=oi.manual_writeoff_cut_height_mm,
        quantity=oi.manual_writeoff_quantity,
    )


@router.delete("/pending-writeoff/{order_item_id}")
def cancel_pending_writeoff(
    order_item_id: int,
    db: Session = Depends(get_db_warehouse),
    user: User = Depends(get_current_user),
):
    oi = db.get(OrderItem, order_item_id)
    if not oi:
        raise HTTPException(status_code=404, detail="Order item not found")
    if not oi.manual_writeoff_pending:
        raise HTTPException(status_code=400, detail="Order item is not pending manual writeoff")

    if oi.manual_writeoff_raw_material_id:
        existing_writeoff = db.execute(
            select(StockWriteoff).where(
                StockWriteoff.order_id == oi.order_id,
                StockWriteoff.raw_material_id == oi.manual_writeoff_raw_material_id,
            )
        ).scalar_one_or_none()
        if existing_writeoff:
            wi = db.execute(
                select(WarehouseItem).where(WarehouseItem.raw_material_id == oi.manual_writeoff_raw_material_id)
            ).scalar_one_or_none()
            if wi:
                wi.quantity += existing_writeoff.quantity
            db.delete(existing_writeoff)

    oi.manual_writeoff_pending = False
    db.commit()
    return {"ok": True}


def _enrich(item: WarehouseItem, db: Session, pending_counts: dict[int, int] | None = None) -> WarehouseOut:
    product = db.get(Product, item.product_id) if item.product_id else None
    raw_material = db.get(RawMaterial, item.raw_material_id) if item.raw_material_id else None
    return WarehouseOut(
        id=item.id,
        product_id=item.product_id,
        raw_material_id=item.raw_material_id,
        quantity=item.quantity,
        min_quantity=item.min_quantity,
        defective_quantity=item.defective_quantity,
        defective_reason=item.defective_reason,
        stock_calculation_script=item.stock_calculation_script,
        display_format_script=item.display_format_script,
        product_name=product.name if product else None,
        product_unit_type=product.unit_type if product else None,
        raw_material_name=raw_material.name if raw_material else None,
        raw_material_unit_type=raw_material.unit_type if raw_material else None,
        raw_material_roll_length_m=raw_material.roll_length_m if raw_material else None,
        pending_writeoffs_count=pending_counts.get(item.raw_material_id, 0) if pending_counts and item.raw_material_id else 0,
    )
