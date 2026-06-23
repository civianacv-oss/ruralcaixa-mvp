"""
RuralCaixa — Migração EFD-Reinf Completa (006 + 009)
Cria todas as tabelas EFD-Reinf do zero + melhorias v2.
Idempotente: verifica schema_migrations antes de executar.
Uso: DATABASE_URL="postgresql://..." python3 migrate_efdreinf_completo.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

def log(msg): print(f"  {msg}")

def run():
    print("=" * 60)
    print("  RuralCaixa — Migração EFD-Reinf Completa (006 + 009)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    # ── Passo 0: schema_migrations ──────────────────────────────────────────
    log("-- Passo 0: schema_migrations")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id          VARCHAR(100) PRIMARY KEY,
            description TEXT,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    conn.commit()
    log("  [OK]")

    # ── Verificar idempotência ───────────────────────────────────────────────
    cur.execute("SELECT id FROM schema_migrations WHERE id IN ('006_efdreinf_schema','009_efdreinf_melhorias')")
    ja_aplicadas = {r["id"] for r in cur.fetchall()}

    if "006_efdreinf_schema" in ja_aplicadas and "009_efdreinf_melhorias" in ja_aplicadas:
        log("  [OK]  Ambas as migrações já aplicadas. Nada a fazer.")
        conn.close()
        return

    try:
        # ── Passo 1: Tabelas base (006) ──────────────────────────────────────
        if "006_efdreinf_schema" not in ja_aplicadas:
            log("-- Passo 1: Criar tabelas base EFD-Reinf (006)")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS reinf_configuracao (
                    id                  SERIAL PRIMARY KEY,
                    imovel_id           INTEGER NOT NULL,
                    cpf_cnpj            VARCHAR(18) NOT NULL,
                    caepf               VARCHAR(20),
                    tipo_contribuinte   VARCHAR(30) NOT NULL DEFAULT 'produtor_rural_pf',
                    regime_tributario   VARCHAR(30) NOT NULL DEFAULT 'lucro_presumido',
                    tem_empregados      BOOLEAN NOT NULL DEFAULT FALSE,
                    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
                    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            log("  [OK]  reinf_configuracao")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS reinf_r2055 (
                    id                       SERIAL PRIMARY KEY,
                    imovel_id                INTEGER NOT NULL,
                    competencia              VARCHAR(7) NOT NULL,
                    cnpj_adquirente          VARCHAR(18) NOT NULL,
                    nome_adquirente          VARCHAR(120),
                    data_nota                DATE NOT NULL,
                    numero_nota              VARCHAR(30),
                    tipo_produto             VARCHAR(60) NOT NULL,
                    valor_bruto              NUMERIC(14,2) NOT NULL,
                    aliquota_funrural        NUMERIC(6,4) NOT NULL DEFAULT 0.0187,
                    aliquota_senar           NUMERIC(6,4) NOT NULL DEFAULT 0.0011,
                    valor_funrural           NUMERIC(12,2) NOT NULL DEFAULT 0,
                    valor_senar              NUMERIC(12,2) NOT NULL DEFAULT 0,
                    valor_total_retido       NUMERIC(12,2) NOT NULL DEFAULT 0,
                    retencao_pelo_adquirente BOOLEAN NOT NULL DEFAULT TRUE,
                    status                   VARCHAR(20) NOT NULL DEFAULT 'pendente',
                    protocolo_transmissao    VARCHAR(60),
                    observacoes              TEXT,
                    -- campos v2 (009)
                    acerto_id                INTEGER,
                    origem                   VARCHAR(20) NOT NULL DEFAULT 'manual',
                    cpf_cnpj_produtor        VARCHAR(18),
                    caepf                    VARCHAR(20),
                    xml_gerado               TEXT,
                    data_transmissao         TIMESTAMPTZ,
                    retificacao_id           INTEGER,
                    atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    aliquota_cbs             NUMERIC(6,4) DEFAULT 0,
                    valor_cbs                NUMERIC(12,2) DEFAULT 0,
                    aliquota_ibs             NUMERIC(6,4) DEFAULT 0,
                    valor_ibs                NUMERIC(12,2) DEFAULT 0,
                    regime_fiscal            VARCHAR(30) DEFAULT 'atual',
                    criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            log("  [OK]  reinf_r2055")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS reinf_r2010 (
                    id                    SERIAL PRIMARY KEY,
                    imovel_id             INTEGER NOT NULL,
                    competencia           VARCHAR(7) NOT NULL,
                    cnpj_prestador        VARCHAR(18) NOT NULL,
                    nome_prestador        VARCHAR(120),
                    data_nota             DATE NOT NULL,
                    numero_nota           VARCHAR(30),
                    tipo_servico          VARCHAR(80) NOT NULL,
                    valor_bruto           NUMERIC(14,2) NOT NULL,
                    aliquota_retencao     NUMERIC(6,4) NOT NULL DEFAULT 0.11,
                    valor_retido          NUMERIC(12,2) NOT NULL DEFAULT 0,
                    cessao_mao_obra       BOOLEAN NOT NULL DEFAULT TRUE,
                    status                VARCHAR(20) NOT NULL DEFAULT 'pendente',
                    protocolo_transmissao VARCHAR(60),
                    observacoes           TEXT,
                    -- campos v2 (009)
                    origem                VARCHAR(20) NOT NULL DEFAULT 'manual',
                    cpf_cnpj_produtor     VARCHAR(18),
                    caepf                 VARCHAR(20),
                    xml_gerado            TEXT,
                    data_transmissao      TIMESTAMPTZ,
                    retificacao_id        INTEGER,
                    atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            log("  [OK]  reinf_r2010")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS reinf_apuracao (
                    id                   SERIAL PRIMARY KEY,
                    imovel_id            INTEGER NOT NULL,
                    competencia          VARCHAR(7) NOT NULL,
                    total_receita_bruta  NUMERIC(14,2) NOT NULL DEFAULT 0,
                    total_funrural       NUMERIC(12,2) NOT NULL DEFAULT 0,
                    total_senar          NUMERIC(12,2) NOT NULL DEFAULT 0,
                    total_inss_servicos  NUMERIC(12,2) NOT NULL DEFAULT 0,
                    total_a_recolher     NUMERIC(12,2) NOT NULL DEFAULT 0,
                    data_vencimento      DATE,
                    codigo_receita_darf  VARCHAR(10) NOT NULL DEFAULT '2985',
                    status_darf          VARCHAR(20) NOT NULL DEFAULT 'em_aberto',
                    data_pagamento       DATE,
                    valor_pago           NUMERIC(12,2),
                    nosso_numero         VARCHAR(30),
                    codigo_barras        VARCHAR(60),
                    -- campos v2 (009)
                    dctfweb_numero       VARCHAR(30),
                    dctfweb_status       VARCHAR(20) DEFAULT 'nao_gerada',
                    dctfweb_data         TIMESTAMPTZ,
                    total_cbs            NUMERIC(12,2) DEFAULT 0,
                    total_ibs            NUMERIC(12,2) DEFAULT 0,
                    aliquota_cbs         NUMERIC(6,4) DEFAULT 0,
                    aliquota_ibs         NUMERIC(6,4) DEFAULT 0,
                    regime_fiscal        VARCHAR(30) DEFAULT 'atual',
                    observacoes_darf     TEXT,
                    criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(imovel_id, competencia)
                )
            """)
            log("  [OK]  reinf_apuracao")

            conn.commit()
            cur.execute("""
                INSERT INTO schema_migrations (id, description)
                VALUES ('006_efdreinf_schema', 'EFD-Reinf: tabelas base reinf_configuracao, reinf_r2055, reinf_r2010, reinf_apuracao')
                ON CONFLICT DO NOTHING
            """)
            conn.commit()
            log("  [OK]  006_efdreinf_schema registrada")
        else:
            log("-- Passo 1: 006_efdreinf_schema já aplicada — adicionando colunas faltantes")
            # Adicionar colunas v2 se não existirem
            for tbl, col, defn in [
                ("reinf_r2055", "acerto_id",         "INTEGER"),
                ("reinf_r2055", "origem",             "VARCHAR(20) NOT NULL DEFAULT 'manual'"),
                ("reinf_r2055", "cpf_cnpj_produtor",  "VARCHAR(18)"),
                ("reinf_r2055", "caepf",              "VARCHAR(20)"),
                ("reinf_r2055", "xml_gerado",         "TEXT"),
                ("reinf_r2055", "data_transmissao",   "TIMESTAMPTZ"),
                ("reinf_r2055", "retificacao_id",     "INTEGER"),
                ("reinf_r2055", "atualizado_em",      "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
                ("reinf_r2055", "aliquota_cbs",       "NUMERIC(6,4) DEFAULT 0"),
                ("reinf_r2055", "valor_cbs",          "NUMERIC(12,2) DEFAULT 0"),
                ("reinf_r2055", "aliquota_ibs",       "NUMERIC(6,4) DEFAULT 0"),
                ("reinf_r2055", "valor_ibs",          "NUMERIC(12,2) DEFAULT 0"),
                ("reinf_r2055", "regime_fiscal",      "VARCHAR(30) DEFAULT 'atual'"),
                ("reinf_r2010", "origem",             "VARCHAR(20) NOT NULL DEFAULT 'manual'"),
                ("reinf_r2010", "cpf_cnpj_produtor",  "VARCHAR(18)"),
                ("reinf_r2010", "caepf",              "VARCHAR(20)"),
                ("reinf_r2010", "xml_gerado",         "TEXT"),
                ("reinf_r2010", "data_transmissao",   "TIMESTAMPTZ"),
                ("reinf_r2010", "retificacao_id",     "INTEGER"),
                ("reinf_r2010", "atualizado_em",      "TIMESTAMPTZ NOT NULL DEFAULT NOW()"),
                ("reinf_apuracao", "dctfweb_numero",  "VARCHAR(30)"),
                ("reinf_apuracao", "dctfweb_status",  "VARCHAR(20) DEFAULT 'nao_gerada'"),
                ("reinf_apuracao", "dctfweb_data",    "TIMESTAMPTZ"),
                ("reinf_apuracao", "total_cbs",       "NUMERIC(12,2) DEFAULT 0"),
                ("reinf_apuracao", "total_ibs",       "NUMERIC(12,2) DEFAULT 0"),
                ("reinf_apuracao", "aliquota_cbs",    "NUMERIC(6,4) DEFAULT 0"),
                ("reinf_apuracao", "aliquota_ibs",    "NUMERIC(6,4) DEFAULT 0"),
                ("reinf_apuracao", "regime_fiscal",   "VARCHAR(30) DEFAULT 'atual'"),
                ("reinf_apuracao", "observacoes_darf","TEXT"),
            ]:
                cur.execute(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col} {defn}")
            conn.commit()
            log("  [OK]  colunas v2 adicionadas")

        # ── Passo 2: Tabelas novas (009) ─────────────────────────────────────
        if "009_efdreinf_melhorias" not in ja_aplicadas:
            log("-- Passo 2: Tabelas novas (009)")

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
            log("  [OK]  reinf_xml_lotes")

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
            log("  [OK]  reinf_configuracao_avancada")
            conn.commit()

        # ── Passo 3: Índices ─────────────────────────────────────────────────
        log("-- Passo 3: índices")
        for idx, tbl, col in [
            ("idx_reinf_r2055_imovel",     "reinf_r2055",    "imovel_id"),
            ("idx_reinf_r2055_competencia","reinf_r2055",    "competencia"),
            ("idx_reinf_r2055_acerto_id",  "reinf_r2055",    "acerto_id"),
            ("idx_reinf_r2055_origem",     "reinf_r2055",    "origem"),
            ("idx_reinf_r2055_status",     "reinf_r2055",    "status"),
            ("idx_reinf_r2010_imovel",     "reinf_r2010",    "imovel_id"),
            ("idx_reinf_r2010_competencia","reinf_r2010",    "competencia"),
            ("idx_reinf_r2010_status",     "reinf_r2010",    "status"),
            ("idx_reinf_apuracao_imovel",  "reinf_apuracao", "imovel_id"),
            ("idx_reinf_apuracao_status",  "reinf_apuracao", "status_darf"),
            ("idx_reinf_xml_lotes_imovel", "reinf_xml_lotes","imovel_id"),
            ("idx_reinf_xml_lotes_comp",   "reinf_xml_lotes","competencia"),
        ]:
            cur.execute(f"CREATE INDEX IF NOT EXISTS {idx} ON {tbl}({col})")
        conn.commit()
        log("  [OK]  índices criados")

        # ── Passo 4: Triggers ────────────────────────────────────────────────
        log("-- Passo 4: triggers atualizado_em")
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

        # ── Passo 5: Registrar migrações ─────────────────────────────────────
        log("-- Passo 5: registrar migrações")
        for mid, desc in [
            ("006_efdreinf_schema",   "EFD-Reinf: tabelas base"),
            ("009_efdreinf_melhorias","EFD-Reinf: integração acertos→R-2055, XML lotes, LC 214/2024"),
        ]:
            cur.execute(
                "INSERT INTO schema_migrations (id, description) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (mid, desc)
            )
        conn.commit()
        log("  [OK]  migrações registradas")

        print()
        print("✅  Migração EFD-Reinf completa aplicada com sucesso!")
        print()
        print("  Tabelas criadas/atualizadas:")
        for t in ["reinf_configuracao", "reinf_r2055", "reinf_r2010",
                  "reinf_apuracao", "reinf_xml_lotes", "reinf_configuracao_avancada"]:
            print(f"    ✓ {t}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback executado: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
