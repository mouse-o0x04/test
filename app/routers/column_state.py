import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db_core
from app.models.user import User
from app.models.user_column_state import UserColumnState
from app.schemas.user_column_state import ColumnStateOut, ColumnStateUpdate

router = APIRouter(prefix="/column-state", tags=["column-state"])


@router.get("/{entity}", response_model=ColumnStateOut)
def get_column_state(entity: str, user: User = Depends(get_current_user), db: Session = Depends(get_db_core)):
    row = db.execute(
        select(UserColumnState).where(UserColumnState.user_id == user.id, UserColumnState.entity == entity)
    ).scalar_one_or_none()
    if not row:
        return ColumnStateOut(entity=entity, widths={})
    try:
        widths = json.loads(row.widths)
    except Exception:
        widths = {}
    return ColumnStateOut(entity=entity, widths=widths)


@router.put("/{entity}", response_model=ColumnStateOut)
def save_column_state(entity: str, data: ColumnStateUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db_core)):
    row = db.execute(
        select(UserColumnState).where(UserColumnState.user_id == user.id, UserColumnState.entity == entity)
    ).scalar_one_or_none()

    widths_json = json.dumps(data.widths, ensure_ascii=False)

    if row:
        row.widths = widths_json
    else:
        row = UserColumnState(
            user_id=user.id,
            entity=entity,
            widths=widths_json,
        )
        db.add(row)

    db.commit()
    return ColumnStateOut(entity=entity, widths=data.widths)
