from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseWarehouse


class StockWriteoff(BaseWarehouse):
    __tablename__ = "stock_writeoffs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_material_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
