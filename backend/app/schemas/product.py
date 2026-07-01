from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.services.formula import validate_formula


class ProductRawMaterialItem(BaseModel):
    raw_material_id: int
    coefficient: float = 1.0

    model_config = ConfigDict(from_attributes=True)


class ProductRawMaterialOut(ProductRawMaterialItem):
    raw_material_name: str | None = None
    raw_material_width_mm: int | None = None
    raw_material_height_mm: int | None = None


class ProductBase(BaseModel):
    name: str
    description: str | None = None
    unit_price: float
    unit_type: str = "piece"
    category: str | None = None
    formula: str | None = None
    formula_script: str | None = None
    raw_material_id: int | None = None
    material_coefficient: float = 1.0
    supplier_url: str | None = None
    default_cut_width_mm: float | None = None
    default_cut_height_mm: float | None = None
    raw_materials: list[ProductRawMaterialItem] = []

    @field_validator("formula")
    @classmethod
    def check_formula(cls, v: str | None) -> str | None:
        if v and v.strip():
            validate_formula(v)
        return v


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    unit_price: float | None = None
    unit_type: str | None = None
    category: str | None = None
    formula: str | None = None
    formula_script: str | None = None
    raw_material_id: int | None = None
    material_coefficient: float | None = None
    supplier_url: str | None = None
    default_cut_width_mm: float | None = None
    default_cut_height_mm: float | None = None
    raw_materials: list[ProductRawMaterialItem] | None = None

    @field_validator("formula")
    @classmethod
    def check_formula(cls, v: str | None) -> str | None:
        if v and v.strip():
            validate_formula(v)
        return v


class ProductOut(ProductBase):
    id: int
    created_at: datetime
    raw_material_name: str | None = None
    raw_materials: list[ProductRawMaterialOut] = []
    supplier_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
