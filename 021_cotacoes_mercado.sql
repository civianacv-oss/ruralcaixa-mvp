-- 021_cotacoes_mercado.sql
-- Armazena cotacoes de mercado (CEPEA) usadas para alertas de viabilidade
-- economica (ex: engorda antieconomica quando custo/kg supera valor de mercado)

CREATE TABLE IF NOT EXISTS cotacoes_mercado (
    id              SERIAL PRIMARY KEY,
    produto         VARCHAR(50) NOT NULL,
    -- 'boi_gordo_arroba' | 'bezerro'
    data_referencia DATE NOT NULL,
    valor           NUMERIC(10,2) NOT NULL,
    unidade         VARCHAR(20) DEFAULT 'R$/arroba',
    fonte           VARCHAR(30) DEFAULT 'CEPEA',
    criado_em       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(produto, data_referencia)
);

COMMENT ON TABLE cotacoes_mercado IS
  'Cotacoes de mercado (CEPEA/ESALQ, uso nao-comercial CC BY-NC 4.0) para calculo de viabilidade economica. Sempre exibir "Fonte: CEPEA" quando o valor aparecer na tela.';

CREATE INDEX IF NOT EXISTS idx_cotacoes_produto_data ON cotacoes_mercado(produto, data_referencia DESC);

SELECT 'Migration 021 (cotacoes_mercado) concluida!' AS resultado;
