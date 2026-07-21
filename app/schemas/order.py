from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OrderItemRawMaterialIn(BaseModel):
    raw_material_id: int | None = None
    component_product_id: int | None = None
    raw_material_qty: float | None = None
    cut_width_mm: float | None = None
    cut_height_mm: float | None = None
    name: str | None = None
    quantity: int = 1
    unit_price: float | None = None


class OrderItemRawMaterialOut(BaseModel):
    raw_material_id: int | None = None
    component_product_id: int | None = None
    raw_material_qty: float | None = None
    cut_width_mm: float | None = None
    cut_height_mm: float | None = None
    raw_material_name: str | None = None
    component_product_name: str | None = None
    name: str | None = None
    quantity: int = 1
    unit_price: float | None = None


class OrderItemCreate(BaseModel):
    product_id: int | None = None
    product_name: str | None = None
    product_unit: str | None = None
    product_formula: str | None = None
    product_formula_script: str | None = None
    raw_material_id: int | None = None
    raw_material_qty: float | None = None
    cut_width_mm: float | None = None
    cut_height_mm: float | None = None
    raw_materials: list[OrderItemRawMaterialIn] = []
    quantity: int
    unit_price: float | None = None
    processing_method: str | None = None
    manual_writeoff_pending: bool = False
    manual_writeoff_raw_material_id: int | None = None
    manual_writeoff_cut_width_mm: float | None = None
    manual_writeoff_cut_height_mm: float | None = None
    manual_writeoff_quantity: float | None = None


class OrderItemOut(BaseModel):
    id: int
    product_id: int | None = None
    quantity: int
    unit_price: float
    is_completed: bool = False
    is_printed: bool = False
    product_name: str | None = None
    product_unit: str | None = None
    is_custom: bool = False
    raw_material_id: int | None = None
    raw_material_qty: float | None = None
    cut_width_mm: float | None = None
    cut_height_mm: float | None = None
    raw_materials: list[OrderItemRawMaterialOut] = []
    processing_method: str | None = None
    manual_writeoff_pending: bool = False
    manual_writeoff_raw_material_id: int | None = None
    manual_writeoff_cut_width_mm: float | None = None
    manual_writeoff_cut_height_mm: float | None = None
    manual_writeoff_quantity: float | None = None
    manual_writeoff_raw_material_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class OrderCreate(BaseModel):
    client_id: int
    client_ids: list[int] | None = None
    status: str = "new"
    description: str | None = None
    notes: str | None = None
    deadline: datetime | None = None
    deadline_start: datetime | None = None
    designer: str | None = None
    workers: list[str] = []
    layout_type: str | None = None
    path: str | None = None
    source: str | None = None
    items: list[OrderItemCreate]


class OrderUpdate(BaseModel):
    client_id: int | None = None
    client_ids: list[int] | None = None
    status: str | None = None
    description: str | None = None
    notes: str | None = None
    deadline: datetime | None = None
    deadline_start: datetime | None = None
    designer: str | None = None
    workers: list[str] | None = None
    layout_type: str | None = None
    path: str | None = None
    source: str | None = None
    items: list[OrderItemCreate] | None = None


class ClientBrief(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class OrderOut(BaseModel):
    id: int
    client_id: int
    total_price: float
    status: str
    description: str | None = None
    notes: str | None = None
    deadline: datetime | None = None
    deadline_start: datetime | None = None
    designer: str | None = None
    workers: list[str] = []
    layout_type: str | None = None
    path: str | None = None
    source: str | None = None
    created_by: int | None = None
    created_by_name: str | None = None
    created_by_role: str | None = None
    created_at: datetime
    updated_at: datetime
    client_name: str | None = None
    clients: list[ClientBrief] = []
    items: list[OrderItemOut] = []
    progress: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class OrderHistoryOut(BaseModel):
    id: int
    order_id: int
    action: str
    field: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    user_id: int | None = None
    user_name: str | None = None
    user_role: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
