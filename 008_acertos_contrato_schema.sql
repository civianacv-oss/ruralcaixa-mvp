-- =============================================================
-- RuralCaixa — Migração 008: Acertos de Contrato
-- Tabela: contratos_acertos
-- Caso de uso: arrendamento pago em produto (soja, milho, etc.)
--   com conversão para dinheiro pelo próprio arrendatário.
-- Referência fiscal: RIR/2018 art. 59 (base 20% atividade rural PF)
--                    Lei 4.504/1964 (Estatuto da Terra)
-- =============================================================

-- Tabela principal de acertos de contrato (por safra)
CREATE TABLE IF NOT EXISTS contratos_acertos (
    id                      SERIAL PRIMARY KEY,
    imovel_id               INTEGER NOT NULL DEFAULT 1,
    contrato_id             VARCHAR(64),          -- FK opcional para contratos_rurais.id
    safra                   VARCHAR(10) NOT NULL, -- ex: "25/26", "2025/2026"
    arrendatario_nome       VARCHAR(200) NOT NULL,
    arrendatario_cpf_cnpj   VARCHAR(20),
    arrendatario_telefone   VARCHAR(30),

    -- Produto recebido como pagamento
    produto                 VARCHAR(80) NOT NULL DEFAULT 'soja', -- soja | milho | cafe | arroz | outro
    quantidade_sacas        NUMERIC(14, 3) NOT NULL,
    valor_por_saca          NUMERIC(10, 4) NOT NULL,
    valor_bruto             NUMERIC(14, 2) GENERATED ALWAYS AS (quantidade_sacas * valor_por_saca) STORED,

    -- Descontos sobre o valor bruto
    pct_desconto_prod       NUMERIC(6, 4) DEFAULT 0,  -- ex: 1.63 para -1,63%
    valor_desconto_prod     NUMERIC(14, 2) GENERATED ALWAYS AS
                              (ROUND(quantidade_sacas * valor_por_saca * pct_desconto_prod / 100, 2)) STORED,

    pct_desconto_frete      NUMERIC(6, 4) DEFAULT 0,
    valor_desconto_frete    NUMERIC(14, 2) GENERATED ALWAYS AS
                              (ROUND(quantidade_sacas * valor_por_saca * pct_desconto_frete / 100, 2)) STORED,

    outros_descontos        NUMERIC(14, 2) DEFAULT 0,
    descricao_outros_desc   VARCHAR(200),

    -- Valor líquido recebido
    valor_liquido           NUMERIC(14, 2) GENERATED ALWAYS AS (
                              ROUND(
                                quantidade_sacas * valor_por_saca
                                - ROUND(quantidade_sacas * valor_por_saca * pct_desconto_prod / 100, 2)
                                - ROUND(quantidade_sacas * valor_por_saca * pct_desconto_frete / 100, 2)
                                - COALESCE(outros_descontos, 0),
                              2)
                            ) STORED,

    -- Retenções fiscais (feitas pelo arrendatário/comprador)
    funrural_retido         NUMERIC(14, 2) DEFAULT 0,  -- 2,5% PF ou 1,7% PJ
    senar_retido            NUMERIC(14, 2) DEFAULT 0,  -- 0,2%
    rat_retido              NUMERIC(14, 2) DEFAULT 0,  -- opcional
    inss_retido             NUMERIC(14, 2) DEFAULT 0,  -- se PJ prestadora

    -- Base tributável DIRPF (20% da receita bruta — art. 59 RIR/2018)
    pct_base_tributavel     NUMERIC(5, 2) DEFAULT 20.00,
    base_tributavel_irpf    NUMERIC(14, 2) GENERATED ALWAYS AS (
                              ROUND(quantidade_sacas * valor_por_saca * 20.00 / 100, 2)
                            ) STORED,

    -- Tipo de pagamento e modalidade
    tipo_pagamento          VARCHAR(20) NOT NULL DEFAULT 'produto',
                            -- produto | dinheiro | misto
    produto_ficou_com       VARCHAR(20) DEFAULT 'arrendatario',
                            -- arrendatario | arrendador | terceiro
    nota_fiscal_emitida     BOOLEAN DEFAULT FALSE,
    numero_nota_fiscal      VARCHAR(60),
    data_nota_fiscal        DATE,

    -- Comprovante de retenção FUNRURAL
    comprovante_funrural    VARCHAR(200), -- número/referência do comprovante
    data_pagamento          DATE,

    -- Observações e auditoria
    observacoes             TEXT,
    status                  VARCHAR(20) NOT NULL DEFAULT 'registrado',
                            -- registrado | conferido | lancado_livro_caixa | declarado
    lancamento_id           INTEGER,  -- FK para lancamentos (livro caixa)
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_acertos_imovel    ON contratos_acertos (imovel_id);
CREATE INDEX IF NOT EXISTS idx_acertos_safra     ON contratos_acertos (safra);
CREATE INDEX IF NOT EXISTS idx_acertos_contrato  ON contratos_acertos (contrato_id);
CREATE INDEX IF NOT EXISTS idx_acertos_status    ON contratos_acertos (status);

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION update_acertos_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acertos_timestamp ON contratos_acertos;
CREATE TRIGGER trg_acertos_timestamp
    BEFORE UPDATE ON contratos_acertos
    FOR EACH ROW EXECUTE FUNCTION update_acertos_timestamp();

-- Comentários explicativos
COMMENT ON TABLE contratos_acertos IS
  'Acertos de contrato de arrendamento por safra. '
  'Suporta pagamento em produto (soja, milho, etc.) com conversão para dinheiro. '
  'Calcula automaticamente: valor bruto, descontos, valor líquido e base tributável IRPF (20%).';

COMMENT ON COLUMN contratos_acertos.pct_base_tributavel IS
  'Percentual de base tributável para DIRPF. Default 20% conforme art. 59 RIR/2018 '
  '(Decreto 9.580/2018) para atividade rural PF.';

COMMENT ON COLUMN contratos_acertos.funrural_retido IS
  'FUNRURAL retido pelo comprador/arrendatário. '
  'PF: 2,5% (1,2% FUNRURAL + 0,1% SENAR + 1,2% RAT). '
  'PJ: 1,7% (1,5% FUNRURAL + 0,2% SENAR). '
  'Base: Lei 8.212/1991 art. 25 + Lei 9.528/1997.';

COMMENT ON COLUMN contratos_acertos.produto_ficou_com IS
  'Indica quem ficou com a soja/produto após o acerto. '
  'No caso típico: arrendatário dá a soja e já recompra — produto fica com o arrendatário.';
