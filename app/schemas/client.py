from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.company_detail import CompanyDetailOut


class ClientBase(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    address: str | None = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    address: str | None = None


class ClientOut(ClientBase):
    id: int
    created_at: datetime
    updated_at: datetime
    company_details: list[CompanyDetailOut] = []

    model_config = ConfigDict(from_attributes=True)
