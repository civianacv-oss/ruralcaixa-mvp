"""
RuralCaixa — Migração 009: Melhorias EFD-Reinf
Executa o script 009_efdreinf_melhorias.sql de forma idempotente.
Uso: python3 migrate_009_efdreinf.py
     DATABASE_URL="postgresql://..." python3 migrate_009_efdreinf.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "009_efdreinf_melhorias"

def log(msg): print(f"  {msg}")

def run():
    print("=" * 60)
    print(f"  RuralCaixa — Migração {MIGRATION_ID}")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    # Passo 1: schema_migrations
    log("-- Passo 1: schema_migrations")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id          VARCHAR(100) PRIMARY KEY,
            description TEXT,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    conn.commit()
    log("  [OK]  schema_migrations verificada/criada")

    # Passo 2: idempotência
    log("-- Passo 2: Verificar idempotência")
    cur.execute("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = %s", (MIGRATION_ID,))
    if cur.fetchone()["n"] > 0:
        log(f"  [OK]  Migração '{MIGRATION_ID}' já aplicada. Nada a fazer.")
        conn.close()
        return

    try:
        # Passo 3: colunas reinf_r2055
        log("-- Passo 3: reinf_r2055 — novas colunas")
        for col, defn in [
            ("acerto_id",         "INTEGER"),
            ("origem",            "VARCHAR(20) NOT NULL DEFAULT 'manual'"),
            ("cpf_cnpj_produtor", "VARCHAR(18)"),
            ("caepf",             "VARCHAR(20)"),
            ("xml_gerado",        "TEXT"),
            ("data_transmissao",  "TIMESTAMPTZ"),
            ("retificacao_id",    "INTEGER"),
            ("atualizado_em",     "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
            ("aliquota_cbs",      "NUMERIC(6,4) DEFAULT 0"),
            ("valor_cbs",         "NUMERIC(12,2) DEFAULT 0"),
            ("aliquota_ibs",      "NUMERIC(6,4) DEFAULT 0"),
            ("valor_ibs",         "NUMERIC(12,2) DEFAULT 0"),
            ("regime_fiscal",     "VARCHAR(30) DEFAULT 'atual'"),
        ]:
            cur.execute(f"ALTER TABLE reinf_r2055 ADD COLUMN IF NOT EXISTS {col} {defn}")
        conn.commit()
        log("  [OK]  reinf_r2055 atualizada")

        # Passo 4: colunas reinf_r2010
        log("-- Passo 4: reinf_r2010 — novas colunas")
        for col, defn in [
            ("origem",            "VARCHAR(20) NOT NULL DEFAULT 'manual'"),
            ("cpf_cnpj_produtor", "VARCHAR(18)"),
            ("caepf",             "VARCHAR(20)"),
            ("xml_gerado",        "TEXT"),
            ("data_transmissao",  "TIMESTAMPTZ"),
            ("retificacao_id",    "INTEGER"),
            ("atualizado_em",     "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
        ]:
            cur.execute(f"ALTER TABLE reinf_r2010 ADD COLUMN IF NOT EXISTS {col} {defn}")
        conn.commit()
        log("  [OK]  reinf_r2010 atualizada")

        # Passo 5: colunas reinf_apuracao
        log("-- Passo 5: reinf_apuracao — novas colunas")
        for col, defn in [
            ("dctfweb_numero",   "VARCHAR(30)"),
            ("dctfweb_status",   "VARCHAR(20) DEFAULT 'nao_gerada'"),
            ("dctfweb_data",     "TIMESTAMPTZ"),
            ("total_cbs",        "NUMERIC(12,2) DEFAULT 0"),
            ("total_ibs",        "NUMERIC(12,2) DEFAULT 0"),
            ("aliquota_cbs",     "NUMERIC(6,4) DEFAULT 0"),
            ("aliquota_ibs",     "NUMERIC(6,4) DEFAULT 0"),
            ("regime_fiscal",    "VARCHAR(30) DEFAULT 'atual'"),
            ("observacoes_darf", "TEXT"),
        ]:
            cur.execute(f"ALTER TABLE reinf_apuracao ADD COLUMN IF NOT EXISTS {col} {defn}")
        conn.commit()
        log("  [OK]  reinf_apuracao atualizada")

        # Passo 6: tabela reinf_xml_lotes
        log("-- Passo 6: reinf_xml_lotes")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS reinf_xml_lotes (
                id               SERIAL PRIMARY KEY,
                imovel_id        INTEGER NOT NULL,
                competencia      VARCHAR(7) NOT NULL,
                tipo_evento      VARCHAR(10) NOT NULL,
                xml_conteudo     TEXT NOT NULL,
                hash_sha256      VARCHAR(64),
                qtd_eventos      INTEGER DEFAULT 0,
                valor_total      NUMERIC(14,2) DEFAULT 0,
                status           VARCHAR(20) NOT NULL DEFAULT 'gerado',
                protocolo        VARCHAR(60),
                data_geracao     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                data_transmissao TIMESTAMPTZ,
                mensagem_retorno TEXT,
                criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        conn.commit()
        log("  [OK]  reinf_xml_lotes criada")

        # Passo 7: tabela reinf_configuracao_avancada
        log("-- Passo 7: reinf_configuracao_avancada")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS reinf_configuracao_avancada (
                id                   SERIAL PRIMARY KEY,
                imovel_id            INTEGER NOT NULL UNIQUE,
                ambiente             VARCHAR(10) NOT NULL DEFAULT 'producao',
                versao_schema        VARCHAR(10) NOT NULL DEFAULT '2.01.01',
                cnpj_transmissor     VARCHAR(18),
                nome_transmissor     VARCHAR(120),
                aderiu_reforma       BOOLEAN DEFAULT FALSE,
                data_adesao_reforma  DATE,
                aliquota_cbs_padrao  NUMERIC(6,4) DEFAULT 0.0865,
                aliquota_ibs_padrao  NUMERIC(6,4) DEFAULT 0.0265,
                criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        conn.commit()
        log("  [OK]  reinf_configuracao_avancada criada")

        # Passo 8: índices
        log("-- Passo 8: índices")
        for idx, tbl, col in [
            ("idx_reinf_r2055_acerto_id",  "reinf_r2055",    "acerto_id"),
            ("idx_reinf_r2055_origem",     "reinf_r2055",    "origem"),
            ("idx_reinf_r2055_status",     "reinf_r2055",    "status"),
            ("idx_reinf_r2010_status",     "reinf_r2010",    "status"),
            ("idx_reinf_xml_lotes_imovel", "reinf_xml_lotes","imovel_id"),
            ("idx_reinf_xml_lotes_comp",   "reinf_xml_lotes","competencia"),
            ("idx_reinf_apuracao_status",  "reinf_apuracao", "status_darf"),
        ]:
            cur.execute(f"CREATE INDEX IF NOT EXISTS {idx} ON {tbl}({col})")
        conn.commit()
        log("  [OK]  índices criados")

        # Passo 9: triggers
        log("-- Passo 9: triggers atualizado_em")
        cur.execute("""
            CREATE OR REPLACE FUNCTION update_reinf_timestamp()
            RETURNS TRIGGER AS $$
            BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
            $$ LANGUAGE plpgsql
        """)
        for tbl in ["reinf_r2055", "reinf_r2010", "reinf_apuracao", "reinf_configuracao_avancada"]:
            cur.execute(f"DROP TRIGGER IF EXISTS trg_{tbl}_ts ON {tbl}")
            cur.execute(f"""
                CREATE TRIGGER trg_{tbl}_ts
                BEFORE UPDATE ON {tbl}
                FOR EACH ROW EXECUTE FUNCTION update_reinf_timestamp()
            """)
        conn.commit()
        log("  [OK]  triggers criados")

        # Passo 10: registrar migração
        log("-- Passo 10: registrar migração")
        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "EFD-Reinf: integração acertos→R-2055, XML lotes, LC 214/2024, triggers, índices"))
        conn.commit()
        log(f"  [OK]  '{MIGRATION_ID}' registrada em schema_migrations")

        print()
        print("✅  Migração 009 aplicada com sucesso!")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback executado: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
