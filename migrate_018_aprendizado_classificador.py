"""
RuralCaixa — Migração 018: Aprendizado do Classificador Financeiro

Cria a tabela que guarda palavras que o classificador não reconhecia e que
o produtor classificou manualmente (ex: "medicamentos", "flanaliv") — da
próxima vez que uma dessas palavras aparecer, o classificador já acerta
sozinho, sem perguntar de novo.

Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_018_aprendizado_classificador.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "018_aprendizado_classificador"

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
        log("-- Criando tabela termos_aprendidos_financeiro")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS termos_aprendidos_financeiro (
                id            SERIAL PRIMARY KEY,
                termo         VARCHAR(80) NOT NULL,
                conta         VARCHAR(20) NOT NULL,
                tipo          VARCHAR(20) NOT NULL,
                produtor_id   INTEGER REFERENCES produtores(id),
                vezes_usado   INTEGER NOT NULL DEFAULT 1,
                criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (termo, produtor_id)
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_termos_aprendidos_termo
            ON termos_aprendidos_financeiro (termo)
        """)
        conn.commit()
        log("  [OK]  termos_aprendidos_financeiro")

        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Tabela de aprendizado do classificador financeiro (termos corrigidos manualmente)"))
        conn.commit()

        print()
        print("✅  Migração 018 aplicada com sucesso!")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
