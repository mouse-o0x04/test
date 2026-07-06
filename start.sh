#!/bin/bash
cd /media/mouse-hermes/crm/crm/backend
exec /media/mouse-hermes/crm/crm/backend/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 >> /tmp/uvicorn.log 2>&1
