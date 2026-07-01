from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import BaseCore


class KnowledgeFolder(BaseCore):
    __tablename__ = "knowledge_folders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("knowledge_folders.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    children: Mapped[list["KnowledgeFolder"]] = relationship("KnowledgeFolder", back_populates="parent")
    parent: Mapped["KnowledgeFolder | None"] = relationship("KnowledgeFolder", back_populates="children", remote_side="KnowledgeFolder.id")
    notes: Mapped[list["KnowledgeNote"]] = relationship("KnowledgeNote", back_populates="folder", cascade="all, delete-orphan")


class KnowledgeNote(BaseCore):
    __tablename__ = "knowledge_notes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    folder_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("knowledge_folders.id"), nullable=True, index=True)
    tags: Mapped[str] = mapped_column(Text, nullable=True, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    folder: Mapped["KnowledgeFolder | None"] = relationship("KnowledgeFolder", back_populates="notes")
