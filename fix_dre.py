import psycopg2
conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

# Fix 1: vincular lancamentos sem imovel_id ao imovel do produtor
cur.execute("""
    UPDATE lancamentos l
    SET imovel_id = ir.id
    FROM imoveis_rurais ir
    WHERE l.imovel_id IS NULL
      AND ir.produtor_id = l.produtor_id
""")
print(f"Lancamentos atualizados: {cur.rowcount}")

conn.commit()

# Confirma
cur.execute("SELECT imovel_id, COUNT(id) FROM lancamentos WHERE produtor_id=1 GROUP BY imovel_id")
print("imovel_id apos fix:")
for r in cur.fetchall(): print(r)

conn.close()
