#!/bin/bash
# Printing House CRM — ручной запуск (прод-режим)
# БД: контейнер crm-postgres на localhost:5432
# Бэкенд: uvicorn на :8000, раздаёт SPA из frontend/dist
# Фронт: http://<lan-ip>:8000
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
VENV="$BACKEND/venv"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/backend.log"
PID_FILE="$BACKEND/.uvicorn.pid"
DB_CONTAINER="crm-postgres"
HOST="0.0.0.0"
PORT=8000
HEALTH_URL="http://localhost:${PORT}/api/health"

usage() {
  cat <<EOF
Usage: ./start.sh {start|stop|restart|status|logs|--help}

  start    Запустить CRM (по умолчанию, если аргумента нет)
  stop     Остановить бэкенд (БД не трогает)
  restart  stop + start
  status   Состояние БД, бэкенда, health
  logs     tail -f лога бэкенда

Вход:  http://<lan-ip>:${PORT}
Лог:   ${LOG_FILE}
EOF
}

mkdir -p "$LOG_DIR"

# --- DB -----------------------------------------------------------------
db_ready() {
  docker exec "$DB_CONTAINER" pg_isready -U crm_user -d printing_crm >/dev/null 2>&1
}

ensure_db() {
  if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    echo "[db] Контейнер '$DB_CONTAINER' не найден. Создайте его или запустите docker-compose." >&2
    exit 1
  fi
  if ! docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true; then
    echo "[db] Контейнер остановлен — запускаю..."
    docker start "$DB_CONTAINER" >/dev/null
  fi
  echo "[db] Жду localhost:5432..."
  for i in $(seq 1 30); do
    if db_ready; then
      echo "[db] OK (localhost:5432)"
      return 0
    fi
    sleep 1
  done
  echo "[db] Таймаут ожидания БД" >&2
  exit 1
}

# --- Backend ------------------------------------------------------------
port_listening() {
  ss -tlnp 2>/dev/null | grep -q ":${PORT} "
}

pid_alive() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid; pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

start_backend() {
  if port_listening; then
    echo "[backend] Уже запущен на :${PORT} (см. ./start.sh status)" >&2
    exit 0
  fi
  echo "[backend] Запускаю uvicorn на :${PORT}..."
  cd "$BACKEND"
  nohup "$VENV/bin/uvicorn" app.main:app --host "$HOST" --port "$PORT" \
    >> "$LOG_FILE" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  disown "$pid" 2>/dev/null || true
  echo "[backend] pid=$pid"

  echo "[backend] Жду health..."
  for i in $(seq 1 30); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      echo "[backend] OK (health: ok)"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[backend] Процесс умер — см. лог: $LOG_FILE" >&2
      tail -20 "$LOG_FILE" >&2 || true
      exit 1
    fi
    sleep 1
  done
  echo "[backend] Таймаут health — см. лог: $LOG_FILE" >&2
  exit 1
}

stop_backend() {
  local pid=""
  [[ -f "$PID_FILE" ]] && pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[backend] Останавливаю pid=$pid..."
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    for i in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "[backend] PID не найден — pkill по uvicorn..."
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "[backend] Остановлен"
}

# --- URL ----------------------------------------------------------------
lan_ip() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "${ip:-localhost}"
}

print_url() {
  echo
  echo "================================================"
  echo " CRM запущена:  http://$(lan_ip):${PORT}"
  echo " Лог:           ${LOG_FILE}"
  echo " Стоп:          ./start.sh stop"
  echo "================================================"
}

# --- Status -------------------------------------------------------------
cmd_status() {
  echo "=== CRM status ==="
  if docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true; then
    if db_ready; then echo "[db]       UP (localhost:5432)"; else echo "[db]       контейнер вверх, pg_isready НЕ ок"; fi
  else
    echo "[db]       DOWN (контейнер $DB_CONTAINER не запущен)"
  fi

  if port_listening; then
    local pid=""; [[ -f "$PID_FILE" ]] && pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    echo "[backend]  UP :${PORT} (pid=${pid:-?})"
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      echo "[health]   ok"
    else
      echo "[health]   нет ответа"
    fi
  else
    echo "[backend]  DOWN (порт ${PORT} не слушает)"
  fi
}

# --- Main ---------------------------------------------------------------
cmd="${1:-start}"
case "$cmd" in
  start)   ensure_db; start_backend; print_url ;;
  stop)    stop_backend ;;
  restart) stop_backend; ensure_db; start_backend; print_url ;;
  status)  cmd_status ;;
  logs)    exec tail -f "$LOG_FILE" ;;
  --help|-h) usage ;;
  *) usage; exit 1 ;;
esac
