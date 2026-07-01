import io
import os
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.config import settings
from app.auth.deps import get_current_user
from app.database import Session, get_db_core
from app.models.user import User

router = APIRouter(prefix="/db", tags=["database"])

DB_NAMES = ["printing_crm"]
BACKUP_DIR = Path(__file__).resolve().parent.parent.parent / "backups"


def _parse_db_url(url: str) -> dict:
    stripped = url.split("://", 1)[1] if "://" in url else url
    auth, rest = stripped.split("@", 1) if "@" in stripped else ("", stripped)
    user, password = (auth.split(":", 1) if ":" in auth else (auth, ""))
    host_port, dbname = rest.split("/", 1) if "/" in rest else (rest, "")
    host, port = (host_port.split(":", 1) if ":" in host_port else (host_port, "5432"))
    return {"user": user, "password": password, "host": host, "port": port, "dbname": dbname}


def _get_conn() -> dict:
    return _parse_db_url(settings.database_url)


def _get_tables() -> list[str]:
    db = Session()
    try:
        rows = db.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        )).scalars().all()
        return list(rows)
    finally:
        db.close()


def _get_table_columns(table: str) -> list[dict]:
    db = Session()
    try:
        rows = db.execute(text(
            "SELECT column_name, data_type, is_nullable, column_default, "
            "character_maximum_length "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t "
            "ORDER BY ordinal_position"
        ), {"t": table}).fetchall()
        return [{"name": r[0], "type": r[1], "nullable": r[2], "default": r[3], "max_len": r[4]} for r in rows]
    finally:
        db.close()


def _get_primary_keys(table: str) -> list[str]:
    db = Session()
    try:
        rows = db.execute(text(
            "SELECT a.attname FROM pg_index i "
            "JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) "
            "WHERE i.indrelid = cast(:t as regclass) AND i.indisprimary"
        ), {"t": table}).scalars().all()
        return list(rows)
    finally:
        db.close()


def _sql_value(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, bytes):
        escaped = v.decode("utf-8", errors="replace").replace("'", "''")
        return f"'{escaped}'"
    if isinstance(v, datetime):
        escaped = v.isoformat()
        return f"'{escaped}'"
    escaped = str(v).replace("\\", "\\\\").replace("'", "''")
    return f"'{escaped}'"


def _dump_table_sql(table: str) -> str:
    db = Session()
    lines = []
    try:
        cols = _get_table_columns(table)
        pks = _get_primary_keys(table)
        col_names = [c["name"] for c in cols]

        col_defs = []
        nextval_defaults = {}
        for c in cols:
            parts = [f"  {c['name']}"]
            dtype = c["type"]
            if c["max_len"] and dtype in ("character varying", "character"):
                dtype = f"{dtype}({c['max_len']})"
            parts.append(dtype)
            if c["nullable"] == "NO" or c["name"] in pks:
                parts.append("NOT NULL")
            if c["default"]:
                if "nextval" in c["default"]:
                    seq_name = c["default"].split("(")[1].split(")")[0]
                    nextval_defaults[c["name"]] = seq_name
                else:
                    parts.append(f"DEFAULT {c['default']}")
            col_defs.append(" ".join(parts))

        if pks:
            col_defs.append(f"  PRIMARY KEY ({', '.join(pks)})")

        for col_name, seq_name in nextval_defaults.items():
            seq_value = db.execute(text(f"SELECT COALESCE(MAX({col_name}), 0) FROM {table}")).scalar()
            lines.append(f"DROP SEQUENCE IF EXISTS {seq_name} CASCADE;")
            lines.append(f"CREATE SEQUENCE {seq_name} START WITH {max(seq_value, 1)} INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;")
            lines[-2] = lines[-2]  # keep order

        lines.append(f"DROP TABLE IF EXISTS {table} CASCADE;")
        lines.append(f"CREATE TABLE {table} (\n{',\n'.join(col_defs)}\n);")

        for col_name, seq_name in nextval_defaults.items():
            lines.append(f"ALTER TABLE {table} ALTER COLUMN {col_name} SET DEFAULT nextval('{seq_name}'::regclass);")

        rows = db.execute(text(f"SELECT * FROM {table}")).fetchall()
        for row in rows:
            vals = ", ".join(_sql_value(v) for v in row)
            lines.append(f"INSERT INTO {table} ({', '.join(col_names)}) VALUES ({vals});")

        for col_name, seq_name in nextval_defaults.items():
            seq_value = db.execute(text(f"SELECT COALESCE(MAX({col_name}), 0) FROM {table}")).scalar()
            lines.append(f"SELECT setval('{seq_name}', {seq_value});")
    finally:
        db.close()
    return "\n".join(lines)


def _dump_all_sql() -> bytes:
    tables = _get_tables()
    parts = []
    parts.append(f"-- CRM Backup — {datetime.utcnow().isoformat()}")
    parts.append("-- Database: printing_crm")
    parts.append("")

    for table in tables:
        parts.append(_dump_table_sql(table))
        parts.append("")

    return "\n".join(parts).encode("utf-8")


def _restore_sql(sql_bytes: bytes) -> None:
    from app.restore_script import restore
    conn_params = _get_conn()
    restore(sql_bytes, conn_params["host"], int(conn_params["port"]),
            conn_params["user"], conn_params["password"], conn_params["dbname"])
    _sync_sequences()


