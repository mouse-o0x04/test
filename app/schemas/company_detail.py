from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CompanyDetailBase(BaseModel):
    company_name: str
    inn: str | None = None
    kpp: str | None = None
    ogrn: str | None = None
    ogrnip: str | None = None
    legal_address: str | None = None
    actual_address: str | None = None
    settlement_account: str | None = None
    bank_name: str | None = None
    bik: str | None = None
    correspondent_account: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None


class CompanyDetailCreate(CompanyDetailBase):
    pass


class CompanyDetailUpdate(BaseModel):
    company_name: str | None = None
    inn: str | None = None
    kpp: str | None = None
    ogrn: str | None = None
    ogrnip: str | None = None
    legal_address: str | None = None
    actual_address: str | None = None
    settlement_account: str | None = None
    bank_name: str | None = None
    bik: str | None = None
    correspondent_account: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None


class CompanyDetailOut(CompanyDetailBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
