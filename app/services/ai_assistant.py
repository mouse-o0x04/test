import json
import logging
import os
import re
from datetime import datetime, timezone

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import SessionClients, SessionOrders, SessionWarehouse, SessionCore
from app.models.client import Client
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.product_raw_material import ProductRawMaterial
from app.models.raw_material import RawMaterial
from app.models.warehouse import WarehouseItem
from app.models.ai_provider_settings import AIProviderSettings
from app.routers.products import _ensure_warehouse_for_product

logger = logging.getLogger(__name__)


def _get_http_client(**kwargs) -> httpx.Client:
    proxy = os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    defaults = {"timeout": 15}
    if proxy and proxy.startswith("http"):
        defaults["proxy"] = proxy
    defaults.update(kwargs)
    return httpx.Client(**defaults)

CRM_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_clients",
            "description": "Получить список всех клиентов. Можно найти клиента по имени или email.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_client",
            "description": "Получить информацию о клиенте по ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента"},
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_client",
            "description": "Создать нового клиента.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Имя клиента"},
                    "email": {"type": "string", "description": "Email клиента"},
                    "phone": {"type": "string", "description": "Телефон клиента"},
                    "company": {"type": "string", "description": "Компания клиента"},
                    "address": {"type": "string", "description": "Адрес клиента"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_client",
            "description": "Обновить данные клиента.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента"},
                    "name": {"type": "string", "description": "Имя клиента"},
                    "email": {"type": "string", "description": "Email клиента"},
                    "phone": {"type": "string", "description": "Телефон клиента"},
                    "company": {"type": "string", "description": "Компания клиента"},
                    "address": {"type": "string", "description": "Адрес клиента"},
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_client",
            "description": "Удалить клиента по ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента"},
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_orders",
            "description": "Получить список заказов. Можно фильтровать по статусу или клиенту.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Фильтр по статусу: new, in_progress, ready, delivered"},
                    "client_name": {"type": "string", "description": "Фильтр по имени клиента"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_order",
            "description": "Получить информацию о заказе по ID, включая список продуктов.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "integer", "description": "ID заказа"},
                },
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_order",
            "description": "Создать новый заказ. Сначала нужно найти client_id и product_id через list_clients и list_products.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента"},
                    "items": {
                        "type": "array",
                        "description": "Список позиций заказа",
                        "items": {
                            "type": "object",
                            "properties": {
                                "product_id": {"type": "integer", "description": "ID продукта"},
                                "quantity": {"type": "integer", "description": "Количество"},
                            },
                            "required": ["product_id", "quantity"],
                        },
                    },
                    "status": {"type": "string", "description": "Статус заказа (по умолчанию new)"},
                    "description": {"type": "string", "description": "Описание заказа"},
                    "notes": {"type": "string", "description": "Примечания"},
                },
                "required": ["client_id", "items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_order_status",
            "description": "Изменить статус заказа.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "integer", "description": "ID заказа"},
                    "status": {"type": "string", "description": "Новый статус: new, in_progress, ready, delivered"},
                },
                "required": ["order_id", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_order",
            "description": "Удалить заказ по ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "integer", "description": "ID заказа"},
                },
                "required": ["order_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_products",
            "description": "Получить список всех продуктов с ценами.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_product",
            "description": "Создать новый продукт.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Название продукта"},
                    "description": {"type": "string", "description": "Описание продукта"},
                    "unit_price": {"type": "number", "description": "Цена за единицу"},
                    "unit_type": {"type": "string", "description": "Единица измерения: piece, sheet, m2, roll, set"},
                    "category": {"type": "string", "description": "Категория продукта"},
                    "formula": {"type": "string", "description": "Формула расчёта цены (переменные: quantity, unit_price)"},
                    "supplier_url": {"type": "string", "description": "Ссылка на страницу товара у поставщика"},
                },
                "required": ["name", "unit_price", "unit_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_product",
            "description": "Обновить данные продукта.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "integer", "description": "ID продукта"},
                    "name": {"type": "string", "description": "Название продукта"},
                    "description": {"type": "string", "description": "Описание продукта"},
                    "unit_price": {"type": "number", "description": "Цена за единицу"},
                    "unit_type": {"type": "string", "description": "Единица измерения"},
                    "category": {"type": "string", "description": "Категория продукта"},
                    "formula": {"type": "string", "description": "Формула расчёта цены"},
                    "supplier_url": {"type": "string", "description": "Ссылка на страницу товара у поставщика"},
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_product",
            "description": "Удалить продукт по ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "integer", "description": "ID продукта"},
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_raw_materials",
            "description": "Получить список всех видов сырья на складе. Используй чтобы узнать raw_material_id перед добавлением сырья к продукту.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_raw_material_to_product",
            "description": "Добавить компонент к продукту. Компонент может быть СЫРЬЁМ (raw_material_id) ИЛИ другим ПРОДУКТОМ (component_product_id). Поддерживает несколько компонентов одного сырья с разными размерами. Укажите ОДИН из raw_material_id/component_product_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "integer", "description": "ID продукта"},
                    "raw_material_id": {"type": "integer", "description": "ID сырья (если компонент — сырьё). Узнать через list_raw_materials."},
                    "component_product_id": {"type": "integer", "description": "ID под-продукта (если компонент — другой продукт). Узнать через list_products."},
                    "name": {"type": "string", "description": "Название компонента: «Карман 100×50», «Обложка»"},
                    "coefficient": {"type": "number", "description": "Коэффициент расхода (fallback): сколько единиц сырья на 1 штуку компонента"},
                    "cut_width_mm": {"type": "number", "description": "Ширина отреза в мм. Если не указано — наследуется от заказа"},
                    "cut_height_mm": {"type": "number", "description": "Высота отреза в мм. Если не указано — наследуется от заказа"},
                    "quantity_per_unit": {"type": "integer", "description": "Сколько штук этого компонента на 1 продукт. По умолчанию 1"},
                    "price_per_unit": {"type": "number", "description": "Цена за 1 штуку компонента в рублях. Если задано у всех компонентов — цена продукта = сумма (цена × кол-во)"},
                },
                "required": ["product_id", "coefficient"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_raw_material_from_product",
            "description": "Удалить компонент из продукта. Укажите raw_material_id (для сырья) или component_product_id (для под-продукта). Если у продукта несколько компонентов одного типа — все будут удалены.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "integer", "description": "ID продукта"},
                    "raw_material_id": {"type": "integer", "description": "ID сырья для удаления"},
                    "component_product_id": {"type": "integer", "description": "ID под-продукта для удаления"},
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_product_components",
            "description": "Показать состав продукта: список всех компонентов с их сырьём, размерами, количеством и ценой.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "integer", "description": "ID продукта"},
                },
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_warehouse",
            "description": "Получить остатки товаров на складе.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_warehouse_item",
            "description": "Найти позицию на складе по ID или названию. Вернёт詳細ную информацию о позиции включая текущий остаток.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "ID позиции на складе (число) или часть названия для поиска (напр. 'Бумага SRA3')"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_stock",
            "description": "Прибавить количество к остатку на складе. Используй когда пользователь просит 'добавить', 'прибавить', 'положить' товар на склад.",
            "parameters": {
                "type": "object",
                "properties": {
                    "warehouse_item_id": {"type": "integer", "description": "ID позиции на складе (из get_warehouse или get_warehouse_item)"},
                    "quantity": {"type": "number", "description": "Сколько добавить (положительное число)"},
                },
                "required": ["warehouse_item_id", "quantity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_stock",
            "description": "Установить точное количество остатка на складе (перезаписать). Используй когда пользователь просит 'установить', 'поставить' определённое количество.",
            "parameters": {
                "type": "object",
                "properties": {
                    "warehouse_item_id": {"type": "integer", "description": "ID позиции на складе"},
                    "quantity": {"type": "number", "description": "Новое количество остатка"},
                },
                "required": ["warehouse_item_id", "quantity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_dashboard_stats",
            "description": "Получить статистику дашборда: количество заказов по статусам, клиентов, продуктов, выручка.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Открыть веб-страницу по ссылке и вернуть её текстовое содержимое. Используй когда пользователь присылает ссылку на сайт поставщика или любую другую страницу.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL страницы для загрузки"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_daily_report",
            "description": "Сформировать дневной отчёт по CRM: выручка за сегодня, заказы по статусам (готовы, отданы, в работе), мало на складе. Используй когда пользователь просит отчёт за день.",
            "parameters": {
                "type": "object",
                "properties": {
                    "use_ai": {
                        "type": "boolean",
                        "description": "Использовать ИИ для форматирования отчёта (по умолчанию true)",
                    },
                },
                "required": [],
            },
        },
    },
]

SYSTEM_PROMPT = """Ты — ИИ-ассистент CRM для типографии. Ты помогаешь управлять клиентами, заказами, продуктами и складом.

Сегодня: {date}

Доступные статусы заказов:
- new — Новый
- in_progress — В работе
- ready — Готов
- delivered — Отдали

Единицы измерения продуктов:
- piece — штука (шт.)
- sheet — лист
- m2 — квадратный метр (м²)
- roll — рулон
- set — комплект

Правила:
1. Всегда отвечай на русском языке.
2. Перед созданием заказа найди client_id через list_clients и product_id через list_products.
3. При создании заказа products нужно указать product_id и quantity для каждой позиции.
4. Цены автоматически рассчитывается по формулам продуктов.
5. Если пользователь хочет узнать информацию — используй инструменты для получения данных.
6. Если пользователь хочет создать/изменить/удалить — используй соответствующий инструмент.
7. Форматируй ответы красиво, используй таблицы если нужно показать список.
8. Если операция прошла успешно — подтверди это пользователю.
9. При ошибках объясни что пошло не так и предложи варианты.
10. Если пользователь прислал ссылку — используй fetch_url чтобы загрузить страницу и извлечь данные.
11. После загрузки страницы по ссылке — извлекай название, цену и характеристики товаров и предлагай создать продукт.
12. Если пользователь даёт ссылку на товар поставщика (URL) — сохраняй её в поле supplier_url при создании или обновлении продукта.
13. Если пользователь просит создать продукт со ссылкой — обязательно передай supplier_url в инструмент create_product.

Работа с компонентами продукта:
- Продукт может состоять из нескольких компонентов (сырья). Например «Стенд с карманами» = ПВХ + самоклейка + 3 кармана 100×50 + 2 кармана 80×30.
- Если пользователь просит добавить компонент — СНАЧАЛА вызови list_raw_materials чтобы узнать raw_material_id, затем add_raw_material_to_product с product_id, raw_material_id, coefficient и опционально: name, cut_width_mm, cut_height_mm, quantity_per_unit, price_per_unit.
- name — название компонента («Карман 100×50», «Обложка»). cut_width_mm/cut_height_mm — размер отреза в мм (если не указать, наследуется от заказа). quantity_per_unit — сколько штук на 1 продукт (3 кармана, 50 листов). price_per_unit — цена за 1 штуку в рублях.
- Можно добавить несколько компонентов из одного сырья с разными размерами (карманы 100×50 и 80×30).
- Если у продукта уже есть компонент с таким же именем — он будет обновлён, не создастся дубликат.
- Если пользователь просит убрать сырьё — вызови remove_raw_material_from_product (удалятся все компоненты с этим raw_material_id).
- Если хочешь посмотреть состав продукта — вызови list_product_components.

Работа со складом:
- Когда пользователь просит добавить/прибавить/положить товар на склад — СНАЧАЛА вызови get_warehouse_item с названием или ID, затем add_to_stock с warehouse_item_id и количеством.
- Когда пользователь просит установить/поставить определённое количество — СНАЧАЛА вызови get_warehouse_item, затем set_stock.
- НИКОГДА не придумывай ID позиций — всегда ищи через get_warehouse или get_warehouse_item.
- Подтверждай действие показывая старое и новое значение остатка.
"""


def _get_system_prompt() -> str:
    now = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M")
    return SYSTEM_PROMPT.format(date=now)


def _get_item_name(w: WarehouseItem, db) -> str:
    """Get human-readable name for a warehouse item."""
    if w.raw_material_id:
        rm = db.get(RawMaterial, w.raw_material_id)
        return rm.name if rm else f"Сырьё #{w.raw_material_id}"
    if w.product_id:
        product = db.get(Product, w.product_id)
        return product.name if product else f"Продукт #{w.product_id}"
    return f"Позиция #{w.id}"


def _format_warehouse_item(w: WarehouseItem, db) -> str:
    """Format a single warehouse item for display."""
    name = _get_item_name(w, db)
    warning = " ⚠ МАЛО!" if w.min_quantity > 0 and w.quantity <= w.min_quantity else ""
    if w.raw_material_id:
        rm = db.get(RawMaterial, w.raw_material_id)
        if rm and rm.unit_type == "roll" and rm.roll_length_m and rm.roll_length_m > 0:
            rolls = w.quantity / rm.roll_length_m
            return f"ID: {w.id} | {name} | Остаток: {w.quantity} м ({rolls:.1f} рул.) | Мин: {w.min_quantity}{warning}"
    unit = ""
    if w.raw_material_id:
        rm = db.get(RawMaterial, w.raw_material_id)
        unit = rm.unit_type if rm else "шт"
    elif w.product_id:
        product = db.get(Product, w.product_id)
        unit = product.unit_type if product else "шт"
    return f"ID: {w.id} | {name} | Остаток: {w.quantity} {unit or 'шт'} | Мин: {w.min_quantity}{warning}"


def _execute_tool(name: str, args: dict) -> str:
    try:
        if name == "list_clients":
            db = SessionClients()
            try:
                clients = db.query(Client).order_by(Client.id).all()
                if not clients:
                    return "Клиентов пока нет."
                result = []
                for c in clients:
                    result.append(f"ID: {c.id} | {c.name} | {c.email or '—'} | {c.phone or '—'} | {c.company or '—'}")
                return "Клиенты:\n" + "\n".join(result)
            finally:
                db.close()

        elif name == "get_client":
            db = SessionClients()
            try:
                client = db.get(Client, args["client_id"])
                if not client:
                    return f"Клиент с ID {args['client_id']} не найден."
                details = []
                if client.company_details:
                    for d in client.company_details:
                        parts = [f"Название: {d.company_name}"]
                        if d.inn:
                            parts.append(f"ИНН: {d.inn}")
                        details.append("  Реквизиты: " + ", ".join(parts))
                return (
                    f"Клиент #{client.id}:\n"
                    f"  Имя: {client.name}\n"
                    f"  Email: {client.email or '—'}\n"
                    f"  Телефон: {client.phone or '—'}\n"
                    f"  Компания: {client.company or '—'}\n"
                    f"  Адрес: {client.address or '—'}\n"
                    + "\n".join(details)
                )
            finally:
                db.close()

        elif name == "create_client":
            db = SessionClients()
            try:
                client = Client(
                    name=args["name"],
                    email=args.get("email"),
                    phone=args.get("phone"),
                    company=args.get("company"),
                    address=args.get("address"),
                )
                db.add(client)
                db.commit()
                db.refresh(client)
                return f"Клиент «{client.name}» создан (ID: {client.id})."
            finally:
                db.close()

        elif name == "update_client":
            db = SessionClients()
            try:
                client = db.get(Client, args["client_id"])
                if not client:
                    return f"Клиент с ID {args['client_id']} не найден."
                for key in ["name", "email", "phone", "company", "address"]:
                    if key in args and args[key] is not None:
                        setattr(client, key, args[key])
                db.commit()
                return f"Клиент «{client.name}» (ID: {client.id}) обновлён."
            finally:
                db.close()

        elif name == "delete_client":
            db = SessionClients()
            try:
                client = db.get(Client, args["client_id"])
                if not client:
                    return f"Клиент с ID {args['client_id']} не найден."
                name = client.name
                db.delete(client)
                db.commit()
                return f"Клиент «{name}» (ID: {args['client_id']}) удалён."
            finally:
                db.close()

        elif name == "list_orders":
            db_o = SessionOrders()
            db_c = SessionClients()
            try:
                q = db_o.query(Order)
                if args.get("status"):
                    q = q.filter(Order.status == args["status"])
                if args.get("client_name"):
                    clients = db_c.query(Client).filter(Client.name.ilike(f"%{args['client_name']}%")).all()
                    client_ids = [c.id for c in clients]
                    q = q.filter(Order.client_id.in_(client_ids))
                orders = q.order_by(Order.id.desc()).all()
                if not orders:
                    return "Заказов не найдено."
                status_labels = {
                    "new": "Новый", "in_progress": "В работе", "post_processing": "Постобработка", "ready": "Готов", "delivered": "Отдали",
                }
                result = []
                for o in orders:
                    client = db_c.get(Client, o.client_id)
                    client_name = client.name if client else f"#{o.client_id}"
                    status = status_labels.get(o.status, o.status)
                    result.append(f"#{o.id} | {client_name} | {status} | {o.total_price} ₽")
                return "Заказы:\n" + "\n".join(result)
            finally:
                db_o.close()
                db_c.close()

        elif name == "get_order":
            db_o = SessionOrders()
            db_c = SessionClients()
            db_wh = SessionWarehouse()
            try:
                order = db_o.get(Order, args["order_id"])
                if not order:
                    return f"Заказ с ID {args['order_id']} не найден."
                client = db_c.get(Client, order.client_id)
                client_name = client.name if client else f"#{order.client_id}"
                items = db_o.query(OrderItem).filter(OrderItem.order_id == order.id).all()
                status_labels = {
                    "new": "Новый", "in_progress": "В работе", "post_processing": "Постобработка", "ready": "Готов", "delivered": "Отдали",
                }
                items_str = []
                for i in items:
                    product = db_wh.get(Product, i.product_id)
                    pname = product.name if product else f"#{i.product_id}"
                    unit = product.unit_type if product else "шт"
                    completed = "✓" if i.is_completed else "○"
                    items_str.append(f"  {completed} {pname} — {i.quantity} {unit} × {i.unit_price} ₽")
                return (
                    f"Заказ #{order.id}:\n"
                    f"  Клиент: {client_name}\n"
                    f"  Статус: {status_labels.get(order.status, order.status)}\n"
                    f"  Сумма: {order.total_price} ₽\n"
                    f"  Прогресс: {round(sum(1 for i in items if i.is_completed) / len(items) * 100) if items else 0}%\n"
                    f"  Описание: {order.description or '—'}\n"
                    f"  Продукты:\n" + "\n".join(items_str)
                )
            finally:
                db_o.close()
                db_c.close()
                db_wh.close()

        elif name == "create_order":
            db_o = SessionOrders()
            db_c = SessionClients()
            db_wh = SessionWarehouse()
            try:
                client = db_c.get(Client, args["client_id"])
                if not client:
                    return f"Клиент с ID {args['client_id']} не найден. Используй list_clients для поиска."

                from app.services.formula import safe_eval
                from app.services.script_runner import run_script

                total_price = 0.0
                order_items = []
                for item_data in args["items"]:
                    product = db_wh.get(Product, item_data["product_id"])
                    if not product:
                        return f"Продукт с ID {item_data['product_id']} не найден. Используй list_products для поиска."

                    quantity = item_data["quantity"]
                    if product.formula_script and product.formula_script.strip():
                        script_data = {
                            "quantity": quantity,
                            "unit_price": product.unit_price,
                            "price": product.unit_price,
                            "product_name": product.name,
                            "product_id": product.id,
                            "product_category": product.category,
                            "product_unit_type": product.unit_type,
                            "product_description": product.description,
                        }
                        item_price = run_script(product.formula_script, script_data)
                    elif product.formula and product.formula.strip():
                        variables = {"quantity": quantity, "unit_price": product.unit_price, "price": product.unit_price}
                        item_price = safe_eval(product.formula, variables)
                    else:
                        item_price = product.unit_price * quantity

                    total_price += round(item_price, 2)
                    order_items.append(OrderItem(
                        product_id=item_data["product_id"],
                        quantity=quantity,
                        unit_price=round(item_price / quantity, 2) if quantity else product.unit_price,
                    ))

                order = Order(
                    client_id=args["client_id"],
                    total_price=round(total_price, 2),
                    status=args.get("status", "new"),
                    description=args.get("description"),
                    notes=args.get("notes"),
                )
                db_o.add(order)
                db_o.flush()

                for oi in order_items:
                    oi.order_id = order.id
                    db_o.add(oi)

                db_o.commit()

                items_desc = ", ".join(
                    f"{db_wh.get(Product, i.product_id).name or f'#{i.product_id}'} × {i.quantity}"
                    for i in order_items
                )
                return f"Заказ #{order.id} создан для клиента «{client.name}» на сумму {order.total_price} ₽. Продукты: {items_desc}."
            finally:
                db_o.close()
                db_c.close()
                db_wh.close()

        elif name == "update_order_status":
            db = SessionOrders()
            try:
                order = db.get(Order, args["order_id"])
                if not order:
                    return f"Заказ с ID {args['order_id']} не найден."
                valid = ["new", "in_progress", "post_processing", "ready", "delivered"]
                if args["status"] not in valid:
                    return f"Неверный статус «{args['status']}». Допустимые: {', '.join(valid)}"
                old = order.status
                order.status = args["status"]
                if args["status"] == "ready":
                    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
                    for i in items:
                        i.is_completed = True
                elif args["status"] in ("new", "in_progress", "post_processing"):
                    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
                    for i in items:
                        i.is_completed = False
                db.commit()
                return f"Статус заказа #{order.id} изменён с «{old}» на «{args['status']}»."
            finally:
                db.close()

        elif name == "delete_order":
            db = SessionOrders()
            try:
                order = db.get(Order, args["order_id"])
                if not order:
                    return f"Заказ с ID {args['order_id']} не найден."
                oid = order.id
                db.delete(order)
                db.commit()
                return f"Заказ #{oid} удалён."
            finally:
                db.close()

        elif name == "list_products":
            db = SessionWarehouse()
            try:
                products = db.query(Product).order_by(Product.id).all()
                if not products:
                    return "Продуктов пока нет."
                result = []
                for p in products:
                    formula_info = ""
                    if p.formula_script:
                        formula_info = f" [скрипт: {p.formula_script}]"
                    elif p.formula:
                        formula_info = f" [формула: {p.formula}]"
                    result.append(f"ID: {p.id} | {p.name} | {p.unit_price} ₽/{p.unit_type} | {p.category or '—'}{formula_info}")
                return "Продукты:\n" + "\n".join(result)
            finally:
                db.close()

        elif name == "create_product":
            db = SessionWarehouse()
            try:
                product = Product(
                    name=args["name"],
                    description=args.get("description"),
                    unit_price=args["unit_price"],
                    unit_type=args.get("unit_type", "piece"),
                    category=args.get("category"),
                    formula=args.get("formula"),
                    supplier_url=args.get("supplier_url"),
                )
                db.add(product)
                db.commit()
                db.refresh(product)
                return f"Продукт «{product.name}» создан (ID: {product.id}), цена {product.unit_price} ₽/{product.unit_type}."
            finally:
                db.close()

        elif name == "update_product":
            db = SessionWarehouse()
            try:
                product = db.get(Product, args["product_id"])
                if not product:
                    return f"Продукт с ID {args['product_id']} не найден."
                for key in ["name", "description", "unit_price", "unit_type", "category", "formula", "supplier_url"]:
                    if key in args and args[key] is not None:
                        setattr(product, key, args[key])
                db.commit()
                return f"Продукт «{product.name}» (ID: {product.id}) обновлён."
            finally:
                db.close()

        elif name == "delete_product":
            db = SessionWarehouse()
            try:
                product = db.get(Product, args["product_id"])
                if not product:
                    return f"Продукт с ID {args['product_id']} не найден."
                name = product.name
                db.delete(product)
                db.commit()
                return f"Продукт «{name}» (ID: {args['product_id']}) удалён."
            finally:
                db.close()

        elif name == "list_raw_materials":
            db = SessionWarehouse()
            try:
                materials = db.query(RawMaterial).order_by(RawMaterial.id).all()
                if not materials:
                    return "Сырья пока нет."
                result = []
                for rm in materials:
                    dims = []
                    if rm.width_mm:
                        dims.append(f"ширина {rm.width_mm} мм")
                    if rm.height_mm:
                        dims.append(f"высота {rm.height_mm} мм")
                    if rm.roll_length_m:
                        dims.append(f"длина рулона {rm.roll_length_m} м")
                    dims_str = f" | {', '.join(dims)}" if dims else ""
                    result.append(f"ID: {rm.id} | {rm.name} | тип: {rm.unit_type}{dims_str}")
                return "Сырьё:\n" + "\n".join(result)
            finally:
                db.close()

        elif name == "add_raw_material_to_product":
            db = SessionWarehouse()
            try:
                product = db.get(Product, args["product_id"])
                if not product:
                    return f"Продукт с ID {args['product_id']} не найден."
                rm_id = args.get("raw_material_id")
                sub_pid = args.get("component_product_id")
                if not rm_id and not sub_pid:
                    return "Укажите raw_material_id (сырьё) или component_product_id (под-продукт)."
                if rm_id and sub_pid:
                    return "Укажите только ОДИН из raw_material_id/component_product_id, не оба."
                rm = None
                sub_product = None
                source_label = ""
                if rm_id:
                    rm = db.get(RawMaterial, rm_id)
                    if not rm:
                        return f"Сырьё с ID {rm_id} не найдено. Используй list_raw_materials для поиска."
                    source_label = rm.name
                else:
                    sub_product = db.get(Product, sub_pid)
                    if not sub_product:
                        return f"Продукт с ID {sub_pid} не найден. Используй list_products для поиска."
                    if sub_product.id == product.id:
                        return "Продукт не может быть компонентом самого себя."
                    source_label = sub_product.name
                coefficient = float(args["coefficient"])
                if coefficient <= 0:
                    return "Коэффициент должен быть положительным числом."
                comp_name = args.get("name")
                cut_w = args.get("cut_width_mm")
                cut_h = args.get("cut_height_mm")
                qty_per_unit = int(args.get("quantity_per_unit") or 1)
                price = args.get("price_per_unit")

                match_field = "raw_material_id" if rm_id else "component_product_id"
                match_value = rm_id or sub_pid
                existing_count = db.execute(
                    select(ProductRawMaterial).where(
                        ProductRawMaterial.product_id == product.id,
                        getattr(ProductRawMaterial, match_field) == match_value,
                    )
                ).scalars().all()
                if comp_name:
                    match = next((e for e in existing_count if (e.name or "") == comp_name), None)
                else:
                    match = existing_count[0] if existing_count else None

                if match:
                    match.coefficient = coefficient
                    if comp_name is not None: match.name = comp_name
                    if cut_w is not None: match.cut_width_mm = float(cut_w)
                    if cut_h is not None: match.cut_height_mm = float(cut_h)
                    if qty_per_unit: match.quantity_per_unit = qty_per_unit
                    if price is not None: match.price_per_unit = float(price)
                    msg = f"Компонент «{comp_name or source_label}» продукта «{product.name}» обновлён: коэфф={coefficient}, кол-во={qty_per_unit}, цена={price}."
                else:
                    next_sort = db.execute(
                        select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
                    ).scalars().all()
                    sort_order = len(next_sort)
                    prm = ProductRawMaterial(
                        product_id=product.id,
                        raw_material_id=rm_id,
                        component_product_id=sub_pid,
                        name=comp_name or source_label,
                        coefficient=coefficient,
                        cut_width_mm=float(cut_w) if cut_w is not None else None,
                        cut_height_mm=float(cut_h) if cut_h is not None else None,
                        quantity_per_unit=qty_per_unit,
                        price_per_unit=float(price) if price is not None else None,
                        sort_order=sort_order,
                    )
                    db.add(prm)
                    if rm_id and not product.raw_material_id:
                        product.raw_material_id = rm_id
                        product.material_coefficient = coefficient
                    msg = f"Компонент «{comp_name or source_label}» добавлен к продукту «{product.name}»: коэфф={coefficient}, кол-во={qty_per_unit}"
                    if cut_w and cut_h:
                        msg += f", отрез {cut_w}×{cut_h}мм"
                    if price is not None:
                        msg += f", цена {price}₽/шт"
                    if sub_pid:
                        msg += f" (под-продукт: {sub_product.name})"
                    msg += "."
                db.flush()
                from app.routers.products import _detect_cycle
                if _detect_cycle(product.id, db):
                    db.rollback()
                    return "Ошибка: циклическая зависимость. Этот продукт уже содержит данного под-продукта в своём составе."
                _ensure_warehouse_for_product(product, db)
                db.commit()
                return msg
            finally:
                db.close()

        elif name == "remove_raw_material_from_product":
            db = SessionWarehouse()
            try:
                product = db.get(Product, args["product_id"])
                if not product:
                    return f"Продукт с ID {args['product_id']} не найден."
                rm_id = args.get("raw_material_id")
                sub_pid = args.get("component_product_id")
                if not rm_id and not sub_pid:
                    return "Укажите raw_material_id или component_product_id для удаления."
                conds = [ProductRawMaterial.product_id == product.id]
                if rm_id:
                    conds.append(ProductRawMaterial.raw_material_id == rm_id)
                if sub_pid:
                    conds.append(ProductRawMaterial.component_product_id == sub_pid)
                prms = db.execute(select(ProductRawMaterial).where(*conds)).scalars().all()
                if not prms:
                    return f"Компонент не найден у продукта {args['product_id']}."
                label = ""
                if rm_id:
                    rm = db.get(RawMaterial, rm_id)
                    label = rm.name if rm else f"сырьё #{rm_id}"
                else:
                    sub = db.get(Product, sub_pid)
                    label = sub.name if sub else f"продукт #{sub_pid}"
                for prm in prms:
                    db.delete(prm)
                if rm_id and product.raw_material_id == rm_id:
                    remaining = db.execute(
                        select(ProductRawMaterial).where(
                            ProductRawMaterial.product_id == product.id,
                            ProductRawMaterial.raw_material_id.is_not(None),
                        )
                    ).scalars().all()
                    if remaining:
                        product.raw_material_id = remaining[0].raw_material_id
                        product.material_coefficient = remaining[0].coefficient
                    else:
                        product.raw_material_id = None
                        product.material_coefficient = None
                db.flush()
                _ensure_warehouse_for_product(product, db)
                db.commit()
                return f"Удалено компонентов: {len(prms)} («{label}») у продукта «{product.name}»."
            finally:
                db.close()

        elif name == "list_product_components":
            db = SessionWarehouse()
            try:
                product = db.get(Product, args["product_id"])
                if not product:
                    return f"Продукт с ID {args['product_id']} не найден."
                prms = db.execute(
                    select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
                    .order_by(ProductRawMaterial.sort_order, ProductRawMaterial.id)
                ).scalars().all()
                if not prms:
                    return f"У продукта «{product.name}» нет компонентов."
                lines = [f"Компоненты продукта «{product.name}» (ID {product.id}):"]
                for i, prm in enumerate(prms, 1):
                    if prm.raw_material_id:
                        rm = db.get(RawMaterial, prm.raw_material_id)
                        src_name = rm.name if rm else f"#{prm.raw_material_id}"
                        src_type = "сырьё"
                        src_id = prm.raw_material_id
                    else:
                        sub = db.get(Product, prm.component_product_id)
                        src_name = sub.name if sub else f"#{prm.component_product_id}"
                        src_type = "продукт"
                        src_id = prm.component_product_id
                    parts = [f"{i}. {prm.name or src_name}"]
                    parts.append(f"{src_type}: {src_name} (ID {src_id})")
                    parts.append(f"коэфф={prm.coefficient}")
                    parts.append(f"кол-во={prm.quantity_per_unit or 1}")
                    if prm.cut_width_mm and prm.cut_height_mm:
                        parts.append(f"отрез {prm.cut_width_mm}×{prm.cut_height_mm}мм")
                    if prm.price_per_unit is not None:
                        parts.append(f"цена {prm.price_per_unit}₽/шт")
                    lines.append("  " + ", ".join(parts))
                return "\n".join(lines)
            finally:
                db.close()

        elif name == "get_warehouse":
            db = SessionWarehouse()
            try:
                items = db.query(WarehouseItem).order_by(WarehouseItem.id).all()
                if not items:
                    return "Склад пуст."
                result = []
                for w in items:
                    warning = " ⚠ МАЛО!" if w.min_quantity > 0 and w.quantity <= w.min_quantity else ""
                    if w.raw_material_id:
                        rm = db.get(RawMaterial, w.raw_material_id)
                        if rm:
                            name = rm.name
                            if rm.unit_type == "roll" and rm.roll_length_m and rm.roll_length_m > 0:
                                rolls = w.quantity / rm.roll_length_m
                                result.append(f"ID: {w.id} | {name} | Остаток: {w.quantity} м ({rolls:.1f} рул. по {rm.roll_length_m}м) | Мин: {w.min_quantity}{warning}")
                            else:
                                result.append(f"ID: {w.id} | {name} | Остаток: {w.quantity} {rm.unit_type or 'шт'} | Мин: {w.min_quantity}{warning}")
                        else:
                            result.append(f"ID: {w.id} | #{w.raw_material_id} | Остаток: {w.quantity}{warning}")
                    else:
                        product = db.get(Product, w.product_id)
                        pname = product.name if product else f"#{w.product_id}"
                        unit = product.unit_type if product else "шт"
                        result.append(f"ID: {w.id} | {pname} | Остаток: {w.quantity} {unit} | Мин: {w.min_quantity}{warning}")
                return "Склад:\n" + "\n".join(result)
            finally:
                db.close()

        elif name == "get_warehouse_item":
            db = SessionWarehouse()
            try:
                query = args["query"].strip()
                # Try numeric ID first
                try:
                    item_id = int(query)
                    w = db.get(WarehouseItem, item_id)
                    if w:
                        return _format_warehouse_item(w, db)
                except ValueError:
                    pass
                # Search by name substring
                items = db.query(WarehouseItem).all()
                matches = []
                for w in items:
                    item_name = _get_item_name(w, db)
                    if query.lower() in item_name.lower():
                        matches.append(w)
                if not matches:
                    return f"Позиция «{query}» не найдена на складе."
                if len(matches) == 1:
                    return _format_warehouse_item(matches[0], db)
                result = [_format_warehouse_item(w, db) for w in matches]
                return f"Найдено {len(matches)} позиций:\n" + "\n".join(result)
            finally:
                db.close()

        elif name == "add_to_stock":
            db = SessionWarehouse()
            try:
                w = db.get(WarehouseItem, args["warehouse_item_id"])
                if not w:
                    return f"Позиция #{args['warehouse_item_id']} не найдена на складе."
                old_qty = w.quantity
                w.quantity += args["quantity"]
                db.commit()
                item_name = _get_item_name(w, db)
                return f"«{item_name}»: {old_qty} → {w.quantity} (+{args['quantity']})"
            finally:
                db.close()

        elif name == "set_stock":
            db = SessionWarehouse()
            try:
                w = db.get(WarehouseItem, args["warehouse_item_id"])
                if not w:
                    return f"Позиция #{args['warehouse_item_id']} не найдена на складе."
                old_qty = w.quantity
                w.quantity = args["quantity"]
                db.commit()
                item_name = _get_item_name(w, db)
                return f"«{item_name}»: {old_qty} → {w.quantity}"
            finally:
                db.close()

        elif name == "get_dashboard_stats":
            db_o = SessionOrders()
            db_c = SessionClients()
            db_wh = SessionWarehouse()
            try:
                orders = db_o.query(Order).all()
                clients_count = db_c.query(Client).count()
                products_count = db_wh.query(Product).count()
                total_revenue = sum(o.total_price for o in orders)
                by_status = {}
                for o in orders:
                    by_status[o.status] = by_status.get(o.status, 0) + 1
                status_labels = {
                    "new": "Новые", "in_progress": "В работе", "ready": "Готовы", "delivered": "Отданы",
                }
                status_str = "\n".join(f"  {status_labels.get(k, k)}: {v}" for k, v in sorted(by_status.items()))
                low_stock = db_wh.query(WarehouseItem).filter(
                    WarehouseItem.min_quantity > 0,
                    WarehouseItem.quantity <= WarehouseItem.min_quantity
                ).count()
                return (
                    f"Статистика CRM:\n"
                    f"  Клиентов: {clients_count}\n"
                    f"  Продуктов: {products_count}\n"
                    f"  Всего заказов: {len(orders)}\n"
                    f"  Выручка: {total_revenue} ₽\n"
                    f"  Заказы по статусам:\n{status_str}\n"
                    f"  Мало на складе: {low_stock} поз."
                )
            finally:
                db_o.close()
                db_c.close()
                db_wh.close()

        elif name == "fetch_url":
            url = args["url"]
            try:
                with _get_http_client(follow_redirects=True) as http_client:
                    resp = http_client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; CRM-Bot/1.0)"})
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type", "")
                    if "text/html" in content_type:
                        text = resp.text
                        for tag in ["script", "style", "noscript", "nav", "footer", "header"]:
                            text = re.sub(rf"<{tag}[\s\S]*?</{tag}>", "", text, flags=re.IGNORECASE)
                        text = re.sub(r"<[^>]+>", " ", text)
                        text = re.sub(r"\s+", " ", text).strip()
                        if len(text) > 8000:
                            text = text[:8000] + "\n... (страница обрезана)"
                        return text if text else "Страница пуста или содержит только скрипты."
                    else:
                        text = resp.text[:8000]
                        return text
            except httpx.TimeoutException:
                return f"Ошибка: страница не загрузилась по ссылке {url} (тайм-аут)."
            except httpx.HTTPStatusError as e:
                return f"Ошибка HTTP {e.response.status_code} при загрузке {url}."
            except Exception as e:
                return f"Ошибка при загрузке {url}: {e}"

        elif name == "generate_daily_report":
            from app.services.daily_report import generate_daily_report as _gen_report
            use_ai = args.get("use_ai", True)
            report = _gen_report(use_ai=use_ai)
            return report["report_text"]

        return f"Неизвестный инструмент: {name}"

    except Exception as e:
        logger.exception("Tool execution error: %s", name)
        return f"Ошибка выполнения: {e}"


