from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    action: str
    old_data: str | None = None
    new_data: str | None = None
    user_id: int | None = None
    user_name: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
