-- ============================================================
-- RuralCaixa — 011_bovino_leiteiro_corte.sql
-- Separação Gado Leiteiro vs Corte
--
-- Estratégia:
--   • Tabelas compartilhadas já existem (bovino_animais, pesagens,
--     sanitario, reproducao, lotes, abates, movimentacoes)
--   • Adiciona coluna tipo_bovino em imoveis_rurais (text 'leite'|'corte'|'misto')
--     substituindo o campo tipo_exploracao (integer legado)
--   • Cria tabelas EXCLUSIVAS para Leiteiro
--   • Cria tabelas EXCLUSIVAS para Corte
--   • Cria VIEW unificada para dashboard
-- ============================================================

-- ── 1. Atualizar imoveis_rurais ───────────────────────────────
-- Adiciona coluna tipo_bovino (texto) mantendo tipo_exploracao legado
ALTER TABLE imoveis_rurais
  ADD COLUMN IF NOT EXISTS tipo_bovino VARCHAR(6)
    CHECK (tipo_bovino IN ('leite','corte','misto'))
    DEFAULT 'corte';

-- Migra valores existentes: tipo_exploracao=1→corte, 2→leite, 3→misto
UPDATE imoveis_rurais SET tipo_bovino =
  CASE tipo_exploracao
    WHEN 2 THEN 'leite'
    WHEN 3 THEN 'misto'
    ELSE 'corte'
  END
WHERE tipo_bovino IS NULL OR tipo_bovino = 'corte';

-- ── 2. Tabelas EXCLUSIVAS — Gado Leiteiro ─────────────────────

