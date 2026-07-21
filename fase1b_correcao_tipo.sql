-- ============================================================
-- CORREÇÃO DE TIPO — 14 itens que estavam RECEITA/INVESTIMENTO
-- mas são DESPESA operacional (confirmado por revisão manual)
-- ============================================================
-- Isso é CRÍTICO para o IOFC: esses itens hoje inflam a receita
-- e/ou somem do custo de alimentação. Rodar ANTES ou JUNTO com
-- a migration de codigo_conta (fase1_migration_codigo_conta.sql).

BEGIN;

UPDATE subcontas SET tipo = 'DESPESA' WHERE id IN (
  '1863b00f-009d-4dd4-a514-85f4fa86b3f1', -- 03 Tubos de 50 mm para resfriamento de vacas
  '2e844c3a-4cd5-435b-9588-c8afa9a47288', -- Ventilador de resfriamento de vacas
  'e57499c9-861f-4793-b65b-79e85209d120', -- compra de fertilizante
  '35ffe0a6-4dc4-4933-a2b0-8a031791a99b', -- Compra de Cama de Vacas
  'fa93dfbd-3a3b-4ea0-a46e-1157b7ba39dd', -- Insumos para separar a cama das vacas
  '69921897-0623-4857-9738-a09306d27076', -- Aplicação de roundup na roça de milho
  '16e67909-b85e-4eea-b0d4-9703c8da9fe4', -- Fos 90 - mineral Leite
  '5ed3ffd7-0864-496f-a449-1ee67d937135', -- Leite em po bezerros CCPR
  '2b4b4fbd-31e0-4cc0-b971-28aa4ae254aa', -- Leite em pó bezerras
  '0b4f1ed3-c0f7-45a1-8a6e-23980410fcee', -- Nucleo de leite CCPR
  '2a829341-e86d-47b4-b5cf-a60d997d28ed', -- Nucleo Leite
  '26b09133-6045-4ddc-8779-48a8363189c8', -- Nucleo Vaca de Leite
  '8972a44c-d246-43b7-a344-09f5f511d198', -- PAGAMENTO DE 10 SC DE SOJA
  'cd5861c8-fdfb-4078-89e7-181c16a7e1e4'  -- Pagamento de 5 sacos de soja
);

-- Conferência: deve retornar exatamente 14
SELECT COUNT(*) AS total_corrigidos FROM subcontas WHERE tipo = 'DESPESA' AND id IN (
  '1863b00f-009d-4dd4-a514-85f4fa86b3f1','2e844c3a-4cd5-435b-9588-c8afa9a47288',
  'e57499c9-861f-4793-b65b-79e85209d120','35ffe0a6-4dc4-4933-a2b0-8a031791a99b',
  'fa93dfbd-3a3b-4ea0-a46e-1157b7ba39dd','69921897-0623-4857-9738-a09306d27076',
  '16e67909-b85e-4eea-b0d4-9703c8da9fe4','5ed3ffd7-0864-496f-a449-1ee67d937135',
  '2b4b4fbd-31e0-4cc0-b971-28aa4ae254aa','0b4f1ed3-c0f7-45a1-8a6e-23980410fcee',
  '2a829341-e86d-47b4-b5cf-a60d997d28ed','26b09133-6045-4ddc-8779-48a8363189c8',
  '8972a44c-d246-43b7-a344-09f5f511d198','cd5861c8-fdfb-4078-89e7-181c16a7e1e4'
);

-- Se retornou 14 acima, prossiga:
-- COMMIT;   -- <-- descomente e rode manualmente após conferir

-- IMPORTANTE: 'Teste' (e4628672-11bf-44ab-8f6f-9930a9be421b) foi propositalmente
-- deixado FORA desta correção. É provavelmente um registro de teste/lixo, não
-- um erro de categorização real. Ver nota na Fase 4 sobre exclusão.
