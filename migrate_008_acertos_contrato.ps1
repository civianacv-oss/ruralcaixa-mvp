# =============================================================
# RuralCaixa — Migração 008: Acertos de Contrato
# Script: migrate_008_acertos_contrato.ps1
#
# Aplica a tabela contratos_acertos no banco Railway via psql.
# Requer: psql (PostgreSQL client) instalado no PATH.
#
# Uso:
#   .\migrate_008_acertos_contrato.ps1
#
# Para sobrescrever a URL de conexão:
#   $env:DATABASE_URL = "postgresql://user:pass@host:port/db"
#   .\migrate_008_acertos_contrato.ps1
#
# Instalar psql (se não tiver):
#   winget install PostgreSQL.PostgreSQL
#   ou baixe em: https://www.postgresql.org/download/windows/
# =============================================================

$ErrorActionPreference = "Stop"

# ── Configuração ──────────────────────────────────────────────
$MIGRATION_ID   = "008_acertos_contrato"
$MIGRATION_DESC = "Tabela contratos_acertos — arrendamento pago em produto, cálculos fiscais DIRPF"

if ($env:DATABASE_URL) {
    $DB_URL = $env:DATABASE_URL
} else {
    $DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
}

# ── Helpers ───────────────────────────────────────────────────
function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "── Passo $n`: $msg" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "  ✅  $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "  ℹ️   $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
    Write-Host "  ❌  $msg" -ForegroundColor Red
}

function Invoke-SQL($sql) {
    $result = $sql | psql $DB_URL --no-password -t -q 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Erro ao executar SQL: $result"
    }
    return $result.Trim()
}

# ── Verificar psql ────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkGreen
Write-Host "  RuralCaixa — Migração $MIGRATION_ID" -ForegroundColor Green
Write-Host "  $MIGRATION_DESC" -ForegroundColor DarkGray
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor DarkGreen

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Fail "psql não encontrado no PATH."
    Write-Host ""
    Write-Host "  Instale o cliente PostgreSQL:" -ForegroundColor Yellow
    Write-Host "    winget install PostgreSQL.PostgreSQL" -ForegroundColor White
    Write-Host "  ou baixe em: https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "  🔌  Conectando a: $($DB_URL -replace ':([^:@]+)@', ':****@')" -ForegroundColor DarkGray

# ── Passo 1: Tabela schema_migrations ────────────────────────
Write-Step 1 "Tabela schema_migrations"
Invoke-SQL @"
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"@
Write-OK "schema_migrations verificada/criada"

# ── Passo 2: Verificar idempotência ──────────────────────────
Write-Step 2 "Verificar idempotência"
$already = Invoke-SQL "SELECT COUNT(*) FROM schema_migrations WHERE id = '$MIGRATION_ID';"
if ($already -eq "1") {
    Write-Info "Migração '$MIGRATION_ID' já foi aplicada. Nada a fazer."
    Write-Host ""
    Write-Host "  ℹ️   Banco já está atualizado." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}
Write-OK "Migração '$MIGRATION_ID' ainda não aplicada. Prosseguindo..."

# ── Passo 3: Tabela contratos_acertos ────────────────────────
Write-Step 3 "Tabela contratos_acertos"
Invoke-SQL @"
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
"@
Write-OK "Tabela contratos_acertos criada/verificada"

# ── Passo 4: Colunas opcionais ────────────────────────────────
Write-Step 4 "Colunas opcionais (ALTER TABLE IF NOT EXISTS)"
$optionalCols = @(
    "ADD COLUMN IF NOT EXISTS contrato_id           VARCHAR(64)",
    "ADD COLUMN IF NOT EXISTS arrendatario_telefone VARCHAR(30)",
    "ADD COLUMN IF NOT EXISTS descricao_outros_desc VARCHAR(200)",
    "ADD COLUMN IF NOT EXISTS rat_retido            NUMERIC(14,2) DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS inss_retido           NUMERIC(14,2) DEFAULT 0",
    "ADD COLUMN IF NOT EXISTS numero_nota_fiscal    VARCHAR(60)",
    "ADD COLUMN IF NOT EXISTS data_nota_fiscal      DATE",
    "ADD COLUMN IF NOT EXISTS comprovante_funrural  VARCHAR(200)",
    "ADD COLUMN IF NOT EXISTS data_pagamento        DATE",
    "ADD COLUMN IF NOT EXISTS lancamento_id         INTEGER",
    "ADD COLUMN IF NOT EXISTS observacoes           TEXT"
)
foreach ($col in $optionalCols) {
    try {
        Invoke-SQL "ALTER TABLE contratos_acertos $col;"
        $colName = ($col -split "IF NOT EXISTS ")[1] -split " " | Select-Object -First 1
        Write-OK "Coluna '$colName' verificada/adicionada"
    } catch {
        # Colunas GENERATED ALWAYS AS não podem ser adicionadas via ALTER — ignorar
        Write-Info "Coluna ignorada (pode ser GENERATED): $_"
    }
}

