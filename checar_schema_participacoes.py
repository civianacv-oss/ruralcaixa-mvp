import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== Colunas de participacoes_imovel ===")
cur.execute("""
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'participacoes_imovel'
    ORDER BY ordinal_position
""")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Linhas existentes (se houver) ===")
cur.execute("SELECT * FROM participacoes_imovel LIMIT 10")
for r in cur.fetchall():
    print(dict(r))

conn.close()