def _sync_sequences():
    """Create/fix serial sequences for all tables after restore."""
    import psycopg
    conn_params = _get_conn()
    tables = ["warehouse", "raw_materials", "products", "clients", "orders",
              "order_items", "order_history", "audit_log", "roles", "permissions",
              "user_roles", "role_permissions", "stock_writeoffs", "ai_provider_settings",
              "knowledge_entries", "knowledge_folders", "knowledge_notes",
              "filter_states", "user_filter_states", "order_settings",
              "hermes_agents", "hermes_events", "custom_fields", "custom_field_values",
              "company_details", "users"]
    with psycopg.connect(
        host=conn_params["host"], port=int(conn_params["port"]),
        user=conn_params["user"], password=conn_params["password"],
        dbname=conn_params["dbname"],
    ) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for table in tables:
                try:
                    cur.execute(f"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='{table}' AND column_name='id')")
                    has_id = cur.fetchone()[0]
                    if not has_id:
                        continue

                    seq_name = f"{table}_id_seq"
                    cur.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table}")
                    max_id = cur.fetchone()[0]

                    cur.execute(f"SELECT pg_get_serial_sequence('{table}', 'id')")
                    row = cur.fetchone()
                    existing_seq = row[0] if row and row[0] else None

                    if existing_seq:
                        cur.execute(f"SELECT setval('{existing_seq}', {max_id})")
                    else:
                        cur.execute(f"DROP SEQUENCE IF EXISTS {seq_name} CASCADE")
                        start = max(max_id + 1, 1)
                        cur.execute(f"CREATE SEQUENCE {seq_name} START WITH {start} INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1")
                        cur.execute(f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT nextval('{seq_name}'::regclass)")
                except Exception:
                    pass


@router.get("/dump")
def dump_all(user: User = Depends(get_current_user)):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can create backups")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    sql_data = _dump_all_sql()

    tmpdir = tempfile.mkdtemp(prefix="crm_backup_")
    tar_path = os.path.join(tmpdir, f"crm_backup_{timestamp}.tar")

    with tarfile.open(tar_path, "w") as tar:
        info = tarfile.TarInfo(name="printing_crm.sql")
        info.size = len(sql_data)
        tar.addfile(info, io.BytesIO(sql_data))

    return FileResponse(
        tar_path,
        media_type="application/x-tar",
        filename=f"crm_backup_{timestamp}.tar",
    )


@router.get("/dump-single")
def dump_single(db: str = Query(..., description="Database name"), user: User = Depends(get_current_user)):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can create backups")
    if db not in DB_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown database: {db}. Valid: {DB_NAMES}")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    sql_data = _dump_all_sql()

    tmpdir = tempfile.mkdtemp(prefix="crm_backup_")
    sql_path = os.path.join(tmpdir, f"{db}.sql")
    with open(sql_path, "wb") as f:
        f.write(sql_data)

    return FileResponse(
        sql_path,
        media_type="application/octet-stream",
        filename=f"{db}_{timestamp}.sql",
    )



@router.post("/restore")
async def restore_all(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db_core)):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can restore backups")

    content = await file.read()
    db.close()
    tmpdir = tempfile.mkdtemp(prefix="crm_restore_")

    if file.filename and file.filename.endswith(".tar"):
        tar_path = os.path.join(tmpdir, "backup.tar")
        with open(tar_path, "wb") as f:
            f.write(content)
        try:
            with tarfile.open(tar_path, "r") as tar:
                tar.extractall(tmpdir)
        except tarfile.TarError:
            raise HTTPException(status_code=400, detail="Invalid tar archive")

        for sql_file in Path(tmpdir).glob("*.sql"):
            _restore_sql(sql_file.read_bytes())
    elif file.filename and file.filename.endswith(".sql"):
        _restore_sql(content)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use .tar or .sql")

    return {"ok": True, "message": "Database restored successfully"}


@router.get("/backups")
def list_backups(user: User = Depends(get_current_user)):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can list backups")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backups = []
    for f in sorted(BACKUP_DIR.iterdir(), reverse=True):
        if f.suffix == ".tar" and f.name.startswith("crm_backup_"):
            backups.append({
                "filename": f.name,
                "size_bytes": f.stat().st_size,
                "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })
    return backups


@router.post("/save-backup")
def save_backup(user: User = Depends(get_current_user)):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can save backups")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    tar_path = BACKUP_DIR / f"crm_backup_{timestamp}.tar"

    sql_data = _dump_all_sql()

    with tarfile.open(str(tar_path), "w") as tar:
        info = tarfile.TarInfo(name="printing_crm.sql")
        info.size = len(sql_data)
        tar.addfile(info, io.BytesIO(sql_data))

    return {
        "ok": True,
        "filename": tar_path.name,
        "size_bytes": tar_path.stat().st_size,
    }


@router.delete("/backups/{filename}")
def delete_backup(filename: str, user: User = Depends(get_current_user)):
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only superusers can delete backups")

    file_path = BACKUP_DIR / filename
    if not file_path.exists() or not file_path.name.startswith("crm_backup_"):
        raise HTTPException(status_code=404, detail="Backup not found")

    file_path.unlink()
    return {"ok": True, "message": f"Backup {filename} deleted"}
