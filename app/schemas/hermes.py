from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HermesAgentBase(BaseModel):
    name: str
    agent_type: str
    config: dict = {}
    webhook_url: str | None = None


class HermesAgentCreate(HermesAgentBase):
    pass


class HermesAgentUpdate(BaseModel):
    name: str | None = None
    agent_type: str | None = None
    config: dict | None = None
    is_active: bool | None = None
    webhook_url: str | None = None


class HermesAgentOut(HermesAgentBase):
    id: int
    is_active: bool
    last_seen: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HermesEventCreate(BaseModel):
    event_type: str
    payload: dict = {}


class HermesEventOut(BaseModel):
    id: int
    agent_id: int
    event_type: str
    payload: dict
    status: str
    response: dict | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HermesEventSend(HermesEventCreate):
    agent_id: int
