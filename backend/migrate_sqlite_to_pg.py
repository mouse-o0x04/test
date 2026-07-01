"""
One-time migration: copy data from 4 old SQLite databases into the new single PostgreSQL database.
"""
import sqlite3
from sqlalchemy import text
from app.database import Session

BACKEND = "/media/mouse-hermes/crm/crm/backend"

SQLITE_DB_MAP = {
    "crm_core": f"{BACKEND}/crm_core.db",
    "crm_clients": f"{BACKEND}/crm_clients.db",
    "crm_orders": f"{BACKEND}/crm_orders.db",
    "crm_warehouse": f"{BACKEND}/crm_warehouse.db",
}

BOOL_COLS = {
    "users": ["is_active", "is_superuser"],
    "order_items": ["is_completed", "is_printed"],
    "custom_fields": ["required"],
    "ai_provider_settings": ["is_active"],
}

DEFAULTS = {
    "products": {"material_coefficient": 1.0, "raw_material_id": None},
    "warehouse": {"defective_quantity": 0, "defective_reason": None, "raw_material_id": None},
}


def read_sqlite(db_key: str, table: str):
    conn = sqlite3.connect(SQLITE_DB_MAP[db_key])
    conn.row_factory = sqlite3.Row
    rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
    conn.close()
    return [dict(r) for r in rows]


def has_data(session, table_name: str) -> bool:
    r = session.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
    return r > 0


def migrate_table(table_name: str, rows: list[dict]):
    if not rows:
        print(f"  {table_name}: 0 rows in source, skipping")
        return

    s = Session()
    try:
        if has_data(s, table_name):
            print(f"  {table_name}: already has data in PG, skipping")
            return

        cols_info = s.execute(text(
            f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}' ORDER BY ordinal_position"
        )).fetchall()
        pg_cols = [c[0] for c in cols_info]

        bools = BOOL_COLS.get(table_name, [])
        defaults = DEFAULTS.get(table_name, {})
        count = 0
        for row in rows:
            filtered = {}
            for k, v in row.items():
                if k not in pg_cols:
                    continue
                if k in bools:
                    filtered[k] = bool(v) if v is not None else False
                else:
                    filtered[k] = v
            # Apply defaults for new PG columns not in SQLite
            for dk, dv in defaults.items():
                if dk not in filtered:
                    filtered[dk] = dv
            cols = list(filtered.keys())
            placeholders = ", ".join([f":{c}" for c in cols])
            col_names = ", ".join(cols)
            s.execute(
                text(f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})"),
                filtered,
            )
            count += 1

        s.commit()
        print(f"  {table_name}: migrated {count} rows")
    except Exception as e:
        s.rollback()
        print(f"  {table_name}: ERROR - {e}")
    finally:
        s.close()


def main():
    print("\n=== Migrating crm_core ===")
    for table in ["users", "roles", "permissions", "user_roles", "role_permissions",
                    "order_settings", "ai_provider_settings", "custom_fields",
                    "custom_field_values", "knowledge_folders", "knowledge_notes",
                    "hermes_agents", "hermes_events", "user_filter_states"]:
        rows = read_sqlite("crm_core", table)
        migrate_table(table, rows)

    print("\n=== Migrating crm_clients ===")
    for table in ["clients", "company_details", "client_company"]:
        rows = read_sqlite("crm_clients", table)
        migrate_table(table, rows)

    print("\n=== Migrating crm_orders ===")
    for table in ["orders", "order_items", "order_history"]:
        rows = read_sqlite("crm_orders", table)
        migrate_table(table, rows)

    print("\n=== Migrating crm_warehouse ===")
    for table in ["products", "warehouse"]:
        rows = read_sqlite("crm_warehouse", table)
        migrate_table(table, rows)

    print("\n=== Migration complete ===")
    print("\nRow counts in PostgreSQL:")
    s = Session()
    for table in ["users", "roles", "permissions", "clients", "company_details",
                    "orders", "order_items", "order_history", "products", "warehouse",
                    "order_settings", "raw_materials", "user_filter_states"]:
        try:
            count = s.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            print(f"  {table}: {count}")
        except:
            pass
    s.close()


if __name__ == "__main__":
    main()
