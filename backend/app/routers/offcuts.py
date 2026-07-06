from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.auth.deps import get_current_user
from app.database import SessionWarehouse
from app.models.offcut import Offcut
from app.models.raw_material import RawMaterial
from app.schemas.offcut import OffcutCreate, OffcutOut
from app.models.user import User

router = APIRouter(prefix="/offcuts", tags=["offcuts"])


def get_db():
    db = SessionWarehouse()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=list[OffcutOut])
def list_offcuts(raw_material_id: int = None, db=Depends(get_db)):
    q = select(Offcut).order_by(Offcut.id.desc())
    if raw_material_id:
        q = q.where(Offcut.raw_material_id == raw_material_id)
    rows = db.execute(q).scalars().all()
    result = []
    for r in rows:
        rm = db.get(RawMaterial, r.raw_material_id)
        result.append(OffcutOut(
            id=r.id, raw_material_id=r.raw_material_id,
            width_mm=r.width_mm, height_mm=r.height_mm,
            quantity=r.quantity, order_id=r.order_id,
            raw_material_name=rm.name if rm else None,
            created_at=r.created_at,
        ))
    return result


@router.post("", response_model=OffcutOut, status_code=201)
def create_offcut(data: OffcutCreate, db=Depends(get_db), user: User = Depends(get_current_user)):
    offcut = Offcut(**data.model_dump())
    db.add(offcut)
    db.commit()
    db.refresh(offcut)
    rm = db.get(RawMaterial, offcut.raw_material_id)
    return OffcutOut(
        id=offcut.id, raw_material_id=offcut.raw_material_id,
        width_mm=offcut.width_mm, height_mm=offcut.height_mm,
        quantity=offcut.quantity, order_id=offcut.order_id,
        raw_material_name=rm.name if rm else None,
        created_at=offcut.created_at,
    )


@router.delete("/{offcut_id}")
def delete_offcut(offcut_id: int, db=Depends(get_db), user: User = Depends(get_current_user)):
    offcut = db.get(Offcut, offcut_id)
    if not offcut:
        raise HTTPException(status_code=404, detail="Offcut not found")
    db.delete(offcut)
    db.commit()
    return {"ok": True}
