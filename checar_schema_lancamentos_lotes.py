import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== Colunas de lancamentos ===")
cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'lancamentos' ORDER BY ordinal_position
""")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Colunas de bovino_lotes ===")
cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'bovino_lotes' ORDER BY ordinal_position
""")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Exemplo de lotes existentes (bovino) ===")
cur.execute("SELECT * FROM bovino_lotes LIMIT 5")
for r in cur.fetchall():
    print(dict(r))

conn.close()