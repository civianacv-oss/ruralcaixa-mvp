import psycopg2

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()

print("--- Colunas de cotacoes_mercado ---")
cur.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cotacoes_mercado'
    ORDER BY ordinal_position;
""")
for row in cur.fetchall():
    print(row)

print("\n--- Constraints (para achar o UNIQUE) ---")
cur.execute("""
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'cotacoes_mercado'::regclass;
""")
for row in cur.fetchall():
    print(row)

print("\n--- Amostra de dados (produtos existentes, ex boi gordo) ---")
cur.execute("SELECT DISTINCT produto FROM cotacoes_mercado;")
for row in cur.fetchall():
    print(row)

cur.execute("SELECT * FROM cotacoes_mercado ORDER BY data_referencia DESC LIMIT 5;")
colnames = [d[0] for d in cur.description]
print(f"\nColunas: {colnames}")
for row in cur.fetchall():
    print(row)

cur.close()
conn.close()
print("\nConcluido.")