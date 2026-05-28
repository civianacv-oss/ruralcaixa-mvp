import psycopg2

conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

cur.execute(
    "UPDATE empreendimentos SET documento = %s WHERE responsavel_cpf = %s",
    ('728.395.704/001-03', '72839570491')
)
conn.commit()
print('CAEPF atualizado!')

# Verificar
cur.execute("SELECT id, razao_social, tipo, documento, responsavel_nome FROM empreendimentos")
for r in cur.fetchall():
    print(r)

conn.close()
