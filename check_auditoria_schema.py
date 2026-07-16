import psycopg2
import os

conn = psycopg2.connect(
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
cur = conn.cursor()
cur.execute(
    "SELECT column_name, data_type FROM information_schema.columns "
    "WHERE table_name = 'auditoria_contratos' ORDER BY ordinal_position"
)
rows = cur.fetchall()
if not rows:
    print("Tabela 'auditoria_contratos' nao encontrada.")
else:
    for nome, tipo in rows:
        print(f"{nome:30s} {tipo}")
conn.close()
