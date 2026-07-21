import psycopg2
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

cur.execute("SELECT pg_get_viewdef('vw_insumos_alerta', true)")
print(cur.fetchone()[0])

conn.close()