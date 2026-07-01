from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db_clients
from app.models.client import Client
from app.models.company_detail import CompanyDetail
from app.schemas.company_detail import CompanyDetailCreate, CompanyDetailOut, CompanyDetailUpdate

router = APIRouter(prefix="/company-details", tags=["company-details"])


@router.get("", response_model=list[CompanyDetailOut])
def list_company_details(db: Session = Depends(get_db_clients)):
    return db.execute(select(CompanyDetail).order_by(CompanyDetail.id)).scalars().all()


@router.get("/{detail_id}", response_model=CompanyDetailOut)
def get_company_detail(detail_id: int, db: Session = Depends(get_db_clients)):
    detail = db.get(CompanyDetail, detail_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Company detail not found")
    return detail


@router.post("", response_model=CompanyDetailOut, status_code=status.HTTP_201_CREATED)
def create_company_detail(data: CompanyDetailCreate, db: Session = Depends(get_db_clients)):
    detail = CompanyDetail(**data.model_dump())
    db.add(detail)
    db.commit()
    db.refresh(detail)
    return detail


@router.put("/{detail_id}", response_model=CompanyDetailOut)
def update_company_detail(detail_id: int, data: CompanyDetailUpdate, db: Session = Depends(get_db_clients)):
    detail = db.get(CompanyDetail, detail_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Company detail not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(detail, key, val)
    db.commit()
    db.refresh(detail)
    return detail


@router.delete("/{detail_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_detail(detail_id: int, db: Session = Depends(get_db_clients)):
    detail = db.get(CompanyDetail, detail_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Company detail not found")
    db.delete(detail)
    db.commit()


@router.post("/client/{client_id}/attach/{detail_id}")
def attach_to_client(client_id: int, detail_id: int, db: Session = Depends(get_db_clients)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    detail = db.get(CompanyDetail, detail_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Company detail not found")
    if detail not in client.company_details:
        client.company_details.append(detail)
        db.commit()
    return {"ok": True}


@router.delete("/client/{client_id}/detach/{detail_id}")
def detach_from_client(client_id: int, detail_id: int, db: Session = Depends(get_db_clients)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    detail = db.get(CompanyDetail, detail_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Company detail not found")
    if detail in client.company_details:
        client.company_details.remove(detail)
        db.commit()
    return {"ok": True}


@router.get("/client/{client_id}", response_model=list[CompanyDetailOut])
def get_client_details(client_id: int, db: Session = Depends(get_db_clients)):
    client = db.execute(
        select(Client).options(joinedload(Client.company_details)).where(Client.id == client_id)
    ).scalars().unique().one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client.company_details
