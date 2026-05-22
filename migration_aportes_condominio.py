import psycopg2
import psycopg2.extras

conn = psycopg2.connect(
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
conn.autocommit = True
cur = conn.cursor()

sqls = [

# 1. Adicionar tipo condominio ao enum
"""
DO $$ BEGIN
  ALTER TYPE tipo_contrato ADD VALUE IF NOT EXISTS 'condominio';
EXCEPTION WHEN others THEN NULL; END $$
""",

# 2. Adicionar tipo sociedade ao enum
"""
DO $$ BEGIN
  ALTER TYPE tipo_contrato ADD VALUE IF NOT EXISTS 'sociedade';
EXCEPTION WHEN others THEN NULL; END $$
""",

# 3. Tabela de aportes do contrato
"""
CREATE TABLE IF NOT EXISTS contrato_aportes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    produtor_id     INTEGER REFERENCES produtores(id),
    parceiro_id     UUID REFERENCES parceiros_externos(id),
    tipo_bem        TEXT NOT NULL CHECK (tipo_bem IN (
                        'dinheiro','animais','terra','maquinario',
                        'insumos','trabalho','outros'
                    )),
    descricao       TEXT NOT NULL,
    quantidade      NUMERIC(12,3),
    valor_unitario  NUMERIC(15,2),
    valor_total     NUMERIC(15,2) NOT NULL,
    data_aporte     DATE NOT NULL DEFAULT CURRENT_DATE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_aporte_parte CHECK (
        (produtor_id IS NOT NULL)::INT +
        (parceiro_id IS NOT NULL)::INT = 1
    )
)
""",

# 4. Tabela de condôminos (para tipo condominio/sociedade)
"""
CREATE TABLE IF NOT EXISTS contrato_condominos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id         UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    produtor_id         INTEGER REFERENCES produtores(id),
    parceiro_id         UUID REFERENCES parceiros_externos(id),
    percentual_cota     NUMERIC(6,4),   -- calculado automaticamente dos aportes
    percentual_manual   NUMERIC(6,4),   -- override manual se necessário
    data_entrada        DATE NOT NULL DEFAULT CURRENT_DATE,
    data_saida          DATE,
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_condomino_parte CHECK (
        (produtor_id IS NOT NULL)::INT +
        (parceiro_id IS NOT NULL)::INT = 1
    )
)
""",

# 5. Tabela de enquadramento automático (log das decisões)
"""
CREATE TABLE IF NOT EXISTS contrato_enquadramento (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    tipo_sugerido   TEXT NOT NULL,
    tipo_confirmado TEXT,
    fatores         JSONB NOT NULL DEFAULT '{}',
    score           JSONB NOT NULL DEFAULT '{}',
    confirmado_em   TIMESTAMPTZ,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
""",

# 6. Índices
"CREATE INDEX IF NOT EXISTS idx_aportes_contrato    ON contrato_aportes(contrato_id)",
"CREATE INDEX IF NOT EXISTS idx_aportes_produtor    ON contrato_aportes(produtor_id)",
"CREATE INDEX IF NOT EXISTS idx_condominos_contrato ON contrato_condominos(contrato_id)",

# 7. View estendida de aportes por contrato
"""
CREATE OR REPLACE VIEW vw_contrato_aportes_resumo AS
SELECT
    ca.contrato_id,
    COALESCE(p.nome, pe.nome)       AS participante_nome,
    COALESCE(p.id::TEXT, pe.id::TEXT) AS participante_id,
    ca.tipo_bem,
    ca.descricao,
    ca.quantidade,
    ca.valor_unitario,
    ca.valor_total,
    ca.data_aporte,
    SUM(ca.valor_total) OVER (PARTITION BY ca.contrato_id) AS total_contrato,
    ROUND(
        ca.valor_total * 100.0 /
        NULLIF(SUM(ca.valor_total) OVER (PARTITION BY ca.contrato_id), 0),
        4
    ) AS percentual_calculado
FROM contrato_aportes ca
LEFT JOIN produtores p          ON p.id  = ca.produtor_id
LEFT JOIN parceiros_externos pe ON pe.id = ca.parceiro_id
""",

# 8. View de condôminos com percentuais resolvidos
"""
CREATE OR REPLACE VIEW vw_contrato_condominos AS
SELECT
    cc.contrato_id,
    cc.id AS condomino_id,
    COALESCE(p.nome, pe.nome) AS nome,
    COALESCE(p.cpf, pe.documento) AS documento,
    COALESCE(cc.percentual_manual, cc.percentual_cota) AS percentual_efetivo,
    cc.percentual_cota,
    cc.percentual_manual,
    cc.data_entrada,
    cc.data_saida,
    cc.ativo
FROM contrato_condominos cc
LEFT JOIN produtores p          ON p.id  = cc.produtor_id
LEFT JOIN parceiros_externos pe ON pe.id = cc.parceiro_id
""",

]

for i, sql in enumerate(sqls, 1):
    try:
        cur.execute(sql)
        print(f"[OK] passo {i}")
    except Exception as e:
        print(f"[ERRO] passo {i}: {e}")

conn.close()
print("\nMigration de aportes e condôminos concluída!")
