from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import get_current_user
from app.models.user import User
from app.services.ai_assistant import chat

router = APIRouter(prefix="/ai", tags=["ai-assistant"])


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ToolCall(BaseModel):
    tool: str
    args: dict
    result: str


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[ToolCall]


@router.post("/chat", response_model=ChatResponse)
def chat_with_ai(data: ChatRequest, _: User = Depends(get_current_user)):
    try:
        result = chat(data.message, data.history)
        return ChatResponse(
            reply=result["reply"],
            tool_calls=[ToolCall(**tc) for tc in result["tool_calls"]],
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Не удалось подключиться к llama.cpp server. Убедитесь, что сервер запущен на {settings.llama_cpp_url}",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Ошибка от llama.cpp server: {e.response.status_code} — {e.response.text[:200]}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка ИИ-ассистента: {e}")


import httpx

from app.config import settings
