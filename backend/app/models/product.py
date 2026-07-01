from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import BaseWarehouse


class Product(BaseWarehouse):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    unit_type: Mapped[str] = mapped_column(String(50), default="piece")
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    formula: Mapped[str] = mapped_column(Text, nullable=True)
    formula_script: Mapped[str] = mapped_column(String(255), nullable=True)
    raw_material_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    material_coefficient: Mapped[float] = mapped_column(Float, default=1.0)
    supplier_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_cut_width_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    default_cut_height_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    raw_materials: Mapped[list["ProductRawMaterial"]] = relationship(
        "ProductRawMaterial", back_populates="product", cascade="all, delete-orphan"
    )
