import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== Coluna telegram_chat_id existe? ===")
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'produtores' AND column_name ILIKE '%telegram%'
""")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Dados do Cicero (produtor_id=1) ===")
cur.execute("SELECT id, nome, cpf, telefone FROM produtores WHERE id = 1")
for r in cur.fetchall():
    print(dict(r))
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'produtores'
""")
print("\nTodas as colunas de produtores:")
for r in cur.fetchall():
    print(" -", r["column_name"])

conn.close()
