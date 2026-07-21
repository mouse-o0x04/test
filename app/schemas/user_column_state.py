from pydantic import BaseModel


class ColumnStateUpdate(BaseModel):
    widths: dict = {}


class ColumnStateOut(BaseModel):
    entity: str
    widths: dict
