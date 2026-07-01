from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db_clients
from app.models.client import Client
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate
from app.services.hermes_service import notify_all


class BulkDeleteRequest(BaseModel):
    ids: list[int]

router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_clients(data: BulkDeleteRequest, db: Session = Depends(get_db_clients)):
    deleted = 0
    for cid in data.ids:
        client = db.get(Client, cid)
        if client:
            db.delete(client)
            deleted += 1
    db.commit()
    return {"deleted": deleted}


@router.get("", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db_clients)):
    return db.execute(
        select(Client).options(joinedload(Client.company_details)).order_by(Client.id)
    ).scalars().unique().all()


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db_clients)):
    client = db.execute(
        select(Client).options(joinedload(Client.company_details)).where(Client.id == client_id)
    ).scalars().unique().one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(data: ClientCreate, db: Session = Depends(get_db_clients)):
    client = Client(**data.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    try:
        notify_all("client.created", {"client_id": client.id, "name": client.name}, db)
    except Exception:
        pass
    return client


@router.put("/{client_id}", response_model=ClientOut)
def update_client(client_id: int, data: ClientUpdate, db: Session = Depends(get_db_clients)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(client, key, val)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db_clients)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    name = client.name
    db.delete(client)
    db.commit()
    try:
        notify_all("client.deleted", {"client_id": client_id, "name": name}, db)
    except Exception:
        pass
