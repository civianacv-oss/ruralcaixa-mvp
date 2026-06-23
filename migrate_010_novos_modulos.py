"""
RuralCaixa — Migração 010: DCTFWeb, Livro Caixa, DIRPF
Cria as tabelas para os novos módulos de gestão fiscal.
Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_010_novos_modulos.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "010_novos_modulos"

def log(msg): print(f"  {msg}")

def run():
    print("=" * 60)
    print(f"  RuralCaixa — Migração {MIGRATION_ID}")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    # schema_migrations
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
        # ── DCTFWeb ──────────────────────────────────────────────────────────
        log("-- Criando tabelas DCTFWeb")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS dctfweb_declaracoes (
                id                      SERIAL PRIMARY KEY,
                imovel_id               INTEGER NOT NULL,
                competencia             VARCHAR(7) NOT NULL,
                tipo                    VARCHAR(20) NOT NULL DEFAULT 'original',
                status                  VARCHAR(20) NOT NULL DEFAULT 'rascunho',
                funrural_valor          NUMERIC(12,2) NOT NULL DEFAULT 0,
                senar_valor             NUMERIC(12,2) NOT NULL DEFAULT 0,
                inss_servicos_valor     NUMERIC(12,2) NOT NULL DEFAULT 0,
                total_devido            NUMERIC(12,2) NOT NULL DEFAULT 0,
                credito_origem_id       INTEGER,
                valor_credito_vinculado NUMERIC(12,2) DEFAULT 0,
                valor_pago              NUMERIC(12,2) DEFAULT 0,
                data_pagamento          DATE,
                numero_darf             VARCHAR(30),
                perdcomp_numero         VARCHAR(30),
                valor_compensado        NUMERIC(12,2) DEFAULT 0,
                saldo_a_pagar           NUMERIC(12,2) DEFAULT 0,
                numero_declaracao       VARCHAR(40),
                data_transmissao        DATE,
                observacoes             TEXT,
                criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  dctfweb_declaracoes")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS dctfweb_creditos (
                id                   SERIAL PRIMARY KEY,
                imovel_id            INTEGER NOT NULL,
                tipo                 VARCHAR(30) NOT NULL DEFAULT 'pagamento_indevido',
                competencia_origem   VARCHAR(7) NOT NULL,
                valor_original       NUMERIC(12,2) NOT NULL,
                descricao            TEXT NOT NULL,
                numero_perdcomp      VARCHAR(30),
                data_reconhecimento  DATE,
                criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  dctfweb_creditos")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS dctfweb_perdcomp (
                id                 SERIAL PRIMARY KEY,
                imovel_id          INTEGER NOT NULL,
                numero             VARCHAR(30) NOT NULL UNIQUE,
                tipo               VARCHAR(20) NOT NULL DEFAULT 'compensacao',
                competencia_debito VARCHAR(7) NOT NULL,
                credito_origem_id  INTEGER NOT NULL,
                declaracao_id      INTEGER,
                valor_solicitado   NUMERIC(12,2) NOT NULL,
                valor_deferido     NUMERIC(12,2) DEFAULT 0,
                status             VARCHAR(20) NOT NULL DEFAULT 'em_analise',
                data_protocolo     DATE,
                data_decisao       DATE,
                observacoes        TEXT,
                criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  dctfweb_perdcomp")
        conn.commit()

        # ── Livro Caixa ──────────────────────────────────────────────────────
        log("-- Criando tabelas Livro Caixa")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS livro_caixa_lancamentos (
                id               SERIAL PRIMARY KEY,
                imovel_id        INTEGER NOT NULL,
                ano_base         INTEGER NOT NULL,
                data_lancamento  DATE NOT NULL,
                tipo             VARCHAR(10) NOT NULL,
                categoria        VARCHAR(40) NOT NULL,
                descricao        TEXT NOT NULL,
                valor            NUMERIC(14,2) NOT NULL,
                origem           VARCHAR(30) NOT NULL DEFAULT 'manual',
                origem_id        INTEGER,
                deducao_irpf     BOOLEAN NOT NULL DEFAULT TRUE,
                natureza_fiscal  VARCHAR(30),
                documento        VARCHAR(60),
                observacoes      TEXT,
                criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  livro_caixa_lancamentos")
        conn.commit()

        # ── DIRPF ────────────────────────────────────────────────────────────
        log("-- Criando tabelas DIRPF")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS dirpf_config (
                id                           SERIAL PRIMARY KEY,
                imovel_id                    INTEGER NOT NULL,
                ano_base                     INTEGER NOT NULL,
                regime                       VARCHAR(20) NOT NULL DEFAULT 'presumido_20pct',
                dependentes                  INTEGER DEFAULT 0,
                deducao_inss                 NUMERIC(12,2) DEFAULT 0,
                deducao_previdencia_privada  NUMERIC(12,2) DEFAULT 0,
                deducao_educacao             NUMERIC(12,2) DEFAULT 0,
                deducao_saude                NUMERIC(12,2) DEFAULT 0,
                deducao_pensao_alimenticia   NUMERIC(12,2) DEFAULT 0,
                irrf_retido_fonte            NUMERIC(12,2) DEFAULT 0,
                "irrf_carnê_leão"            NUMERIC(12,2) DEFAULT 0,
                observacoes                  TEXT,
                criado_em                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(imovel_id, ano_base)
            )
        """)
        log("  [OK]  dirpf_config")
        conn.commit()

        # ── Índices ──────────────────────────────────────────────────────────
        log("-- Criando índices")
        for idx, tbl, col in [
            ("idx_dctfweb_decl_imovel",   "dctfweb_declaracoes",     "imovel_id"),
            ("idx_dctfweb_decl_comp",     "dctfweb_declaracoes",     "competencia"),
            ("idx_dctfweb_decl_status",   "dctfweb_declaracoes",     "status"),
            ("idx_dctfweb_cred_imovel",   "dctfweb_creditos",        "imovel_id"),
            ("idx_dctfweb_perd_imovel",   "dctfweb_perdcomp",        "imovel_id"),
            ("idx_dctfweb_perd_cred",     "dctfweb_perdcomp",        "credito_origem_id"),
            ("idx_lc_imovel_ano",         "livro_caixa_lancamentos", "imovel_id, ano_base"),
            ("idx_lc_tipo",               "livro_caixa_lancamentos", "tipo"),
            ("idx_lc_origem",             "livro_caixa_lancamentos", "origem, origem_id"),
            ("idx_dirpf_config_imovel",   "dirpf_config",            "imovel_id, ano_base"),
        ]:
            cur.execute(f"CREATE INDEX IF NOT EXISTS {idx} ON {tbl}({col})")
        conn.commit()
        log("  [OK]  índices criados")

        # ── Triggers ─────────────────────────────────────────────────────────
        log("-- Criando triggers")
        cur.execute("""
            CREATE OR REPLACE FUNCTION update_timestamp_generic()
            RETURNS TRIGGER AS $$
            BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
            $$ LANGUAGE plpgsql
        """)
        for tbl in ["dctfweb_declaracoes","dctfweb_creditos","dctfweb_perdcomp",
                    "livro_caixa_lancamentos","dirpf_config"]:
            cur.execute(f"DROP TRIGGER IF EXISTS trg_{tbl}_ts ON {tbl}")
            cur.execute(f"""
                CREATE TRIGGER trg_{tbl}_ts
                BEFORE UPDATE ON {tbl}
                FOR EACH ROW EXECUTE FUNCTION update_timestamp_generic()
            """)
        conn.commit()
        log("  [OK]  triggers criados")

        # ── Registrar ────────────────────────────────────────────────────────
        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "DCTFWeb (declaracoes, creditos, perdcomp), Livro Caixa, DIRPF config"))
        conn.commit()

        print()
        print("✅  Migração 010 aplicada com sucesso!")
        for t in ["dctfweb_declaracoes","dctfweb_creditos","dctfweb_perdcomp",
                  "livro_caixa_lancamentos","dirpf_config"]:
            print(f"    ✓ {t}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
