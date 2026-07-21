from pydantic import BaseModel


class FilterStateUpdate(BaseModel):
    filters: dict = {}
    sort_field: str | None = None
    sort_direction: str = "asc"
    search: str = ""


class FilterStateOut(BaseModel):
    entity: str
    filters: dict
    sort_field: str | None
    sort_direction: str
    search: str
