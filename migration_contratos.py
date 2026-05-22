import psycopg2

conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn.autocommit = True
cur = conn.cursor()

sqls = [

# 1. ENUM TYPES
"""
DO $$ BEGIN
  CREATE TYPE tipo_contrato AS ENUM ('agricola','pecuaria','agroindustrial','extrativa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$
""",
"""
DO $$ BEGIN
  CREATE TYPE status_contrato AS ENUM ('rascunho','aguardando_assinaturas','ativo','encerrado','expirado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$
""",
"""
DO $$ BEGIN
  CREATE TYPE status_assinatura AS ENUM ('pendente','visualizado','assinado','recusado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$
""",
"""
DO $$ BEGIN
  CREATE TYPE frequencia_pagamento AS ENUM ('mensal','safra','anual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$
""",

# 2. PARCEIROS EXTERNOS
"""
CREATE TABLE IF NOT EXISTS parceiros_externos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            TEXT NOT NULL,
    tipo_documento  CHAR(4) NOT NULL CHECK (tipo_documento IN ('CPF','CNPJ')),
    documento       TEXT NOT NULL,
    telefone        TEXT,
    email           TEXT,
    observacoes     TEXT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tipo_documento, documento)
)
""",

# 3. CONTRATOS
"""
CREATE TABLE IF NOT EXISTS contratos (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fazenda_id              INTEGER NOT NULL,
    tipo                    tipo_contrato NOT NULL,
    status                  status_contrato NOT NULL DEFAULT 'rascunho',
    outorgante_socio_id     INTEGER,
    outorgante_externo_id   UUID REFERENCES parceiros_externos(id),
    outorgado_socio_id      INTEGER,
    outorgado_externo_id    UUID REFERENCES parceiros_externos(id),
    data_inicio             DATE NOT NULL,
    data_fim                DATE NOT NULL,
    percentual_outorgante   NUMERIC(5,2) NOT NULL,
    percentual_outorgado    NUMERIC(5,2) NOT NULL,
    frequencia_pagamento    frequencia_pagamento NOT NULL DEFAULT 'safra',
    area_parceria_hectares  NUMERIC(10,4),
    pdf_url                 TEXT,
    pdf_hash_sha256         CHAR(64),
    pdf_gerado_em           TIMESTAMPTZ,
    clausulas_adicionais    JSONB DEFAULT '{}',
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
""",

# 4. ASSINATURAS
"""
CREATE TABLE IF NOT EXISTS assinaturas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id         UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    papel               TEXT NOT NULL CHECK (papel IN ('outorgante','outorgado')),
    socio_id            INTEGER,
    parceiro_externo_id UUID REFERENCES parceiros_externos(id),
    status              status_assinatura NOT NULL DEFAULT 'pendente',
    token_otp           TEXT,
    token_expira_em     TIMESTAMPTZ,
    token_tentativas    SMALLINT DEFAULT 0,
    ip_assinatura       INET,
    user_agent          TEXT,
    geolocalizacao      JSONB,
    whatsapp_msg_id     TEXT,
    link_enviado_em     TIMESTAMPTZ,
    visualizado_em      TIMESTAMPTZ,
    assinado_em         TIMESTAMPTZ,
    recusado_em         TIMESTAMPTZ,
    motivo_recusa       TEXT,
    pdf_hash_no_momento CHAR(64),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
""",

# 5. AUDITORIA
"""
CREATE TABLE IF NOT EXISTS auditoria_contratos (
    id              BIGSERIAL PRIMARY KEY,
    contrato_id     UUID NOT NULL,
    assinatura_id   UUID,
    evento          TEXT NOT NULL,
    descricao       TEXT,
    ip              INET,
    metadata        JSONB DEFAULT '{}',
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
""",

# 6. ÍNDICES
"CREATE INDEX IF NOT EXISTS idx_contratos_fazenda    ON contratos(fazenda_id)",
"CREATE INDEX IF NOT EXISTS idx_contratos_status     ON contratos(status)",
"CREATE INDEX IF NOT EXISTS idx_assinaturas_contrato ON assinaturas(contrato_id)",
"CREATE INDEX IF NOT EXISTS idx_auditoria_contrato   ON auditoria_contratos(contrato_id)",

# 7. VIEW
"""
CREATE OR REPLACE VIEW vw_contratos_resumo AS
SELECT
    c.id, c.fazenda_id, c.tipo, c.status,
    c.data_inicio, c.data_fim,
    c.percentual_outorgante, c.percentual_outorgado,
    c.frequencia_pagamento, c.area_parceria_hectares,
    c.pdf_url, c.pdf_hash_sha256,
    c.outorgante_socio_id, c.outorgante_externo_id,
    c.outorgado_socio_id,  c.outorgado_externo_id,
    COALESCE(s_ote.nome,  pe_ote.nome) AS outorgante_nome,
    COALESCE(s_odo.nome,  pe_odo.nome) AS outorgado_nome,
    (SELECT COUNT(*) FROM assinaturas a WHERE a.contrato_id = c.id AND a.status = 'assinado') AS assinaturas_concluidas,
    (SELECT COUNT(*) FROM assinaturas a WHERE a.contrato_id = c.id)                          AS assinaturas_total,
    c.criado_em, c.atualizado_em
FROM contratos c
LEFT JOIN socios s_ote              ON s_ote.id  = c.outorgante_socio_id
LEFT JOIN parceiros_externos pe_ote ON pe_ote.id = c.outorgante_externo_id
LEFT JOIN socios s_odo              ON s_odo.id  = c.outorgado_socio_id
LEFT JOIN parceiros_externos pe_odo ON pe_odo.id = c.outorgado_externo_id
""",
]

for i, sql in enumerate(sqls, 1):
    try:
        cur.execute(sql)
        print(f"[OK] passo {i}")
    except Exception as e:
        print(f"[ERRO] passo {i}: {e}")

conn.close()
print("\nSchema de contratos aplicado!")
