-- ============================================================
-- RuralCaixa — Migração 009: Melhorias EFD-Reinf
-- Data: 2026-06-23
-- Descrição:
--   1. Adiciona colunas de linkagem acerto→R-2055 (integração automática)
--   2. Adiciona tabela reinf_xml_lotes (exportação XML por competência)
--   3. Adiciona campos LC 214/2024 (CBS/IBS — Reforma Tributária 2027+)
--   4. Melhora índices e adiciona trigger de atualizado_em
--   5. Registra migração em schema_migrations
-- ============================================================

-- ── 0. Garantir tabela de controle de migrações ──────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 1. reinf_r2055: campos de integração com contratos_acertos ───────────────
ALTER TABLE reinf_r2055
    ADD COLUMN IF NOT EXISTS acerto_id         INTEGER,          -- FK → contratos_acertos.id
    ADD COLUMN IF NOT EXISTS origem            VARCHAR(20) NOT NULL DEFAULT 'manual',
    -- 'manual' | 'acerto_contrato' | 'importacao'
    ADD COLUMN IF NOT EXISTS cpf_cnpj_produtor VARCHAR(18),      -- CPF/CNPJ do produtor rural (para XML)
    ADD COLUMN IF NOT EXISTS caepf             VARCHAR(20),      -- CAEPF (para XML R-2055)
    ADD COLUMN IF NOT EXISTS xml_gerado        TEXT,             -- XML do evento gerado
    ADD COLUMN IF NOT EXISTS data_transmissao  TIMESTAMPTZ,      -- quando foi transmitido
    ADD COLUMN IF NOT EXISTS retificacao_id    INTEGER,          -- aponta para o evento original se for retificação
    ADD COLUMN IF NOT EXISTS atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── 2. reinf_r2010: campos de integração e XML ───────────────────────────────
ALTER TABLE reinf_r2010
    ADD COLUMN IF NOT EXISTS origem            VARCHAR(20) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS cpf_cnpj_produtor VARCHAR(18),
    ADD COLUMN IF NOT EXISTS caepf             VARCHAR(20),
    ADD COLUMN IF NOT EXISTS xml_gerado        TEXT,
    ADD COLUMN IF NOT EXISTS data_transmissao  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retificacao_id    INTEGER,
    ADD COLUMN IF NOT EXISTS atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── 3. reinf_apuracao: campos DCTFWeb e LC 214/2024 ─────────────────────────
ALTER TABLE reinf_apuracao
    ADD COLUMN IF NOT EXISTS dctfweb_numero    VARCHAR(30),      -- número da DCTFWeb transmitida
    ADD COLUMN IF NOT EXISTS dctfweb_status    VARCHAR(20) DEFAULT 'nao_gerada',
    -- 'nao_gerada' | 'gerada' | 'transmitida' | 'retificada'
    ADD COLUMN IF NOT EXISTS dctfweb_data      TIMESTAMPTZ,
    -- Campos Reforma Tributária (LC 214/2024 — vigência 2027)
    ADD COLUMN IF NOT EXISTS total_cbs         NUMERIC(12,2) DEFAULT 0,  -- CBS (substitui PIS/COFINS)
    ADD COLUMN IF NOT EXISTS total_ibs         NUMERIC(12,2) DEFAULT 0,  -- IBS (substitui ICMS/ISS)
    ADD COLUMN IF NOT EXISTS aliquota_cbs      NUMERIC(6,4) DEFAULT 0,   -- alíquota CBS vigente
    ADD COLUMN IF NOT EXISTS aliquota_ibs      NUMERIC(6,4) DEFAULT 0,   -- alíquota IBS vigente
    ADD COLUMN IF NOT EXISTS regime_fiscal     VARCHAR(30) DEFAULT 'atual',
    -- 'atual' | 'reforma_tributaria' | 'transicao'
    ADD COLUMN IF NOT EXISTS observacoes_darf  TEXT;

