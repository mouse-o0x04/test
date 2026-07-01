#!/usr/bin/env python3
"""Restore a SQL dump into PostgreSQL, one statement at a time."""
import sys
import psycopg

def restore(sql_bytes: bytes, host: str, port: int, user: str, password: str, dbname: str):
    sql = sql_bytes.decode("utf-8")
    statements = []
    buf = []
    for line in sql.split("\n"):
        stripped = line.strip()
        if stripped.startswith("--") or stripped == "":
            continue
        buf.append(line)
        if stripped.endswith(";"):
            stmt = "\n".join(buf).rstrip(";").strip()
            if stmt:
                statements.append(stmt)
            buf = []
    if buf:
        stmt = "\n".join(buf).rstrip(";").strip()
        if stmt:
            statements.append(stmt)

    with psycopg.connect(
        host=host, port=port, user=user, password=password, dbname=dbname,
    ) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for i, stmt in enumerate(statements):
                try:
                    cur.execute(stmt)
                except Exception as e:
                    print(f"Warning {i+1}/{len(statements)}: {e}", file=sys.stderr)

if __name__ == "__main__":
    if len(sys.argv) != 7:
        print("Usage: restore_script.py <sql_file> <host> <port> <user> <password> <dbname>")
        sys.exit(1)
    with open(sys.argv[1], "rb") as f:
        sql_bytes = f.read()
    restore(sql_bytes, sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5], sys.argv[6])
