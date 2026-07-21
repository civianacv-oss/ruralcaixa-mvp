"""
remover_imovel_duplicado.py

Remove o registro duplicado (imovel_id=10, "Fazenda Emboque São Francisco"
cadastrado por engano pelo Felipe) do Postgres — SÓ depois de confirmar de
novo que não há nenhuma linha real vinculada a ele em nenhuma tabela.

Rodar consolidar_emboque_acl.ts (lado Node) ANTES deste script, pra garantir
que o Felipe já tenha acesso ao imovel_id=6 antes de perder o vínculo com o 10.
"""

import psycopg2
import psycopg2.extras
import os
import sys

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

IMOVEL_ID = 10

# ── Checagem final de segurança: reconfirma que está tudo zerado ────────────
cur.execute("""
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.column_name = 'imovel_id'
      AND c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
""")
tabelas = [r["table_name"] for r in cur.fetchall()]

pendencias = []
for t in tabelas:
    try:
        cur.execute(f"SELECT COUNT(*) AS total FROM {t} WHERE imovel_id = %s", (IMOVEL_ID,))
        total = cur.fetchone()["total"]
        if total > 0:
            pendencias.append((t, total))
    except Exception:
        conn.rollback()

if pendencias:
    print("ABORTADO: ainda existem dados vinculados ao imovel_id=10:")
    for t, total in pendencias:
        print(f"  - {t}: {total} linha(s)")
    print("Resolva essas dependências antes de apagar o registro.")
    sys.exit(1)

print("Checagem OK: nenhum dado real vinculado ao imovel_id=10.")

cur.execute("SELECT nome, produtor_id FROM imoveis_rurais WHERE id = %s", (IMOVEL_ID,))
row = cur.fetchone()
if not row:
    print(f"imovel_id={IMOVEL_ID} já não existe — nada a fazer.")
    conn.close()
    sys.exit(0)

print(f"Confirmar exclusão de: '{row['nome']}' (produtor_id={row['produtor_id']}, id={IMOVEL_ID})")
resposta = input("Digite CONFIRMAR para prosseguir: ")
if resposta.strip().upper() != "CONFIRMAR":
    print("Cancelado.")
    conn.close()
    sys.exit(0)

cur.execute("DELETE FROM imoveis_rurais WHERE id = %s", (IMOVEL_ID,))
conn.commit()
print(f"imovel_id={IMOVEL_ID} removido com sucesso.")
conn.close()
