import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== Todos os produtores com esse CPF ===")
cur.execute("SELECT id, nome, cpf FROM produtores WHERE cpf = '74032526672'")
rows = cur.fetchall()
for r in rows:
    print(dict(r))
print(f"Total encontrado: {len(rows)} (esperado: 1)")

print("\n=== Imóveis chamados 'Condominio Rural Coqueiro' ===")
cur.execute("SELECT id, nome, produtor_id FROM imoveis_rurais WHERE nome ILIKE '%coqueiro%'")
rows2 = cur.fetchall()
for r in rows2:
    print(dict(r))
print(f"Total encontrado: {len(rows2)} (esperado: 1)")

conn.close()
