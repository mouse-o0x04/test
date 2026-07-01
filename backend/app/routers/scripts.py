from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.script_runner import delete_script, get_script, list_scripts, run_display_script, run_script, save_script

router = APIRouter(prefix="/scripts", tags=["scripts"])


class ScriptCreate(BaseModel):
    name: str
    content: str


class ScriptOut(BaseModel):
    name: str
    filename: str
    size: int


class ScriptContent(BaseModel):
    name: str
    content: str


class RunScriptRequest(BaseModel):
    name: str
    data: dict


@router.get("", response_model=list[ScriptOut])
def api_list_scripts():
    return list_scripts()


@router.get("/{name}")
def api_get_script(name: str):
    content = get_script(name)
    if content is None:
        raise HTTPException(status_code=404, detail="Script not found")
    return ScriptContent(name=name, content=content)


@router.post("", response_model=ScriptOut, status_code=201)
def api_create_script(data: ScriptCreate):
    try:
        result = save_script(data.name, data.content)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{name}", response_model=ScriptOut)
def api_update_script(name: str, data: ScriptCreate):
    existing = get_script(name)
    if existing is None:
        raise HTTPException(status_code=404, detail="Script not found")
    try:
        result = save_script(data.name, data.content)
        if data.name != name:
            delete_script(name)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{name}")
def api_delete_script(name: str):
    if not delete_script(name):
        raise HTTPException(status_code=404, detail="Script not found")
    return {"ok": True}


@router.post("/run")
def api_run_script(data: RunScriptRequest):
    try:
        result = run_script(data.name, data.data)
        return {"result": result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Script error: {e}")


@router.post("/run-display")
def api_run_display_script(data: RunScriptRequest):
    try:
        result = run_display_script(data.name, data.data)
        return {"result": result}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Script error: {e}")
