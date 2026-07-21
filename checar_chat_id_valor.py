import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

cur.execute("SELECT id, nome, telefone, telegram_chat_id, imovel_id_padrao FROM produtores WHERE id = 1")
print(dict(cur.fetchone()))

print("\n=== Quantos produtores JA TEM telegram_chat_id preenchido? ===")
cur.execute("SELECT id, nome, telegram_chat_id FROM produtores WHERE telegram_chat_id IS NOT NULL")
for r in cur.fetchall():
    print(dict(r))

conn.close()