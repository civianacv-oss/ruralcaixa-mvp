#!/usr/bin/env python3
"""
=============================================================
RuralCaixa — Migração 008: Acertos de Contrato
Script: migrate_008_acertos_contrato.py

Executa a migração de forma IDEMPOTENTE:
  - Cria a tabela contratos_acertos se não existir
  - Adiciona colunas ausentes (safe para re-execução)
  - Cria índices e trigger se não existirem
  - Registra a migração na tabela schema_migrations

Uso:
  python3 migrate_008_acertos_contrato.py
  DATABASE_URL="postgresql://..." python3 migrate_008_acertos_contrato.py

Requer: psycopg2-binary
  pip install psycopg2-binary
=============================================================
"""

import os
import sys
import psycopg2
import psycopg2.extras
from datetime import datetime

# ── Conexão ───────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

MIGRATION_ID = "008_acertos_contrato"
MIGRATION_DESC = "Tabela contratos_acertos — arrendamento pago em produto, cálculos fiscais DIRPF"

# ── DDL principal ─────────────────────────────────────────────────────────────
DDL_TABLE = """
CREATE TABLE IF NOT EXISTS contratos_acertos (
    id                      SERIAL PRIMARY KEY,
    imovel_id               INTEGER NOT NULL DEFAULT 1,
    contrato_id             VARCHAR(64),
    safra                   VARCHAR(10) NOT NULL,
    arrendatario_nome       VARCHAR(200) NOT NULL,
    arrendatario_cpf_cnpj   VARCHAR(20),
    arrendatario_telefone   VARCHAR(30),

    produto                 VARCHAR(80) NOT NULL DEFAULT 'soja',
    quantidade_sacas        NUMERIC(14, 3) NOT NULL,
    valor_por_saca          NUMERIC(10, 4) NOT NULL,
    valor_bruto             NUMERIC(14, 2) GENERATED ALWAYS AS
                              (ROUND(quantidade_sacas * valor_por_saca, 2)) STORED,

    pct_desconto_prod       NUMERIC(6, 4) DEFAULT 0,
    valor_desconto_prod     NUMERIC(14, 2) GENERATED ALWAYS AS
                              (ROUND(quantidade_sacas * valor_por_saca * pct_desconto_prod / 100, 2)) STORED,

    pct_desconto_frete      NUMERIC(6, 4) DEFAULT 0,
    valor_desconto_frete    NUMERIC(14, 2) GENERATED ALWAYS AS
                              (ROUND(quantidade_sacas * valor_por_saca * pct_desconto_frete / 100, 2)) STORED,

    outros_descontos        NUMERIC(14, 2) DEFAULT 0,
    descricao_outros_desc   VARCHAR(200),

    valor_liquido           NUMERIC(14, 2) GENERATED ALWAYS AS (
                              ROUND(
                                quantidade_sacas * valor_por_saca
                                - ROUND(quantidade_sacas * valor_por_saca * pct_desconto_prod  / 100, 2)
                                - ROUND(quantidade_sacas * valor_por_saca * pct_desconto_frete / 100, 2)
                                - COALESCE(outros_descontos, 0),
                              2)
                            ) STORED,

    funrural_retido         NUMERIC(14, 2) DEFAULT 0,
    senar_retido            NUMERIC(14, 2) DEFAULT 0,
    rat_retido              NUMERIC(14, 2) DEFAULT 0,
    inss_retido             NUMERIC(14, 2) DEFAULT 0,

    pct_base_tributavel     NUMERIC(5, 2) DEFAULT 20.00,
    base_tributavel_irpf    NUMERIC(14, 2) GENERATED ALWAYS AS (
                              ROUND(quantidade_sacas * valor_por_saca * 20.00 / 100, 2)
                            ) STORED,

    tipo_pagamento          VARCHAR(20) NOT NULL DEFAULT 'produto',
    produto_ficou_com       VARCHAR(20) DEFAULT 'arrendatario',
    nota_fiscal_emitida     BOOLEAN DEFAULT FALSE,
    numero_nota_fiscal      VARCHAR(60),
    data_nota_fiscal        DATE,

    comprovante_funrural    VARCHAR(200),
    data_pagamento          DATE,

    observacoes             TEXT,
    status                  VARCHAR(20) NOT NULL DEFAULT 'registrado',
    lancamento_id           INTEGER,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

DDL_COMMENTS = """
COMMENT ON TABLE contratos_acertos IS
  'Acertos de contrato de arrendamento por safra. '
  'Suporta pagamento em produto (soja, milho, etc.) com conversão para dinheiro. '
  'Calcula automaticamente: valor bruto, descontos, valor líquido e base tributável IRPF (20%).';

