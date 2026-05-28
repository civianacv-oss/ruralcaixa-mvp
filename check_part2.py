import psycopg2
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()
cur.execute("SELECT id, produtor_id, percentual, vigencia_inicio, vigencia_fim, capital_aportado FROM participacoes_imovel WHERE imovel_id=1 ORDER BY produtor_id, vigencia_inicio")
for r in cur.fetchall():
    print(r)
conn.close()
