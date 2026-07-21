import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

for tabela in ["fornecedores", "pedidos_compra", "insumos"]:
    print(f"=== {tabela} ===")
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = %s
        ORDER BY ordinal_position
    """, (tabela,))
    for r in cur.fetchall():
        print(dict(r))
    print()

conn.close()
