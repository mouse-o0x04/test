import json
import logging
import os
import smtplib
from datetime import datetime, timezone
from email.mime.text import MIMEText

import httpx
from sqlalchemy.orm import Session

from app.models.hermes_agent import HermesAgent, HermesEvent

logger = logging.getLogger(__name__)


def _get_http_client() -> httpx.Client:
    """Create httpx.Client using system HTTP proxy (SOCKS proxy is not supported by httpx)."""
    proxy = os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    kwargs: dict = {"timeout": 15}
    if proxy and proxy.startswith("http"):
        kwargs["proxy"] = proxy
    return httpx.Client(**kwargs)


def dispatch_event(agent_id: int, event_type: str, payload: dict, db: Session) -> HermesEvent:
    agent = db.get(HermesAgent, agent_id)
    if not agent or not agent.is_active:
        raise ValueError(f"Agent {agent_id} not found or inactive")

    event = HermesEvent(
        agent_id=agent_id,
        event_type=event_type,
        payload=payload,
        status="pending",
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    _deliver(agent, event)

    return event


def _deliver(agent: HermesAgent, event: HermesEvent):
    agent_type = agent.agent_type
    config = agent.config or {}

    try:
        if event.event_type == "daily_report":
            _send_daily_report(agent, event, config)
        elif agent_type == "webhook":
            _send_webhook(agent, event)
        elif agent_type == "telegram":
            _send_telegram(agent, event, config)
        elif agent_type == "email":
            _send_email(agent, event, config)
        else:
            _send_webhook(agent, event)
    except Exception as e:
        logger.exception("Delivery failed for agent %s (type=%s)", agent.id, agent_type)
        event.status = "failed"
        event.response = {"error": str(e)}

    agent.last_seen = datetime.now(timezone.utc)
    db = Session.object_session(event)
    if db:
        db.commit()


def _send_webhook(agent: HermesAgent, event: HermesEvent):
    url = agent.webhook_url
    if not url:
        event.status = "failed"
        event.response = {"error": "No webhook_url configured"}
        return

    try:
        with _get_http_client() as client:
            resp = client.post(
                url,
                json={
                    "event_id": event.id,
                    "event_type": event.event_type,
                    "payload": event.payload,
                    "agent_id": agent.id,
                    "agent_name": agent.name,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
            event.status = "delivered" if resp.is_success else "failed"
            event.response = {"status_code": resp.status_code, "body": resp.text[:500]}
    except Exception as e:
        logger.exception("Webhook call failed for agent %s", agent.id)
        event.status = "failed"
        event.response = {"error": str(e)}

    agent.last_seen = datetime.now(timezone.utc)


def _send_daily_report(agent: HermesAgent, event: HermesEvent, config: dict):
    from app.services.daily_report import generate_daily_report

    use_ai = config.get("use_ai", True)
    report = generate_daily_report(use_ai=use_ai)
    report_text = report["report_text"]

    event.response = {"report_text": report_text, "data": report["data"]}

    if agent.agent_type == "telegram":
        _send_telegram_report(agent, event, config, report_text)
    elif agent.agent_type == "email":
        _send_email_report(agent, event, config, report_text)
    elif agent.agent_type == "webhook":
        _send_webhook_report(agent, event, report_text)
    else:
        _send_webhook_report(agent, event, report_text)


def _send_telegram_report(agent: HermesAgent, event: HermesEvent, config: dict, report_text: str):
    bot_token = config.get("bot_token")
    chat_id = config.get("chat_id")

    if not bot_token or not chat_id:
        event.status = "failed"
        event.response = {"error": "Missing bot_token or chat_id in config"}
        return

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        with _get_http_client() as client:
            resp = client.post(url, json={"chat_id": chat_id, "text": report_text, "parse_mode": "HTML"})
            event.status = "delivered" if resp.is_success else "failed"
            event.response = {"status_code": resp.status_code, "body": resp.text[:500]}
    except Exception as e:
        logger.exception("Telegram report send failed for agent %s", agent.id)
        event.status = "failed"
        event.response = {"error": str(e)}
    agent.last_seen = datetime.now(timezone.utc)


def _send_email_report(agent: HermesAgent, event: HermesEvent, config: dict, report_text: str):
    smtp_host = config.get("smtp_host")
    smtp_port = config.get("smtp_port", 587)
    smtp_user = config.get("smtp_user")
    smtp_pass = config.get("smtp_pass")
    to_email = config.get("to_email")

    if not all([smtp_host, smtp_user, smtp_pass, to_email]):
        event.status = "failed"
        event.response = {"error": "Missing SMTP config"}
        return

    from email.mime.text import MIMEText
    import smtplib

    msg = MIMEText(report_text, "plain", "utf-8")
    msg["Subject"] = f"[CRM] Дневной отчёт — {datetime.now(timezone.utc).strftime('%d.%m.%Y')}"
    msg["From"] = smtp_user
    msg["To"] = to_email

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        event.status = "delivered"
        event.response = {"to": to_email}
    except Exception as e:
        logger.exception("Email report send failed for agent %s", agent.id)
        event.status = "failed"
        event.response = {"error": str(e)}
    agent.last_seen = datetime.now(timezone.utc)


def _send_webhook_report(agent: HermesAgent, event: HermesEvent, report_text: str):
    url = agent.webhook_url
    if not url:
        event.status = "failed"
        event.response = {"error": "No webhook_url configured"}
        return

    try:
        with _get_http_client() as client:
            resp = client.post(url, json={
                "event_type": "daily_report",
                "report_text": report_text,
                "data": event.response.get("data") if event.response else None,
                "agent_id": agent.id,
                "agent_name": agent.name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            event.status = "delivered" if resp.is_success else "failed"
            event.response = {"status_code": resp.status_code, "body": resp.text[:500]}
    except Exception as e:
        logger.exception("Webhook report failed for agent %s", agent.id)
        event.status = "failed"
        event.response = {"error": str(e)}
    agent.last_seen = datetime.now(timezone.utc)


def _send_telegram(agent: HermesAgent, event: HermesEvent, config: dict):
    bot_token = config.get("bot_token")
    chat_id = config.get("chat_id")

    if not bot_token or not chat_id:
        event.status = "failed"
        event.response = {"error": "Missing bot_token or chat_id in config"}
        return

    text = _format_telegram_message(event)
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    try:
        with _get_http_client() as client:
            resp = client.post(
                url,
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
            event.status = "delivered" if resp.is_success else "failed"
            event.response = {"status_code": resp.status_code, "body": resp.text[:500]}
    except Exception as e:
        logger.exception("Telegram send failed for agent %s", agent.id)
        event.status = "failed"
        event.response = {"error": str(e)}

    agent.last_seen = datetime.now(timezone.utc)


def _format_telegram_message(event: HermesEvent) -> str:
    et = event.event_type
    p = event.payload or {}

    status_labels = {
        "new": "Новый", "in_progress": "В работе", "ready": "Готов",
        "delivered": "Отдали",
    }

    if et == "order.created":
        return (
            f"📦 <b>Новый заказ</b>\n"
            f"ID: #{p.get('order_id', '?')}\n"
            f"Клиент: {p.get('client_name', '?')}\n"
            f"Сумма: {p.get('total_price', 0)} ₽"
        )
    elif et == "order.status_changed":
        old = status_labels.get(p.get("old_status", ""), p.get("old_status", "?"))
        new = status_labels.get(p.get("new_status", ""), p.get("new_status", "?"))
        return (
            f"🔄 <b>Статус заказа #{p.get('order_id', '?')}</b>\n"
            f"{old} → {new}"
        )
    elif et == "order.deleted":
        return f"🗑 <b>Заказ #{p.get('order_id', '?')} удалён</b>"
    elif et == "client.created":
        return (
            f"👤 <b>Новый клиент</b>\n"
            f"ID: {p.get('client_id', '?')}\n"
            f"Имя: {p.get('name', '?')}"
        )
    elif et == "client.deleted":
        return f"👤 <b>Клиент «{p.get('name', '?')}» удалён</b>"
    elif et == "low_stock":
        return (
            f"⚠️ <b>Мало на складе</b>\n"
            f"Товар: {p.get('product_name', '?')}\n"
            f"Остаток: {p.get('quantity', 0)}\n"
            f"Минимум: {p.get('min_quantity', 0)}"
        )
    else:
        return f"🔔 <b>{et}</b>\n{json.dumps(p, ensure_ascii=False, indent=2)}"


def _send_email(agent: HermesAgent, event: HermesEvent, config: dict):
    smtp_host = config.get("smtp_host")
    smtp_port = config.get("smtp_port", 587)
    smtp_user = config.get("smtp_user")
    smtp_pass = config.get("smtp_pass")
    to_email = config.get("to_email")

    if not all([smtp_host, smtp_user, smtp_pass, to_email]):
        event.status = "failed"
        event.response = {"error": "Missing SMTP config (smtp_host, smtp_user, smtp_pass, to_email)"}
        return

    subject = f"[CRM] {event.event_type}"
    body = _format_email_body(event)

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        event.status = "delivered"
        event.response = {"to": to_email, "subject": subject}
    except Exception as e:
        logger.exception("Email send failed for agent %s", agent.id)
        event.status = "failed"
        event.response = {"error": str(e)}

    agent.last_seen = datetime.now(timezone.utc)


def _format_email_body(event: HermesEvent) -> str:
    et = event.event_type
    p = event.payload or {}

    status_labels = {
        "new": "Новый", "in_progress": "В работе", "ready": "Готов",
        "delivered": "Отдали",
    }

    lines = [f"Событие: {et}", f"Дата: {datetime.now(timezone.utc).strftime('%d.%m.%Y %H:%M UTC')}", ""]

    if et == "order.created":
        lines += [
            "Новый заказ создан",
            f"  ID: #{p.get('order_id', '?')}",
            f"  Клиент: {p.get('client_name', '?')}",
            f"  Сумма: {p.get('total_price', 0)} ₽",
        ]
    elif et == "order.status_changed":
        old = status_labels.get(p.get("old_status", ""), p.get("old_status", "?"))
        new = status_labels.get(p.get("new_status", ""), p.get("new_status", "?"))
        lines += [
            f"Заказ #{p.get('order_id', '?')}",
            f"  Статус: {old} → {new}",
        ]
    elif et == "order.deleted":
        lines.append(f"Заказ #{p.get('order_id', '?')} удалён")
    elif et == "client.created":
        lines += [
            "Новый клиент",
            f"  ID: {p.get('client_id', '?')}",
            f"  Имя: {p.get('name', '?')}",
        ]
    elif et == "client.deleted":
        lines.append(f"Клиент «{p.get('name', '?')}» удалён")
    elif et == "low_stock":
        lines += [
            "Товар заканчивается на складе",
            f"  Товар: {p.get('product_name', '?')}",
            f"  Остаток: {p.get('quantity', 0)}",
            f"  Минимум: {p.get('min_quantity', 0)}",
        ]
    else:
        lines.append(json.dumps(p, ensure_ascii=False, indent=2))

    return "\n".join(lines)


def notify_all(event_type: str, payload: dict, db: Session):
    from app.database import SessionCore
    core_db = SessionCore()
    try:
        agents = core_db.query(HermesAgent).filter(HermesAgent.is_active == True).all()
        for agent in agents:
            try:
                dispatch_event(agent_id=agent.id, event_type=event_type, payload=payload, db=core_db)
            except Exception as e:
                logger.error("Failed to notify agent %s: %s", agent.id, e)
    finally:
        core_db.close()
