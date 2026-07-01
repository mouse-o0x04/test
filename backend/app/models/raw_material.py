from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseWarehouse


class RawMaterial(BaseWarehouse):
    __tablename__ = "raw_materials"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    width_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    roll_width_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    roll_length_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    density: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color_finish: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit_type: Mapped[str] = mapped_column(String(50), default="piece")
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    display_format_script: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stock_calculation_script: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
