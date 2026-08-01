"""
corrigir_dado_inflado_1000x_v1.py

Corrige os dois efeitos colaterais do bug de virgula-decimal no OCR
(31/07), ja consertado na origem por patch_ocr_quantidade_decimal_v1.py.
Este script so limpa o dado que ja ficou errado ANTES do prompt ser
corrigido:

  1. insumos.estoque_atual e custo_medio inflados 1000x:
     - id=100 'Caroço de Algodão': 750000kg -> 750kg, custo R$0.0020 -> R$2.00
     - id=74  'Farelo de Soja':   1000000kg -> 1000kg, custo R$0.0024 -> R$2.40
     (valores corretos confirmados na nota fiscal real: 30 sacos de 25kg
     a R$49,50/saco = R$1,98/kg; 20 sacos de 50kg a R$121,00/saco = R$2,42/kg
     -- aqui uso o custo_medio JA GRAVADO / 1000, que reflete o preco real
     da nota, apenas com a casa decimal no lugar certo)

  2. movimentacoes_insumo.quantidade e custo_unitario dos dois registros
     de origem (id=127 Caroco de Algodao, id=128 Farelo de Soja) - mesma
     correcao, pra manter o historico de auditoria consistente com o
     saldo corrigido (nao apaga o registro, so corrige os valores).

  3. lancamentos.produtor_id do lancamento #532dbeb2-4f77-407d-84c7-
     28a998896caa: 1 (Cicero, errado) -> 6 (Bira, correto - confirmado
     pelo documento_url que ja apontava pra pasta do produtor_6, e pelo
     numero de telefone que enviou a nota).

Tudo numa unica transacao (tudo ou nada) - se qualquer passo falhar,
nada e alterado.

Uso:
  python3 corrigir_dado_inflado_1000x_v1.py            # diagnostico
  python3 corrigir_dado_inflado_1000x_v1.py --aplicar   # aplica
"""

import argparse
import sys
from decimal import Decimal

import psycopg2

DATABASE_URL = (
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX"
    "@gondola.proxy.rlwy.net:53900/railway"
)

FATOR = Decimal("1000")

# insumo_id -> movimentacao_id (a movimentacao de compra que causou a inflacao)
CORRECOES_INSUMO = {
    100: 127,  # Caroço de Algodão
    74: 128,   # Farelo de Soja
}

LANCAMENTO_ID_ERRADO = "532dbeb2-4f77-407d-84c7-28a998896caa"
PRODUTOR_ID_ERRADO = 1
PRODUTOR_ID_CORRETO = 6


def diagnostico(cur):
    print("--- Diagnostico ---\n")

    print("1) Insumos a corrigir (estoque_atual e custo_medio / 1000):")
    for insumo_id in CORRECOES_INSUMO:
        cur.execute(
            "SELECT nome, estoque_atual, custo_medio FROM insumos WHERE id = %s",
            (insumo_id,),
        )
        row = cur.fetchone()
        if not row:
            print(f"   ERRO: insumo_id={insumo_id} nao encontrado.")
            continue
        nome, estoque, custo = row
        print(
            f"   id={insumo_id} ({nome}): estoque {estoque} -> {estoque / FATOR}, "
            f"custo_medio {custo} -> {custo * FATOR if custo else custo}"
        )

    print("\n2) Movimentacoes a corrigir (quantidade e custo_unitario / 1000):")
    for insumo_id, mov_id in CORRECOES_INSUMO.items():
        cur.execute(
            "SELECT quantidade, custo_unitario FROM movimentacoes_insumo WHERE id = %s AND insumo_id = %s",
            (mov_id, insumo_id),
        )
        row = cur.fetchone()
        if not row:
            print(f"   ERRO: movimentacao id={mov_id} (insumo_id={insumo_id}) nao encontrada.")
            continue
        qtd, custo_unit = row
        print(
            f"   movimentacao id={mov_id}: quantidade {qtd} -> {qtd / FATOR}, "
            f"custo_unitario {custo_unit} -> {custo_unit * FATOR if custo_unit else custo_unit}"
        )

    print(f"\n3) Lancamento #{LANCAMENTO_ID_ERRADO}:")
    cur.execute(
        "SELECT produtor_id FROM lancamentos WHERE id::text = %s",
        (LANCAMENTO_ID_ERRADO,),
    )
    row = cur.fetchone()
    if not row:
        print("   ERRO: lancamento nao encontrado.")
    else:
        (produtor_atual,) = row
        if produtor_atual == PRODUTOR_ID_ERRADO:
            print(f"   produtor_id atual: {produtor_atual} -> sera corrigido para {PRODUTOR_ID_CORRETO}")
        elif produtor_atual == PRODUTOR_ID_CORRETO:
            print(f"   produtor_id ja esta correto ({PRODUTOR_ID_CORRETO}) - nada a fazer aqui.")
        else:
            print(
                f"   AVISO: produtor_id atual e {produtor_atual}, nem o esperado "
                f"errado ({PRODUTOR_ID_ERRADO}) nem o correto ({PRODUTOR_ID_CORRETO}). "
                f"Revisar manualmente antes de aplicar."
            )


def aplicar(conn, cur):
    try:
        print("Corrigindo insumos...")
        for insumo_id in CORRECOES_INSUMO:
            cur.execute(
                """
                UPDATE insumos
                SET estoque_atual = estoque_atual / %s,
                    custo_medio = custo_medio * %s,
                    atualizado_em = NOW()
                WHERE id = %s
                """,
                (FATOR, FATOR, insumo_id),
            )
            print(f"   insumo_id={insumo_id} corrigido.")

        print("Corrigindo movimentacoes de origem...")
        for insumo_id, mov_id in CORRECOES_INSUMO.items():
            cur.execute(
                """
                UPDATE movimentacoes_insumo
                SET quantidade = quantidade / %s,
                    custo_unitario = custo_unitario * %s,
                    custo_total = custo_total,
                    observacao = COALESCE(observacao, '') || ' [corrigido 31/07: valor original dividido por 1000 - bug de virgula decimal no OCR]'
                WHERE id = %s AND insumo_id = %s
                """,
                (FATOR, FATOR, mov_id, insumo_id),
            )
            print(f"   movimentacao id={mov_id} corrigida.")

        print("Corrigindo produtor_id do lancamento...")
        cur.execute(
            "SELECT produtor_id FROM lancamentos WHERE id::text = %s",
            (LANCAMENTO_ID_ERRADO,),
        )
        row = cur.fetchone()
        if row and row[0] == PRODUTOR_ID_ERRADO:
            cur.execute(
                "UPDATE lancamentos SET produtor_id = %s WHERE id::text = %s",
                (PRODUTOR_ID_CORRETO, LANCAMENTO_ID_ERRADO),
            )
            print(f"   lancamento corrigido para produtor_id={PRODUTOR_ID_CORRETO}.")
        elif row and row[0] == PRODUTOR_ID_CORRETO:
            print("   lancamento ja estava correto - pulando.")
        else:
            raise RuntimeError(
                f"lancamento com produtor_id inesperado ({row}) - abortando "
                f"para nao corrigir as cegas."
            )

        conn.commit()
        print("\nTudo corrigido e commitado com sucesso.")

    except Exception:
        conn.rollback()
        print("\nERRO - ROLLBACK completo. Nenhuma alteracao foi aplicada.")
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        if args.aplicar:
            aplicar(conn, cur)
        else:
            diagnostico(cur)
            print(
                "\n(Modo diagnostico - nenhuma alteracao foi feita. "
                "Rode novamente com --aplicar para corrigir.)"
            )
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
