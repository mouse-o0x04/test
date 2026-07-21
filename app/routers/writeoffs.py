import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import SessionWarehouse, get_db_warehouse
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.stock_writeoff import StockWriteoff
from app.models.user import User
from app.models.warehouse import WarehouseItem
from app.schemas.stock_writeoff import WriteoffCreate, WriteoffOut

logger = logging.getLogger("writeoffs")

router = APIRouter(prefix="/writeoffs", tags=["writeoffs"])


@router.get("", response_model=list[WriteoffOut])
def list_writeoffs(
    db: Session = Depends(get_db_warehouse),
    user: User = Depends(get_current_user),
):
    rows = db.execute(select(StockWriteoff).order_by(StockWriteoff.created_at.desc()).limit(200)).scalars().all()
    result = []
    for w in rows:
        item_name = None
        unit_price = None
        roll_width = None
        if w.product_id:
            p = db.get(Product, w.product_id)
            if p:
                item_name = p.name
                unit_price = p.unit_price
        elif w.raw_material_id:
            rm = db.get(RawMaterial, w.raw_material_id)
            if rm:
                item_name = rm.name
                unit_price = rm.unit_price
                roll_width = rm.roll_width_m if rm.roll_width_m else None
        if unit_price and w.raw_material_id and roll_width:
            total = round(unit_price * w.quantity * roll_width, 2)
        else:
            total = round(unit_price * w.quantity, 2) if unit_price else None
        result.append(WriteoffOut(
            id=w.id, item_type=w.item_type, product_id=w.product_id,
            raw_material_id=w.raw_material_id, quantity=w.quantity,
            reason=w.reason, order_id=w.order_id,
            created_by=w.created_by, created_by_name=w.created_by_name,
            created_at=w.created_at, item_name=item_name, unit_price=unit_price,
            total_value=total,
        ))
    return result


@router.delete("/{writeoff_id}", response_model=WriteoffOut)
def reverse_writeoff(
    writeoff_id: int,
    db: Session = Depends(get_db_warehouse),
    user: User = Depends(get_current_user),
):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admins can reverse writeoffs")

    w = db.get(StockWriteoff, writeoff_id)
    if not w:
        raise HTTPException(status_code=404, detail="Writeoff not found")

    if w.product_id:
        wi = db.execute(select(WarehouseItem).where(WarehouseItem.product_id == w.product_id)).scalar_one_or_none()
        if wi:
            wi.quantity += w.quantity
    elif w.raw_material_id:
        wi = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == w.raw_material_id)).scalar_one_or_none()
        if wi:
            wi.quantity += w.quantity

    db.delete(w)
    db.commit()

    logger.info(f"Writeoff #{writeoff_id} reversed by {user.username}")
    return w


@router.post("", response_model=WriteoffOut, status_code=201)
def create_writeoff(
    data: WriteoffCreate,
    db: Session = Depends(get_db_warehouse),
    user: User = Depends(get_current_user),
):
    if data.item_type not in ("product", "raw_material"):
        raise HTTPException(status_code=400, detail="item_type must be 'product' or 'raw_material'")
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")

    if data.item_type == "product":
        if not data.product_id:
            raise HTTPException(status_code=400, detail="product_id required for product writeoff")
        wi = db.execute(select(WarehouseItem).where(WarehouseItem.product_id == data.product_id)).scalar_one_or_none()
        if not wi:
            raise HTTPException(status_code=400, detail="Product not found in warehouse")
        if wi.quantity < data.quantity:
            raise HTTPException(status_code=400, detail=f"Not enough stock: have {wi.quantity}, want to write off {data.quantity}")
        wi.quantity -= data.quantity
        product = db.get(Product, data.product_id)
        name = product.name if product else f"#{data.product_id}"
    else:
        if not data.raw_material_id:
            raise HTTPException(status_code=400, detail="raw_material_id required for raw_material writeoff")
        wi = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == data.raw_material_id)).scalar_one_or_none()
        if not wi:
            raise HTTPException(status_code=400, detail="Raw material not found in warehouse")
        if wi.quantity < data.quantity:
            raise HTTPException(status_code=400, detail=f"Not enough stock: have {wi.quantity}, want to write off {data.quantity}")
        wi.quantity -= data.quantity
        rm = db.get(RawMaterial, data.raw_material_id)
        name = rm.name if rm else f"#{data.raw_material_id}"

    writeoff = StockWriteoff(
        item_type=data.item_type,
        product_id=data.product_id,
        raw_material_id=data.raw_material_id,
        quantity=data.quantity,
        reason=data.reason,
        order_id=data.order_id,
        created_by=user.id,
        created_by_name=user.full_name or user.username,
    )
    db.add(writeoff)
    db.commit()
    db.refresh(writeoff)

    logger.info(f"Writeoff: {name} x{data.quantity} by {user.username}, reason: {data.reason}")
    return writeoff
