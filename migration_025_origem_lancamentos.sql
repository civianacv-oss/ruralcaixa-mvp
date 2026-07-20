-- migration_025_origem_lancamentos.sql
--
-- Rastreabilidade de custo por unidade de produção (lote de rebanho, ciclo
-- de piscicultura, talhão de fruticultura etc.) nos lançamentos financeiros
-- — mesmo padrão já usado em movimentacoes_insumo (origem_modulo/tipo/id),
-- pra não precisar de uma coluna nova em lancamentos a cada módulo novo.
--
-- origem_modulo: 'bovino' | 'ovino' | 'caprino' | 'suino' | 'piscicultura' | 'fruticultura' | ...
-- origem_tipo:   'lote' | 'ciclo' | 'talhao' | ... (depende do módulo)
-- origem_id:     id da linha na tabela específica do módulo (ex: bovino_lotes.id)
--
-- Continua nullable — lançamentos sem unidade de produção específica (a
-- maioria histórica) seguem funcionando exatamente como hoje.

ALTER TABLE lancamentos
    ADD COLUMN IF NOT EXISTS origem_modulo VARCHAR(30),
    ADD COLUMN IF NOT EXISTS origem_tipo VARCHAR(30),
    ADD COLUMN IF NOT EXISTS origem_id INTEGER,
    ADD COLUMN IF NOT EXISTS origem_descricao TEXT;

CREATE INDEX IF NOT EXISTS idx_lancamentos_origem
    ON lancamentos(origem_modulo, origem_tipo, origem_id)
    WHERE origem_modulo IS NOT NULL;
