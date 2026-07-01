import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.auth.deps import get_current_user
from app.database import SessionCore, get_db_core
from app.models.order_settings import OrderSettings
from app.models.user import User
from app.schemas.order_settings import OrderSettingsCreate, OrderSettingsOut, OrderSettingsUpdate

router = APIRouter(prefix="/order-settings", tags=["order-settings"])


@router.get("", response_model=list[OrderSettingsOut])
def list_order_settings(
    type: str | None = None,
    db=Depends(get_db_core),
):
    q = select(OrderSettings).order_by(OrderSettings.sort_order, OrderSettings.id)
    if type:
        q = q.where(OrderSettings.setting_type == type)
    return db.execute(q).scalars().all()


@router.post("", response_model=OrderSettingsOut, status_code=status.HTTP_201_CREATED)
def create_order_setting(
    data: OrderSettingsCreate,
    user: User = Depends(get_current_user),
    db=Depends(get_db_core),
):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admin can manage order settings")
    item = OrderSettings(
        setting_type=data.setting_type,
        name=data.name,
        color=data.color,
        sort_order=data.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=OrderSettingsOut)
def update_order_setting(
    item_id: int,
    data: OrderSettingsUpdate,
    user: User = Depends(get_current_user),
    db=Depends(get_db_core),
):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admin can manage order settings")
    item = db.get(OrderSettings, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Setting not found")
    if data.name is not None:
        item.name = data.name
    if data.color is not None:
        item.color = data.color
    if data.sort_order is not None:
        item.sort_order = data.sort_order
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order_setting(
    item_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db_core),
):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only admin can manage order settings")
    item = db.get(OrderSettings, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Setting not found")
    db.delete(item)
    db.commit()
