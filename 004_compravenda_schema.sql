-- ============================================================
-- RuralCaixa — Módulo Compra e Venda de Animais
-- Migration: 004_compravenda_schema.sql
-- ============================================================

-- Produtos / Itens de estoque
CREATE TABLE IF NOT EXISTS cv_produtos (
    id          SERIAL PRIMARY KEY,
    imovel_id   INTEGER NOT NULL,
    nome        VARCHAR(120) NOT NULL,
    descricao   TEXT,
    unidade     VARCHAR(20)  NOT NULL DEFAULT 'cab',  -- cab, kg, arroba, saca, un
    especie     VARCHAR(40),                           -- bovino, suino, ovino, caprino, outro
    custo_medio NUMERIC(12,2),
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Compras (entradas de estoque)
CREATE TABLE IF NOT EXISTS cv_compras (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    produto_id      INTEGER NOT NULL REFERENCES cv_produtos(id),
    data_compra     DATE    NOT NULL DEFAULT CURRENT_DATE,
    quantidade      NUMERIC(12,4) NOT NULL,
    valor_unitario  NUMERIC(12,2) NOT NULL,
    valor_total     NUMERIC(14,2) NOT NULL,
    fornecedor      VARCHAR(120),
    nota_fiscal     VARCHAR(60),
    observacoes     TEXT,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Vendas (saídas de estoque)
CREATE TABLE IF NOT EXISTS cv_vendas (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    produto_id      INTEGER NOT NULL REFERENCES cv_produtos(id),
    data_venda      DATE    NOT NULL DEFAULT CURRENT_DATE,
    quantidade      NUMERIC(12,4) NOT NULL,
    valor_unitario  NUMERIC(12,2) NOT NULL,
    valor_total     NUMERIC(14,2) NOT NULL,
    custo_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
    lucro_bruto     NUMERIC(14,2) NOT NULL DEFAULT 0,
    margem_pct      NUMERIC(6,2)  NOT NULL DEFAULT 0,
    comprador       VARCHAR(120),
    nota_fiscal     VARCHAR(60),
    observacoes     TEXT,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Despesas operacionais do módulo comercial
CREATE TABLE IF NOT EXISTS cv_despesas (
    id                SERIAL PRIMARY KEY,
    imovel_id         INTEGER NOT NULL,
    descricao         VARCHAR(200) NOT NULL,
    categoria         VARCHAR(40)  NOT NULL DEFAULT 'operacional',
    data_lancamento   DATE         NOT NULL DEFAULT CURRENT_DATE,
    valor             NUMERIC(12,2) NOT NULL,
    observacoes       TEXT,
    criado_em         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_cv_compras_imovel   ON cv_compras(imovel_id);
CREATE INDEX IF NOT EXISTS idx_cv_compras_produto  ON cv_compras(produto_id);
CREATE INDEX IF NOT EXISTS idx_cv_compras_data     ON cv_compras(data_compra);
CREATE INDEX IF NOT EXISTS idx_cv_vendas_imovel    ON cv_vendas(imovel_id);
CREATE INDEX IF NOT EXISTS idx_cv_vendas_produto   ON cv_vendas(produto_id);
CREATE INDEX IF NOT EXISTS idx_cv_vendas_data      ON cv_vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_cv_despesas_imovel  ON cv_despesas(imovel_id);
CREATE INDEX IF NOT EXISTS idx_cv_despesas_data    ON cv_despesas(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_cv_produtos_imovel  ON cv_produtos(imovel_id);
