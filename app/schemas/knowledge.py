from datetime import datetime
from pydantic import BaseModel, ConfigDict


class KnowledgeFolderOut(BaseModel):
    id: int
    name: str
    parent_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KnowledgeFolderCreate(BaseModel):
    name: str
    parent_id: int | None = None


class KnowledgeNoteOut(BaseModel):
    id: int
    title: str
    content: str
    folder_id: int | None = None
    tags: str = ""
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KnowledgeNoteCreate(BaseModel):
    title: str
    content: str = ""
    folder_id: int | None = None
    tags: str = ""


class KnowledgeNoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    folder_id: str | None = None
    tags: str | None = None
