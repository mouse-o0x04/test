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
from app.models.raw_material import RawMaterial
from app.models.warehouse import WarehouseItem
from app.models.ai_provider_settings import AIProviderSettings

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
            "name": "update_stock",
            "description": "Обновить количество товара на складе.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "integer", "description": "ID продукта"},
                    "quantity": {"type": "integer", "description": "Новое количество"},
                    "min_quantity": {"type": "integer", "description": "Минимальный остаток"},
                },
                "required": ["product_id", "quantity"],
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
"""


def _get_system_prompt() -> str:
    now = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M")
    return SYSTEM_PROMPT.format(date=now)


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
                    "new": "Новый", "in_progress": "В работе", "ready": "Готов", "delivered": "Отдали",
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
                    "new": "Новый", "in_progress": "В работе", "ready": "Готов", "delivered": "Отдали",
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
                valid = ["new", "in_progress", "ready", "delivered"]
                if args["status"] not in valid:
                    return f"Неверный статус «{args['status']}». Допустимые: {', '.join(valid)}"
                old = order.status
                order.status = args["status"]
                if args["status"] == "ready":
                    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
                    for i in items:
                        i.is_completed = True
                elif args["status"] in ("new", "in_progress"):
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

        elif name == "update_stock":
            db = SessionWarehouse()
            try:
                item = db.query(WarehouseItem).filter(WarehouseItem.product_id == args["product_id"]).first()
                if not item:
                    item = WarehouseItem(
                        product_id=args["product_id"],
                        quantity=args["quantity"],
                        min_quantity=args.get("min_quantity", 0),
                    )
                    db.add(item)
                else:
                    item.quantity = args["quantity"]
                    if "min_quantity" in args:
                        item.min_quantity = args["min_quantity"]
                db.commit()
                product = db.get(Product, args["product_id"])
                pname = product.name if product else f"#{args['product_id']}"
                return f"Остаток «{pname}» обновлён: {args['quantity']} шт."
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

    for _ in range(MAX_ROUNDS):
        with _get_http_client(timeout=120) as client:
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

        if not message.get("tool_calls"):
            break

        messages.append(message)
        for tc in message["tool_calls"]:
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
