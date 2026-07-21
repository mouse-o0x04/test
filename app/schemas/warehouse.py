from typing import Any
from pydantic import BaseModel, ConfigDict, model_validator


class WarehouseComponentOut(BaseModel):
    name: str | None = None
    raw_material_id: int | None = None
    component_product_id: int | None = None
    cut_width_mm: float | None = None
    cut_height_mm: float | None = None
    quantity_per_unit: int = 1
    stock_quantity: float = 0


class WarehouseBase(BaseModel):
    product_id: int | None = None
    raw_material_id: int | None = None
    quantity: float = 0
    min_quantity: int = 0
    defective_quantity: int = 0
    defective_reason: str | None = None
    stock_calculation_script: str | None = None
    display_format_script: str | None = None

    @model_validator(mode="after")
    def check_one_of_two(self):
        if (self.product_id is None) == (self.raw_material_id is None):
            raise ValueError("Exactly one of product_id or raw_material_id must be set")
        return self


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    quantity: float | None = None
    min_quantity: int | None = None
    defective_quantity: int | None = None
    defective_reason: str | None = None
    stock_calculation_script: str | None = None
    display_format_script: str | None = None


class WarehouseOut(WarehouseBase):
    id: int
    updated_at: str | None = None
    product_name: str | None = None
    product_unit_type: str | None = None
    raw_material_name: str | None = None
    raw_material_unit_type: str | None = None
    raw_material_roll_length_m: float | None = None
    raw_material_width_mm: float | None = None
    raw_material_height_mm: float | None = None
    source_raw_material_name: str | None = None
    source_raw_material_quantity: float | None = None
    components: list[WarehouseComponentOut] = []
    pending_writeoffs_count: int = 0

    model_config = ConfigDict(from_attributes=True)
