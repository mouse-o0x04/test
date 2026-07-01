from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AIProviderSettingsOut(BaseModel):
    id: int
    provider_name: str
    base_url: str
    api_key: str | None = None
    model_name: str
    temperature: float
    max_tokens: int
    system_prompt: str | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AIProviderSettingsUpdate(BaseModel):
    provider_name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    system_prompt: str | None = None
    is_active: bool | None = None
