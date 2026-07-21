from datetime import datetime

from pydantic import BaseModel


class OffcutCreate(BaseModel):
    raw_material_id: int
    width_mm: float
    height_mm: float
    quantity: int = 1
    order_id: int | None = None


class OffcutOut(BaseModel):
    id: int
    raw_material_id: int
    width_mm: float
    height_mm: float
    quantity: int
    order_id: int | None = None
    raw_material_name: str | None = None
    created_at: datetime | None = None
