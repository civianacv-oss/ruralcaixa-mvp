import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

cur.execute("""
    INSERT INTO bovino_lotes (imovel_id, nome, aptidao, ativo)
    VALUES (1, 'Lote Teste - Recria', 'corte', true)
    RETURNING id, nome
""")
novo = cur.fetchone()
conn.commit()
print("Lote de teste criado:", dict(novo))

print("\n=== Lotes ativos do imovel_id=1 ===")
cur.execute("SELECT id, nome, aptidao, ativo FROM bovino_lotes WHERE imovel_id = 1 AND ativo = true")
for r in cur.fetchall():
    print(dict(r))

conn.close()