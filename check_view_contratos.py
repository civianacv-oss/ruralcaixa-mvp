import os
import psycopg2

DB_URL = (
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

print("--- Colunas da TABELA contratos ---")
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'contratos' ORDER BY ordinal_position
""")
cols_tabela = [r[0] for r in cur.fetchall()]
for c in cols_tabela:
    print(" -", c)

print()
print("--- Colunas da VIEW vw_contratos_resumo ---")
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'vw_contratos_resumo' ORDER BY ordinal_position
""")
cols_view = [r[0] for r in cur.fetchall()]
for c in cols_view:
    print(" -", c)

print()
faltando = set(cols_tabela) - set(cols_view)
print("Colunas que existem na tabela mas NAO aparecem na view:", faltando)

conn.close()
