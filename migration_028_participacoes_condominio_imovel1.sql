-- migration_028_participacoes_condominio_imovel1.sql
--
-- Item #8 da lista de pendências: participacoes_imovel só tinha 1
-- registro (Fernando como 'administrador', percentual simbólico 0.01 --
-- só acesso, gravado via comando "vincular administrador" do bot). Os
-- percentuais reais de participação societária no Condomínio Rural
-- Coqueiro (imovel_id=1) nunca tinham sido gravados como registro de
-- verdade -- só existiam em notas.
--
-- Confirmado com o Cícero em 02/08:
--   Cícero    (produtor_id=1): 20%
--   Fernando  (produtor_id=4): 40%
--   Geodilson (produtor_id=5): 40%
--   (soma = 100%)
--
-- Fernando já tinha a linha 'administrador' (0.01%, só ACL) -- mantida
-- como está, intocada. Esta migration adiciona uma SEGUNDA linha pra
-- ele como 'proprietario' (participação societária real), junto com as
-- novas linhas de Cícero e Geodilson.
--
-- Idempotente: cada INSERT só roda se ainda não existir uma linha
-- 'proprietario' vigente (vigencia_fim IS NULL) pra aquele produtor
-- nesse imóvel -- seguro rodar mais de uma vez sem duplicar.

INSERT INTO participacoes_imovel
    (imovel_id, produtor_id, percentual, nome_participante, vigencia_inicio, tipo_vinculo)
SELECT 1, 1, 20, 'Cícero Viana de Souza', CURRENT_DATE, 'proprietario'
WHERE NOT EXISTS (
    SELECT 1 FROM participacoes_imovel
    WHERE imovel_id = 1 AND produtor_id = 1
      AND tipo_vinculo = 'proprietario' AND vigencia_fim IS NULL
);

INSERT INTO participacoes_imovel
    (imovel_id, produtor_id, percentual, nome_participante, vigencia_inicio, tipo_vinculo)
SELECT 1, 4, 40, 'Fernando Loyo Cadette', CURRENT_DATE, 'proprietario'
WHERE NOT EXISTS (
    SELECT 1 FROM participacoes_imovel
    WHERE imovel_id = 1 AND produtor_id = 4
      AND tipo_vinculo = 'proprietario' AND vigencia_fim IS NULL
);

INSERT INTO participacoes_imovel
    (imovel_id, produtor_id, percentual, nome_participante, vigencia_inicio, tipo_vinculo)
SELECT 1, 5, 40, 'Geodilson Alves Lima', CURRENT_DATE, 'proprietario'
WHERE NOT EXISTS (
    SELECT 1 FROM participacoes_imovel
    WHERE imovel_id = 1 AND produtor_id = 5
      AND tipo_vinculo = 'proprietario' AND vigencia_fim IS NULL
);
