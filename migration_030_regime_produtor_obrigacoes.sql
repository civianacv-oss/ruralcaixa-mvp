-- migration_030_regime_produtor_obrigacoes.sql
-- Item #1 da lista de pendências (registrado 03/08, implementado 05/08):
-- obrigações acessórias automáticas após venda de leite pra laticínio.
--
-- Faltava um campo único e confiável pra dizer se o produtor é PF comum,
-- PJ, ou Segurado Especial -- reinf_configuracao.tipo_contribuinte (por
-- imóvel) só cobre PF/PJ/simples_nacional, e esocial_config não tem esse
-- dado. Sem isso, não dá pra decidir automaticamente entre gerar um
-- reinf_r2055 (EFD-Reinf) ou um esocial_s1260 (eSocial) na venda de leite.
--
-- Também adiciona uma coluna de rastreamento por UUID em reinf_r2055 e
-- esocial_s1260 -- essas tabelas já tinham colunas de link pra outras
-- origens (acerto_id inteiro em reinf_r2055, lancamento_id inteiro em
-- esocial_s1260), mas ambas com tipo INTEGER, incompatível com o UUID
-- usado pela tabela `lancamentos` do fluxo do bot (ver nota de
-- continuidade de 03-04/08: duas tabelas de lançamento paralelas,
-- lancamentos=UUID vs livro_caixa_lancamentos=integer -- lancamento_id
-- em esocial_s1260 parece apontar pra essa segunda). Em vez de forçar um
-- UUID dentro de uma coluna integer (quebraria) ou reaproveitar uma
-- coluna com semântica diferente, adiciona um campo próprio.

ALTER TABLE produtores
    ADD COLUMN IF NOT EXISTS regime_produtor VARCHAR(20) NOT NULL DEFAULT 'pf_comum';
    -- 'pf_comum' | 'pj' | 'segurado_especial'

COMMENT ON COLUMN produtores.regime_produtor IS
    'Regime do produtor pra decidir a obrigação acessória na comercialização: pf_comum/pj -> EFD-Reinf (reinf_r2055); segurado_especial -> eSocial (esocial_s1260). Default pf_comum -- CONFIRMAR manualmente o valor real de cada produtor antes de confiar no gatilho automático.';

CREATE INDEX IF NOT EXISTS idx_produtores_regime ON produtores(regime_produtor);

ALTER TABLE reinf_r2055
    ADD COLUMN IF NOT EXISTS lancamento_uuid VARCHAR(36);
CREATE INDEX IF NOT EXISTS idx_reinf_r2055_lancamento_uuid ON reinf_r2055(lancamento_uuid);
COMMENT ON COLUMN reinf_r2055.lancamento_uuid IS
    'FK textual para lancamentos.id (UUID) -- preenchido quando o R-2055 é gerado automaticamente a partir de uma venda de leite detectada pelo bot. Independente de acerto_id (que aponta pra contratos_acertos).';

ALTER TABLE esocial_s1260
    ADD COLUMN IF NOT EXISTS origem           VARCHAR(20) NOT NULL DEFAULT 'manual',
    -- 'manual' | 'venda_leite_bot'
    ADD COLUMN IF NOT EXISTS lancamento_uuid  VARCHAR(36),
    ADD COLUMN IF NOT EXISTS observacoes      TEXT;
CREATE INDEX IF NOT EXISTS idx_esocial_s1260_lancamento_uuid ON esocial_s1260(lancamento_uuid);
COMMENT ON COLUMN esocial_s1260.lancamento_uuid IS
    'FK textual para lancamentos.id (UUID) -- preenchido quando o S-1260 é gerado automaticamente a partir de uma venda de leite detectada pelo bot (produtor Segurado Especial). Independente de lancamento_id (que parece apontar pra livro_caixa_lancamentos, integer).';

INSERT INTO schema_migrations (id, description)
VALUES (
    'migration_030_regime_produtor_obrigacoes',
    'Adiciona produtores.regime_produtor + colunas lancamento_uuid em reinf_r2055/esocial_s1260 para o gatilho automático de obrigação acessória na venda de leite'
)
ON CONFLICT DO NOTHING;
