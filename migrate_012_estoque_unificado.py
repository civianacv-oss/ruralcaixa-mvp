"""
RuralCaixa — Migração 012: Estoque Unificado de Insumos (PMP global)
Integra Piscicultura e Fruticultura (Açaí) ao estoque geral de Insumos.

Arquitetura:
  - Estoque físico e PMP (Preço Médio Ponderado): GLOBAL por insumo (fazenda_id).
  - Apropriação de custo: por movimentação, marcada com origem_modulo/origem_tipo/origem_id
    (ex: piscicultura/ciclo/7, acai/talhao/3), permitindo relatórios de custo por
    ciclo/safra/talhao sem duplicar ou fragmentar o estoque físico.
  - Sem dados históricos em compras_insumos_piscicultura / acai_insumos até o momento
    desta migração — portanto NÃO há backfill. Integração vale a partir de agora.

Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_012_estoque_unificado.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "012_estoque_unificado"

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
        # ── 1. insumos: custo médio ponderado global ──────────────────────
        log("-- Ajustando tabela insumos (PMP global)")
        cur.execute("""
            ALTER TABLE insumos
                ADD COLUMN IF NOT EXISTS custo_medio NUMERIC(14,4)
        """)
        # backfill inofensivo: onde ainda não há PMP, usa o preço estimado como ponto de partida
        cur.execute("""
            UPDATE insumos SET custo_medio = preco_estimado
            WHERE custo_medio IS NULL AND preco_estimado IS NOT NULL
        """)
        conn.commit()
        log("  [OK]  insumos.custo_medio")

        # ── 2. movimentacoes_insumo: rastreabilidade de origem + auditoria de PMP ──
        log("-- Ajustando tabela movimentacoes_insumo (origem + PMP)")
        cur.execute("""
            ALTER TABLE movimentacoes_insumo
                ADD COLUMN IF NOT EXISTS origem_modulo     VARCHAR(40) NOT NULL DEFAULT 'manual',
                ADD COLUMN IF NOT EXISTS origem_tipo       VARCHAR(40),
                ADD COLUMN IF NOT EXISTS origem_id         INTEGER,
                ADD COLUMN IF NOT EXISTS origem_descricao  VARCHAR(200),
                ADD COLUMN IF NOT EXISTS custo_medio_antes NUMERIC(14,4),
                ADD COLUMN IF NOT EXISTS custo_medio_depois NUMERIC(14,4)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_movim_insumo_origem
                ON movimentacoes_insumo (origem_modulo, origem_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_movim_insumo_insumo_data
                ON movimentacoes_insumo (insumo_id, data_movim)
        """)
        conn.commit()
        log("  [OK]  movimentacoes_insumo.origem_* / custo_medio_*")

        # ── 3. Piscicultura: liga compras e consumo de ração ao estoque geral ──
        log("-- Ajustando tabela compras_insumos_piscicultura")
        cur.execute("""
            ALTER TABLE compras_insumos_piscicultura
                ADD COLUMN IF NOT EXISTS insumo_id      INTEGER REFERENCES insumos(id),
                ADD COLUMN IF NOT EXISTS movimentacao_id INTEGER REFERENCES movimentacoes_insumo(id)
        """)
        conn.commit()
        log("  [OK]  compras_insumos_piscicultura.insumo_id / movimentacao_id")

        log("-- Ajustando tabela registros_diarios_piscicultura")
        cur.execute("""
            ALTER TABLE registros_diarios_piscicultura
                ADD COLUMN IF NOT EXISTS insumo_racao_id     INTEGER REFERENCES insumos(id),
                ADD COLUMN IF NOT EXISTS movimentacao_id     INTEGER REFERENCES movimentacoes_insumo(id)
        """)
        conn.commit()
        log("  [OK]  registros_diarios_piscicultura.insumo_racao_id / movimentacao_id")

        # ── 4. Açaí: liga aplicação de insumos (adubo, defensivo etc.) ao estoque geral ──
        # Verifica se a tabela existe antes de alterar — em algumas bases o
        # módulo Açaí pode não ter sido migrado ainda, e isso não deve travar
        # o resto desta migração (insumos/piscicultura já foram aplicados
        # com sucesso nos passos anteriores, cada um com commit próprio).
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables WHERE table_name = 'acai_insumos'
            )
        """)
        acai_existe = cur.fetchone()["exists"]
        if acai_existe:
            log("-- Ajustando tabela acai_insumos")
            cur.execute("""
                ALTER TABLE acai_insumos
                    ADD COLUMN IF NOT EXISTS insumo_id      INTEGER REFERENCES insumos(id),
                    ADD COLUMN IF NOT EXISTS movimentacao_id INTEGER REFERENCES movimentacoes_insumo(id)
            """)
            conn.commit()
            log("  [OK]  acai_insumos.insumo_id / movimentacao_id")
        else:
            log("  [SKIP] tabela 'acai_insumos' não existe nesta base — módulo Açaí")
            log("         pode não estar migrado ainda. Pulando sem travar a migração.")

        # ── Registrar ────────────────────────────────────────────────────
        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Estoque unificado de insumos (PMP global) integrado a Piscicultura e Açaí"))
        conn.commit()

        print()
        print("✅  Migração 012 aplicada com sucesso!")
        itens_ok = ["insumos.custo_medio", "movimentacoes_insumo.origem_*",
                    "compras_insumos_piscicultura.insumo_id", "registros_diarios_piscicultura.insumo_racao_id"]
        if acai_existe:
            itens_ok.append("acai_insumos.insumo_id")
        for t in itens_ok:
            print(f"    ✓ {t}")
        if not acai_existe:
            print("    ⊘ acai_insumos.insumo_id — pulado (tabela não existe nesta base)")
        print()
        print("  Nenhum backfill de histórico foi necessário (sem dados anteriores).")
        print("  A partir de agora, ligue insumo_id nas compras/consumo desses módulos")
        print("  para que a baixa de estoque e o PMP passem a ser automáticos.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
