@echo off
cd /d D:\crm\backend
set DATABASE_URL=postgresql+psycopg://crm_user:crm_pass@127.0.0.1:5433/printing_crm
D:\crm\backend\venv\Scripts\python.exe -c "import logging; logging.basicConfig(level=logging.DEBUG); from app.main import app; import uvicorn; uvicorn.run(app, host='0.0.0.0', port=8001)" > D:\crm\backend_log.txt 2>&1
