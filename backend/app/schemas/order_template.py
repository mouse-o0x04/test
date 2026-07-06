from pydantic import BaseModel
from typing import Any


class OrderTemplateItem(BaseModel):
    product_name: str
    quantity: int = 1
    unit_price: float | None = None
    raw_material_id: int | None = None
    cut_width_mm: float | None = None
    cut_height_mm: float | None = None


class OrderTemplateCreate(BaseModel):
    name: str
    items: list[dict[str, Any]]


class OrderTemplateOut(BaseModel):
    id: int
    name: str
    items: list[dict[str, Any]]
    created_by: int | None

    model_config = {"from_attributes": True}
