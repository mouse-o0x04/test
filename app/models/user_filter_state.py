from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import BaseCore


class UserFilterState(BaseCore):
    __tablename__ = "user_filter_states"
    __table_args__ = (UniqueConstraint("user_id", "entity", name="uq_user_entity_filter"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    entity: Mapped[str] = mapped_column(String(50), nullable=False)
    filters: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    sort_field: Mapped[str] = mapped_column(String(100), nullable=True)
    sort_direction: Mapped[str] = mapped_column(String(10), default="asc")
    search: Mapped[str] = mapped_column(String(255), nullable=True, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
