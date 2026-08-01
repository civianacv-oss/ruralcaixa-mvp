"""
criar_tabelas_transformacao_v1.py

Cria as tabelas do modulo de TRANSFORMACAO de insumo (mistura de
materias-primas em produto acabado):

  - transformacoes_insumo       (cabecalho da mistura)
  - transformacao_ingredientes  (rastreabilidade: qual MP entrou em qual mistura)

Ja inclui a coluna `perda_processual` desde a criacao (nao precisa rodar
migracao_perda_processual_v1.py depois, a menos que a tabela ja exista em
algum ambiente sem essa coluna - nesse caso, aquele script isolado serve
de fallback).

Pre-requisito: as tabelas `imoveis_rurais`, `produtores`, `insumos` e
`movimentacoes_insumo` ja devem existir (usadas como FK).

Segue o padrao do projeto RuralCaixa:
  1. Diagnostico (read-only) - mostra o que existe e o que falta
  2. --aplicar - executa os CREATE TABLE / CREATE INDEX de fato

Uso:
  # 1) Diagnostico primeiro (sem flag)
  python3 criar_tabelas_transformacao_v1.py

  # 2) Backup antes de aplicar
  pg_dump "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway" > backup_pre_transformacao_$(date +%Y%m%d_%H%M%S).sql

  # 3) Aplicar
  python3 criar_tabelas_transformacao_v1.py --aplicar

Idempotente: usa CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS,
entao rodar de novo apos queda de conexao nao causa erro.
"""

import argparse
import sys

import psycopg2

DATABASE_URL = (
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX"
    "@gondola.proxy.rlwy.net:53900/railway"
)

TABELAS_PREREQUISITO = ["imoveis_rurais", "produtores", "insumos", "movimentacoes_insumo"]
TABELAS_NOVAS = ["transformacoes_insumo", "transformacao_ingredientes"]

DDL_TRANSFORMACOES_INSUMO = """
CREATE TABLE IF NOT EXISTS transformacoes_insumo (
    id SERIAL PRIMARY KEY,
    imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
    produtor_id INTEGER NOT NULL REFERENCES produtores(id),
    insumo_resultado_id INTEGER NOT NULL REFERENCES insumos(id),
    quantidade_resultado DECIMAL(12,3) NOT NULL,
    custo_total_resultado DECIMAL(12,2) NOT NULL,
    movimentacao_entrada_id INTEGER NOT NULL REFERENCES movimentacoes_insumo(id),
    perda_processual DECIMAL(12,3) NOT NULL DEFAULT 0,
    formula_id INTEGER NULL,
    data_movimentacao DATE NOT NULL,
    data_registro TIMESTAMP DEFAULT NOW(),
    observacao TEXT,
    lote_resultado VARCHAR(50)
)
"""

DDL_TRANSFORMACAO_INGREDIENTES = """
CREATE TABLE IF NOT EXISTS transformacao_ingredientes (
    id SERIAL PRIMARY KEY,
    transformacao_id INTEGER NOT NULL REFERENCES transformacoes_insumo(id) ON DELETE CASCADE,
    insumo_mp_id INTEGER NOT NULL REFERENCES insumos(id),
    movimentacao_saida_id INTEGER NOT NULL REFERENCES movimentacoes_insumo(id),
    quantidade_usada DECIMAL(12,3) NOT NULL,
    custo_unitario_na_data DECIMAL(12,4) NOT NULL,
    custo_total DECIMAL(12,2) NOT NULL,
    lote_mp VARCHAR(50) NULL
)
"""

INDICES = [
    (
        "idx_transformacao_imovel",
        "CREATE INDEX IF NOT EXISTS idx_transformacao_imovel "
        "ON transformacoes_insumo(imovel_id, data_movimentacao)",
    ),
    (
        "idx_transformacao_resultado",
        "CREATE INDEX IF NOT EXISTS idx_transformacao_resultado "
        "ON transformacoes_insumo(insumo_resultado_id)",
    ),
    (
        "idx_ingredientes_transformacao",
        "CREATE INDEX IF NOT EXISTS idx_ingredientes_transformacao "
        "ON transformacao_ingredientes(transformacao_id)",
    ),
    (
        "idx_ingredientes_mp",
        "CREATE INDEX IF NOT EXISTS idx_ingredientes_mp "
        "ON transformacao_ingredientes(insumo_mp_id)",
    ),
]


def tabela_existe(cur, nome_tabela: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
        (nome_tabela,),
    )
    return cur.fetchone() is not None


def indice_existe(cur, nome_indice: str) -> bool:
    cur.execute(
        "SELECT 1 FROM pg_indexes WHERE indexname = %s",
        (nome_indice,),
    )
    return cur.fetchone() is not None


def diagnostico(cur):
    print("--- Diagnostico: modulo de transformacao de insumo ---\n")

    print("Pre-requisitos (tabelas que ja devem existir):")
    faltando_prereq = []
    for t in TABELAS_PREREQUISITO:
        existe = tabela_existe(cur, t)
        status = "OK" if existe else "FALTANDO"
        print(f"  [{status}] {t}")
        if not existe:
            faltando_prereq.append(t)

    if faltando_prereq:
        print(
            f"\nATENCAO: pre-requisito(s) ausente(s): {', '.join(faltando_prereq)}. "
            "Nao aplique esta migracao ate essas tabelas existirem - os "
            "REFERENCES vao falhar."
        )

    print("\nTabelas novas deste modulo:")
    for t in TABELAS_NOVAS:
        existe = tabela_existe(cur, t)
        status = "JA EXISTE" if existe else "sera criada"
        print(f"  [{status}] {t}")

    print("\nIndices deste modulo:")
    for nome_idx, _ in INDICES:
        existe = indice_existe(cur, nome_idx)
        status = "JA EXISTE" if existe else "sera criado"
        print(f"  [{status}] {nome_idx}")

    if not faltando_prereq:
        print(
            "\nTudo pronto para aplicar. Rode com --aplicar apos fazer o "
            "pg_dump de backup."
        )


def aplicar(cur):
    faltando = [t for t in TABELAS_PREREQUISITO if not tabela_existe(cur, t)]
    if faltando:
        print(
            f"ERRO: pre-requisito(s) ausente(s): {', '.join(faltando)}. "
            "Abortando - os REFERENCES falhariam."
        )
        sys.exit(1)

    print("Criando 'transformacoes_insumo' (se necessario)...")
    cur.execute(DDL_TRANSFORMACOES_INSUMO)
    print("OK.")

    print("Criando 'transformacao_ingredientes' (se necessario)...")
    cur.execute(DDL_TRANSFORMACAO_INGREDIENTES)
    print("OK.")

    for nome_idx, ddl in INDICES:
        print(f"Criando indice '{nome_idx}' (se necessario)...")
        cur.execute(ddl)
        print("OK.")

    print("\nMigracao concluida com sucesso.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Executa os CREATE TABLE/INDEX de fato. Sem esta flag, roda so o diagnostico (read-only).",
    )
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL)
    # Autocommit por operacao - cada CREATE TABLE/INDEX confirma
    # individualmente, seguindo o padrao do projeto (evita perder
    # progresso inteiro em caso de queda de conexao no meio da migracao).
    conn.autocommit = True
    cur = conn.cursor()

    try:
        if args.aplicar:
            aplicar(cur)
        else:
            diagnostico(cur)
            print(
                "\n(Modo diagnostico - nenhuma alteracao foi feita. "
                "Rode novamente com --aplicar para criar as tabelas.)"
            )
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
