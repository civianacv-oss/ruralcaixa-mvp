"""
RuralCaixa — Migração 011: nfe_produtor
Cria tabela nfe_produtor para o novo router /nfe-produtor.
(Diferente das tabelas legadas nfe_notas/nfe_config que são usadas pelo wizard existente)
Idempotente via schema_migrations.
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "011_nfe_produtor"

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
        log("-- Criando tabela nfe_produtor")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS nfe_produtor (
                id                           SERIAL PRIMARY KEY,
                imovel_id                    INTEGER NOT NULL,
                numero                       VARCHAR(20) NOT NULL,
                serie                        VARCHAR(5) NOT NULL DEFAULT '001',
                data_emissao                 DATE NOT NULL,
                data_saida                   DATE,
                -- Emitente
                nome_emitente                VARCHAR(150) NOT NULL,
                cpf_cnpj_emitente            VARCHAR(18) NOT NULL,
                ie_emitente                  VARCHAR(30),
                inscricao_estadual_produtor  VARCHAR(30),
                -- Destinatário
                nome_destinatario            VARCHAR(150) NOT NULL,
                cpf_cnpj_destinatario        VARCHAR(18) NOT NULL,
                ie_destinatario              VARCHAR(30),
                -- Produto
                produto                      VARCHAR(40) NOT NULL,
                descricao_produto            TEXT NOT NULL,
                ncm                          VARCHAR(10),
                cfop                         VARCHAR(6) NOT NULL DEFAULT '5101',
                unidade                      VARCHAR(6) NOT NULL DEFAULT 'SC',
                quantidade                   NUMERIC(12,3) NOT NULL,
                valor_unitario               NUMERIC(12,4) NOT NULL,
                -- Valores
                valor_produtos               NUMERIC(14,2) NOT NULL,
                desconto                     NUMERIC(12,2) NOT NULL DEFAULT 0,
                valor_frete                  NUMERIC(12,2) NOT NULL DEFAULT 0,
                valor_total_nf               NUMERIC(14,2) NOT NULL,
                -- ICMS
                base_calculo_icms            NUMERIC(14,2) NOT NULL DEFAULT 0,
                aliquota_icms                NUMERIC(6,4) NOT NULL DEFAULT 0,
                valor_icms                   NUMERIC(12,2) NOT NULL DEFAULT 0,
                icms_diferido                BOOLEAN NOT NULL DEFAULT FALSE,
                -- FUNRURAL / SENAR
                base_calculo_funrural        NUMERIC(14,2) NOT NULL DEFAULT 0,
                aliquota_funrural            NUMERIC(6,4) NOT NULL DEFAULT 1.87,
                valor_funrural               NUMERIC(12,2) NOT NULL DEFAULT 0,
                aliquota_senar               NUMERIC(6,4) NOT NULL DEFAULT 0.20,
                valor_senar                  NUMERIC(12,2) NOT NULL DEFAULT 0,
                -- Controle
                chave_acesso                 VARCHAR(50),
                protocolo_autorizacao        VARCHAR(30),
                status                       VARCHAR(20) NOT NULL DEFAULT 'rascunho',
                motivo_cancelamento          TEXT,
                -- Vinculação
                acerto_contrato_id           INTEGER,
                observacoes                  TEXT,
                criado_em                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(imovel_id, numero, serie)
            )
        """)
        log("  [OK]  nfe_produtor")
        conn.commit()

        log("-- Criando índices")
        for idx, col in [
            ("idx_nfe_prod_imovel",   "imovel_id"),
            ("idx_nfe_prod_emissao",  "data_emissao"),
            ("idx_nfe_prod_status",   "status"),
            ("idx_nfe_prod_acerto",   "acerto_contrato_id"),
        ]:
            cur.execute(f"CREATE INDEX IF NOT EXISTS {idx} ON nfe_produtor({col})")
        conn.commit()
        log("  [OK]  índices criados")

        log("-- Criando trigger")
        cur.execute("""
            CREATE OR REPLACE FUNCTION update_timestamp_generic()
            RETURNS TRIGGER AS $$
            BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
            $$ LANGUAGE plpgsql
        """)
        cur.execute("DROP TRIGGER IF EXISTS trg_nfe_produtor_ts ON nfe_produtor")
        cur.execute("""
            CREATE TRIGGER trg_nfe_produtor_ts
            BEFORE UPDATE ON nfe_produtor
            FOR EACH ROW EXECUTE FUNCTION update_timestamp_generic()
        """)
        conn.commit()
        log("  [OK]  trigger criado")

        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Tabela nfe_produtor para controle de NF-e de produtor rural"))
        conn.commit()

        print()
        print("✅  Migração 011 aplicada com sucesso!")
        print("    ✓ nfe_produtor")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
