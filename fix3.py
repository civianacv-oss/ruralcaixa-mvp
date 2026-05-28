import psycopg2
conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

# Mapear tipo_exploracao numerico para texto
TIPO_MAP = {1:"individual", 2:"condominio", 3:"arrendamento", 4:"parceria", 5:"comodato", 6:"outros"}

cur.execute("SELECT pi.imovel_id, pi.produtor_id, pi.percentual, ir.tipo_exploracao, ir.nome FROM participacoes_imovel pi JOIN imoveis_rurais ir ON ir.id = pi.imovel_id")
print("=== participacoes ===")
for r in cur.fetchall():
    print(f"imovel={r[0]} ({r[4]}) produtor={r[1]} perc={r[2]} tipo={TIPO_MAP.get(r[3], r[3])}")

# Verificar lancamentos vinculados aos duplicados
cur.execute("SELECT imovel_id, COUNT(id) FROM lancamentos GROUP BY imovel_id ORDER BY imovel_id")
print()
print("=== lancamentos por imovel ===")
for r in cur.fetchall(): print(r)

conn.close()
