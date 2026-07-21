-- migration_023_tipo_vinculo_participacoes.sql
--
-- Corrige a causa raiz do duplicado Fazenda Emboque: hoje não existe
-- nenhum jeito de vincular alguém a uma propriedade sem ser como
-- proprietário/cotitular. Isso adiciona uma distinção na tabela que já
-- existe (participacoes_imovel), sem quebrar nada que já usa ela.
--
-- tipo_vinculo:
--   'proprietario'  -> tem participação percentual real (conta pra soma de 100%)
--   'administrador' -> só acesso operacional, percentual sempre 0, não conta
--                      pra apuração societária/tributária

ALTER TABLE participacoes_imovel
    ADD COLUMN IF NOT EXISTS tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'proprietario';

ALTER TABLE participacoes_imovel
    DROP CONSTRAINT IF EXISTS chk_tipo_vinculo;

ALTER TABLE participacoes_imovel
    ADD CONSTRAINT chk_tipo_vinculo CHECK (tipo_vinculo IN ('proprietario', 'administrador'));

-- Índice pra listar administradores rápido por imóvel
CREATE INDEX IF NOT EXISTS idx_participacoes_imovel_tipo
    ON participacoes_imovel(imovel_id, tipo_vinculo)
    WHERE vigencia_fim IS NULL;
