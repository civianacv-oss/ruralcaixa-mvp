"""
corrigir_imovel_padrao_bira_v1.py

Corrige produtores.imovel_id_padrao do Bira (produtor_id=6), que estava
apontando erroneamente para 1 (fazenda real do Cicero) em vez de 6
(Fazenda Emboque Sao Francisco, a propria fazenda do Bira).

Investigacao (31/07) descartou contaminacao de historico: fazenda_id=1
tem 238 lancamentos reais confirmados do proprio Cicero, sem evidencia
de dado do Bira misroteado la dentro. Este script SO corrige o campo
de roteamento futuro - nao mexe em nenhum registro historico.

Uso:
  python3 corrigir_imovel_padrao_bira_v1.py            # diagnostico
  python3 corrigir_imovel_padrao_bira_v1.py --aplicar   # aplica
"""

import argparse
import sys

import psycopg2

DATABASE_URL = (
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX"
    "@gondola.proxy.rlwy.net:53900/railway"
)

PRODUTOR_ID_BIRA = 6
IMOVEL_ID_CORRETO = 6


def diagnostico(cur):
    cur.execute(
        "SELECT id, nome, imovel_id_padrao FROM produtores WHERE id = %s",
        (PRODUTOR_ID_BIRA,),
    )
    row = cur.fetchone()
    if not row:
        print(f"ERRO: produtor_id={PRODUTOR_ID_BIRA} nao encontrado.")
        sys.exit(1)

    produtor_id, nome, imovel_atual = row
    print(f"Produtor: {nome} (id={produtor_id})")
    print(f"imovel_id_padrao atual: {imovel_atual}")

    cur.execute(
        "SELECT id FROM imoveis_rurais WHERE id = %s AND produtor_id = %s",
        (IMOVEL_ID_CORRETO, PRODUTOR_ID_BIRA),
    )
    if not cur.fetchone():
        print(
            f"ERRO: imovel_id={IMOVEL_ID_CORRETO} nao pertence ao "
            f"produtor_id={PRODUTOR_ID_BIRA}. Abortando - verificar manualmente."
        )
        sys.exit(1)

    if imovel_atual == IMOVEL_ID_CORRETO:
        print(f"\nJa esta correto (imovel_id_padrao={IMOVEL_ID_CORRETO}). Nada a fazer.")
    else:
        print(
            f"\nPRONTO PARA CORRIGIR: {imovel_atual} -> {IMOVEL_ID_CORRETO}\n"
            f"Rode com --aplicar para executar."
        )


def aplicar(conn, cur):
    cur.execute(
        "SELECT imovel_id_padrao FROM produtores WHERE id = %s",
        (PRODUTOR_ID_BIRA,),
    )
    (imovel_atual,) = cur.fetchone()

    if imovel_atual == IMOVEL_ID_CORRETO:
        print(f"Ja estava correto (imovel_id_padrao={IMOVEL_ID_CORRETO}). Nada a fazer.")
        return

    cur.execute(
        "UPDATE produtores SET imovel_id_padrao = %s WHERE id = %s",
        (IMOVEL_ID_CORRETO, PRODUTOR_ID_BIRA),
    )
    print(
        f"Corrigido: produtor_id={PRODUTOR_ID_BIRA} imovel_id_padrao "
        f"{imovel_atual} -> {IMOVEL_ID_CORRETO}"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True  # operacao unica, autocommit por operacao (padrao do projeto)
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
