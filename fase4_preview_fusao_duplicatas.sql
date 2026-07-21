-- ============================================================
-- FASE 4 (PREVIEW) — Fusão de subcontas duplicadas
-- ============================================================
-- ⚠️  NÃO RODAR AUTOMATICAMENTE. Isto é um RASCUNHO para revisão.
-- ⚠️  Faça backup da tabela `lancamentos` e `subcontas` antes de
--     rodar qualquer DELETE.
-- ⚠️  Rode cada bloco (1 grupo por vez), confira o resultado do
--     SELECT de conferência, e só então rode o DELETE daquele grupo.
--
-- Lógica de cada grupo:
--   1) Repontar lancamentos.subconta_id das duplicatas para a subconta canônica
--   2) Renomear a subconta canônica para um nome mais claro
--   3) Conferir que nenhum lançamento ainda aponta pra duplicata
--   4) Só então DELETE da(s) subconta(s) duplicada(s)
-- ============================================================

BEGIN;

-- ---------- GRUPO 1: S100 (4 subcontas -> 1) ----------
-- Canônica escolhida: 7fba3b74-5443-4168-a847-7bdc804cab7f ("S100")
UPDATE lancamentos SET subconta_id = '7fba3b74-5443-4168-a847-7bdc804cab7f'
WHERE subconta_id IN (
  '3450c0ee-ffdb-4fd5-aed7-01c12caf44a7', -- S 100
  'df5b474a-e526-402e-b59d-a09bc970f622', -- S100 - detergente neutro
  'b828ab10-2435-4f24-bc04-e95c2f1371f0'  -- S 100 sanitizante 5 L
);
UPDATE subcontas SET nome = 'S100 - Sanitizante para Ordenha'
WHERE id = '7fba3b74-5443-4168-a847-7bdc804cab7f';

-- Conferência (deve retornar 0 linhas antes do DELETE):
SELECT * FROM lancamentos WHERE subconta_id IN (
  '3450c0ee-ffdb-4fd5-aed7-01c12caf44a7','df5b474a-e526-402e-b59d-a09bc970f622',
  'b828ab10-2435-4f24-bc04-e95c2f1371f0'
);

-- DELETE FROM subcontas WHERE id IN (
--   '3450c0ee-ffdb-4fd5-aed7-01c12caf44a7','df5b474a-e526-402e-b59d-a09bc970f622',
--   'b828ab10-2435-4f24-bc04-e95c2f1371f0'
-- );

-- ---------- GRUPO 2: D1000 (2 -> 1) ----------
-- Canônica: eb941692-4a96-427f-bc82-fabc76916945 ("D1000")
UPDATE lancamentos SET subconta_id = 'eb941692-4a96-427f-bc82-fabc76916945'
WHERE subconta_id = 'fdfbb16b-f4b8-4c2a-84c4-84aeb059b12d';
UPDATE subcontas SET nome = 'D1000 - Sanitizante para Ordenha'
WHERE id = 'eb941692-4a96-427f-bc82-fabc76916945';

SELECT * FROM lancamentos WHERE subconta_id = 'fdfbb16b-f4b8-4c2a-84c4-84aeb059b12d';
-- DELETE FROM subcontas WHERE id = 'fdfbb16b-f4b8-4c2a-84c4-84aeb059b12d';

-- ---------- GRUPO 3: Óleo de Ordenha (2 -> 1) ----------
-- Canônica: efd00938-cb61-45e4-bd85-1f36fa401107 ("Oleo de ordenha")
UPDATE lancamentos SET subconta_id = 'efd00938-cb61-45e4-bd85-1f36fa401107'
WHERE subconta_id = 'd3ed7d3f-2161-4472-b6c6-71499a02a3da';
UPDATE subcontas SET nome = 'Óleo de Ordenha'
WHERE id = 'efd00938-cb61-45e4-bd85-1f36fa401107';

SELECT * FROM lancamentos WHERE subconta_id = 'd3ed7d3f-2161-4472-b6c6-71499a02a3da';
-- DELETE FROM subcontas WHERE id = 'd3ed7d3f-2161-4472-b6c6-71499a02a3da';

-- ---------- GRUPO 4: Agulhas Ocitocina (2 -> 1) ----------
-- Canônica: b1b81762-2aed-44d2-9949-4ff64c8a05a9 ("Agulhas ocitocina")
UPDATE lancamentos SET subconta_id = 'b1b81762-2aed-44d2-9949-4ff64c8a05a9'
WHERE subconta_id = 'bc14deac-9ddd-43c0-9739-aeaba20448f8';
UPDATE subcontas SET nome = 'Agulhas para Ocitocina'
WHERE id = 'b1b81762-2aed-44d2-9949-4ff64c8a05a9';

SELECT * FROM lancamentos WHERE subconta_id = 'bc14deac-9ddd-43c0-9739-aeaba20448f8';
-- DELETE FROM subcontas WHERE id = 'bc14deac-9ddd-43c0-9739-aeaba20448f8';

-- ---------- GRUPO 5: Dermasoft (2 -> 1) ----------
-- Canônica: 4f724a59-0873-4ac9-851d-f8d70ea132dc ("Dermasoft 5% Weizur")
UPDATE lancamentos SET subconta_id = '4f724a59-0873-4ac9-851d-f8d70ea132dc'
WHERE subconta_id = '4e2b6686-6c41-411b-a7da-5f6ce0622bf7';
UPDATE subcontas SET nome = 'Dermasoft'
WHERE id = '4f724a59-0873-4ac9-851d-f8d70ea132dc';

SELECT * FROM lancamentos WHERE subconta_id = '4e2b6686-6c41-411b-a7da-5f6ce0622bf7';
-- DELETE FROM subcontas WHERE id = '4e2b6686-6c41-411b-a7da-5f6ce0622bf7';

-- ---------- GRUPO 6: Consultoria Veterinária (2 -> 1) ----------
-- Canônica: d446c10e-3c20-4752-a5c6-cc4b1d194707 ("Pagamento consultoria veterinária")
UPDATE lancamentos SET subconta_id = 'd446c10e-3c20-4752-a5c6-cc4b1d194707'
WHERE subconta_id = '16b59444-4f8d-4b1d-a3bc-855feafc015c';
UPDATE subcontas SET nome = 'Consultoria Veterinária'
WHERE id = 'd446c10e-3c20-4752-a5c6-cc4b1d194707';

SELECT * FROM lancamentos WHERE subconta_id = '16b59444-4f8d-4b1d-a3bc-855feafc015c';
-- DELETE FROM subcontas WHERE id = '16b59444-4f8d-4b1d-a3bc-855feafc015c';

-- ============================================================
-- Nota sobre "Teste" (e4628672-11bf-44ab-8f6f-9930a9be421b):
-- Verificar se há lançamentos reais associados antes de decidir
-- entre excluir a subconta ou apenas ignorá-la nos relatórios.
--   SELECT * FROM lancamentos WHERE subconta_id = 'e4628672-11bf-44ab-8f6f-9930a9be421b';
-- ============================================================

-- Só faça COMMIT depois de rodar cada bloco, conferir os SELECTs,
-- e descomentar/rodar manualmente os DELETEs que quiser aplicar.
-- COMMIT;
ROLLBACK; -- placeholder de segurança: troque por COMMIT só quando tiver revisado tudo
