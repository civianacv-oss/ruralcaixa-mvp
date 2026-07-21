import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== Imóveis cadastrados ===")
cur.execute("SELECT id, produtor_id, nome FROM imoveis_rurais ORDER BY id")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Distribuição de livro_caixa_lancamentos por imovel_id/ano_base ===")
cur.execute("""
    SELECT imovel_id, ano_base, COUNT(*) AS total, SUM(valor) AS soma
    FROM livro_caixa_lancamentos
    GROUP BY imovel_id, ano_base
    ORDER BY imovel_id, ano_base
""")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Produtores distintos na tabela lancamentos ===")
cur.execute("SELECT DISTINCT produtor_id FROM lancamentos ORDER BY produtor_id")
for r in cur.fetchall():
    print(dict(r))

conn.close()
