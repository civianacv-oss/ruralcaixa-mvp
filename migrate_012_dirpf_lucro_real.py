"""
RuralCaixa — Migração 012: DIRPF Lucro Real Completo
Cria tabelas para apuração completa pelo Resultado Real (Lucro Real) da atividade rural.
Base legal:
  - Lei 9.250/1995 art. 18 — Livro Caixa, despesas dedutíveis
  - RIR/2018 arts. 58-71 — atividade rural PF
  - IN SRF 162/1998 — tabela de depreciação de bens
  - Lei 9.250/1995 art. 14 — investimentos rurais (dedução integral)
Idempotente via schema_migrations.
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "012_dirpf_lucro_real"

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
        # ── 1. Despesas rurais detalhadas ────────────────────────────────────
        log("-- Passo 1: dirpf_despesas_rurais")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS dirpf_despesas_rurais (
                id              SERIAL PRIMARY KEY,
                imovel_id       INTEGER NOT NULL,
                ano_base        INTEGER NOT NULL,
                -- Categoria (art. 18 Lei 9.250/1995)
                categoria       VARCHAR(50) NOT NULL,
                -- Categorias válidas:
                -- 'insumos'           — sementes, fertilizantes, defensivos, corretivos
                -- 'combustivel'       — diesel, gasolina, lubrificantes
                -- 'manutencao'        — manutenção de máquinas, equipamentos, benfeitorias
                -- 'mao_de_obra'       — salários, encargos, pró-labore (se PJ)
                -- 'arrendamento_pago' — arrendamento pago a terceiros
                -- 'funrural_pago'     — FUNRURAL pago (quando não retido na fonte)
                -- 'energia'           — energia elétrica, água, irrigação
                -- 'transporte'        — frete de produção, transporte de insumos
                -- 'seguro'            — seguro rural, seguro de máquinas
                -- 'assistencia_tecnica' — EMATER, consultoria agronômica
                -- 'depreciacao'       — depreciação de bens (calculada automaticamente)
                -- 'investimento_rural' — benfeitorias, açudes, cercas (dedução integral art. 14)
                -- 'outros'            — outras despesas dedutíveis
                descricao       TEXT NOT NULL,
                valor           NUMERIC(14,2) NOT NULL,
                data_despesa    DATE,
                comprovante     VARCHAR(100),  -- número NF, recibo, etc.
                observacoes     TEXT,
                -- Controle
                dedutivel_irpf  BOOLEAN NOT NULL DEFAULT TRUE,
                lancamento_id   INTEGER,       -- vínculo com livro_caixa_lancamentos
                criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dirpf_desp_imovel_ano ON dirpf_despesas_rurais(imovel_id, ano_base)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dirpf_desp_categoria ON dirpf_despesas_rurais(categoria)")
        conn.commit()
        log("  [OK]  dirpf_despesas_rurais")

        # ── 2. Bens sujeitos a depreciação ───────────────────────────────────
        log("-- Passo 2: dirpf_bens_depreciacao")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS dirpf_bens_depreciacao (
                id                  SERIAL PRIMARY KEY,
                imovel_id           INTEGER NOT NULL,
                descricao           VARCHAR(200) NOT NULL,
                -- Tipo do bem (IN SRF 162/1998)
                tipo_bem            VARCHAR(50) NOT NULL,
                -- Tipos válidos e vida útil:
                -- 'trator'              — 5 anos (20%/ano)
                -- 'colheitadeira'       — 5 anos (20%/ano)
                -- 'implemento_agricola' — 5 anos (20%/ano)
                -- 'caminhao'            — 5 anos (20%/ano)
                -- 'veiculo_leve'        — 5 anos (20%/ano)
                -- 'silo_armazem'        — 25 anos (4%/ano)
                -- 'edificacao_rural'    — 25 anos (4%/ano)
                -- 'cerca'               — 10 anos (10%/ano)
                -- 'sistema_irrigacao'   — 10 anos (10%/ano)
                -- 'computador'          — 5 anos (20%/ano)
                -- 'outros'              — vida útil definida pelo usuário
                data_aquisicao      DATE NOT NULL,
                valor_aquisicao     NUMERIC(14,2) NOT NULL,
                vida_util_anos      INTEGER NOT NULL,        -- definido pela tabela IN SRF 162/1998
                taxa_depreciacao_pct NUMERIC(6,4) NOT NULL,  -- 100 / vida_util_anos
                valor_residual      NUMERIC(14,2) NOT NULL DEFAULT 0,
                -- Controle
                ativo               BOOLEAN NOT NULL DEFAULT TRUE,
                data_baixa          DATE,
                valor_baixa         NUMERIC(14,2),
                motivo_baixa        VARCHAR(100),  -- 'alienacao', 'sucateamento', 'sinistro'
                criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dirpf_bens_imovel ON dirpf_bens_depreciacao(imovel_id)")
        conn.commit()
        log("  [OK]  dirpf_bens_depreciacao")

        # ── 3. Controle de prejuízo rural acumulado ──────────────────────────
        log("-- Passo 3: dirpf_prejuizo_rural")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS dirpf_prejuizo_rural (
                id                  SERIAL PRIMARY KEY,
                imovel_id           INTEGER NOT NULL,
                ano_base            INTEGER NOT NULL,       -- ano em que o prejuízo foi gerado
                valor_prejuizo      NUMERIC(14,2) NOT NULL, -- valor original do prejuízo
                valor_compensado    NUMERIC(14,2) NOT NULL DEFAULT 0,  -- já compensado em anos anteriores
                saldo_compensar     NUMERIC(14,2) GENERATED ALWAYS AS (valor_prejuizo - valor_compensado) STORED,
                -- Compensações realizadas (JSON array: [{ano, valor}])
                historico_compensacoes JSONB NOT NULL DEFAULT '[]',
                observacoes         TEXT,
                criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(imovel_id, ano_base)
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_dirpf_prej_imovel ON dirpf_prejuizo_rural(imovel_id)")
        conn.commit()
        log("  [OK]  dirpf_prejuizo_rural")

        # ── 4. Expandir dirpf_config com campos Lucro Real ───────────────────
        log("-- Passo 4: expandir dirpf_config")
        for col, defn in [
            ("irrf_retido_fonte",       "NUMERIC(12,2) NOT NULL DEFAULT 0"),
            ("irrf_carne_leao",         "NUMERIC(12,2) NOT NULL DEFAULT 0"),
            ("usa_depreciacao",         "BOOLEAN NOT NULL DEFAULT TRUE"),
            ("usa_investimentos_rurais","BOOLEAN NOT NULL DEFAULT TRUE"),
            ("compensar_prejuizo",      "BOOLEAN NOT NULL DEFAULT TRUE"),
        ]:
            cur.execute(f"""
                ALTER TABLE dirpf_config ADD COLUMN IF NOT EXISTS {col} {defn}
            """)
        conn.commit()
        log("  [OK]  dirpf_config expandida")

        # ── 5. View consolidada do Resultado Real ────────────────────────────
        log("-- Passo 5: view vw_dirpf_resultado_real")
        cur.execute("""
            CREATE OR REPLACE VIEW vw_dirpf_resultado_real AS
            SELECT
                d.imovel_id,
                d.ano_base,
                -- Receitas
                COALESCE(lc_rec.total, 0)                          AS receita_bruta_livro_caixa,
                COALESCE(acertos.bruto, 0)                         AS receita_acertos,
                -- Despesas por categoria
                COALESCE(desp.total_insumos, 0)                    AS desp_insumos,
                COALESCE(desp.total_combustivel, 0)                AS desp_combustivel,
                COALESCE(desp.total_manutencao, 0)                 AS desp_manutencao,
                COALESCE(desp.total_mao_de_obra, 0)                AS desp_mao_de_obra,
                COALESCE(desp.total_arrendamento, 0)               AS desp_arrendamento_pago,
                COALESCE(desp.total_funrural, 0)                   AS desp_funrural_pago,
                COALESCE(desp.total_energia, 0)                    AS desp_energia,
                COALESCE(desp.total_transporte, 0)                 AS desp_transporte,
                COALESCE(desp.total_seguro, 0)                     AS desp_seguro,
                COALESCE(desp.total_assistencia, 0)                AS desp_assistencia_tecnica,
                COALESCE(desp.total_investimento, 0)               AS desp_investimentos_rurais,
                COALESCE(desp.total_outros, 0)                     AS desp_outros,
                COALESCE(desp.total_geral, 0)                      AS total_despesas_reais,
                -- Depreciação (calculada separadamente)
                COALESCE(dep.total_depreciacao, 0)                 AS depreciacao_anual,
                -- Prejuízo a compensar
                COALESCE(prej.saldo_total, 0)                      AS prejuizo_acumulado_compensar,
                -- Resultado
                COALESCE(lc_rec.total, 0)
                  - COALESCE(desp.total_geral, 0)
                  - COALESCE(dep.total_depreciacao, 0)             AS resultado_antes_prejuizo
            FROM dirpf_config d
            LEFT JOIN (
                SELECT imovel_id, ano_base, SUM(valor) AS total
                FROM livro_caixa_lancamentos
                WHERE tipo = 'receita' AND deducao_irpf = TRUE
                GROUP BY imovel_id, ano_base
            ) lc_rec ON lc_rec.imovel_id = d.imovel_id AND lc_rec.ano_base = d.ano_base
            LEFT JOIN (
                SELECT imovel_id, EXTRACT(YEAR FROM COALESCE(data_pagamento, criado_em))::INT AS ano,
                       SUM(valor_bruto) AS bruto
                FROM contratos_acertos GROUP BY imovel_id, ano
            ) acertos ON acertos.imovel_id = d.imovel_id AND acertos.ano = d.ano_base
            LEFT JOIN (
                SELECT imovel_id, ano_base,
                    SUM(CASE WHEN categoria='insumos' THEN valor ELSE 0 END)             AS total_insumos,
                    SUM(CASE WHEN categoria='combustivel' THEN valor ELSE 0 END)         AS total_combustivel,
                    SUM(CASE WHEN categoria='manutencao' THEN valor ELSE 0 END)          AS total_manutencao,
                    SUM(CASE WHEN categoria='mao_de_obra' THEN valor ELSE 0 END)         AS total_mao_de_obra,
                    SUM(CASE WHEN categoria='arrendamento_pago' THEN valor ELSE 0 END)   AS total_arrendamento,
                    SUM(CASE WHEN categoria='funrural_pago' THEN valor ELSE 0 END)       AS total_funrural,
                    SUM(CASE WHEN categoria='energia' THEN valor ELSE 0 END)             AS total_energia,
                    SUM(CASE WHEN categoria='transporte' THEN valor ELSE 0 END)          AS total_transporte,
                    SUM(CASE WHEN categoria='seguro' THEN valor ELSE 0 END)              AS total_seguro,
                    SUM(CASE WHEN categoria='assistencia_tecnica' THEN valor ELSE 0 END) AS total_assistencia,
                    SUM(CASE WHEN categoria='investimento_rural' THEN valor ELSE 0 END)  AS total_investimento,
                    SUM(CASE WHEN categoria='outros' THEN valor ELSE 0 END)              AS total_outros,
                    SUM(valor) FILTER (WHERE dedutivel_irpf = TRUE)                      AS total_geral
                FROM dirpf_despesas_rurais GROUP BY imovel_id, ano_base
            ) desp ON desp.imovel_id = d.imovel_id AND desp.ano_base = d.ano_base
            LEFT JOIN (
                SELECT imovel_id,
                    SUM(
                        LEAST(
                            valor_aquisicao * taxa_depreciacao_pct / 100,
                            valor_aquisicao - valor_residual
                        )
                    ) AS total_depreciacao
                FROM dirpf_bens_depreciacao
                WHERE ativo = TRUE
                GROUP BY imovel_id
            ) dep ON dep.imovel_id = d.imovel_id
            LEFT JOIN (
                SELECT imovel_id, SUM(saldo_compensar) AS saldo_total
                FROM dirpf_prejuizo_rural
                WHERE saldo_compensar > 0
                GROUP BY imovel_id
            ) prej ON prej.imovel_id = d.imovel_id
        """)
        conn.commit()
        log("  [OK]  vw_dirpf_resultado_real")

        # ── 6. Registrar migração ────────────────────────────────────────────
        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "DIRPF Lucro Real: despesas detalhadas, depreciação, prejuízo acumulado"))
        conn.commit()

        print()
        print("✅  Migração 012 aplicada com sucesso!")
        print("    ✓ dirpf_despesas_rurais (13 categorias)")
        print("    ✓ dirpf_bens_depreciacao (IN SRF 162/1998)")
        print("    ✓ dirpf_prejuizo_rural (compensação sem limite de prazo)")
        print("    ✓ dirpf_config expandida (depreciação, investimentos, prejuízo)")
        print("    ✓ vw_dirpf_resultado_real (view consolidada)")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
