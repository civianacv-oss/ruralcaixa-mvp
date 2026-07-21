import psycopg2
import psycopg2.extras

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
conn.autocommit = False
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

FORNECEDOR_ID_DUPLICADO = 2

print(f"--- Checando referencias ao fornecedor id={FORNECEDOR_ID_DUPLICADO} ---")

cur.execute("SELECT COUNT(*) as total FROM insumos WHERE fornecedor_id = %s", (FORNECEDOR_ID_DUPLICADO,))
ref_insumos = cur.fetchone()["total"]
print(f"Insumos referenciando este fornecedor: {ref_insumos}")

cur.execute("SELECT COUNT(*) as total FROM pedidos_compra WHERE fornecedor_id = %s", (FORNECEDOR_ID_DUPLICADO,))
ref_pedidos = cur.fetchone()["total"]
print(f"Pedidos de compra referenciando este fornecedor: {ref_pedidos}")

if ref_insumos > 0 or ref_pedidos > 0:
    print("\n⚠️  Este fornecedor TEM referencias. Em vez de DELETE, vou apenas DESATIVAR (ativo=false).")
    cur.execute(
        "UPDATE fornecedores SET ativo = false, atualizado_em = NOW() WHERE id = %s RETURNING id, nome, ativo",
        (FORNECEDOR_ID_DUPLICADO,)
    )
    resultado = cur.fetchone()
    conn.commit()
    print(f"Desativado: {dict(resultado)}")
else:
    print("\nSem referencias. Seguro fazer DELETE definitivo.")
    cur.execute(
        "DELETE FROM fornecedores WHERE id = %s RETURNING id, nome",
        (FORNECEDOR_ID_DUPLICADO,)
    )
    resultado = cur.fetchone()
    conn.commit()
    print(f"Removido: {dict(resultado)}")

print("\n--- Estado final da tabela fornecedores ---")
cur.execute("SELECT id, nome, whatsapp, telegram, ativo FROM fornecedores ORDER BY id;")
for row in cur.fetchall():
    print(dict(row))

cur.close()
conn.close()
print("\nConcluido.")
