from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseCore


class AIProviderSettings(BaseCore):
    __tablename__ = "ai_provider_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    provider_name: Mapped[str] = mapped_column(String(100), nullable=False, default="llamacpp")
    base_url: Mapped[str] = mapped_column(String(500), nullable=False, default="http://localhost:8080")
    api_key: Mapped[str] = mapped_column(String(500), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False, default="local-model")
    temperature: Mapped[float] = mapped_column(default=0.3)
    max_tokens: Mapped[int] = mapped_column(default=4096)
    timeout: Mapped[int] = mapped_column(default=120)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
