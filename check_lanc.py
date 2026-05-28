import psycopg2
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()
cur.execute("""
    SELECT l.id, l.valor, l.data, s.nome, s.tipo, s.atividade_tipo
    FROM lancamentos l
    LEFT JOIN subcontas s ON s.id = l.subconta_id
    WHERE l.produtor_id = 1
    ORDER BY l.data DESC
    LIMIT 10
""")
for r in cur.fetchall():
    print(r)
conn.close()
