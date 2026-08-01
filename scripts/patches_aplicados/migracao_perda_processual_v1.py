"""
migracao_perda_processual_v1.py

Adiciona a coluna `perda_processual` na tabela `transformacoes_insumo`
(modulo de transformacao de insumo / mistura de materias-primas).

Segue o padrao do projeto RuralCaixa:
  1. Diagnostico (read-only) - mostra o estado atual, nao altera nada
  2. --aplicar - executa o ALTER TABLE de fato

Uso:
  # 1) Sempre rodar o diagnostico primeiro (sem flag)
  python3 migracao_perda_processual_v1.py

  # 2) Fazer backup antes de aplicar (recomendado, mesmo sendo ALTER simples)
  pg_dump "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway" > backup_pre_perda_processual_$(date +%Y%m%d_%H%M%S).sql

  # 3) Aplicar de fato
  python3 migracao_perda_processual_v1.py --aplicar

Seguro re-executar: o script verifica se a coluna ja existe antes de
tentar criar (idempotente), entao rodar de novo apos uma queda de conexao
nao causa erro nem duplica nada.
"""

import argparse
import sys

import psycopg2

DATABASE_URL = (
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX"
    "@gondola.proxy.rlwy.net:53900/railway"
)

TABELA = "transformacoes_insumo"
COLUNA = "perda_processual"


def coluna_existe(cur) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
        """,
        (TABELA, COLUNA),
    )
    return cur.fetchone() is not None


def tabela_existe(cur) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = %s
        """,
        (TABELA,),
    )
    return cur.fetchone() is not None


def diagnostico(cur):
    print(f"--- Diagnostico: tabela '{TABELA}' / coluna '{COLUNA}' ---\n")

    if not tabela_existe(cur):
        print(
            f"A tabela '{TABELA}' ainda NAO existe no banco.\n"
            "Este script so cuida da coluna 'perda_processual'; a criacao "
            "da tabela em si (junto com 'transformacao_ingredientes') e "
            "responsabilidade de uma migracao separada (DDL_REFERENCIA em "
            "transformacao_insumo_v1.py). Rode aquela migracao primeiro."
        )
        return

    print(f"Tabela '{TABELA}' existe.")

    if coluna_existe(cur):
        print(
            f"Coluna '{COLUNA}' JA EXISTE. Nada a fazer - "
            "rodar --aplicar seria um no-op seguro (idempotente)."
        )
    else:
        print(
            f"Coluna '{COLUNA}' NAO existe ainda. "
            "Rode com --aplicar para criar:\n"
            f"  ALTER TABLE {TABELA} ADD COLUMN {COLUNA} DECIMAL(12,3) "
            "NOT NULL DEFAULT 0;"
        )

    # Conferencia extra: quantas linhas ja existem na tabela (para saber
    # se o DEFAULT 0 vai popular retroativamente sem impacto)
    cur.execute(f"SELECT COUNT(*) FROM {TABELA}")
    (total_linhas,) = cur.fetchone()
    print(f"\nLinhas existentes em '{TABELA}': {total_linhas}")
    if total_linhas > 0:
        print(
            "Atencao: linhas existentes vao receber perda_processual = 0 "
            "por padrao (assumindo que a mistura registrada rendeu exatamente "
            "a soma das materias-primas, sem perda conhecida)."
        )


def aplicar(conn, cur):
    if not tabela_existe(cur):
        print(
            f"ERRO: tabela '{TABELA}' nao existe. Aplique primeiro a "
            "migracao que cria 'transformacoes_insumo' e "
            "'transformacao_ingredientes' (DDL_REFERENCIA em "
            "transformacao_insumo_v1.py)."
        )
        sys.exit(1)

    if coluna_existe(cur):
        print(f"Coluna '{COLUNA}' ja existe. Nenhuma alteracao necessaria.")
        return

    print(f"Aplicando: ALTER TABLE {TABELA} ADD COLUMN {COLUNA} ...")
    cur.execute(
        f"""
        ALTER TABLE {TABELA}
        ADD COLUMN {COLUNA} DECIMAL(12,3) NOT NULL DEFAULT 0
        """
    )
    # autocommit esta ligado na conexao (ver main()), entao o commit
    # ja ocorre por operacao - nao ha necessidade de conn.commit() aqui
    print(f"Coluna '{COLUNA}' criada com sucesso em '{TABELA}'.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Executa o ALTER TABLE de fato. Sem esta flag, roda so o diagnostico (read-only).",
    )
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL)
    # Autocommit por operacao (nao uma unica transacao para todo o script) -
    # padrao do projeto para evitar perder progresso em caso de queda de conexao.
    conn.autocommit = True
    cur = conn.cursor()

    try:
        if args.aplicar:
            aplicar(conn, cur)
        else:
            diagnostico(cur)
            print(
                "\n(Modo diagnostico - nenhuma alteracao foi feita. "
                "Rode novamente com --aplicar para executar o ALTER TABLE.)"
            )
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
