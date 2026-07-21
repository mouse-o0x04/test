from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseCore


class OrderSettings(BaseCore):
    __tablename__ = "order_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    setting_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#1677ff")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
