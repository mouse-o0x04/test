from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RawMaterialBase(BaseModel):
    name: str
    description: str | None = None
    width_mm: int | None = None
    height_mm: int | None = None
    roll_width_m: float | None = None
    roll_length_m: float | None = None
    density: str | None = None
    color_finish: str | None = None
    unit_type: str = "piece"
    unit_price: float = 0.0
    display_format_script: str | None = None
    stock_calculation_script: str | None = None


class RawMaterialCreate(RawMaterialBase):
    pass


class RawMaterialUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    width_mm: int | None = None
    height_mm: int | None = None
    roll_width_m: float | None = None
    roll_length_m: float | None = None
    density: str | None = None
    color_finish: str | None = None
    unit_type: str | None = None
    unit_price: float | None = None
    display_format_script: str | None = None
    stock_calculation_script: str | None = None


class RawMaterialOut(RawMaterialBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
