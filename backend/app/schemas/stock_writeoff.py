from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WriteoffCreate(BaseModel):
    item_type: str
    product_id: int | None = None
    raw_material_id: int | None = None
    quantity: float
    reason: str | None = None
    order_id: int | None = None


class WriteoffOut(BaseModel):
    id: int
    item_type: str
    product_id: int | None = None
    raw_material_id: int | None = None
    quantity: float
    reason: str | None = None
    order_id: int | None = None
    created_by: int | None = None
    created_by_name: str | None = None
    created_at: datetime
    item_name: str | None = None
    unit_price: float | None = None
    total_value: float | None = None

    model_config = ConfigDict(from_attributes=True)
