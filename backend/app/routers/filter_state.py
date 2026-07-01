import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db_core
from app.models.user import User
from app.models.user_filter_state import UserFilterState
from app.schemas.user_filter_state import FilterStateOut, FilterStateUpdate

router = APIRouter(prefix="/filter-state", tags=["filter-state"])


@router.get("/{entity}", response_model=FilterStateOut)
def get_filter_state(entity: str, user: User = Depends(get_current_user), db: Session = Depends(get_db_core)):
    row = db.execute(
        select(UserFilterState).where(UserFilterState.user_id == user.id, UserFilterState.entity == entity)
    ).scalar_one_or_none()
    if not row:
        return FilterStateOut(entity=entity, filters={}, sort_field=None, sort_direction="asc", search="")
    try:
        filters = json.loads(row.filters)
    except Exception:
        filters = {}
    return FilterStateOut(
        entity=entity,
        filters=filters,
        sort_field=row.sort_field,
        sort_direction=row.sort_direction,
        search=row.search or "",
    )


@router.put("/{entity}", response_model=FilterStateOut)
def save_filter_state(entity: str, data: FilterStateUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db_core)):
    row = db.execute(
        select(UserFilterState).where(UserFilterState.user_id == user.id, UserFilterState.entity == entity)
    ).scalar_one_or_none()

    filters_json = json.dumps(data.filters, ensure_ascii=False)

    if row:
        row.filters = filters_json
        row.sort_field = data.sort_field
        row.sort_direction = data.sort_direction
        row.search = data.search
    else:
        row = UserFilterState(
            user_id=user.id,
            entity=entity,
            filters=filters_json,
            sort_field=data.sort_field,
            sort_direction=data.sort_direction,
            search=data.search,
        )
        db.add(row)

    db.commit()
    return FilterStateOut(
        entity=entity,
        filters=data.filters,
        sort_field=data.sort_field,
        sort_direction=data.sort_direction,
        search=data.search,
    )
