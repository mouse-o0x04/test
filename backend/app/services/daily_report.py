import json
import logging
import os
from datetime import datetime, timezone, timedelta

import httpx
from sqlalchemy import func

from app.config import settings
from app.database import SessionClients, SessionOrders, SessionWarehouse, SessionCore
from app.models.client import Client
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.warehouse import WarehouseItem
from app.models.ai_provider_settings import AIProviderSettings

logger = logging.getLogger(__name__)


def _get_http_client(**kwargs) -> httpx.Client:
    proxy = os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    defaults = {"timeout": 60}
    if proxy and proxy.startswith("http"):
        defaults["proxy"] = proxy
    defaults.update(kwargs)
    return httpx.Client(**defaults)

STATUS_LABELS = {
    "new": "Новый",
    "in_progress": "В работе",
    "ready": "Готов",
    "delivered": "Отдали",
}


def _get_ai_settings():
    db = SessionCore()
    try:
        from sqlalchemy import select
        row = db.execute(select(AIProviderSettings).limit(1)).scalar_one_or_none()
        if row:
            return {
                "base_url": row.base_url,
                "api_key": row.api_key,
                "model_name": row.model_name,
                "temperature": row.temperature,
                "max_tokens": row.max_tokens,
            }
    except Exception:
        pass
    finally:
        db.close()
    return {
        "base_url": settings.llama_cpp_url,
        "api_key": None,
        "model_name": settings.llama_model_name,
        "temperature": 0.3,
        "max_tokens": 4096,
    }


def collect_daily_data() -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    db_o = SessionOrders()
    db_c = SessionClients()
    db_wh = SessionWarehouse()

    try:
        all_orders = db_o.query(Order).all()

        today_created = [
            o for o in all_orders
            if o.created_at and today_start <= o.created_at.replace(tzinfo=timezone.utc) < today_end
        ]

        ready_orders = [o for o in all_orders if o.status == "ready"]
        delivered_orders = [o for o in all_orders if o.status == "delivered"]
        active_orders = [o for o in all_orders if o.status in ("new", "in_progress")]
        in_progress_orders = [o for o in all_orders if o.status == "in_progress"]

        today_revenue = sum(o.total_price for o in today_created)
        total_revenue = sum(o.total_price for o in all_orders)

        low_stock_items = db_wh.query(WarehouseItem).filter(
            WarehouseItem.min_quantity > 0,
            WarehouseItem.quantity <= WarehouseItem.min_quantity,
        ).all()

        low_stock_details = []
        for w in low_stock_items:
            product = db_wh.get(Product, w.product_id)
            pname = product.name if product else f"#{w.product_id}"
            unit = product.unit_type if product else "шт"
            low_stock_details.append({
                "product": pname,
                "quantity": w.quantity,
                "min_quantity": w.min_quantity,
                "unit": unit,
                "deficit": w.min_quantity - w.quantity,
            })

        def get_client_name(client_id):
            client = db_c.get(Client, client_id)
            return client.name if client else f"#{client_id}"

        ready_details = [
            {"id": o.id, "client": get_client_name(o.client_id), "total_price": o.total_price}
            for o in ready_orders
        ]

        delivered_details = [
            {"id": o.id, "client": get_client_name(o.client_id), "total_price": o.total_price}
            for o in delivered_orders
        ]

        active_details = [
            {"id": o.id, "client": get_client_name(o.client_id), "status": STATUS_LABELS.get(o.status, o.status), "total_price": o.total_price}
            for o in active_orders
        ]

        return {
            "date": now.strftime("%d.%m.%Y"),
            "today_created_count": len(today_created),
            "today_revenue": today_revenue,
            "total_revenue": total_revenue,
            "ready_count": len(ready_orders),
            "ready_orders": ready_details,
            "delivered_count": len(delivered_orders),
            "delivered_orders": delivered_details,
            "active_count": len(active_orders),
            "active_orders": active_details,
            "in_progress_count": len(in_progress_orders),
            "low_stock_count": len(low_stock_details),
            "low_stock_items": low_stock_details,
            "total_orders": len(all_orders),
        }
    finally:
        db_o.close()
        db_c.close()
        db_wh.close()


def format_report_text(data: dict) -> str:
    lines = [
        f"📊 ДНЕВНОЙ ОТЧЁТ — {data['date']}",
        "",
        f"💰 Выручка за сегодня: {data['today_revenue']:,.0f} ₽",
        f"💰 Общая выручка: {data['total_revenue']:,.0f} ₽",
        "",
        f"📦 Всего заказов: {data['total_orders']}",
        f"🆕 Создано сегодня: {data['today_created_count']}",
        "",
        f"✅ Готовы к выдаче: {data['ready_count']}",
    ]

    if data["ready_orders"]:
        for o in data["ready_orders"]:
            lines.append(f"   #{o['id']} — {o['client']} — {o['total_price']:,.0f} ₽")
    else:
        lines.append("   Нет готовых заказов")

    lines.append("")
    lines.append(f"🚚 Отданы сегодня: {data['delivered_count']}")
    if data["delivered_orders"]:
        for o in data["delivered_orders"]:
            lines.append(f"   #{o['id']} — {o['client']} — {o['total_price']:,.0f} ₽")
    else:
        lines.append("   Нет отданных заказов")

    lines.append("")
    lines.append(f"🔄 В работе: {data['in_progress_count']}")
    if data["active_orders"]:
        for o in data["active_orders"]:
            lines.append(f"   #{o['id']} — {o['client']} — {o['status']} — {o['total_price']:,.0f} ₽")

    lines.append("")
    lines.append(f"⚠️ Мало на складе: {data['low_stock_count']} поз.")
    if data["low_stock_items"]:
        for item in data["low_stock_items"]:
            lines.append(f"   {item['product']}: {item['quantity']} {item['unit']} (мин. {item['min_quantity']}, не хватает {item['deficit']})")
    else:
        lines.append("   Все позиции в норме")

    return "\n".join(lines)


def generate_ai_report(data: dict) -> str:
    raw_report = format_report_text(data)

    ai = _get_ai_settings()
    base_url = ai["base_url"].rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]

    system_prompt = (
        "Ты — ИИ-ассистент CRM типографии. Сформируй краткий и понятный дневной отчёт на основе сырых данных. "
        "Используй эмодзи для наглядности. Будь лаконичным, но информативным. "
        "Выдели ключевые моменты: выручка, проблемы со складом, готовые заказы."
    )

    user_message = (
        f"Вот данные за сегодня. Сформируй дневной отчёт:\n\n{raw_report}"
    )

    headers = {"Content-Type": "application/json"}
    if ai["api_key"]:
        headers["Authorization"] = f"Bearer {ai['api_key']}"

    try:
        with _get_http_client() as client:
            resp = client.post(
                f"{base_url}/v1/chat/completions",
                json={
                    "model": ai["model_name"],
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": ai["temperature"],
                    "max_tokens": ai["max_tokens"],
                },
                headers=headers,
            )
            resp.raise_for_status()
            result = resp.json()
            return result["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("AI report generation failed, using raw report: %s", e)
        return raw_report


def generate_daily_report(use_ai: bool = True) -> dict:
    data = collect_daily_data()

    if use_ai:
        report_text = generate_ai_report(data)
    else:
        report_text = format_report_text(data)

    return {
        "data": data,
        "report_text": report_text,
        "raw_text": format_report_text(data),
    }
