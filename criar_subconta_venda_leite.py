import psycopg2
import uuid

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

NOVO_ID = str(uuid.uuid4())
NOME = "Venda de Leite"
TIPO = "RECEITA"
ATIVIDADE_TIPO = "RURAL"
CODIGO_CONTA = "4.1.2"

conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()

# 1. Checar se já existe alguma subconta com esse nome exato (evitar duplicata)
cur.execute("SELECT id, nome, tipo, codigo_conta FROM subcontas WHERE nome ILIKE %s;", (NOME,))
existentes = cur.fetchall()

if existentes:
    print(f"AVISO: ja existe(m) subconta(s) com nome parecido:")
    for r in existentes:
        print(f"  {r}")
    print("\nNao vou criar duplicata. Se quiser mesmo assim, ajuste o script.")
else:
    cur.execute("""
        INSERT INTO subcontas (id, nome, tipo, atividade_tipo, codigo_conta)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, nome, tipo, atividade_tipo, codigo_conta;
    """, (NOVO_ID, NOME, TIPO, ATIVIDADE_TIPO, CODIGO_CONTA))
    nova = cur.fetchone()
    print("Subconta criada com sucesso:")
    print(f"  id: {nova[0]}")
    print(f"  nome: {nova[1]}")
    print(f"  tipo: {nova[2]}")
    print(f"  atividade_tipo: {nova[3]}")
    print(f"  codigo_conta: {nova[4]}")
    print("\nGUARDE ESSE ID - vai ser usado pelo bot/frontend para lancar vendas de leite.")

cur.close()
conn.close()
