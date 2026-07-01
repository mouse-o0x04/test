from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db_core
from app.models.hermes_agent import HermesAgent, HermesEvent
from app.schemas.hermes import (
    HermesAgentCreate,
    HermesAgentOut,
    HermesAgentUpdate,
    HermesEventCreate,
    HermesEventOut,
    HermesEventSend,
)
from app.services.hermes_service import dispatch_event
from app.services.daily_report import generate_daily_report, collect_daily_data, format_report_text

router = APIRouter(prefix="/hermes", tags=["hermes"])


@router.get("/agents", response_model=list[HermesAgentOut])
def list_agents(db: Session = Depends(get_db_core)):
    return db.execute(select(HermesAgent).order_by(HermesAgent.id)).scalars().all()


@router.get("/agents/{agent_id}", response_model=HermesAgentOut)
def get_agent(agent_id: int, db: Session = Depends(get_db_core)):
    agent = db.get(HermesAgent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("/agents", response_model=HermesAgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(data: HermesAgentCreate, db: Session = Depends(get_db_core)):
    agent = HermesAgent(**data.model_dump())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.put("/agents/{agent_id}", response_model=HermesAgentOut)
def update_agent(agent_id: int, data: HermesAgentUpdate, db: Session = Depends(get_db_core)):
    agent = db.get(HermesAgent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(agent, key, val)
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: int, db: Session = Depends(get_db_core)):
    agent = db.get(HermesAgent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.delete(agent)
    db.commit()


@router.get("/events", response_model=list[HermesEventOut])
def list_events(agent_id: int | None = None, db: Session = Depends(get_db_core)):
    q = select(HermesEvent).order_by(HermesEvent.id.desc())
    if agent_id:
        q = q.where(HermesEvent.agent_id == agent_id)
    return db.execute(q).scalars().all()


@router.post("/events", response_model=HermesEventOut, status_code=status.HTTP_201_CREATED)
def send_event(data: HermesEventSend, db: Session = Depends(get_db_core)):
    try:
        event = dispatch_event(
            agent_id=data.agent_id,
            event_type=data.event_type,
            payload=data.payload,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return event


class DailyReportRequest(BaseModel):
    agent_id: int
    use_ai: bool = True


@router.post("/daily-report")
def send_daily_report(data: DailyReportRequest, db: Session = Depends(get_db_core)):
    agent = db.get(HermesAgent, data.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not agent.is_active:
        raise HTTPException(status_code=400, detail="Agent is not active")

    try:
        event = dispatch_event(
            agent_id=data.agent_id,
            event_type="daily_report",
            payload={"use_ai": data.use_ai},
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return event


@router.get("/daily-report/preview")
def preview_daily_report(use_ai: bool = True):
    report = generate_daily_report(use_ai=use_ai)
    return {
        "report_text": report["report_text"],
        "raw_text": report["raw_text"],
        "data": report["data"],
    }
