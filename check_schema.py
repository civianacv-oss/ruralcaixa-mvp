import psycopg2
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()

# Todas as tabelas
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
print("TABELAS:", [r[0] for r in cur.fetchall()])

# Colunas de lancamentos
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='lancamentos' ORDER BY ordinal_position")
print("\nLANCAMENTOS:", cur.fetchall())

# Sample de lancamentos
cur.execute("SELECT * FROM lancamentos LIMIT 2")
print("\nSAMPLE:", cur.fetchall())
conn.close()
