import psycopg2
conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

cur.execute("SELECT DISTINCT conta_codigo, subconta, tipo, COUNT(id), SUM(valor) FROM lancamentos WHERE conta_codigo LIKE '5%' GROUP BY conta_codigo, subconta, tipo")
print('=== CONTAS 5.x ===')
for r in cur.fetchall(): print(r)

cur.execute("SELECT imovel_id, COUNT(id) FROM lancamentos WHERE produtor_id=1 GROUP BY imovel_id")
print()
print('=== imovel_id nos lancamentos ===')
for r in cur.fetchall(): print(r)

cur.execute("SELECT codigo, nome FROM plano_contas WHERE codigo LIKE '5%' ORDER BY codigo")
print()
print('=== plano_contas 5.x ===')
for r in cur.fetchall(): print(r)

conn.close()
