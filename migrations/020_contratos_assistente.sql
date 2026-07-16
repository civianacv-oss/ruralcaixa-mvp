-- migrations/020_contratos_assistente.sql
-- Assistente Inteligente de Contratos Rurais — tabelas de apoio
-- (tipos de contrato, cláusulas modelo, alertas legais, histórico de recomendações)

CREATE TABLE IF NOT EXISTS tipos_contrato_rural (
    id            SERIAL PRIMARY KEY,
    slug          VARCHAR(50) UNIQUE NOT NULL,   -- mesmo valor aceito por contratos_api.py (_TIPO_MAP)
    nome          VARCHAR(100) NOT NULL,
    emoji         VARCHAR(10),
    descricao     TEXT,
    quando_usar   TEXT,
    ativo         BOOLEAN DEFAULT TRUE,
    ordem         INT DEFAULT 0,
    criado_em     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clausulas_contrato (
    id                SERIAL PRIMARY KEY,
    tipo_contrato_id  INT NOT NULL REFERENCES tipos_contrato_rural(id) ON DELETE CASCADE,
    ordem             INT NOT NULL DEFAULT 0,
    titulo            VARCHAR(255) NOT NULL,
    descricao         TEXT,               -- explicação em linguagem simples (não só juridiquês)
    obrigatoria       BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS alertas_contrato (
    id                SERIAL PRIMARY KEY,
    tipo_contrato_id  INT NOT NULL REFERENCES tipos_contrato_rural(id) ON DELETE CASCADE,
    texto             TEXT NOT NULL,
    nivel             VARCHAR(20) NOT NULL DEFAULT 'aviso'
                      CHECK (nivel IN ('aviso', 'alerta', 'proibicao'))
);

CREATE TABLE IF NOT EXISTS recomendacoes_contrato (
    id                     SERIAL PRIMARY KEY,
    imovel_id              INT,
    produtor_id            INT,
    respostas              JSONB NOT NULL,
    contrato_recomendado   VARCHAR(50),   -- NULL quando for "nao_e_contrato_rural_padrao"
    score                  INT,
    alternativas           JSONB,
    alertas_disparados     JSONB,         -- alertas de inconsistência/risco calculados na hora
    rascunho_gerado        TEXT,
    status                 VARCHAR(20) DEFAULT 'rascunho'
                           CHECK (status IN ('rascunho', 'revisado', 'assinado', 'descartado')),
    criado_em              TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clausulas_tipo ON clausulas_contrato(tipo_contrato_id);
CREATE INDEX IF NOT EXISTS idx_alertas_tipo ON alertas_contrato(tipo_contrato_id);
CREATE INDEX IF NOT EXISTS idx_recomendacoes_imovel ON recomendacoes_contrato(imovel_id);
