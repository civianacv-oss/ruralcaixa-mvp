import psycopg2

conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()
cur.execute("SELECT api_token FROM produtores WHERE id = 1")
print(cur.fetchone())