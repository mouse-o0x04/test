from sqlalchemy import Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseCore


class OrderTemplate(BaseCore):
    __tablename__ = "order_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    items: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
