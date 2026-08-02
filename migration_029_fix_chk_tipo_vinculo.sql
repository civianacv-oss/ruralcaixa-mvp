-- migration_029_fix_chk_tipo_vinculo.sql
--
-- Achado em 02/08 (revisão do item #8 -- participações do Condomínio
-- Rural Coqueiro): a constraint chk_tipo_vinculo só permitia
-- 'proprietario' e 'administrador', mas o código já grava/consulta
-- 'procurador' e 'contador' também:
--   - app/services/mensagem_handler.py: _processar_comando_vinculo()
--     ("vincular administrador/procurador/contador <CPF>") insere
--     qualquer um dos 3 em participacoes_imovel.tipo_vinculo
--   - app/db.py: listar_imoveis_acessiveis() documenta 'procurador',
--     'contador' e 'cotitular' como papéis válidos
--
-- Antes desta correção, "vincular procurador ..." ou "vincular contador
-- ..." pelo bot quebrava com erro de constraint (nunca testado em
-- produção até agora, por isso não tinha sido notado). 'cotitular'
-- incluído também -- já é mencionado como conceito na documentação
-- (db.py), mesmo sem nenhum INSERT real usando esse valor ainda.

ALTER TABLE participacoes_imovel DROP CONSTRAINT IF EXISTS chk_tipo_vinculo;

ALTER TABLE participacoes_imovel ADD CONSTRAINT chk_tipo_vinculo
    CHECK (tipo_vinculo IN ('proprietario', 'administrador', 'procurador', 'contador', 'cotitular'));
