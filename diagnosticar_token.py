import psycopg2

conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()
cur.execute("SELECT api_token, length(api_token), ativo FROM produtores WHERE id = 1")
row = cur.fetchone()
print("Token (repr):", repr(row[0]))
print("Tamanho:", row[1])
print("Ativo:", row[2] if len(row) > 2 else "coluna 'ativo' não existe")