import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== Tipo do objeto vw_bovino_dashboard ===")
cur.execute("""
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_name = 'vw_bovino_dashboard'
""")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Conteúdo da linha para imovel_id=10 ===")
cur.execute("SELECT * FROM vw_bovino_dashboard WHERE imovel_id = 10")
for r in cur.fetchall():
    print(dict(r))

conn.close()
