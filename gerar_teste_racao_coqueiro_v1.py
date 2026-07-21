"""
RuralCaixa — Dados de TESTE de consumo de racao pro imovel_id=1 (Coqueiro, sandbox)

ATENCAO: isso e dado INVENTADO pra testar o calculo do IOFC, nao e consumo
real. Vai pro imovel_id=1 (Condominio Rural Coqueiro), que e a propriedade
de teste/sandbox -- NAO mexe no imovel_id=6 (Fazenda Emboque, dado real do
Ubiratan). Tudo fica marcado com origem_modulo='teste_iofc' e observacao
começando com "[TESTE]" pra ser facil de identificar e reverter depois
(ver o DELETE comentado no final do arquivo).

Uso: DATABASE_URL="postgresql://..." python3 gerar_teste_racao_coqueiro_v1.py
"""
import os
import psycopg2
import psycopg2.extras
from datetime import date

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

FAZENDA_ID = 1  # = imovel_id=1, Condominio Rural Coqueiro (sandbox de teste)

# (data_movim, quantidade_kg, custo_unitario_por_kg)
CONSUMOS_TESTE = [
    (date(2026, 5, 5),  2100.0, 1.75),
    (date(2026, 5, 20), 2050.0, 1.75),
    (date(2026, 6, 5),  2200.0, 1.80),
    (date(2026, 6, 20), 2150.0, 1.80),
    (date(2026, 7, 5),  2250.0, 1.85),
    (date(2026, 7, 18), 2200.0, 1.85),
]


def log(msg):
    print(f"  {msg}")


def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    print("=" * 70)
    print("1) Insumo 'Racao Bovino Leiteiro (TESTE)' -- cria se nao existir")
    print("=" * 70)
    cur.execute("""
        SELECT id, estoque_atual, custo_medio FROM insumos
        WHERE fazenda_id = %s AND LOWER(TRIM(nome)) = %s AND ativo = TRUE
        LIMIT 1
    """, (FAZENDA_ID, "racao bovino leiteiro (teste)"))
    insumo = cur.fetchone()

    if insumo:
        insumo_id = insumo["id"]
        log(f"Ja existe: insumo_id={insumo_id}")
    else:
        cur.execute("""
            INSERT INTO insumos
                (fazenda_id, nome, descricao, categoria, unidade, origem,
                 estoque_atual, estoque_minimo, estoque_ideal, preco_estimado, custo_medio)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            FAZENDA_ID, "Racao Bovino Leiteiro (TESTE)",
            "[TESTE] Insumo criado para testar o calculo do IOFC -- pode ser removido.",
            "racao", "kg", "compra",
            0, 500, 3000, 1.80, 1.80,
        ))
        conn.commit()
        insumo_id = cur.fetchone()["id"]
        log(f"Criado: insumo_id={insumo_id}")

    print()
    print("=" * 70)
    print("2) Lancando consumo (tipo='uso') -- dado de TESTE")
    print("=" * 70)
    criados, duplicados, erros = 0, 0, 0
    for data_movim, qtd, custo_unit in CONSUMOS_TESTE:
        custo_total = round(qtd * custo_unit, 2)
        cur.execute("SAVEPOINT sp1")
        try:
            cur.execute("""
                SELECT id FROM movimentacoes_insumo
                WHERE insumo_id = %s AND data_movim = %s AND tipo = 'uso'
                  AND origem_modulo = 'teste_iofc'
            """, (insumo_id, data_movim))
            if cur.fetchone():
                cur.execute("RELEASE SAVEPOINT sp1")
                duplicados += 1
                log(f"{data_movim} -> ja lancado antes, pulado")
                continue

            cur.execute("""
                INSERT INTO movimentacoes_insumo
                    (insumo_id, fazenda_id, tipo, quantidade, custo_unitario, custo_total,
                     observacao, data_movim, origem_modulo, origem_tipo, origem_descricao,
                     custo_medio_antes, custo_medio_depois)
                VALUES (%s,%s,'uso',%s,%s,%s,%s,%s,'teste_iofc','teste',%s,%s,%s)
            """, (
                insumo_id, FAZENDA_ID, qtd, custo_unit, custo_total,
                "[TESTE] Consumo de racao inventado para testar o IOFC.",
                data_movim, "Dado de teste -- gerar_teste_racao_emboque_v1.py",
                custo_unit, custo_unit,
            ))
            cur.execute("RELEASE SAVEPOINT sp1")
            criados += 1
            log(f"{data_movim} -> {qtd}kg x R${custo_unit} = R${custo_total} OK")
        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp1")
            erros += 1
            log(f"{data_movim} -> ERRO: {e}")

    conn.commit()
    log(f"Total: {criados} criados, {duplicados} duplicados, {erros} erros")

    conn.close()
    print()
    print("Concluido.")
    print()
    print("Pra REVERTER tudo isso depois (rodar manualmente quando quiser limpar):")
    print("  DELETE FROM movimentacoes_insumo WHERE origem_modulo = 'teste_iofc';")
    print("  DELETE FROM insumos WHERE fazenda_id = 1 AND nome = 'Racao Bovino Leiteiro (TESTE)';")


if __name__ == "__main__":
    run()
