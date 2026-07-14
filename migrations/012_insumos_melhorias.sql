-- 012_insumos_melhorias.sql
-- Adiciona colunas de gestão avançada de estoque ao módulo de Insumos:
-- reservado, estoque máximo, lote/validade, local de armazenamento.
-- Todas aditivas (ADD COLUMN IF NOT EXISTS) — não altera dados existentes
-- nem a lógica de atualização de estoque_atual já em produção.

ALTER TABLE insumos
  ADD COLUMN IF NOT EXISTS estoque_reservado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_maximo numeric,
  ADD COLUMN IF NOT EXISTS lote varchar(60),
  ADD COLUMN IF NOT EXISTS validade date,
  ADD COLUMN IF NOT EXISTS local_armazenamento varchar(120);

COMMENT ON COLUMN insumos.estoque_reservado IS 'Quantidade já comprometida para atividade futura (não conta como disponível para novo consumo)';
COMMENT ON COLUMN insumos.estoque_maximo IS 'Teto de estoque para evitar compras excessivas';
COMMENT ON COLUMN insumos.lote IS 'Lote do insumo (essencial para medicamentos, vacinas, sementes, defensivos)';
COMMENT ON COLUMN insumos.validade IS 'Data de validade do lote atual, para alertas de vencimento';
COMMENT ON COLUMN insumos.local_armazenamento IS 'Ex: Silo 02, Galpão A, Farmácia, Tanque Diesel, Depósito Central';

-- Índice para consultas de vencimento próximo
CREATE INDEX IF NOT EXISTS idx_insumos_validade ON insumos (validade) WHERE validade IS NOT NULL;
