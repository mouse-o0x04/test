import json
import random
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionClients, SessionOrders, SessionWarehouse
from app.models.client import Client
from app.models.company_detail import CompanyDetail, client_company
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.warehouse import WarehouseItem
from app.auth.jwt import hash_password

random.seed(42)

NAMES = [
    "Иванов Алексей", "Петрова Мария", "Сидоров Дмитрий", "Козлова Анна",
    "Михайлов Сергей", "Новикова Елена", "Попов Андрей", "Соколова Ольга",
    "Лебедев Николай", "Волкова Татьяна", "Морозов Павел", "Зайцева Ирина",
    "Борисов Виктор", "Яковлева Наталья", "Григорьев Максим",
]

COMPANIES = [
    "ООО Рога и Копыта", "ИП Смирнов", "ЗАО Технологии", "ООО МедиаПро",
    "ИП Волков", "АО ИнвестГрупп", "ООО ПринтМастер", "ИП Козлов",
    "ООО Дигитал", "ЗАО СтройСервис", "ООО ЛогоСтудия", "ИП Новиков",
    "АО ФармМед", "ООО Аврора", "ИП Попов",
]

PRODUCTS = [
    ("Баннер ПВХ 500г", "шт", 350, 50),
    ("Баннер сетка", "шт", 420, 30),
    ("Листы А4 цветные", "лист", 8, 500),
    ("Листы А3 цветные", "лист", 15, 300),
    ("Визитки (тираж 100)", "уп", 450, 100),
    ("Флаеры А5 (тираж 100)", "уп", 380, 80),
    ("Плакат А1", "шт", 280, 40),
    ("Плакат А0", "шт", 520, 20),
    ("Наклейки виниловые", "шт", 25, 200),
    ("Наклейки прозрачные", "шт", 35, 150),
    ("Листовки А4", "шт", 12, 400),
    ("Буклеты А4 (16 стр)", "шт", 85, 100),
    ("Каталоги А5 (8 стр)", "шт", 120, 60),
    ("Брошюры А4 (4 стр)", "шт", 65, 80),
    ("Пресс-волл", "шт", 4500, 5),
    ("Ролл-ап 85x200", "шт", 3800, 8),
    ("Печать на холсте", "шт", 1200, 15),
    ("Календари настенные", "шт", 180, 50),
    ("Календари плакатные", "шт", 250, 30),
    ("Нашивки", "шт", 45, 100),
]

DESIGNERS = ["Анна К.", "Сергей М.", "Елена В."]
WORKERS = ["Павел Т.", "Николай Л.", "Дмитрий С.", "Максим Г."]
LAYOUTS = ["Макет клиента", "Разработка макета", "Правка макета"]
SOURCES = ["Сайт", "Телефон", "Личный визит", "Рекомендация", "Telegram"]

STATUSES = ["new", "in_progress", "ready", "delivered"]

print("Creating clients...")
clients = []
with SessionClients() as db:
    for i, name in enumerate(NAMES):
        first, last = name.split(" ", 1)
        c = Client(
            name=name,
            email=f"{first.lower()}.{last.lower()}@example.com",
            phone=f"+7 903 {random.randint(100,999)} {random.randint(10,99)} {random.randint(10,99)}",
            company=COMPANIES[i] if i < len(COMPANIES) else None,
            address=f"г. Москва, ул. {random.choice(['Ленина','Пушкина','Гагарина','Чехова','Толстого'])}, д. {random.randint(1,50)}",
        )
        db.add(c)
        db.flush()
        clients.append({"id": c.id, "name": name})
        if random.random() < 0.6:
            cd = CompanyDetail(
                company_name=COMPANIES[i] if i < len(COMPANIES) else name,
                inn=f"{random.randint(1000000000,9999999999)}",
                ogrn=f"{random.randint(1000000000000,9999999999999)}",
            )
            db.add(cd)
            db.flush()
            db.execute(client_company.insert().values(client_id=c.id, company_detail_id=cd.id))
    db.commit()
    print(f"  Created {len(clients)} clients")

print("Creating products...")
products = []
with SessionWarehouse() as db:
    for name, unit, price, qty in PRODUCTS:
        p = Product(name=name, unit_type=unit, unit_price=price)
        db.add(p)
        db.flush()
        products.append({"id": p.id, "name": name, "unit": unit, "price": round(p.unit_price, 2)})
        wh = WarehouseItem(product_id=p.id, quantity=qty, min_quantity=max(5, qty // 10))
        db.add(wh)
    db.commit()
    print(f"  Created {len(products)} products")

print("Creating orders...")
orders_data = []
with SessionOrders() as db_o, SessionClients() as db_c, SessionWarehouse() as db_w:
    for i in range(50):
        client = random.choice(clients)
        status = random.choices(STATUSES, weights=[20, 30, 25, 25])[0]

        num_items = random.randint(1, 6)
        selected_products = random.sample(products, min(num_items, len(products)))
        items_data = []
        total = 0
        for p in selected_products:
            qty = random.randint(1, 20)
            price = p["price"] * random.uniform(0.8, 1.2)
            item_total = round(qty * price, 2)
            total += item_total
            items_data.append({
                "product_id": p["id"],
                "quantity": qty,
                "unit_price": round(price, 2),
                "is_completed": status in ("ready", "delivered"),
                "is_printed": status in ("ready", "delivered", "in_progress"),
            })

        order = Order(
            client_id=client["id"],
            total_price=round(total, 2),
            status=status,
            description=random.choice([
                "Срочный заказ", "Стандартный заказ", "Заказ на мероприятие",
                "Для офиса", "Промо-акция", "Выставка", "Нет описания", None,
            ]),
            notes=random.choice(["Без замечаний", "Срочно!", "Обсудить цену", None, None]),
            deadline=datetime.strptime(f"2025-{random.randint(1,12):02d}-{random.randint(1,28):02d}", "%Y-%m-%d") if random.random() < 0.6 else None,
            designer=random.choice(DESIGNERS) if random.random() < 0.5 else None,
            workers=json.dumps(random.sample(WORKERS, random.randint(1, 2))) if random.random() < 0.5 else None,
            layout_type=random.choice(LAYOUTS) if random.random() < 0.4 else None,
            source=random.choice(SOURCES),
        )
        db_o.add(order)
        db_o.flush()

        for item_data in items_data:
            oi = OrderItem(order_id=order.id, **item_data)
            db_o.add(oi)

        orders_data.append(order)

    db_o.commit()
    print(f"  Created {len(orders_data)} orders")

    status_counts = {}
    for o in orders_data:
        status_counts[o.status] = status_counts.get(o.status, 0) + 1
    for s, c in sorted(status_counts.items()):
        print(f"    {s}: {c}")

print("Done!")
