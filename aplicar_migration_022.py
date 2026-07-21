"""
aplicar_migration_022.py

Roda a migration 022_compravenda_classificacao_fiscal.sql direto no
Postgres do Railway. Idempotente (usa IF NOT EXISTS / ADD COLUMN IF NOT
EXISTS em tudo), entao pode rodar mais de uma vez sem quebrar nada.

Uso:
    python aplicar_migration_022.py
"""

import psycopg2
import sys

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
ARQUIVO_SQL = "022_compravenda_classificacao_fiscal.sql"


def main():
    print(f"Lendo {ARQUIVO_SQL}...")
    try:
        with open(ARQUIVO_SQL, "r", encoding="utf-8") as f:
            sql = f.read()
    except FileNotFoundError:
        print(f"ERRO: arquivo {ARQUIVO_SQL} não encontrado nesta pasta.")
        print("Rode este script na mesma pasta onde está o .sql (C:\\ruralcaixa\\ruralcaixa-mvp).")
        sys.exit(1)

    print("Conectando no Railway...")
    conn = psycopg2.connect(DB_URL, connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()
    print("Conectado!\n")

    try:
        cur.execute(sql)
        conn.commit()
        print("OK — migration 022 aplicada com sucesso.\n")
    except Exception as e:
        conn.rollback()
        print(f"ERRO ao aplicar a migration: {e}")
        sys.exit(1)

    # Conferência rápida do que foi criado
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'cv_vendas'
          AND column_name IN ('classificacao', 'valor_rural', 'valor_negociacao', 'lancamento_id')
        ORDER BY column_name
    """)
    colunas = [r[0] for r in cur.fetchall()]
    print("Colunas novas em cv_vendas:", colunas)

    cur.execute("""
        SELECT 1 FROM information_schema.tables WHERE table_name = 'cv_vendas_baixas'
    """)
    tem_tabela = cur.fetchone() is not None
    print("Tabela cv_vendas_baixas criada:", tem_tabela)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
