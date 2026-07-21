"""
Roda migration_022_fechamento_livro_caixa.sql contra o banco do Railway.

USO:
    $env:DATABASE_URL = "postgresql://postgres:...@gondola.proxy.rlwy.net:53900/railway"
    python rodar_migration_022.py
"""

import os
import sys
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERRO: defina a variável de ambiente DATABASE_URL antes de rodar este script.")
    sys.exit(1)

SQL_FILE = os.path.join(os.path.dirname(__file__), "migration_022_fechamento_livro_caixa.sql")
with open(SQL_FILE, "r", encoding="utf-8") as f:
    sql = f.read()

conn = psycopg2.connect(DATABASE_URL)
try:
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    print("Migration aplicada com sucesso: livro_caixa_fechamentos criada.")
except Exception as e:
    conn.rollback()
    print(f"ERRO ao aplicar migration: {e}")
    sys.exit(1)
finally:
    conn.close()
