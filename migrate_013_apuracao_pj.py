"""
Migração 013 — Apuração PJ: Lucro Presumido, Lucro Real PJ
Tabelas: pj_config, pj_apuracao_trimestral, pj_lancamento_mensal, pj_credito_pis_cofins
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
MIGRATION_ID = "013_apuracao_pj"

def run():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("=" * 60)
    print(f"  RuralCaixa — Migração {MIGRATION_ID}")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    try:
        # Passo 0: schema_migrations
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                aplicada_em TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        print("  -- Passo 0: schema_migrations")
        print("    [OK]  schema_migrations verificada")

        # Passo 1: idempotência
        cur.execute("SELECT COUNT(*) AS n FROM schema_migrations WHERE id=%s", (MIGRATION_ID,))
        if cur.fetchone()["n"] > 0:
            print(f"\n  [OK]  Migração '{MIGRATION_ID}' já aplicada. Nada a fazer.")
            conn.rollback()
            return

        # Passo 2: pj_config
        print("  -- Passo 2: pj_config")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pj_config (
                id              SERIAL PRIMARY KEY,
                imovel_id       INT NOT NULL,
                ano_base        INT NOT NULL,
                regime          TEXT NOT NULL DEFAULT 'lucro_presumido',
                tipo_atividade  TEXT NOT NULL DEFAULT 'comercio',
                cnpj            TEXT,
                razao_social    TEXT,
                -- Lucro Presumido
                pct_presuncao_irpj  NUMERIC(5,2) DEFAULT 8.00,
                pct_presuncao_csll  NUMERIC(5,2) DEFAULT 12.00,
                -- Lucro Real
                usa_jcp         BOOLEAN DEFAULT FALSE,
                jcp_anual       NUMERIC(15,2) DEFAULT 0,
                -- Simples
                anexo_simples   TEXT DEFAULT 'II',
                folha_12m       NUMERIC(15,2) DEFAULT 0,
                -- Controle
                criado_em       TIMESTAMPTZ DEFAULT NOW(),
                atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(imovel_id, ano_base)
            )
        """)
        print("    [OK]  pj_config")

        # Passo 3: pj_lancamento_mensal
        print("  -- Passo 3: pj_lancamento_mensal")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pj_lancamento_mensal (
                id                   SERIAL PRIMARY KEY,
                imovel_id            INT NOT NULL,
                competencia          DATE NOT NULL,
                -- Receitas
                receita_bruta        NUMERIC(15,2) DEFAULT 0,
                receita_servicos     NUMERIC(15,2) DEFAULT 0,
                receita_financeira   NUMERIC(15,2) DEFAULT 0,
                outras_receitas      NUMERIC(15,2) DEFAULT 0,
                -- Despesas (Lucro Real)
                custo_mercadorias    NUMERIC(15,2) DEFAULT 0,
                despesas_operacionais NUMERIC(15,2) DEFAULT 0,
                folha_pagamento      NUMERIC(15,2) DEFAULT 0,
                prolabore            NUMERIC(15,2) DEFAULT 0,
                despesas_financeiras NUMERIC(15,2) DEFAULT 0,
                outras_despesas      NUMERIC(15,2) DEFAULT 0,
                -- PIS/COFINS
                creditos_pis_cofins  NUMERIC(15,2) DEFAULT 0,
                -- Metadados
                tipo_producao        TEXT DEFAULT 'comercio',
                observacoes          TEXT,
                criado_em            TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(imovel_id, competencia)
            )
        """)
        print("    [OK]  pj_lancamento_mensal")

        # Passo 4: pj_apuracao_trimestral
        print("  -- Passo 4: pj_apuracao_trimestral")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pj_apuracao_trimestral (
                id                   SERIAL PRIMARY KEY,
                imovel_id            INT NOT NULL,
                ano_base             INT NOT NULL,
                trimestre            INT NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
                regime               TEXT NOT NULL,
                -- Receitas do trimestre
                receita_bruta        NUMERIC(15,2) DEFAULT 0,
                -- Lucro Presumido
                base_irpj_presumida  NUMERIC(15,2) DEFAULT 0,
                base_csll_presumida  NUMERIC(15,2) DEFAULT 0,
                irpj                 NUMERIC(15,2) DEFAULT 0,
                irpj_adicional       NUMERIC(15,2) DEFAULT 0,
                csll                 NUMERIC(15,2) DEFAULT 0,
                -- Lucro Real
                lucro_real           NUMERIC(15,2) DEFAULT 0,
                irpj_real            NUMERIC(15,2) DEFAULT 0,
                irpj_adicional_real  NUMERIC(15,2) DEFAULT 0,
                csll_real            NUMERIC(15,2) DEFAULT 0,
                -- PIS/COFINS (mensal, mas agrupado aqui)
                pis_trimestre        NUMERIC(15,2) DEFAULT 0,
                cofins_trimestre     NUMERIC(15,2) DEFAULT 0,
                -- Total
                total_tributos       NUMERIC(15,2) DEFAULT 0,
                aliq_efetiva_pct     NUMERIC(6,2) DEFAULT 0,
                -- Status
                status               TEXT DEFAULT 'calculado',  -- calculado, pago, retificado
                data_vencimento      DATE,
                data_pagamento       DATE,
                darf_numero          TEXT,
                observacoes          TEXT,
                criado_em            TIMESTAMPTZ DEFAULT NOW(),
                atualizado_em        TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(imovel_id, ano_base, trimestre, regime)
            )
        """)
        print("    [OK]  pj_apuracao_trimestral")

        # Passo 5: pj_credito_pis_cofins
        print("  -- Passo 5: pj_credito_pis_cofins")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pj_credito_pis_cofins (
                id              SERIAL PRIMARY KEY,
                imovel_id       INT NOT NULL,
                competencia     DATE NOT NULL,
                tipo_credito    TEXT NOT NULL,  -- insumos, ativo_imobilizado, energia, frete, etc.
                descricao       TEXT,
                valor_base      NUMERIC(15,2) DEFAULT 0,
                credito_pis     NUMERIC(15,2) GENERATED ALWAYS AS (valor_base * 0.0165) STORED,
                credito_cofins  NUMERIC(15,2) GENERATED ALWAYS AS (valor_base * 0.076) STORED,
                credito_total   NUMERIC(15,2) GENERATED ALWAYS AS (valor_base * 0.0925) STORED,
                nf_numero       TEXT,
                criado_em       TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        print("    [OK]  pj_credito_pis_cofins")

        # Passo 6: índices
        print("  -- Passo 6: índices")
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_pj_config_imovel ON pj_config(imovel_id, ano_base)",
            "CREATE INDEX IF NOT EXISTS idx_pj_lanc_imovel ON pj_lancamento_mensal(imovel_id, competencia)",
            "CREATE INDEX IF NOT EXISTS idx_pj_apuracao_imovel ON pj_apuracao_trimestral(imovel_id, ano_base)",
            "CREATE INDEX IF NOT EXISTS idx_pj_credito_imovel ON pj_credito_pis_cofins(imovel_id, competencia)",
        ]:
            cur.execute(idx_sql)
        print("    [OK]  4 índices criados")

        # Passo 7: registrar migração
        cur.execute("INSERT INTO schema_migrations (id) VALUES (%s)", (MIGRATION_ID,))
        conn.commit()

        print(f"\n✅  Migração {MIGRATION_ID} aplicada com sucesso!")
        print("    ✓ pj_config (configuração por regime/ano)")
        print("    ✓ pj_lancamento_mensal (receitas e despesas mensais)")
        print("    ✓ pj_apuracao_trimestral (IRPJ+CSLL trimestral)")
        print("    ✓ pj_credito_pis_cofins (créditos PIS/COFINS não-cumulativo)")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run()
