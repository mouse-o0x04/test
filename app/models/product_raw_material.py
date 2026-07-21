from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import BaseWarehouse


class ProductRawMaterial(BaseWarehouse):
    """Product component: either a raw material OR another product (nested BOM).

    Multiple rows with the same (product_id, raw_material_id) or
    (product_id, component_product_id) but different cut sizes are allowed.

    Constraints (enforced at DB level via prm_one_source check):
    - Exactly one of raw_material_id / component_product_id should be set
      (we allow both NULL transiently during sync).
    """
    __tablename__ = "product_raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_material_id = Column(Integer, ForeignKey("raw_materials.id", ondelete="CASCADE"), nullable=True)
    component_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(255), nullable=True)
    coefficient = Column(Float, default=1.0, nullable=False)
    cut_width_mm = Column(Float, nullable=True)
    cut_height_mm = Column(Float, nullable=True)
    quantity_per_unit = Column(Integer, default=1, nullable=False)
    price_per_unit = Column(Float, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    product = relationship("Product", back_populates="raw_materials", foreign_keys=[product_id])
    component_product = relationship("Product", foreign_keys=[component_product_id])