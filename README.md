# Printing House CRM

CRM-система для типографии на 15 сотрудников. Управление заказами, клиентами, складом, продукцией и расчётом стоимости.

## Технологический стек

| Компонент | Технологии |
|-----------|-----------|
| **Backend** | Python 3.13, FastAPI, SQLAlchemy 2.0, PostgreSQL 16 |
| **Frontend** | React 18, TypeScript, Ant Design 5, Vite |
| **AI** | Llama.cpp (локальный LLM-ассистент) |
| **Коммуникации** | Hermes (Telegram-бот для уведомлений) |

## Быстрый старт

### Через Docker (рекомендуется)

```bash
# Клонируйте репозиторий
git clone <url>
cd crm

# Запустите все сервисы
docker-compose up -d

# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# Swagger docs: http://localhost:8000/docs
```

### Без Docker

```bash
# 1. Запустите PostgreSQL (или используйте существующий)
# Создайте БД и пользователя:
# CREATE USER crm_user WITH PASSWORD 'crm_pass';
# CREATE DATABASE printing_crm OWNER crm_user;

# 2. Backend
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
cp ../.env.example .env   # Настройте переменные
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3. Frontend (отдельный терминал)
cd frontend
npm install
npm run dev
```

### Дефолтные данные

| Поле | Значение |
|------|----------|
| Логин | `admin` |
| Пароль | `admin` |

## Структура проекта

```
crm/
├── backend/
│   ├── app/
│   │   ├── auth/           # Аутентификация (JWT)
│   │   ├── models/         # SQLAlchemy модели
│   │   ├── routers/        # API эндпоинты
│   │   ├── schemas/        # Pydantic схемы
│   │   ├── scripts/        # Скрипты расчёта (sheet_stock_calc, roll_stock_calc)
│   │   ├── services/       # Бизнес-логика (AI, Hermes, ежедневный отчёт)
│   │   ├── config.py       # Конфигурация
│   │   ├── database.py     # Подключение к БД
│   │   └── main.py         # FastAPI приложение + auto-migration
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/            # API-клиенты (axios)
│   │   ├── components/     # Переиспользуемые компоненты
│   │   ├── hooks/          # React-хуки (аутентификация, фильтры)
│   │   ├── pages/          # Страницы (Заказы, Клиенты, Склад и т.д.)
│   │   ├── types/          # TypeScript типы
│   │   └── utils/          # Утилиты
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Основные модули

### Заказы
- Создание/редактирование заказов с позициями из каталога или произвольными
- Канбан-доска и табличный вид
- Автоматическое списание сырья при смене статуса
- Ручное списание сырья с подтверждением на складе
- История изменений заказа

### Склад
- Учёт продуктов и сырья (рулонные и листовые материалы)
- Минимальные остатки с предупреждениями
- Скрипты форматирования отображения
- История списаний

### Калькулятор
- Рас стоимости печати по параметрам
- Поддержка формулы продукта и скриптов

### AI-ассистент
- Локальный LLM для помощи в работе
- Интеграция с CRM (поиск клиентов, заказов, склада)

### Уведомления (Hermes)
- Telegram-бот для событий CRM
- Ежедневные отчёты

## Переменные окружения

См. `.env.example` — все переменные с комментариями и примерами значений.

## API документация

Swagger UI доступен по адресу: `http://localhost:8000/docs`

ReDoc: `http://localhost:8000/redoc`

## Тестирование

```bash
cd backend
python -m pytest tests/ -v
```

Тестовый набор: 34 теста, покрывающих основные API-эндпоинты.

## Развертывание

1. Установите Docker и Docker Compose
2. Скопируйте `.env.example` в `.env` и измените `SECRET_KEY` и `DATABASE_URL`
3. Запустите: `docker-compose up -d`
4. Откройте `http://<ip-сервера>:8000` в браузере

Для доступа из локальной сети: бэкенд слушает на `0.0.0.0:8000`, фронтенд раздаётся из бэкенда в production-режиме.

## Лицензия

MIT
