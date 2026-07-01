from pydantic import BaseModel, ConfigDict


class OrderSettingsCreate(BaseModel):
    setting_type: str
    name: str
    color: str = "#1677ff"
    sort_order: int = 0


class OrderSettingsUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    sort_order: int | None = None


class OrderSettingsOut(BaseModel):
    id: int
    setting_type: str
    name: str
    color: str
    sort_order: int

    model_config = ConfigDict(from_attributes=True)
