"""
RuralCaixa — Migração 015: Melhorias de Estoque de Insumos
(originalmente enviada como 012_insumos_melhorias.sql — renumerada para 015
para não colidir com migrate_012_estoque_unificado.py / migrate_013_gestao_culturas.py
já usados no fluxo atual de migrações .py na raiz do projeto)

Adiciona colunas de gestão avançada ao catálogo de Insumos:
estoque_reservado, estoque_maximo, lote, validade, local_armazenamento.

100% aditiva — não altera estoque_atual nem a lógica de PMP já em produção
(app/services/estoque_insumos.py). estoque_reservado ainda não é lido/escrito
por nenhum endpoint; é só a coluna, pronta para quando a lógica de reserva
for implementada.

Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_015_insumos_melhorias.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "015_insumos_melhorias"

def log(msg): print(f"  {msg}")

def run():
    print("=" * 60)
    print(f"  RuralCaixa — Migração {MIGRATION_ID}")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id VARCHAR(100) PRIMARY KEY, description TEXT,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    conn.commit()

    cur.execute("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = %s", (MIGRATION_ID,))
    if cur.fetchone()["n"] > 0:
        log(f"  [OK]  Migração '{MIGRATION_ID}' já aplicada.")
        conn.close(); return

    try:
        log("-- Ajustando tabela insumos (reserva, teto, lote, validade, local)")
        cur.execute("""
            ALTER TABLE insumos
              ADD COLUMN IF NOT EXISTS estoque_reservado numeric NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS estoque_maximo numeric,
              ADD COLUMN IF NOT EXISTS lote varchar(60),
              ADD COLUMN IF NOT EXISTS validade date,
              ADD COLUMN IF NOT EXISTS local_armazenamento varchar(120)
        """)
        cur.execute("COMMENT ON COLUMN insumos.estoque_reservado IS "
                     "'Quantidade já comprometida para atividade futura (não conta como disponível para novo consumo)'")
        cur.execute("COMMENT ON COLUMN insumos.estoque_maximo IS "
                     "'Teto de estoque para evitar compras excessivas'")
        cur.execute("COMMENT ON COLUMN insumos.lote IS "
                     "'Lote do insumo (essencial para medicamentos, vacinas, sementes, defensivos)'")
        cur.execute("COMMENT ON COLUMN insumos.validade IS "
                     "'Data de validade do lote atual, para alertas de vencimento'")
        cur.execute("COMMENT ON COLUMN insumos.local_armazenamento IS "
                     "'Ex: Silo 02, Galpão A, Farmácia, Tanque Diesel, Depósito Central'")
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_insumos_validade
            ON insumos (validade) WHERE validade IS NOT NULL
        """)
        conn.commit()
        log("  [OK]  insumos.estoque_reservado / estoque_maximo / lote / validade / local_armazenamento")

        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Melhorias de estoque de Insumos: reservado, máximo, lote, validade, local (ex-012_insumos_melhorias.sql)"))
        conn.commit()

        print()
        print("✅  Migração 015 aplicada com sucesso!")
        print("    ✓ insumos.estoque_reservado (default 0, ainda sem lógica de leitura/escrita)")
        print("    ✓ insumos.estoque_maximo")
        print("    ✓ insumos.lote / insumos.validade (+ índice de vencimento)")
        print("    ✓ insumos.local_armazenamento")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
