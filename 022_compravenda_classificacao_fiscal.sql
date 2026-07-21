-- ============================================================
-- RuralCaixa — Classificação Fiscal Automática (Compra e Venda)
-- Migration: 022_compravenda_classificacao_fiscal.sql
-- ============================================================
-- Reaproveita o mesmo prazo já usado em /compravenda/alertas-fiscais
-- (Decreto 9.580/2018 — RIR atual): 52 dias para regime de confinamento,
-- 138 dias para regime de pasto. Acima do prazo = ATIVIDADE RURAL
-- (entra no Livro Caixa). Dentro do prazo = NEGOCIACAO/COMERCIAL
-- (fica fora do Livro Caixa Rural, tratado à parte na DAA).
--
-- Consumo por FIFO (Primeiro que Entra, Primeiro que Sai): cada venda
-- é abatida das compras mais antigas primeiro, o que resolve o problema
-- de rateio quando um mesmo produto/lote tem compras em datas diferentes.
-- ============================================================

-- Ledger de baixas: liga cada venda às compras específicas que ela consumiu
CREATE TABLE IF NOT EXISTS cv_vendas_baixas (
    id                  SERIAL PRIMARY KEY,
    venda_id            INTEGER NOT NULL REFERENCES cv_vendas(id),
    compra_id           INTEGER NOT NULL REFERENCES cv_compras(id),
    quantidade_baixada  NUMERIC(12,4) NOT NULL CHECK (quantidade_baixada > 0),
    dias_permanencia    INTEGER NOT NULL,
    prazo_max           INTEGER NOT NULL,          -- 52 (confinamento) ou 138 (pasto)
    classificacao       VARCHAR(12) NOT NULL CHECK (classificacao IN ('RURAL', 'NEGOCIACAO')),
    valor_baixado       NUMERIC(14,2) NOT NULL,     -- proporcional ao valor_unitario da venda
    custo_baixado       NUMERIC(14,2) NOT NULL,     -- proporcional ao valor_unitario da compra
    criado_em           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cv_vendas_baixas_venda  ON cv_vendas_baixas(venda_id);
CREATE INDEX IF NOT EXISTS idx_cv_vendas_baixas_compra ON cv_vendas_baixas(compra_id);

-- Campos agregados na própria venda, para consulta rápida sem juntar o ledger
ALTER TABLE cv_vendas
    ADD COLUMN IF NOT EXISTS classificacao   VARCHAR(12),   -- RURAL | NEGOCIACAO | MISTA
    ADD COLUMN IF NOT EXISTS valor_rural      NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_negociacao NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lancamento_id    UUID REFERENCES lancamentos(id);

CREATE INDEX IF NOT EXISTS idx_cv_vendas_classificacao ON cv_vendas(classificacao);