def _get_ai_settings():
    db = SessionCore()
    try:
        row = db.execute(select(AIProviderSettings).limit(1)).scalar_one_or_none()
        if row:
            return {
                "base_url": row.base_url,
                "api_key": row.api_key,
                "model_name": row.model_name,
                "temperature": row.temperature,
                "max_tokens": row.max_tokens,
                "timeout": getattr(row, "timeout", 120) or 120,
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
        "timeout": 120,
    }


def chat(user_message: str, history: list[dict]) -> dict:
    ai = _get_ai_settings()
    base_url = ai["base_url"].rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]
    model = ai["model_name"]
    temperature = ai["temperature"]
    max_tokens = ai["max_tokens"]
    api_key = ai["api_key"]

    messages = [{"role": "system", "content": _get_system_prompt()}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    tool_calls_executed = []
    MAX_ROUNDS = 10
    ai_timeout = ai.get("timeout", 120)

    logger.info("AI chat: user_message=%s, model=%s", user_message[:100], model)

    for round_num in range(MAX_ROUNDS):
        with _get_http_client(timeout=ai_timeout) as client:
            resp = client.post(
                f"{base_url}/v1/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "tools": CRM_TOOLS,
                    "tool_choice": "auto",
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]
        message = choice["message"]

        tool_calls = message.get("tool_calls")
        if not tool_calls:
            logger.info("AI chat: no tool_calls in round %d, text=%s", round_num, (message.get("content") or "")[:200])
            break

        logger.info("AI chat: round %d, tool_calls=%s", round_num, [(tc["function"]["name"], tc["function"].get("arguments", "")[:100]) for tc in tool_calls])

        messages.append(message)
        for tc in tool_calls:
            fn = tc["function"]
            fn_name = fn["name"]
            fn_args = json.loads(fn["arguments"]) if isinstance(fn["arguments"], str) else fn["arguments"]
            result = _execute_tool(fn_name, fn_args)
            tool_calls_executed.append({
                "tool": fn_name,
                "args": fn_args,
                "result": result,
            })
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

    return {
        "reply": message.get("content", ""),
        "tool_calls": tool_calls_executed,
    }
