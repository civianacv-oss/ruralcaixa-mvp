import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'movimentacoes_insumo' AND column_name = 'origem_id'
""")
print("movimentacoes_insumo.origem_id:", dict(cur.fetchone() or {}))

cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'lancamentos' AND column_name = 'id'
""")
print("lancamentos.id:", dict(cur.fetchone() or {}))

conn.close()
