"""
RuralCaixa — Migração 017: Genealogia de Bovinos

Adiciona campos para importação de genealogia (pai/mãe externos, composição
racial) ao cadastro de bovinos. Complementa os já existentes pai_id/mae_id
(FK para bovino_animais.id, usados quando o pai/mãe está no próprio rebanho).

Os novos campos de texto guardam a referência do pedigree mesmo quando o
pai/mãe NÃO está cadastrado localmente (ex.: touro de central de IA, matriz
de outra fazenda) — nada se perde na importação mesmo sem conseguir linkar.

Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_017_genealogia_bovino.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "017_genealogia_bovino"

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
        log("-- Ajustando tabela bovino_animais (genealogia)")
        cur.execute("""
            ALTER TABLE bovino_animais
                ADD COLUMN IF NOT EXISTS nome_pai              VARCHAR(150),
                ADD COLUMN IF NOT EXISTS nome_mae               VARCHAR(150),
                ADD COLUMN IF NOT EXISTS registro_pai_externo   VARCHAR(60),
                ADD COLUMN IF NOT EXISTS registro_mae_externo   VARCHAR(60),
                ADD COLUMN IF NOT EXISTS composicao_racial      VARCHAR(200)
        """)
        cur.execute("""
            COMMENT ON COLUMN bovino_animais.registro_pai_externo IS
            'Nº de registro do pai quando ele NÃO está cadastrado neste rebanho (ex: touro de central de IA). Se o pai for encontrado localmente, use pai_id em vez disso.'
        """)
        cur.execute("""
            COMMENT ON COLUMN bovino_animais.registro_mae_externo IS
            'Nº de registro da mãe quando ela NÃO está cadastrada neste rebanho. Se a mãe for encontrada localmente, use mae_id em vez disso.'
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_bovino_animais_registro_pai_ext
            ON bovino_animais(registro_pai_externo) WHERE registro_pai_externo IS NOT NULL
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_bovino_animais_registro_mae_ext
            ON bovino_animais(registro_mae_externo) WHERE registro_mae_externo IS NOT NULL
        """)
        conn.commit()
        log("  [OK]  bovino_animais.nome_pai / nome_mae / registro_pai_externo / registro_mae_externo / composicao_racial")

        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Genealogia de bovinos: pai/mãe externos + composição racial (import GISleite)"))
        conn.commit()

        print()
        print("✅  Migração 017 aplicada com sucesso!")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
