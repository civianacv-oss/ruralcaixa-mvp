"""
RuralCaixa — Diagnóstico: Ubiratan (produtor_id=6) não vê IOFC

Somente LEITURA.
Uso: DATABASE_URL="postgresql://..." python3 diagnostico_ubiratan_iofc_v1.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    print("=" * 70)
    print("1) Cadastro do produtor Ubiratan (id=6)")
    print("=" * 70)
    cur.execute("""
        SELECT id, nome, email, api_token, telegram_chat_id, telefone
        FROM produtores
        WHERE id = 6
    """)
    row = cur.fetchone()
    if row:
        # nao imprime o token inteiro por seguranca, so confirma se existe
        r = dict(row)
        if r.get("api_token"):
            r["api_token"] = r["api_token"][:8] + "...(presente)"
        else:
            r["api_token"] = None
        print(f"  {r}")
    else:
        print("  NENHUM produtor com id=6 encontrado!")

    print()
    print("=" * 70)
    print("2) Vinculos de propriedade do Ubiratan (participacoes_imovel)")
    print("=" * 70)
    cur.execute("""
        SELECT p.imovel_id, i.nome AS nome_imovel, p.tipo_vinculo, p.percentual
        FROM participacoes_imovel p
        LEFT JOIN imoveis_rurais i ON i.id = p.imovel_id
        WHERE p.produtor_id = 6
    """)
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    print()
    print("=" * 70)
    print("3) Imoveis rurais existentes hoje (confirma se Emboque/Coqueiro ok)")
    print("=" * 70)
    cur.execute("SELECT id, nome, area_total FROM imoveis_rurais ORDER BY id")
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    print()
    print("=" * 70)
    print("4) Ha dados de movimentacoes_insumo (custo racao leite) pros imoveis do Ubiratan?")
    print("=" * 70)
    cur.execute("""
        SELECT imovel_id, COUNT(*) AS qtd, MIN(data_movim) AS mais_antigo, MAX(data_movim) AS mais_recente
        FROM movimentacoes_insumo
        WHERE imovel_id IN (SELECT imovel_id FROM participacoes_imovel WHERE produtor_id = 6)
          AND tipo = 'uso'
        GROUP BY imovel_id
    """)
    rows4 = cur.fetchall()
    if rows4:
        for r in rows4:
            print(f"  {dict(r)}")
    else:
        print("  Nenhuma movimentacao de insumo (uso) encontrada pros imoveis do Ubiratan.")

    conn.close()

if __name__ == "__main__":
    run()
