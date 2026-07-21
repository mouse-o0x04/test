from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.order_template import OrderTemplate
from app.models.user import User
from app.auth.deps import get_current_user
from app.schemas.order_template import OrderTemplateCreate, OrderTemplateOut

router = APIRouter(prefix="/order-templates", tags=["order-templates"])


@router.get("", response_model=list[OrderTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.query(OrderTemplate).order_by(OrderTemplate.id).all()


@router.post("", response_model=OrderTemplateOut)
def create_template(data: OrderTemplateCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tmpl = OrderTemplate(name=data.name, items=data.items, created_by=user.id)
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl


@router.put("/{template_id}", response_model=OrderTemplateOut)
def update_template(template_id: int, data: OrderTemplateCreate, db: Session = Depends(get_db)):
    tmpl = db.query(OrderTemplate).filter(OrderTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    tmpl.name = data.name
    tmpl.items = data.items
    db.commit()
    db.refresh(tmpl)
    return tmpl


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    tmpl = db.query(OrderTemplate).filter(OrderTemplate.id == template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    db.delete(tmpl)
    db.commit()
    return {"ok": True}
