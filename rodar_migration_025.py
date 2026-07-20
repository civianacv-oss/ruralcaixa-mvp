import psycopg2
import os
import sys

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
SQL_FILE = os.path.join(os.path.dirname(__file__), "migration_025_origem_lancamentos.sql")

with open(SQL_FILE, "r", encoding="utf-8") as f:
    sql = f.read()

conn = psycopg2.connect(DB_URL)
try:
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    print("Migration 025 aplicada: colunas de origem criadas em lancamentos.")
except Exception as e:
    conn.rollback()
    print(f"ERRO: {e}")
    sys.exit(1)
finally:
    conn.close()
