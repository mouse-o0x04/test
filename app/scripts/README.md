# Инструкция по написанию скриптов CRM Типографии

## Общая архитектура

Скрипты хранятся в `backend/app/scripts/` как `.py` файлы.
Каждый скрипт — это отдельный модуль с функцией `calculate(data)` или `format(data)`.

**Важно:** Скрипты выполняются в sandbox — `import` запрещён. Доступны: `math`, `json`, `rectpack`, `newPacker`, `round`, `int`, `float`, `str`, `len`, `min`, `max`, `sum`, `sorted`, `range`, `enumerate`, `zip`, `map`, `filter`, `list`, `dict`, `tuple`, `set`.

Два типа скриптов:
1. **Расчёт** (`calculate`) — считает количество материалов для списания
2. **Отображение** (`format`) — форматирует данные для показа на складе

---

## Тип 1: Скрипт расчёта (`calculate`)

### Где вызывается
Скрипт привязывается к складской позиции в поле `stock_calculation_script`. Вызывается при:
- Создании/обновлении заказа (расчёт расхода сырья)
- Смене статуса заказа (списание со склада)

### Входные данные (dict `data`)

Для **рулонных** материалов:
```python
{
    "quantity": 15,              # количество изделий в заказе
    "width_mm": 3000,            # ширина рулона/листа, мм
    "height_mm": 0,              # высота (для рулонов = 0)
    "roll_width_m": 3.2,         # ширина рулона, м
    "roll_length_m": 50,         # длина рулона, м
    "material_coefficient": 1.0, # коэффициент материала
    "cut_width_mm": 110,         # ширина отреза, мм
    "cut_height_mm": 160,        # высота отреза, мм
    "material_name": "баннер 1.6",
    "processing_method": "",     # не используется для рулонов
    "offcuts": [{"width": 500, "height": 2000}],  # обрезки
}
```

Для **листовых** материалов:
```python
{
    "quantity": 30,              # количество изделий
    "width_mm": 450,             # ширина листа, мм
    "height_mm": 320,            # высота листа, мм
    "cut_width_mm": 210,         # ширина отреза, мм
    "cut_height_mm": 297,        # высота отреза, мм
    "material_name": "бумага 250 мат",
    "processing_method": "",     # для листовых не нужен
    "offcuts": [],
}
```

Для **листовых с раскроем** (акрил, ПВХ):
```python
{
    "quantity": 15,
    "width_mm": 3000,            # ширина листа
    "height_mm": 2000,           # высота листа
    "cut_width_mm": 120,         # ширина изделия
    "cut_height_mm": 80,         # высота изделия
    "material_name": "акрил 3мм",
    "processing_method": "Лазер",  # Фреза/Лазер/Ручная резка
    "offcuts": [{"width": 2774, "height": 2000}],  # обрезки
}
```

### Что должен возвращать `calculate()`

**Вариант 1: Просто число** (количество листов/рулонов для списания):
```python
def calculate(data):
    # ... расчёт ...
    return 2.5  # количество единиц сырья для списания
```

**Вариант 2: Dict** (с расширенной информацией):
```python
def calculate(data):
    # ... расчёт ...
    return {
        "sheets_to_write_off": 1,        # количество листов для списания (обязательно!)
        "new_offcuts": [                 # новые обрезки (опционально)
            {"width": 400, "height": 1800}
        ],
        "offcuts_used": [],              # использованные обрезки
        "error": "Описание ошибки",      # если что-то не так
    }
```

### Примеры скриптов

**Рулонный материал** (`roll_stock_calc.py`):
```python
def calculate(data):
    cut_w = data.get("cut_width_mm", 0)
    cut_h = data.get("cut_height_mm", 0)
    qty = data.get("quantity", 1)
    roll_width_m = data.get("roll_width_m", 0)

    if not roll_width_m or not cut_w or not cut_h:
        return 0

    roll_width_mm = roll_width_m * 1000
    options = []
    fit_a = int(roll_width_mm // cut_w)
    if fit_a >= 1:
        options.append((cut_h / 1000) / fit_a)
    fit_b = int(roll_width_mm // cut_h)
    if fit_b >= 1:
        options.append((cut_w / 1000) / fit_b)
    if not options:
        return 0
    per_piece = min(options)
    return round(per_piece * qty, 6)
```

