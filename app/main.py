import logging
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.database import (
    Base,
    Session,
    engine,
)
from app.routers import clients, company_detail, hermes, orders, products, scripts, warehouse
from app.routers.raw_material import router as raw_material_router
from app.routers.writeoffs import router as writeoffs_router
from app.routers.auth import router as auth_router
from app.routers.auth import _ensure_default_data, _ensure_order_settings
from app.routers.ai_assistant import router as ai_router
from app.routers.ai_provider_settings import router as ai_settings_router
from app.routers.filter_state import router as filter_state_router
from app.routers.column_state import router as column_state_router
from app.routers.order_settings import router as order_settings_router
from app.routers.knowledge import router as knowledge_router
from app.routers.db_backup import router as db_backup_router
from app.routers.audit_log import router as audit_log_router
from app.routers.order_templates import router as order_templates_router
from app.routers.offcuts import router as offcuts_router

logger = logging.getLogger(__name__)


def _ensure_columns():
    """Add missing columns to existing tables and fix/create sequences."""
    migrations = [
        ("raw_materials", "stock_calculation_script", "VARCHAR(255)"),
        ("warehouse", "stock_calculation_script", "VARCHAR(255)"),
        ("warehouse", "display_format_script", "VARCHAR(255)"),
        ("products", "supplier_url", "VARCHAR(500)"),
        ("products", "default_cut_width_mm", "DOUBLE PRECISION"),
        ("products", "default_cut_height_mm", "DOUBLE PRECISION"),
        ("stock_writeoffs", "order_id", "INTEGER"),
        ("order_items", "manual_writeoff_pending", "BOOLEAN DEFAULT FALSE"),
        ("order_items", "manual_writeoff_raw_material_id", "INTEGER"),
        ("order_items", "manual_writeoff_cut_width_mm", "DOUBLE PRECISION"),
        ("order_items", "manual_writeoff_cut_height_mm", "DOUBLE PRECISION"),
        ("order_items", "manual_writeoff_quantity", "DOUBLE PRECISION"),
        ("ai_provider_settings", "timeout", "INTEGER DEFAULT 120"),
        ("order_items", "processing_method", "VARCHAR(100)"),
        ("orders", "deadline_start", "TIMESTAMP WITH TIME ZONE"),
    ]
    db = Session()
    try:
        for table, column, col_type in migrations:
            try:
                db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                db.commit()
                logger.info(f"Migration: added {table}.{column}")
            except Exception:
                db.rollback()

        all_tables = db.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        )).scalars().all()
        for table in all_tables:
            try:
                has_id = db.execute(text(
                    "SELECT EXISTS(SELECT 1 FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name=:t AND column_name='id')"
                ), {"t": table}).scalar()
                if not has_id:
                    continue
                result = db.execute(text(f"SELECT pg_get_serial_sequence('{table}', 'id')")).scalar()
                max_id = db.execute(text(f"SELECT COALESCE(MAX(id), 0) FROM {table}")).scalar()
                if result:
                    db.execute(text(f"SELECT setval('{result}', {max_id})"))
                    db.commit()
                elif max_id > 0:
                    seq_name = f"{table}_id_seq"
                    db.execute(text(f"DROP SEQUENCE IF EXISTS {seq_name} CASCADE"))
                    db.execute(text(f"CREATE SEQUENCE {seq_name} START WITH {max_id + 1} INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1"))
                    db.execute(text(f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT nextval('{seq_name}'::regclass)"))
                    db.commit()
                    logger.info(f"Migration: created sequence {seq_name}")
            except Exception:
                db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    db = Session()
    try:
        _ensure_default_data(db)
    except Exception as e:
        logger.warning(f"ensure_default_data skipped: {e}")
        db.rollback()
    finally:
        db.close()
    try:
        _ensure_order_settings()
    except Exception as e:
        logger.warning(f"ensure_order_settings skipped: {e}")
    yield


app = FastAPI(title="Printing House CRM", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(clients.router, prefix=API_PREFIX)
app.include_router(products.router, prefix=API_PREFIX)
app.include_router(orders.router, prefix=API_PREFIX)
app.include_router(hermes.router, prefix=API_PREFIX)
app.include_router(warehouse.router, prefix=API_PREFIX)
app.include_router(raw_material_router, prefix=API_PREFIX)
app.include_router(scripts.router, prefix=API_PREFIX)
app.include_router(filter_state_router, prefix=API_PREFIX)
app.include_router(column_state_router, prefix=API_PREFIX)
app.include_router(company_detail.router, prefix=API_PREFIX)
app.include_router(ai_router, prefix=API_PREFIX)
app.include_router(ai_settings_router, prefix=API_PREFIX)
app.include_router(order_settings_router, prefix=API_PREFIX)
app.include_router(knowledge_router, prefix=API_PREFIX)
app.include_router(writeoffs_router, prefix=API_PREFIX)
app.include_router(db_backup_router, prefix=API_PREFIX)
app.include_router(audit_log_router, prefix=API_PREFIX)
app.include_router(order_templates_router, prefix=API_PREFIX)
app.include_router(offcuts_router, prefix=API_PREFIX)


@app.get("/api/health")
def health():
    return {"status": "ok"}


STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="static-assets")

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

if STATIC_DIR.is_dir():

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file = STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(STATIC_DIR / "index.html"))