-- ── 4. reinf_r2055: campos LC 214/2024 ───────────────────────────────────────
ALTER TABLE reinf_r2055
    ADD COLUMN IF NOT EXISTS aliquota_cbs      NUMERIC(6,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_cbs         NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS aliquota_ibs      NUMERIC(6,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_ibs         NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS regime_fiscal     VARCHAR(30) DEFAULT 'atual';

-- ── 5. Nova tabela: reinf_xml_lotes ─────────────────────────────────────────
-- Armazena os lotes XML gerados por competência para download/transmissão
CREATE TABLE IF NOT EXISTS reinf_xml_lotes (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    competencia     VARCHAR(7) NOT NULL,    -- 'YYYY-MM'
    tipo_evento     VARCHAR(10) NOT NULL,   -- 'R-2055' | 'R-2010' | 'R-9000' | 'R-9011'
    xml_conteudo    TEXT NOT NULL,          -- XML completo do lote
    hash_sha256     VARCHAR(64),            -- hash para verificação de integridade
    qtd_eventos     INTEGER DEFAULT 0,
    valor_total     NUMERIC(14,2) DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'gerado',
    -- 'gerado' | 'transmitido' | 'retificado' | 'cancelado'
    protocolo       VARCHAR(60),            -- protocolo de transmissão RFB
    data_geracao    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_transmissao TIMESTAMPTZ,
    mensagem_retorno TEXT,                  -- retorno da RFB após transmissão
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Nova tabela: reinf_configuracao_avancada ──────────────────────────────
-- Configurações avançadas para geração de XML (certificado, ambiente, etc.)
CREATE TABLE IF NOT EXISTS reinf_configuracao_avancada (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL UNIQUE,
    ambiente        VARCHAR(10) NOT NULL DEFAULT 'producao',
    -- 'producao' | 'homologacao'
    versao_schema   VARCHAR(10) NOT NULL DEFAULT '2.01.01',
    -- versão do schema EFD-Reinf (atual: 2.01.01 conforme NT 2024/001)
    cnpj_transmissor VARCHAR(18),           -- CNPJ do transmissor (contador/escritório)
    nome_transmissor VARCHAR(120),
    -- Campos para Reforma Tributária (LC 214/2024)
    aderiu_reforma   BOOLEAN DEFAULT FALSE, -- TRUE a partir de 01/01/2027
    data_adesao_reforma DATE,
    aliquota_cbs_padrao NUMERIC(6,4) DEFAULT 0.0865,  -- 8,65% CBS (estimativa LC 214)
    aliquota_ibs_padrao NUMERIC(6,4) DEFAULT 0.0265,  -- 2,65% IBS (estimativa LC 214)
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Índices adicionais ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reinf_r2055_acerto_id   ON reinf_r2055(acerto_id);
CREATE INDEX IF NOT EXISTS idx_reinf_r2055_origem       ON reinf_r2055(origem);
CREATE INDEX IF NOT EXISTS idx_reinf_r2055_status       ON reinf_r2055(status);
CREATE INDEX IF NOT EXISTS idx_reinf_r2010_status       ON reinf_r2010(status);
CREATE INDEX IF NOT EXISTS idx_reinf_xml_lotes_imovel   ON reinf_xml_lotes(imovel_id);
CREATE INDEX IF NOT EXISTS idx_reinf_xml_lotes_comp     ON reinf_xml_lotes(competencia);
CREATE INDEX IF NOT EXISTS idx_reinf_apuracao_status    ON reinf_apuracao(status_darf);

-- ── 8. Triggers de atualizado_em ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_reinf_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reinf_r2055_ts ON reinf_r2055;
CREATE TRIGGER trg_reinf_r2055_ts
    BEFORE UPDATE ON reinf_r2055
    FOR EACH ROW EXECUTE FUNCTION update_reinf_timestamp();

DROP TRIGGER IF EXISTS trg_reinf_r2010_ts ON reinf_r2010;
CREATE TRIGGER trg_reinf_r2010_ts
    BEFORE UPDATE ON reinf_r2010
    FOR EACH ROW EXECUTE FUNCTION update_reinf_timestamp();

DROP TRIGGER IF EXISTS trg_reinf_apuracao_ts ON reinf_apuracao;
CREATE TRIGGER trg_reinf_apuracao_ts
    BEFORE UPDATE ON reinf_apuracao
    FOR EACH ROW EXECUTE FUNCTION update_reinf_timestamp();

DROP TRIGGER IF EXISTS trg_reinf_conf_avancada_ts ON reinf_configuracao_avancada;
CREATE TRIGGER trg_reinf_conf_avancada_ts
    BEFORE UPDATE ON reinf_configuracao_avancada
    FOR EACH ROW EXECUTE FUNCTION update_reinf_timestamp();

-- ── 9. Comentários ──────────────────────────────────────────────────────────
COMMENT ON COLUMN reinf_r2055.acerto_id IS
    'FK para contratos_acertos.id — preenchido quando o R-2055 é gerado automaticamente a partir de um acerto de arrendamento.';
COMMENT ON COLUMN reinf_r2055.origem IS
    'Origem do lançamento: manual (usuário), acerto_contrato (gerado pelo módulo de acertos), importacao.';
COMMENT ON TABLE reinf_xml_lotes IS
    'Lotes XML gerados por competência para transmissão à RFB. Cada lote pode conter múltiplos eventos R-2055 ou R-2010.';
COMMENT ON TABLE reinf_configuracao_avancada IS
    'Configurações avançadas para geração de XML EFD-Reinf e preparação para Reforma Tributária (LC 214/2024).';
COMMENT ON COLUMN reinf_apuracao.total_cbs IS
    'CBS — Contribuição sobre Bens e Serviços (substitui PIS/COFINS). Vigência: 01/01/2027 conforme LC 214/2024.';
COMMENT ON COLUMN reinf_apuracao.total_ibs IS
    'IBS — Imposto sobre Bens e Serviços (substitui ICMS/ISS). Vigência: 01/01/2027 conforme LC 214/2024.';

-- ── 10. Registrar migração ───────────────────────────────────────────────────
INSERT INTO schema_migrations (id, description)
VALUES (
    '009_efdreinf_melhorias',
    'EFD-Reinf: integração acertos→R-2055, tabela XML lotes, campos LC 214/2024, triggers, índices'
)
ON CONFLICT DO NOTHING;
