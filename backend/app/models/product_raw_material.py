from sqlalchemy import Column, Float, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.database import BaseWarehouse


class ProductRawMaterial(BaseWarehouse):
    __tablename__ = "product_raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_material_id = Column(Integer, ForeignKey("raw_materials.id", ondelete="CASCADE"), nullable=False)
    coefficient = Column(Float, default=1.0, nullable=False)

    product = relationship("Product", back_populates="raw_materials")
