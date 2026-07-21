import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== participacoes_imovel (imovel 6 e 10) ===")
cur.execute("SELECT * FROM participacoes_imovel WHERE imovel_id IN (6, 10)")
rows = cur.fetchall()
if not rows:
    print("(nenhuma linha)")
for r in rows:
    print(dict(r))

print("\n=== produtores 6 e 7 ===")
cur.execute("SELECT id, nome, cpf FROM produtores WHERE id IN (6, 7)")
for r in cur.fetchall():
    print(dict(r))

conn.close()