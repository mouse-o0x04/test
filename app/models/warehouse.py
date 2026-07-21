from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseWarehouse


class WarehouseItem(BaseWarehouse):
    __tablename__ = "warehouse"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    raw_material_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    quantity: Mapped[float] = mapped_column(Float, default=0)
    min_quantity: Mapped[int] = mapped_column(Integer, default=0)
    defective_quantity: Mapped[int] = mapped_column(Integer, default=0)
    defective_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    stock_calculation_script: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_format_script: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "(product_id IS NOT NULL AND raw_material_id IS NULL) OR (product_id IS NULL AND raw_material_id IS NOT NULL)",
            name="warehouse_one_of_two",
        ),
    )