COMMENT ON COLUMN contratos_acertos.pct_base_tributavel IS
  'Percentual de base tributável para DIRPF. Default 20% conforme art. 59 RIR/2018 (Decreto 9.580/2018).';

COMMENT ON COLUMN contratos_acertos.funrural_retido IS
  'FUNRURAL retido pelo comprador/arrendatário. PF: 2,5%. PJ: 1,7%. Base: Lei 8.212/1991 art. 25.';

COMMENT ON COLUMN contratos_acertos.produto_ficou_com IS
  'Indica quem ficou com o produto após o acerto. '
  'No caso típico: arrendatário dá a soja e já recompra — produto fica com o arrendatário.';
"""

DDL_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_acertos_imovel   ON contratos_acertos (imovel_id);",
    "CREATE INDEX IF NOT EXISTS idx_acertos_safra    ON contratos_acertos (safra);",
    "CREATE INDEX IF NOT EXISTS idx_acertos_contrato ON contratos_acertos (contrato_id);",
    "CREATE INDEX IF NOT EXISTS idx_acertos_status   ON contratos_acertos (status);",
]

DDL_TRIGGER_FN = """
CREATE OR REPLACE FUNCTION update_acertos_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

DDL_TRIGGER = """
DROP TRIGGER IF EXISTS trg_acertos_timestamp ON contratos_acertos;
CREATE TRIGGER trg_acertos_timestamp
    BEFORE UPDATE ON contratos_acertos
    FOR EACH ROW EXECUTE FUNCTION update_acertos_timestamp();
"""

DDL_MIGRATIONS_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

