"""
RuralCaixa — Migração 016: Log de mensagens WhatsApp/Telegram (Bovino + Piscicultura)

Cria bovino_whatsapp_log e piscicultura_whatsapp_log, espelhando exatamente
ovino_whatsapp_log, para suportar os novos webhooks de IA desses módulos
(webhook_whatsapp_bovino, webhook_whatsapp_piscicultura).

Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_016_whatsapp_log_bovino_pisc.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "016_whatsapp_log_bovino_pisc"

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
        for tabela in ["bovino_whatsapp_log", "piscicultura_whatsapp_log"]:
            log(f"-- Criando tabela {tabela}")
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {tabela} (
                    id                SERIAL PRIMARY KEY,
                    telefone          VARCHAR(30),
                    tipo_midia        VARCHAR(20) DEFAULT 'texto',
                    conteudo_raw      TEXT,
                    intent_detectada  VARCHAR(50),
                    entidades_json    JSONB,
                    status            VARCHAR(20),
                    evento_id         INTEGER,
                    evento_tabela     VARCHAR(60),
                    erro_msg          TEXT,
                    criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{tabela}_telefone ON {tabela}(telefone)
            """)
            conn.commit()
            log(f"  [OK]  {tabela}")

        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Log de WhatsApp/Telegram para bovino e piscicultura (novos webhooks de IA)"))
        conn.commit()

        print()
        print("✅  Migração 016 aplicada com sucesso!")
        print("    ✓ bovino_whatsapp_log")
        print("    ✓ piscicultura_whatsapp_log")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
