import psycopg2
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='lancamentos' ORDER BY ordinal_position")
print([r[0] for r in cur.fetchall()])
conn.close()
