-- migration_022_fechamento_livro_caixa.sql
--
-- Tabela separada pra guardar o "Fechamento do mês": um snapshot
-- consolidado (1 linha por categoria/tipo) por cima dos lançamentos
-- brutos que já são sincronizados automaticamente em
-- livro_caixa_lancamentos (via trigger da migration_021).
--
-- Por que tabela separada e não substituir os lançamentos brutos:
-- assim o Livro Caixa detalhado continua íntegro (auditoria linha a
-- linha) e o fechamento é só uma visão resumida, sem risco de contar
-- o mesmo valor duas vezes na apuração anual.

CREATE TABLE IF NOT EXISTS livro_caixa_fechamentos (
    id           SERIAL PRIMARY KEY,
    imovel_id    INTEGER NOT NULL,
    ano_base     INTEGER NOT NULL,
    mes          INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    tipo         VARCHAR(10) NOT NULL,   -- 'receita' | 'despesa'
    categoria    VARCHAR(40) NOT NULL,
    total        NUMERIC(14,2) NOT NULL,
    fechado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (imovel_id, ano_base, mes, tipo, categoria)
);

CREATE INDEX IF NOT EXISTS idx_livro_caixa_fechamentos_periodo
    ON livro_caixa_fechamentos(imovel_id, ano_base, mes);
