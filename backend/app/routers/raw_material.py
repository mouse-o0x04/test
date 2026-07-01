from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db_warehouse
from app.models.audit_log import AuditLog
from app.models.raw_material import RawMaterial
from app.models.user import User
from app.schemas.raw_material import RawMaterialCreate, RawMaterialOut, RawMaterialUpdate


class BulkDeleteRequest(BaseModel):
    ids: list[int]

router = APIRouter(prefix="/raw-materials", tags=["raw-materials"])


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
def bulk_delete_raw_materials(data: BulkDeleteRequest, db: Session = Depends(get_db_warehouse)):
    deleted = 0
    for mid in data.ids:
        material = db.get(RawMaterial, mid)
        if material:
            db.delete(material)
            deleted += 1
    db.commit()
    return {"deleted": deleted}


@router.get("", response_model=list[RawMaterialOut])
def list_raw_materials(db: Session = Depends(get_db_warehouse)):
    return db.execute(select(RawMaterial).order_by(RawMaterial.id)).scalars().all()


@router.get("/{material_id}", response_model=RawMaterialOut)
def get_raw_material(material_id: int, db: Session = Depends(get_db_warehouse)):
    material = db.get(RawMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    return material


@router.post("", response_model=RawMaterialOut, status_code=status.HTTP_201_CREATED)
def create_raw_material(data: RawMaterialCreate, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    material = RawMaterial(**data.model_dump())
    db.add(material)
    db.flush()
    _audit(db, "raw_material", material.id, "create", None, data.model_dump(), user)
    db.commit()
    db.refresh(material)
    return material


@router.put("/{material_id}", response_model=RawMaterialOut)
def update_raw_material(material_id: int, data: RawMaterialUpdate, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    material = db.get(RawMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    old_data = {c.name: getattr(material, c.name) for c in RawMaterial.__table__.columns}
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(material, key, val)
    new_data = {c.name: getattr(material, c.name) for c in RawMaterial.__table__.columns}
    _audit(db, "raw_material", material.id, "update", old_data, new_data, user)
    db.commit()
    db.refresh(material)
    return material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_raw_material(material_id: int, db: Session = Depends(get_db_warehouse), user: User = Depends(get_current_user)):
    material = db.get(RawMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    old_data = {c.name: getattr(material, c.name) for c in RawMaterial.__table__.columns}
    _audit(db, "raw_material", material.id, "delete", old_data, None, user)
    db.delete(material)
    db.commit()
