from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.database import SessionCore
from app.auth.deps import get_current_user
from app.models.user import User
from app.models.knowledge import KnowledgeFolder, KnowledgeNote
from app.schemas.knowledge import (
    KnowledgeFolderOut, KnowledgeFolderCreate,
    KnowledgeNoteOut, KnowledgeNoteCreate, KnowledgeNoteUpdate,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


def get_db():
    db = SessionCore()
    try:
        yield db
    finally:
        db.close()


# ─── Folders ───

@router.get("/folders", response_model=list[KnowledgeFolderOut])
def list_folders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.execute(select(KnowledgeFolder).order_by(KnowledgeFolder.name)).scalars().all()


@router.post("/folders", response_model=KnowledgeFolderOut)
def create_folder(data: KnowledgeFolderCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = KnowledgeFolder(name=data.name, parent_id=data.parent_id)
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@router.put("/folders/{folder_id}", response_model=KnowledgeFolderOut)
def update_folder(folder_id: int, data: KnowledgeFolderCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = db.get(KnowledgeFolder, folder_id)
    if not f:
        raise HTTPException(status_code=404, detail="Folder not found")
    f.name = data.name
    f.parent_id = data.parent_id
    db.commit()
    db.refresh(f)
    return f


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = db.get(KnowledgeFolder, folder_id)
    if not f:
        raise HTTPException(status_code=404, detail="Folder not found")
    db.delete(f)
    db.commit()
    return {"ok": True}


# ─── Notes ───

@router.get("/notes", response_model=list[KnowledgeNoteOut])
def list_notes(
    folder_id: int | None = Query(None),
    search: str | None = Query(None),
    tag: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(KnowledgeNote)
    if folder_id is not None:
        q = q.where(KnowledgeNote.folder_id == folder_id)
    if search:
        pattern = f"%{search}%"
        q = q.where(or_(KnowledgeNote.title.ilike(pattern), KnowledgeNote.content.ilike(pattern)))
    if tag:
        q = q.where(KnowledgeNote.tags.ilike(f"%{tag}%"))
    return db.execute(q.order_by(KnowledgeNote.updated_at.desc())).scalars().all()


@router.get("/notes/{note_id}", response_model=KnowledgeNoteOut)
def get_note(note_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(KnowledgeNote, note_id)
    if not n:
        raise HTTPException(status_code=404, detail="Note not found")
    return n


@router.post("/notes", response_model=KnowledgeNoteOut)
def create_note(data: KnowledgeNoteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = KnowledgeNote(title=data.title, content=data.content, folder_id=data.folder_id, tags=data.tags)
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


@router.put("/notes/{note_id}", response_model=KnowledgeNoteOut)
def update_note(note_id: int, data: KnowledgeNoteUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(KnowledgeNote, note_id)
    if not n:
        raise HTTPException(status_code=404, detail="Note not found")
    if data.title is not None:
        n.title = data.title
    if data.content is not None:
        n.content = data.content
    if data.folder_id is not None:
        n.folder_id = int(data.folder_id) if data.folder_id != "null" else None
    if data.tags is not None:
        n.tags = data.tags
    db.commit()
    db.refresh(n)
    return n


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(KnowledgeNote, note_id)
    if not n:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(n)
    db.commit()
    return {"ok": True}


@router.get("/graph")
def knowledge_graph(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    notes = db.execute(select(KnowledgeNote)).scalars().all()
    import re
    all_titles = {n.title for n in notes}
    nodes = []
    edges = []
    for n in notes:
        nodes.append({"id": n.id, "title": n.title, "tags": n.tags or "", "folder_id": n.folder_id})
        links = re.findall(r"\[\[([^\]]+)\]\]", n.content)
        for target_title in links:
            target = next((t for t in all_titles if t.lower() == target_title.lower()), None)
            if target:
                target_note = next((x for x in notes if x.title.lower() == target.lower()), None)
                if target_note:
                    edges.append({"source": n.id, "target": target_note.id})
    return {"nodes": nodes, "edges": edges}
