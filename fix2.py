import psycopg2
conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

# Ver colunas e valores atuais em imoveis_rurais
cur.execute("SELECT id, nome, tipo_exploracao, participacao FROM imoveis_rurais")
print("=== imoveis_rurais ===")
for r in cur.fetchall(): print(r)

# Ver tipo_sociedade na participacoes_imovel
cur.execute("SELECT pi.imovel_id, pi.produtor_id, pi.percentual, ir.tipo_sociedade FROM participacoes_imovel pi JOIN imoveis_rurais ir ON ir.id = pi.imovel_id")
print()
print("=== participacoes com tipo_sociedade ===")
for r in cur.fetchall(): print(r)

conn.close()
