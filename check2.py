import psycopg2
conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='plano_contas' ORDER BY ordinal_position")
print('=== colunas plano_contas ===')
for r in cur.fetchall(): print(r[0])

cur.execute("SELECT * FROM plano_contas WHERE codigo LIKE '5%'")
print()
print('=== plano_contas 5.x ===')
for r in cur.fetchall(): print(r)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='imoveis_rurais' ORDER BY ordinal_position")
print()
print('=== colunas imoveis_rurais ===')
for r in cur.fetchall(): print(r[0])

conn.close()