-- 2a. Controle de ordenha por animal/turno
CREATE TABLE IF NOT EXISTS bovino_ordenha (
  id              SERIAL PRIMARY KEY,
  imovel_id       INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE RESTRICT,
  animal_id       INTEGER REFERENCES bovino_animais(id) ON DELETE CASCADE,
  lote_id         INTEGER REFERENCES bovino_lotes(id),
  data            DATE NOT NULL,
  turno           VARCHAR(6) NOT NULL DEFAULT 'total'
                    CHECK (turno IN ('manha','tarde','total')),
  volume_l        NUMERIC(7,2) NOT NULL CHECK (volume_l >= 0),
  gordura_pct     NUMERIC(4,2),
  proteina_pct    NUMERIC(4,2),
  ccs             INTEGER,                  -- contagem células somáticas (x1000/mL)
  ufc             INTEGER,                  -- unidades formadoras de colônia
  destinacao      VARCHAR(20) NOT NULL DEFAULT 'venda'
                    CHECK (destinacao IN ('venda','autoconsumo','bezerros','descarte','queijo','manteiga')),
  preco_litro     NUMERIC(6,4),
  valor_total     NUMERIC(10,2) GENERATED ALWAYS AS
                    (volume_l * COALESCE(preco_litro, 0)) STORED,
  observacoes     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bovino_ordenha_imovel_data
  ON bovino_ordenha(imovel_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_bovino_ordenha_animal
  ON bovino_ordenha(animal_id);

-- 2b. Protocolo IATF (Inseminação Artificial em Tempo Fixo)
CREATE TABLE IF NOT EXISTS bovino_protocolo_iatf (
  id              SERIAL PRIMARY KEY,
  imovel_id       INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE RESTRICT,
  femea_id        INTEGER NOT NULL REFERENCES bovino_animais(id) ON DELETE CASCADE,
  lote_id         INTEGER REFERENCES bovino_lotes(id),
  protocolo       VARCHAR(60) NOT NULL,     -- ex: "Ovsynch 48h", "CIDR 7d"
  data_inicio     DATE NOT NULL,
  data_iatf       DATE,                     -- data da inseminação
  touro_id        INTEGER REFERENCES bovino_animais(id),
  semen_touro     VARCHAR(80),              -- nome/código do sêmen
  tecnico         VARCHAR(80),
  resultado       VARCHAR(20) DEFAULT 'aguardando'
                    CHECK (resultado IN ('aguardando','positivo','negativo','aborto')),
  data_diagnostico DATE,
  observacoes     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bovino_iatf_imovel
  ON bovino_protocolo_iatf(imovel_id);
CREATE INDEX IF NOT EXISTS idx_bovino_iatf_femea
  ON bovino_protocolo_iatf(femea_id);

-- 2c. Dieta de transição (pré e pós-parto)
CREATE TABLE IF NOT EXISTS bovino_dieta_transicao (
  id              SERIAL PRIMARY KEY,
  imovel_id       INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE RESTRICT,
  animal_id       INTEGER NOT NULL REFERENCES bovino_animais(id) ON DELETE CASCADE,
  fase            VARCHAR(20) NOT NULL
                    CHECK (fase IN ('pre_parto','pos_parto','secagem','alta_producao')),
  data_inicio     DATE NOT NULL,
  data_fim        DATE,
  dieta_descricao TEXT NOT NULL,
  volumoso_kg_dia NUMERIC(6,2),
  concentrado_kg_dia NUMERIC(6,2),
  suplemento      VARCHAR(80),
  responsavel     VARCHAR(80),
  observacoes     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bovino_dieta_imovel
  ON bovino_dieta_transicao(imovel_id);
CREATE INDEX IF NOT EXISTS idx_bovino_dieta_animal
  ON bovino_dieta_transicao(animal_id);

-- ── 3. Tabelas EXCLUSIVAS — Gado de Corte ─────────────────────

-- 3a. Confinamento (lote em confinamento)
CREATE TABLE IF NOT EXISTS bovino_confinamento (
  id              SERIAL PRIMARY KEY,
  imovel_id       INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE RESTRICT,
  lote_id         INTEGER NOT NULL REFERENCES bovino_lotes(id) ON DELETE CASCADE,
  data_entrada    DATE NOT NULL,
  data_saida_prev DATE,
  data_saida_real DATE,
  peso_entrada_kg NUMERIC(7,2),
  peso_saida_kg   NUMERIC(7,2),
  gmd_kg          NUMERIC(5,3)              -- ganho médio diário (kg/dia)
                    GENERATED ALWAYS AS (
                      CASE WHEN data_saida_real IS NOT NULL
                               AND data_saida_real > data_entrada
                               AND peso_saida_kg IS NOT NULL
                               AND peso_entrada_kg IS NOT NULL
                        THEN ROUND(
                          (peso_saida_kg - peso_entrada_kg)
                          / (data_saida_real - data_entrada), 3)
                        ELSE NULL
                      END
                    ) STORED,
  dieta           TEXT,
  custo_diario_cab NUMERIC(8,2),
  objetivo        VARCHAR(40) DEFAULT 'terminacao'
                    CHECK (objetivo IN ('terminacao','recria','engorda')),
  status          VARCHAR(20) DEFAULT 'ativo'
                    CHECK (status IN ('ativo','encerrado','cancelado')),
  observacoes     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bovino_confin_imovel
  ON bovino_confinamento(imovel_id);
CREATE INDEX IF NOT EXISTS idx_bovino_confin_lote
  ON bovino_confinamento(lote_id);

-- 3b. Classificação de carcaça / tipificação
CREATE TABLE IF NOT EXISTS bovino_classificacao_carcaca (
  id              SERIAL PRIMARY KEY,
  imovel_id       INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE RESTRICT,
  animal_id       INTEGER NOT NULL REFERENCES bovino_animais(id) ON DELETE CASCADE,
  abate_id        INTEGER REFERENCES bovino_abates(id),
  data            DATE NOT NULL,
  frigorifico     VARCHAR(80),
  maturidade      VARCHAR(20)               -- dente: 0d, 2d, 4d, 6d, 8d
                    CHECK (maturidade IN ('0d','2d','4d','6d','8d','adulto')),
  acabamento      VARCHAR(20)               -- cobertura de gordura
                    CHECK (acabamento IN ('ausente','escasso','mediano','uniforme','excessivo')),
  conformacao     VARCHAR(20)
                    CHECK (conformacao IN ('convexa','subconvexa','reta','subconca','concava')),
  peso_carcaca_kg NUMERIC(7,2),
  rendimento_pct  NUMERIC(5,2),
  preco_arroba    NUMERIC(8,2),
  valor_total     NUMERIC(12,2),
  nota_fiscal     VARCHAR(60),
  observacoes     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bovino_carcaca_imovel
  ON bovino_classificacao_carcaca(imovel_id);
CREATE INDEX IF NOT EXISTS idx_bovino_carcaca_animal
  ON bovino_classificacao_carcaca(animal_id);

-- 3c. Custo de produção por lote/período
CREATE TABLE IF NOT EXISTS bovino_custo_producao (
  id              SERIAL PRIMARY KEY,
  imovel_id       INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE RESTRICT,
  lote_id         INTEGER REFERENCES bovino_lotes(id),
  confinamento_id INTEGER REFERENCES bovino_confinamento(id),
  periodo_inicio  DATE NOT NULL,
  periodo_fim     DATE,
  categoria       VARCHAR(40) NOT NULL
                    CHECK (categoria IN (
                      'racao','sal_mineral','sanidade','mao_de_obra',
                      'pasto','agua','energia','outros'
                    )),
  descricao       VARCHAR(120),
  valor           NUMERIC(12,2) NOT NULL,
  lancamento_id   UUID REFERENCES lancamentos(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bovino_custo_imovel
  ON bovino_custo_producao(imovel_id);
CREATE INDEX IF NOT EXISTS idx_bovino_custo_lote
  ON bovino_custo_producao(lote_id);

-- ── 4. VIEW de dashboard unificado ───────────────────────────
CREATE OR REPLACE VIEW vw_bovino_dashboard AS
SELECT
  ir.id                                     AS imovel_id,
  ir.tipo_bovino,
  -- plantel
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'ativo')  AS total_animais,
  COUNT(DISTINCT a.id) FILTER (WHERE a.aptidao_manejo = 'leite' AND a.status = 'ativo') AS total_leite,
  COUNT(DISTINCT a.id) FILTER (WHERE a.aptidao_manejo = 'corte' AND a.status = 'ativo') AS total_corte,
  -- produção de leite (últimos 30 dias)
  COALESCE(SUM(o.volume_l) FILTER (WHERE o.data >= CURRENT_DATE - 30), 0) AS leite_30d_l,
  COALESCE(AVG(o.volume_l) FILTER (WHERE o.data >= CURRENT_DATE - 30), 0) AS leite_media_dia_l,
  -- abates (últimos 90 dias)
  COUNT(DISTINCT ab.id) FILTER (WHERE ab.data >= CURRENT_DATE - 90)       AS abates_90d,
  COALESCE(SUM(ab.valor_total) FILTER (WHERE ab.data >= CURRENT_DATE - 90), 0) AS receita_abates_90d,
  -- confinamento ativo
  COUNT(DISTINCT cf.id) FILTER (WHERE cf.status = 'ativo')                AS lotes_confinamento_ativos
FROM imoveis_rurais ir
LEFT JOIN bovino_animais a    ON a.imovel_id = ir.id
LEFT JOIN bovino_ordenha o    ON o.imovel_id = ir.id
LEFT JOIN bovino_abates ab    ON ab.animal_id = a.id
LEFT JOIN bovino_lotes bl     ON bl.imovel_id = ir.id
LEFT JOIN bovino_confinamento cf ON cf.imovel_id = ir.id
GROUP BY ir.id, ir.tipo_bovino;

-- ── 5. Função helper: retorna tipo_bovino do imóvel ──────────
CREATE OR REPLACE FUNCTION fn_tipo_bovino(p_imovel_id INTEGER)
RETURNS VARCHAR AS $$
  SELECT COALESCE(tipo_bovino, 'corte')
  FROM imoveis_rurais WHERE id = p_imovel_id;
$$ LANGUAGE SQL STABLE;
