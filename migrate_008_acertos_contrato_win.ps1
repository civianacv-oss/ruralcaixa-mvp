# =============================================================
# RuralCaixa — Migração 008: Acertos de Contrato
# Script: migrate_008_acertos_contrato_win.ps1
#
# Não requer psql. Usa Python (pip install psycopg2-binary).
#
# Uso:
#   .\migrate_008_acertos_contrato_win.ps1
# =============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkGreen
Write-Host "  RuralCaixa — Migração 008: Acertos de Contrato" -ForegroundColor Green
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor DarkGreen
Write-Host ""

# ── 1. Verificar Python ───────────────────────────────────────
$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $python = $cmd
        break
    }
}

if (-not $python) {
    Write-Host "  ❌  Python não encontrado." -ForegroundColor Red
    Write-Host "  Instale em: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

$pyVer = & $python --version 2>&1
Write-Host "  ✅  Python encontrado: $pyVer" -ForegroundColor Green

# ── 2. Instalar psycopg2-binary se necessário ─────────────────
Write-Host ""
Write-Host "── Verificando psycopg2-binary..." -ForegroundColor Cyan
$check = & $python -c "import psycopg2; print('ok')" 2>&1
if ($check -ne "ok") {
    Write-Host "  ⏳  Instalando psycopg2-binary..." -ForegroundColor Yellow
    & $python -m pip install psycopg2-binary --quiet
    Write-Host "  ✅  psycopg2-binary instalado" -ForegroundColor Green
} else {
    Write-Host "  ✅  psycopg2-binary já instalado" -ForegroundColor Green
}

# ── 3. Escrever script Python em arquivo temporário ───────────
$tmpScript = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.py'

@'
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID   = "008_acertos_contrato"
MIGRATION_DESC = "Tabela contratos_acertos — arrendamento pago em produto, calculos fiscais DIRPF"

def log(msg, ok=True):
    icon = "OK" if ok else "ERRO"
    print(f"  [{icon}]  {msg}")

def run():
    print(f"\n  Conectando a: {DB_URL.split('@')[-1]}")
    try:
        conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        conn.autocommit = False
        cur = conn.cursor()
    except Exception as e:
        print(f"  [ERRO]  Falha na conexao: {e}")
        sys.exit(1)

    try:
        # schema_migrations
        print("\n-- Passo 1: schema_migrations")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id VARCHAR(100) PRIMARY KEY,
                description TEXT,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        log("schema_migrations verificada/criada")

        # idempotencia
        print("\n-- Passo 2: Verificar idempotencia")
        cur.execute("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = %s", (MIGRATION_ID,))
        if cur.fetchone()["n"] > 0:
            log(f"Migracao '{MIGRATION_ID}' ja aplicada. Nada a fazer.")
            conn.rollback(); conn.close(); return

        log(f"Migracao '{MIGRATION_ID}' nao aplicada. Prosseguindo...")

        # tabela principal
        print("\n-- Passo 3: Tabela contratos_acertos")
        cur.execute("""
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
        """)
        log("Tabela contratos_acertos criada/verificada")

        # colunas opcionais
        print("\n-- Passo 4: Colunas opcionais")
        cols = [
            ("contrato_id",           "ADD COLUMN IF NOT EXISTS contrato_id           VARCHAR(64)"),
            ("arrendatario_telefone", "ADD COLUMN IF NOT EXISTS arrendatario_telefone VARCHAR(30)"),
            ("descricao_outros_desc", "ADD COLUMN IF NOT EXISTS descricao_outros_desc VARCHAR(200)"),
            ("rat_retido",            "ADD COLUMN IF NOT EXISTS rat_retido            NUMERIC(14,2) DEFAULT 0"),
            ("inss_retido",           "ADD COLUMN IF NOT EXISTS inss_retido           NUMERIC(14,2) DEFAULT 0"),
            ("numero_nota_fiscal",    "ADD COLUMN IF NOT EXISTS numero_nota_fiscal    VARCHAR(60)"),
            ("data_nota_fiscal",      "ADD COLUMN IF NOT EXISTS data_nota_fiscal      DATE"),
            ("comprovante_funrural",  "ADD COLUMN IF NOT EXISTS comprovante_funrural  VARCHAR(200)"),
            ("data_pagamento",        "ADD COLUMN IF NOT EXISTS data_pagamento        DATE"),
            ("lancamento_id",         "ADD COLUMN IF NOT EXISTS lancamento_id         INTEGER"),
            ("observacoes",           "ADD COLUMN IF NOT EXISTS observacoes           TEXT"),
        ]
        for name, ddl in cols:
            try:
                cur.execute(f"ALTER TABLE contratos_acertos {ddl}")
                log(f"Coluna '{name}' verificada/adicionada")
            except Exception:
                log(f"Coluna '{name}' ignorada (provavelmente GENERATED)", ok=True)

        # indices
        print("\n-- Passo 5: Indices")
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_acertos_imovel   ON contratos_acertos (imovel_id);",
            "CREATE INDEX IF NOT EXISTS idx_acertos_safra    ON contratos_acertos (safra);",
            "CREATE INDEX IF NOT EXISTS idx_acertos_contrato ON contratos_acertos (contrato_id);",
            "CREATE INDEX IF NOT EXISTS idx_acertos_status   ON contratos_acertos (status);",
        ]:
            cur.execute(idx_sql)
            idx_name = idx_sql.split("idx_")[1].split(" ")[0]
            log(f"Indice idx_{idx_name} verificado/criado")

        # trigger
        print("\n-- Passo 6: Trigger atualizado_em")
        cur.execute("""
            CREATE OR REPLACE FUNCTION update_acertos_timestamp()
            RETURNS TRIGGER AS $$
            BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
            $$ LANGUAGE plpgsql;
        """)
        cur.execute("DROP TRIGGER IF EXISTS trg_acertos_timestamp ON contratos_acertos;")
        cur.execute("""
            CREATE TRIGGER trg_acertos_timestamp
                BEFORE UPDATE ON contratos_acertos
                FOR EACH ROW EXECUTE FUNCTION update_acertos_timestamp();
        """)
        log("Trigger trg_acertos_timestamp criado/atualizado")

        # registrar
        print("\n-- Passo 7: Registrar migracao")
        cur.execute(
            "INSERT INTO schema_migrations (id, description) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (MIGRATION_ID, MIGRATION_DESC)
        )
        log(f"Migracao '{MIGRATION_ID}' registrada")

        conn.commit()
        print("\n============================================================")
        print("  SUCESSO! Migracao 008 aplicada.")
        print("\n  Proximos passos:")
        print("  1. Acesse /contratos/acerto no frontend")
        print("  2. Registre o acerto da safra 25/26:")
        print("     6.212 sc x R$ 113,50 = R$ 705.062,00")
        print("     Desconto PROD -1,63% -> Liquido R$ 693.569,49")
        print("     Base IRPF (20%) = R$ 141.012,40")
        print("============================================================\n")

    except Exception as e:
        conn.rollback()
        print(f"\n  [ERRO]  {e}")
        print("  Rollback executado. Banco nao foi alterado.\n")
        conn.close()
        sys.exit(1)
    finally:
        try: conn.close()
        except: pass

run()
'@ | Set-Content -Path $tmpScript -Encoding UTF8

# ── 4. Executar ───────────────────────────────────────────────
Write-Host ""
Write-Host "── Executando migração..." -ForegroundColor Cyan
& $python $tmpScript
$exitCode = $LASTEXITCODE

# ── 5. Limpar arquivo temporário ─────────────────────────────
Remove-Item $tmpScript -ErrorAction SilentlyContinue

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "  ❌  Migração falhou. Verifique o erro acima." -ForegroundColor Red
    exit 1
}
