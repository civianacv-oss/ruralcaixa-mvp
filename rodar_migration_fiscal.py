"""
Roda migration_020_fiscal.sql contra o banco do Railway.

USO:
    python rodar_migration_fiscal.py

Requer a variável de ambiente DATABASE_URL (a mesma usada no backend).
Se preferir, defina antes de rodar:
    $env:DATABASE_URL = "postgresql://postgres:...@gondola.proxy.rlwy.net:53900/railway"
"""

import os
import sys
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("ERRO: defina a variável de ambiente DATABASE_URL antes de rodar este script.")
    print('Exemplo (PowerShell): $env:DATABASE_URL = "postgresql://..."')
    sys.exit(1)

SQL_FILE = os.path.join(os.path.dirname(__file__), "migration_020_fiscal.sql")

with open(SQL_FILE, "r", encoding="utf-8") as f:
    sql = f.read()

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = False
try:
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    print("Migration aplicada com sucesso: nfe_emitidas, esocial_eventos, "
          "efdreinf_apuracoes, dctfweb_transmissoes, simulacoes_tributarias.")
except Exception as e:
    conn.rollback()
    print(f"ERRO ao aplicar migration: {e}")
    sys.exit(1)
finally:
    conn.close()
