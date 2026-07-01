from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_permission
from app.database import get_db_core
from app.models.ai_provider_settings import AIProviderSettings
from app.models.user import User
from app.schemas.ai_provider_settings import AIProviderSettingsOut, AIProviderSettingsUpdate

router = APIRouter(prefix="/ai-settings", tags=["ai-settings"])


def _get_or_create_settings(db: Session) -> AIProviderSettings:
    row = db.execute(select(AIProviderSettings).limit(1)).scalar_one_or_none()
    if not row:
        row = AIProviderSettings()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row

PROVIDER_URLS = {
    "llamacpp": "http://localhost:8080",
    "openai": "https://api.openai.com/v1",
    "ollama": "http://localhost:11434/v1",
    "together": "https://api.together.xyz/v1",
    "groq": "https://api.groq.com/openai/v1",
    "custom": "",
}


@router.get("/providers")
def list_providers():
    return [
        {"key": "llamacpp", "label": "llama.cpp Server", "default_url": "http://localhost:8080"},
        {"key": "openai", "label": "OpenAI API", "default_url": "https://api.openai.com/v1"},
        {"key": "ollama", "label": "Ollama (local)", "default_url": "http://localhost:11434/v1"},
        {"key": "together", "label": "Together AI", "default_url": "https://api.together.xyz/v1"},
        {"key": "groq", "label": "Groq", "default_url": "https://api.groq.com/openai/v1"},
        {"key": "custom", "label": "Свой провайдер", "default_url": ""},
    ]


@router.get("", response_model=AIProviderSettingsOut)
def get_settings(db: Session = Depends(get_db_core), _: User = Depends(get_current_user)):
    return _get_or_create_settings(db)


@router.put("", response_model=AIProviderSettingsOut)
def update_settings(
    data: AIProviderSettingsUpdate,
    db: Session = Depends(get_db_core),
    _: User = Depends(get_current_user),
):
    row = _get_or_create_settings(db)

    for key, val in data.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(row, key, val)

    db.commit()
    db.refresh(row)
    return row
