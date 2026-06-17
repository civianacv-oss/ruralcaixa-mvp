-- =============================================================================
-- 005_acai_schema.sql
-- RuralCaixa — Módulo Cultivo de Açaí
-- =============================================================================

-- Talhões (áreas de cultivo)
CREATE TABLE IF NOT EXISTS acai_talhoes (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    nome            VARCHAR(120) NOT NULL,
    area_ha         NUMERIC(10,4) NOT NULL,
    sistema         VARCHAR(30) NOT NULL DEFAULT 'varzea'
                    CHECK (sistema IN ('varzea', 'terra_firme', 'igapo', 'outro')),
    especie         VARCHAR(40) NOT NULL DEFAULT 'euterpe_oleracea'
                    CHECK (especie IN ('euterpe_oleracea', 'euterpe_precatoria', 'outro')),
    data_plantio    DATE,
    espacamento_m   NUMERIC(5,2),          -- espaçamento em metros (ex: 5.0 = 5x5m)
    num_plantas     INTEGER,               -- número total de plantas
    fase            VARCHAR(30) NOT NULL DEFAULT 'implantacao'
                    CHECK (fase IN ('implantacao', 'crescimento', 'producao', 'reforma', 'abandonado')),
    observacoes     TEXT,
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Safras / Colheitas
CREATE TABLE IF NOT EXISTS acai_safras (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    talhao_id       INTEGER NOT NULL REFERENCES acai_talhoes(id),
    data_colheita   DATE NOT NULL DEFAULT CURRENT_DATE,
    quantidade_kg   NUMERIC(12,3) NOT NULL,
    preco_kg        NUMERIC(10,4) NOT NULL,
    valor_total     NUMERIC(14,2) NOT NULL,
    comprador       VARCHAR(120),
    tipo_venda      VARCHAR(30) NOT NULL DEFAULT 'in_natura'
                    CHECK (tipo_venda IN ('in_natura', 'polpa', 'cooperativa', 'industria', 'outro')),
    nota_fiscal     VARCHAR(60),
    observacoes     TEXT,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insumos e Manejo (custos de produção)
CREATE TABLE IF NOT EXISTS acai_insumos (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    talhao_id       INTEGER REFERENCES acai_talhoes(id),  -- NULL = toda a propriedade
    data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
    descricao       VARCHAR(200) NOT NULL,
    categoria       VARCHAR(40) NOT NULL DEFAULT 'insumo'
                    CHECK (categoria IN (
                        'insumo',       -- fertilizantes, defensivos, sementes
                        'mao_de_obra',  -- colheita, roçagem, adubação
                        'maquinario',   -- aluguel de equipamentos
                        'frete',        -- transporte da produção
                        'irrigacao',    -- energia, manutenção
                        'outros'
                    )),
    quantidade      NUMERIC(12,3),
    unidade         VARCHAR(20),
    valor_unitario  NUMERIC(12,4),
    valor_total     NUMERIC(14,2) NOT NULL,
    observacoes     TEXT,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_acai_talhoes_imovel   ON acai_talhoes(imovel_id);
CREATE INDEX IF NOT EXISTS idx_acai_safras_imovel    ON acai_safras(imovel_id);
CREATE INDEX IF NOT EXISTS idx_acai_safras_talhao    ON acai_safras(talhao_id);
CREATE INDEX IF NOT EXISTS idx_acai_insumos_imovel   ON acai_insumos(imovel_id);
CREATE INDEX IF NOT EXISTS idx_acai_insumos_talhao   ON acai_insumos(talhao_id);
