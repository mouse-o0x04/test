from sqlalchemy import Column, Float, Integer

from app.database import BaseOrders


class OrderItemRawMaterial(BaseOrders):
    __tablename__ = "order_item_raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, nullable=False, index=True)
    raw_material_id = Column(Integer, nullable=False)
    raw_material_qty = Column(Float, nullable=True)
    cut_width_mm = Column(Float, nullable=True)
    cut_height_mm = Column(Float, nullable=True)
