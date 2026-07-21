from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import BaseClients

client_company = Table(
    "client_company",
    BaseClients.metadata,
    Column("client_id", Integer, ForeignKey("clients.id", ondelete="CASCADE"), primary_key=True),
    Column("company_detail_id", Integer, ForeignKey("company_details.id", ondelete="CASCADE"), primary_key=True),
)


class CompanyDetail(BaseClients):
    __tablename__ = "company_details"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    inn: Mapped[str] = mapped_column(String(12), nullable=True)
    kpp: Mapped[str] = mapped_column(String(9), nullable=True)
    ogrn: Mapped[str] = mapped_column(String(15), nullable=True)
    ogrnip: Mapped[str] = mapped_column(String(15), nullable=True)
    legal_address: Mapped[str] = mapped_column(Text, nullable=True)
    actual_address: Mapped[str] = mapped_column(Text, nullable=True)
    settlement_account: Mapped[str] = mapped_column(String(20), nullable=True)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=True)
    bik: Mapped[str] = mapped_column(String(9), nullable=True)
    correspondent_account: Mapped[str] = mapped_column(String(20), nullable=True)
    contact_person: Mapped[str] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    clients: Mapped[list["Client"]] = relationship("Client", secondary=client_company, back_populates="company_details")


from app.models.client import Client