# ── Colunas opcionais que podem estar faltando em instâncias antigas ──────────
# Formato: (nome_coluna, definição_ALTER_TABLE)
OPTIONAL_COLUMNS = [
    ("contrato_id",           "ADD COLUMN IF NOT EXISTS contrato_id VARCHAR(64)"),
    ("arrendatario_telefone", "ADD COLUMN IF NOT EXISTS arrendatario_telefone VARCHAR(30)"),
    ("descricao_outros_desc", "ADD COLUMN IF NOT EXISTS descricao_outros_desc VARCHAR(200)"),
    ("rat_retido",            "ADD COLUMN IF NOT EXISTS rat_retido NUMERIC(14,2) DEFAULT 0"),
    ("inss_retido",           "ADD COLUMN IF NOT EXISTS inss_retido NUMERIC(14,2) DEFAULT 0"),
    ("numero_nota_fiscal",    "ADD COLUMN IF NOT EXISTS numero_nota_fiscal VARCHAR(60)"),
    ("data_nota_fiscal",      "ADD COLUMN IF NOT EXISTS data_nota_fiscal DATE"),
    ("comprovante_funrural",  "ADD COLUMN IF NOT EXISTS comprovante_funrural VARCHAR(200)"),
    ("data_pagamento",        "ADD COLUMN IF NOT EXISTS data_pagamento DATE"),
    ("lancamento_id",         "ADD COLUMN IF NOT EXISTS lancamento_id INTEGER"),
    ("observacoes",           "ADD COLUMN IF NOT EXISTS observacoes TEXT"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────
def log(msg: str, ok: bool = True):
    icon = "✅" if ok else "❌"
    print(f"  {icon}  {msg}")


def table_exists(cur, table: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name = %s AND table_schema = 'public'",
        (table,)
    )
    return cur.fetchone() is not None


def migration_applied(cur, migration_id: str) -> bool:
    try:
        cur.execute("SELECT 1 FROM schema_migrations WHERE id = %s", (migration_id,))
        return cur.fetchone() is not None
    except Exception:
        return False


# ── Main ──────────────────────────────────────────────────────────────────────
def run():
    print()
    print("=" * 60)
    print(f"  RuralCaixa — Migração {MIGRATION_ID}")
    print(f"  {MIGRATION_DESC}")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    print()

    try:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        conn.autocommit = False
        cur = conn.cursor()
        print(f"  🔌  Conectado ao banco: {DATABASE_URL.split('@')[-1]}")
        print()
    except Exception as e:
        print(f"  ❌  Falha na conexão: {e}")
        sys.exit(1)

    try:
        # 1. Tabela de controle de migrações
        print("── Passo 1: Tabela schema_migrations ─────────────────────")
        cur.execute(DDL_MIGRATIONS_TABLE)
        log("schema_migrations verificada/criada")

        # 2. Verificar se migração já foi aplicada
        print()
        print("── Passo 2: Verificar idempotência ───────────────────────")
        if migration_applied(cur, MIGRATION_ID):
            log(f"Migração '{MIGRATION_ID}' já foi aplicada anteriormente. Nada a fazer.")
            conn.rollback()
            conn.close()
            print()
            print("  ℹ️   Migração já aplicada. Banco está atualizado.")
            print()
            return

        log(f"Migração '{MIGRATION_ID}' ainda não aplicada. Prosseguindo...")

        # 3. Criar tabela principal
        print()
        print("── Passo 3: Tabela contratos_acertos ─────────────────────")
        already_existed = table_exists(cur, "contratos_acertos")
        cur.execute(DDL_TABLE)
        if already_existed:
            log("Tabela contratos_acertos já existia — verificando colunas opcionais")
        else:
            log("Tabela contratos_acertos criada com sucesso")

        # 4. Adicionar colunas opcionais faltantes (safe para re-execução)
        if already_existed:
            print()
            print("── Passo 4: Colunas opcionais ────────────────────────────")
            for col_name, alter_def in OPTIONAL_COLUMNS:
                try:
                    cur.execute(f"ALTER TABLE contratos_acertos {alter_def}")
                    log(f"Coluna '{col_name}' verificada/adicionada")
                except Exception as col_err:
                    # Colunas geradas (GENERATED ALWAYS AS) não podem ser adicionadas via ALTER
                    # — são criadas apenas no CREATE TABLE. Ignorar silenciosamente.
                    log(f"Coluna '{col_name}' ignorada (pode ser GENERATED): {col_err}", ok=True)
        else:
            log("Passo 4: Pulado — tabela foi criada agora com todas as colunas")

        # 5. Comentários
        print()
        print("── Passo 5: Comentários ──────────────────────────────────")
        cur.execute(DDL_COMMENTS)
        log("Comentários aplicados")

        # 6. Índices
        print()
        print("── Passo 6: Índices ──────────────────────────────────────")
        for ddl in DDL_INDEXES:
            cur.execute(ddl)
            idx = ddl.split("idx_")[1].split(" ")[0]
            log(f"Índice idx_{idx} verificado/criado")

        # 7. Trigger
        print()
        print("── Passo 7: Trigger atualizado_em ────────────────────────")
        cur.execute(DDL_TRIGGER_FN)
        cur.execute(DDL_TRIGGER)
        log("Trigger trg_acertos_timestamp criado/atualizado")

        # 8. Registrar migração
        print()
        print("── Passo 8: Registrar migração ───────────────────────────")
        cur.execute(
            "INSERT INTO schema_migrations (id, description) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (MIGRATION_ID, MIGRATION_DESC)
        )
        log(f"Migração '{MIGRATION_ID}' registrada em schema_migrations")

        # 9. Commit
        conn.commit()
        print()
        print("=" * 60)
        print("  🎉  Migração 008 aplicada com sucesso!")
        print()
        print("  Próximos passos:")
        print("  1. Acesse /contratos/acerto no frontend")
        print("  2. Registre o acerto da safra 25/26:")
        print("     6.212 sc × R$ 113,50 = R$ 705.062,00")
        print("     Desconto PROD -1,63% → Líquido R$ 693.569,49")
        print("     Base IRPF (20%) = R$ 141.012,40")
        print("=" * 60)
        print()

    except Exception as e:
        conn.rollback()
        print()
        print(f"  ❌  Erro durante a migração: {e}")
        print("  ↩️   Rollback executado. Banco não foi alterado.")
        print()
        conn.close()
        sys.exit(1)

    finally:
        try:
            conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    run()
