from sqlalchemy import Column, Float, Integer, String

from app.database import BaseOrders


class OrderItemRawMaterial(BaseOrders):
    """Snapshot of a product component on a specific order item.

    Captured at order creation time so later product edits do not affect
    historical orders. Custom order items (no product_id) use this table
    directly to store their own components.

    A component is either a raw material (raw_material_id set) or
    a nested product (component_product_id set).
    """
    __tablename__ = "order_item_raw_materials"

    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, nullable=False, index=True)
    raw_material_id = Column(Integer, nullable=True)
    component_product_id = Column(Integer, nullable=True)
    raw_material_qty = Column(Float, nullable=True)
    cut_width_mm = Column(Float, nullable=True)
    cut_height_mm = Column(Float, nullable=True)
    name = Column(String(255), nullable=True)
    quantity = Column(Integer, default=1, nullable=False)
    unit_price = Column(Float, nullable=True)