**Листовой материал** (`sheet_stock_calc.py`):
```python
def calculate(data):
    cut_w = data.get("cut_width_mm", 0)
    cut_h = data.get("cut_height_mm", 0)
    qty = data.get("quantity", 1)
    sw = data.get("width_mm", 0)
    sh = data.get("height_mm", 0)

    if not sw or not sh or not cut_w or not cut_h:
        return 0

    fit_a = int(sw // cut_w) * int(sh // cut_h)
    fit_b = int(sw // cut_h) * int(sh // cut_w)
    fit = max(fit_a, fit_b)
    if fit < 1:
        return 0
    per_piece = 1.0 / fit
    return round(per_piece * qty, 6)
```

**Раскрой с обрезками** (`sheet_stock_calc_v2.py`):
```python
def calculate(data):
    # ... расчёт с учётом станков, обрезков ...
    return {
        "sheets_to_write_off": used_full_sheets,
        "new_offcuts": [{"width": 400, "height": 1800}],
        "offcuts_used": [...],
    }
```

---

## Тип 2: Скрипт отображения (`format`)

### Где вызывается
Привязывается к складской позиции в поле `display_format_script`. Вызывается при отображении склада.

### Входные данные (dict `data`)

Для **рулонных**:
```python
{
    "totalQuantity": 150.0,    # остаток в метрах
    "totalMeters": 150.0,      # то же самое
    "rollLength": 50,          # длина рулона, м
    "rolls": 3,                # количество полных рулонов
    "leftover": 0.0,           # остаток после целых рулонов
    "materialName": "баннер 1.6",
}
```

Для **листовых**:
```python
{
    "totalQuantity": 7.5,      # остаток в листах
    "width_mm": 3000,           # ширина листа
    "height_mm": 2000,          # высота листа
    "minQuantity": 5,           # минимальный остаток
}
```

### Что должен возвращать `format()`

Dict с двумя ключами:
```python
def format(data):
    total = data.get("totalQuantity", 0)
    w = data.get("width_mm", 0)
    h = data.get("height_mm", 0)
    
    main = f"{total} лист(ов)" if total != 1 else f"{total} лист"
    sub = f"Лист {w}×{h} мм" if w and h else ""
    
    return {
        "main": main,      # основной текст (жирный)
        "sub": sub,         # подпись (серый, мелкий)
    }
```

---

## Как создать новый скрипт

### Шаг 1: Создай файл
Файл → `backend/app/scripts/имя_скрипта.py`

### Шаг 2: Напиши функцию `calculate`
```python
def calculate(data):
    # data — dict с входными данными
    # Возвращает: число (количество для списания) или dict
    quantity = data.get("quantity", 0)
    # ... твоя логика ...
    return 2.5  # количество единиц сырья
```

### Шаг 3: Привяжи к складской позиции
На странице Склад → редактирование позиции → поле «Скрипт расчёта» → выбери свой скрипт.

### Шаг 4: Опционально — добавь `format`
```python
def format(data):
    total = data.get("totalQuantity", 0)
    return {"main": f"{total} ед.", "sub": "Описание"}
```

---

## Доступные модули в sandbox

| Модуль | Описание |
|--------|----------|
| `math` | Математика (ceil, floor, sqrt...) |
| `json` | Парсинг JSON |
| `rectpack` | Упаковка прямоугольников |
| `newPacker` | Создание packer'а из rectpack |

## Доступные функции

`round`, `int`, `float`, `str`, `len`, `min`, `max`, `sum`, `sorted`, `range`, `enumerate`, `zip`, `map`, `filter`, `list`, `dict`, `tuple`, `set`

## Запрещено

`open`, `exec`, `eval`, `__import__`, `compile`, `breakpoint`, `exit`, `quit`, `os`, `sys`, `subprocess`, `shutil`, `pathlib`, `socket`, `http`, `urllib`, `requests`, `ctypes`, `importlib`

---

## Как протестировать скрипт

1. Перейди в Настройки → Скрипты
2. Открой свой скрипт
3. Нажми «Выполнить» с тестовыми данными
4. Или через API: `POST /api/scripts/run` с телом `{"name": "имя_скрипта", "data": {...}}`
