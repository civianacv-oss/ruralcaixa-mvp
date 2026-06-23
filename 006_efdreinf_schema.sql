-- ============================================================
-- RuralCaixa — Migração 006: Módulo EFD-Reinf
-- Eventos: R-1000, R-2055 (comercialização), R-2010 (serviços)
-- FUNRURAL apuração mensal e geração de DARF
-- ============================================================

-- Configuração do contribuinte (evento R-1000)
CREATE TABLE IF NOT EXISTS reinf_configuracao (
    id                  SERIAL PRIMARY KEY,
    imovel_id           INTEGER NOT NULL,
    cpf_cnpj            VARCHAR(18) NOT NULL,
    caepf               VARCHAR(20),
    tipo_contribuinte   VARCHAR(30) NOT NULL DEFAULT 'produtor_rural_pf',
    -- 'produtor_rural_pf' | 'produtor_rural_pj' | 'simples_nacional'
    regime_tributario   VARCHAR(30) NOT NULL DEFAULT 'lucro_presumido',
    -- 'lucro_real' | 'lucro_presumido' | 'simples_nacional'
    tem_empregados      BOOLEAN NOT NULL DEFAULT FALSE,
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Evento R-2055: Comercialização da Produção Rural (vendas com retenção FUNRURAL)
CREATE TABLE IF NOT EXISTS reinf_r2055 (
    id                  SERIAL PRIMARY KEY,
    imovel_id           INTEGER NOT NULL,
    competencia         VARCHAR(7) NOT NULL,    -- 'YYYY-MM'
    cnpj_adquirente     VARCHAR(18) NOT NULL,
    nome_adquirente     VARCHAR(120),
    data_nota           DATE NOT NULL,
    numero_nota         VARCHAR(30),
    tipo_produto        VARCHAR(60) NOT NULL,
    -- 'bovino' | 'suino' | 'ovino' | 'aves' | 'leite' | 'graos' | 'frutas' | 'outros'
    valor_bruto         NUMERIC(14,2) NOT NULL,
    aliquota_funrural   NUMERIC(6,4) NOT NULL DEFAULT 0.0187,  -- 1,87% (IN RFB 2.237/2024)
    aliquota_senar      NUMERIC(6,4) NOT NULL DEFAULT 0.0011,  -- 0,11%
    valor_funrural      NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_senar         NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_total_retido  NUMERIC(12,2) NOT NULL DEFAULT 0,
    retencao_pelo_adquirente BOOLEAN NOT NULL DEFAULT TRUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
    -- 'pendente' | 'transmitido' | 'retificado' | 'excluido'
    protocolo_transmissao VARCHAR(60),
    observacoes         TEXT,
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Evento R-2010: Retenção de INSS em serviços tomados
CREATE TABLE IF NOT EXISTS reinf_r2010 (
    id                  SERIAL PRIMARY KEY,
    imovel_id           INTEGER NOT NULL,
    competencia         VARCHAR(7) NOT NULL,    -- 'YYYY-MM'
    cnpj_prestador      VARCHAR(18) NOT NULL,
    nome_prestador      VARCHAR(120),
    data_nota           DATE NOT NULL,
    numero_nota         VARCHAR(30),
    tipo_servico        VARCHAR(80) NOT NULL,
    -- 'colheita' | 'tratorista' | 'construcao' | 'transporte' | 'outros'
    valor_bruto         NUMERIC(14,2) NOT NULL,
    aliquota_retencao   NUMERIC(6,4) NOT NULL DEFAULT 0.11,   -- 11%
    valor_retido        NUMERIC(12,2) NOT NULL DEFAULT 0,
    cessao_mao_obra     BOOLEAN NOT NULL DEFAULT TRUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
    protocolo_transmissao VARCHAR(60),
    observacoes         TEXT,
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Apuração mensal FUNRURAL (base para DCTFWeb e DARF)
CREATE TABLE IF NOT EXISTS reinf_apuracao (
    id                  SERIAL PRIMARY KEY,
    imovel_id           INTEGER NOT NULL,
    competencia         VARCHAR(7) NOT NULL,    -- 'YYYY-MM'
    total_receita_bruta NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_funrural      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_senar         NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_inss_servicos NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_a_recolher    NUMERIC(12,2) NOT NULL DEFAULT 0,
    data_vencimento     DATE,
    codigo_receita_darf VARCHAR(10) NOT NULL DEFAULT '2985',
    -- 2985: FUNRURAL PF | 2991: FUNRURAL PJ | 2089: INSS serviços
    status_darf         VARCHAR(20) NOT NULL DEFAULT 'em_aberto',
    -- 'em_aberto' | 'gerado' | 'pago' | 'compensado'
    data_pagamento      DATE,
    valor_pago          NUMERIC(12,2),
    nosso_numero        VARCHAR(30),
    codigo_barras       VARCHAR(60),
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(imovel_id, competencia)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reinf_r2055_imovel     ON reinf_r2055(imovel_id);
CREATE INDEX IF NOT EXISTS idx_reinf_r2055_competencia ON reinf_r2055(competencia);
CREATE INDEX IF NOT EXISTS idx_reinf_r2010_imovel     ON reinf_r2010(imovel_id);
CREATE INDEX IF NOT EXISTS idx_reinf_r2010_competencia ON reinf_r2010(competencia);
CREATE INDEX IF NOT EXISTS idx_reinf_apuracao_imovel  ON reinf_apuracao(imovel_id);
