-- migration_031_salario_base_trabalhador.sql
-- Item #2 da lista de pendências (bot de folha de pagamento, 05/08).
-- esocial_trabalhadores já existia (fora do repo, sem migration
-- registrada) mas sem um campo de salário base -- o /FOLHA precisa de
-- um valor default pra não obrigar o produtor a digitar o salário toda
-- vez que lançar a folha do mês.

ALTER TABLE esocial_trabalhadores
    ADD COLUMN IF NOT EXISTS salario_base NUMERIC(14,2);

COMMENT ON COLUMN esocial_trabalhadores.salario_base IS
    'Salário base mensal -- usado como default no comando /FOLHA quando o produtor não informar um valor diferente naquele mês (ex: mês com hora extra).';

CREATE TABLE IF NOT EXISTS schema_migrations (
    id          VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (id, description)
VALUES (
    'migration_031_salario_base_trabalhador',
    'Adiciona esocial_trabalhadores.salario_base pro bot de folha de pagamento'
)
ON CONFLICT DO NOTHING;
