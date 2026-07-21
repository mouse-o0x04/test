from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseWarehouse


class Offcut(BaseWarehouse):
    __tablename__ = "offcuts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    raw_material_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    width_mm: Mapped[float] = mapped_column(Float, nullable=False)
    height_mm: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    order_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
