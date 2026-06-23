-- ============================================================
-- 007 — Simulador de Regime Tributário (Reforma Tributária)
-- RuralCaixa — Decreto 9.580/2018 + LC 214/2024
-- ============================================================

-- Perfil do produtor (configuração base)
CREATE TABLE IF NOT EXISTS sim_perfil (
  id               SERIAL PRIMARY KEY,
  imovel_id        INTEGER NOT NULL UNIQUE,
  nome             VARCHAR(120),
  tipo_pessoa      VARCHAR(5)  NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF','PJ')),
  tipo_atividade   VARCHAR(30) NOT NULL DEFAULT 'in_natura'
                   CHECK (tipo_atividade IN ('in_natura','industrializado','servico','misto')),
  regime_atual     VARCHAR(20) NOT NULL DEFAULT 'pf_diferenciado'
                   CHECK (regime_atual IN ('pf_diferenciado','pf_lucro_real','pj_simples','pj_lucro_real')),
  anexo_simples    VARCHAR(5)  DEFAULT 'II'
                   CHECK (anexo_simples IN ('I','II','III','IV','V')),
  criado_em        TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Lançamentos mensais (entradas para o simulador)
CREATE TABLE IF NOT EXISTS sim_lancamentos (
  id                    SERIAL PRIMARY KEY,
  imovel_id             INTEGER NOT NULL,
  competencia           DATE    NOT NULL,          -- primeiro dia do mês
  faturamento           NUMERIC(14,2) NOT NULL DEFAULT 0,
  despesas_operacionais NUMERIC(14,2) NOT NULL DEFAULT 0,
  folha_pagamento       NUMERIC(14,2) NOT NULL DEFAULT 0,  -- pró-labore + salários
  prolabore             NUMERIC(14,2) NOT NULL DEFAULT 0,
  tipo_producao         VARCHAR(30) NOT NULL DEFAULT 'in_natura'
                        CHECK (tipo_producao IN ('in_natura','industrializado','servico','misto')),
  observacoes           TEXT,
  criado_em             TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (imovel_id, competencia)
);

-- Resultados calculados por competência (cache)
CREATE TABLE IF NOT EXISTS sim_resultados (
  id                    SERIAL PRIMARY KEY,
  imovel_id             INTEGER NOT NULL,
  competencia           DATE    NOT NULL,
  faturamento_12m       NUMERIC(14,2) NOT NULL DEFAULT 0,
  folha_12m             NUMERIC(14,2) NOT NULL DEFAULT 0,
  despesas_12m          NUMERIC(14,2) NOT NULL DEFAULT 0,
  fator_r_pct           NUMERIC(6,2)  NOT NULL DEFAULT 0,
  -- Tributos calculados por regime
  pf_diferenciado       NUMERIC(14,2) NOT NULL DEFAULT 0,
  pf_lucro_real         NUMERIC(14,2) NOT NULL DEFAULT 0,
  pj_simples_ii         NUMERIC(14,2) NOT NULL DEFAULT 0,
  pj_simples_iii        NUMERIC(14,2) NOT NULL DEFAULT 0,
  pj_simples_v          NUMERIC(14,2) NOT NULL DEFAULT 0,
  pj_lucro_real         NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Recomendação
  regime_recomendado    VARCHAR(30),
  economia_anual        NUMERIC(14,2) NOT NULL DEFAULT 0,
  alertas               JSONB,
  calculado_em          TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (imovel_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_sim_lancamentos_imovel ON sim_lancamentos(imovel_id);
CREATE INDEX IF NOT EXISTS idx_sim_resultados_imovel  ON sim_resultados(imovel_id);
