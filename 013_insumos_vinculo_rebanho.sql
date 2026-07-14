-- 013_insumos_vinculo_rebanho.sql
-- Vincula consumo de insumo (tipo='uso') a especie/lote/animal dos rebanhos
-- terrestres, sem tocar na logica de estoque ja em producao.
--
-- Uso esperado ao lancar consumo de racao para um animal/lote:
--   INSERT INTO movimentacoes_insumo
--     (insumo_id, fazenda_id, tipo, quantidade, especie, lote_id, animal_id, ...)
--   VALUES (..., 'uso', 50, 'bovinos', 12, NULL, ...)   -- consumo por lote
--   VALUES (..., 'uso', 3,  'bovinos', NULL, 963, ...)  -- consumo individual
--
-- Nota: 'lote_id' aqui = agrupamento de animais (curral/pasto), NAO confundir
-- com a coluna 'lote' (varchar) ja existente em insumos, que e lote/validade
-- do produto (ex: lote de vacina).

ALTER TABLE movimentacoes_insumo
  ADD COLUMN IF NOT EXISTS especie varchar(20),
  -- 'bovinos' | 'ovinos' | 'caprinos' | 'suinos' | NULL (uso nao pecuario)
  ADD COLUMN IF NOT EXISTS lote_id integer,
  -- id do lote/curral de animais (sem FK fixa: cada especie tem sua tabela)
  ADD COLUMN IF NOT EXISTS animal_id integer;
  -- id do animal individual (sem FK fixa: varia por especie)

COMMENT ON COLUMN movimentacoes_insumo.especie IS
  'Especie do rebanho consumidor, quando tipo = uso pecuario. NULL para uso agricola/geral.';
COMMENT ON COLUMN movimentacoes_insumo.lote_id IS
  'Lote/curral de animais (agrupamento), quando o consumo foi lancado por lote e nao por animal individual.';
COMMENT ON COLUMN movimentacoes_insumo.animal_id IS
  'Animal individual, quando o consumo foi lancado com essa granularidade. Mutuamente exclusivo com lote_id na pratica.';

CREATE INDEX IF NOT EXISTS idx_movim_insumo_especie   ON movimentacoes_insumo(especie);
CREATE INDEX IF NOT EXISTS idx_movim_insumo_lote      ON movimentacoes_insumo(lote_id) WHERE lote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movim_insumo_animal    ON movimentacoes_insumo(animal_id) WHERE animal_id IS NOT NULL;

SELECT 'Migration 013 (vinculo rebanho em movimentacoes_insumo) concluida!' AS resultado;
