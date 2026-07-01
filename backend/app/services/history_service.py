import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.order import Order, OrderHistory
from app.models.user import User


def _user_info(user: User | None) -> dict:
    if not user:
        return {"user_id": None, "user_name": "Система", "user_role": "system"}
    role_name = user.roles[0].name if user.roles else "user"
    return {
        "user_id": user.id,
        "user_name": user.full_name or user.username,
        "user_role": role_name,
    }


def log_created(order: Order, user: User | None, db: Session):
    info = _user_info(user)
    db.add(OrderHistory(
        order_id=order.id,
        action="created",
        field=None,
        old_value=None,
        new_value=f"Заказ #{order.id} создан",
        **info,
    ))
    db.commit()


def log_status_changed(order: Order, old_status: str, new_status: str, user: User | None, db: Session):
    status_labels = {
        "new": "Новый", "in_progress": "В работе", "ready": "Готов", "delivered": "Отдали",
    }
    info = _user_info(user)
    db.add(OrderHistory(
        order_id=order.id,
        action="status_changed",
        field="status",
        old_value=status_labels.get(old_status, old_status),
        new_value=status_labels.get(new_status, new_status),
        **info,
    ))
    db.commit()


def log_item_completed(order: Order, item_name: str, completed: bool, user: User | None, db: Session):
    info = _user_info(user)
    db.add(OrderHistory(
        order_id=order.id,
        action="item_completed" if completed else "item_uncompleted",
        field="item",
        old_value=None,
        new_value=item_name,
        **info,
    ))
    db.commit()


def log_item_printed(order: Order, item_name: str, printed: bool, user: User | None, db: Session):
    info = _user_info(user)
    db.add(OrderHistory(
        order_id=order.id,
        action="item_printed" if printed else "item_unprinted",
        field="item",
        old_value=None,
        new_value=item_name,
        **info,
    ))
    db.commit()


def log_updated(order: Order, changes: dict[str, tuple], user: User | None, db: Session):
    info = _user_info(user)
    for field_name, (old_val, new_val) in changes.items():
        db.add(OrderHistory(
            order_id=order.id,
            action="updated",
            field=field_name,
            old_value=str(old_val) if old_val is not None else None,
            new_value=str(new_val) if new_val is not None else None,
            **info,
        ))
    db.commit()


def log_deleted(order_id: int, user: User | None, db: Session):
    info = _user_info(user)
    db.add(OrderHistory(
        order_id=order_id,
        action="deleted",
        field=None,
        old_value=None,
        new_value=f"Заказ #{order_id} удалён",
        **info,
    ))
    db.commit()