# ── Passo 5: Comentários ──────────────────────────────────────
Write-Step 5 "Comentários"
Invoke-SQL @"
COMMENT ON TABLE contratos_acertos IS
  'Acertos de contrato de arrendamento por safra. Suporta pagamento em produto com conversão para dinheiro. Calcula automaticamente: valor bruto, descontos, valor liquido e base tributavel IRPF (20%).';
COMMENT ON COLUMN contratos_acertos.pct_base_tributavel IS
  'Percentual de base tributavel para DIRPF. Default 20% conforme art. 59 RIR/2018 (Decreto 9.580/2018).';
COMMENT ON COLUMN contratos_acertos.funrural_retido IS
  'FUNRURAL retido pelo comprador/arrendatario. PF: 2,5%. PJ: 1,7%. Base: Lei 8.212/1991 art. 25.';
"@
Write-OK "Comentários aplicados"

# ── Passo 6: Índices ──────────────────────────────────────────
Write-Step 6 "Índices"
$indexes = @(
    @{ name="idx_acertos_imovel";   sql="CREATE INDEX IF NOT EXISTS idx_acertos_imovel   ON contratos_acertos (imovel_id);" },
    @{ name="idx_acertos_safra";    sql="CREATE INDEX IF NOT EXISTS idx_acertos_safra    ON contratos_acertos (safra);" },
    @{ name="idx_acertos_contrato"; sql="CREATE INDEX IF NOT EXISTS idx_acertos_contrato ON contratos_acertos (contrato_id);" },
    @{ name="idx_acertos_status";   sql="CREATE INDEX IF NOT EXISTS idx_acertos_status   ON contratos_acertos (status);" }
)
foreach ($idx in $indexes) {
    Invoke-SQL $idx.sql
    Write-OK "Índice $($idx.name) verificado/criado"
}

# ── Passo 7: Trigger ──────────────────────────────────────────
Write-Step 7 "Trigger atualizado_em"
Invoke-SQL @"
CREATE OR REPLACE FUNCTION update_acertos_timestamp()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acertos_timestamp ON contratos_acertos;
CREATE TRIGGER trg_acertos_timestamp
    BEFORE UPDATE ON contratos_acertos
    FOR EACH ROW EXECUTE FUNCTION update_acertos_timestamp();
"@
Write-OK "Trigger trg_acertos_timestamp criado/atualizado"

# ── Passo 8: Registrar migração ───────────────────────────────
Write-Step 8 "Registrar migração"
Invoke-SQL @"
INSERT INTO schema_migrations (id, description)
VALUES ('$MIGRATION_ID', '$MIGRATION_DESC')
ON CONFLICT DO NOTHING;
"@
Write-OK "Migração '$MIGRATION_ID' registrada em schema_migrations"

# ── Concluído ─────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkGreen
Write-Host "  🎉  Migração 008 aplicada com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "  Próximos passos:" -ForegroundColor White
Write-Host "  1. Acesse /contratos/acerto no frontend" -ForegroundColor White
Write-Host "  2. Registre o acerto da safra 25/26:" -ForegroundColor White
Write-Host "     6.212 sc x R`$ 113,50 = R`$ 705.062,00" -ForegroundColor White
Write-Host "     Desconto PROD -1,63% -> Liquido R`$ 693.569,49" -ForegroundColor White
Write-Host "     Base IRPF (20%) = R`$ 141.012,40" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor DarkGreen
Write-Host ""
