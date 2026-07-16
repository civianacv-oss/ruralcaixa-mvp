-- Migration 022: padroniza valores de destino/tipo em *_abates para o
-- mesmo vocabulario usado pelo frontend (railway.ts / baixaForm):
--   venda | morte | abate_proprio | abate_frigorif | doacao | permuta
--
-- Motivo: ovino_abates.destino, bovino_abates.tipo, caprino_abates.destino
-- e suino_abates.destino tinham 3 vocabularios diferentes (e caprino/suino
-- nao tinham CHECK nenhuma), causando erro 500 (CheckViolation) ao
-- registrar baixa de ovino e na maioria dos casos de bovino.
--
-- Rodar com o banco em producao (Railway > Postgres > Console):
--   psql $DATABASE_URL -f 022_padroniza_destino_abates.sql

BEGIN;

-- ── 1. Normaliza dados existentes para o vocabulario novo ──────────────────
-- (evita que linhas antigas violem a constraint nova)

-- ovino_abates.destino: frigorifico/consumo_proprio/venda_direta/feira -> novo vocabulario
UPDATE ovino_abates SET destino = CASE destino
  WHEN 'frigorifico'      THEN 'abate_frigorif'
  WHEN 'consumo_proprio'  THEN 'abate_proprio'
  WHEN 'venda_direta'     THEN 'venda'
  WHEN 'feira'            THEN 'venda'
  ELSE destino
END
WHERE destino IN ('frigorifico', 'consumo_proprio', 'venda_direta', 'feira');

-- bovino_abates.tipo: abate_proprio/venda_frigorif/venda_direto/morte -> novo vocabulario
UPDATE bovino_abates SET tipo = CASE tipo
  WHEN 'venda_frigorif' THEN 'abate_frigorif'
  WHEN 'venda_direto'   THEN 'venda'
  ELSE tipo  -- 'abate_proprio' e 'morte' ja batem
END
WHERE tipo IN ('venda_frigorif', 'venda_direto');

-- caprino_abates e suino_abates nao tinham CHECK, entao podem ter qualquer
-- texto solto. Mapeia os valores conhecidos e joga o resto em 'venda'
-- (revisar manualmente depois se sobrar algo estranho).
UPDATE caprino_abates SET destino = CASE lower(trim(destino))
  WHEN 'frigorifico'      THEN 'abate_frigorif'
  WHEN 'consumo_proprio'  THEN 'abate_proprio'
  WHEN 'venda_direta'     THEN 'venda'
  WHEN 'venda'            THEN 'venda'
  WHEN 'morte'            THEN 'morte'
  WHEN 'doacao'           THEN 'doacao'
  WHEN 'permuta'          THEN 'permuta'
  ELSE 'venda'
END
WHERE destino IS NOT NULL
  AND destino NOT IN ('venda','morte','abate_proprio','abate_frigorif','doacao','permuta');

UPDATE suino_abates SET destino = CASE lower(trim(destino))
  WHEN 'frigorifico'      THEN 'abate_frigorif'
  WHEN 'consumo_proprio'  THEN 'abate_proprio'
  WHEN 'venda_direta'     THEN 'venda'
  WHEN 'venda'            THEN 'venda'
  WHEN 'morte'            THEN 'morte'
  WHEN 'doacao'           THEN 'doacao'
  WHEN 'permuta'          THEN 'permuta'
  ELSE 'venda'
END
WHERE destino IS NOT NULL
  AND destino NOT IN ('venda','morte','abate_proprio','abate_frigorif','doacao','permuta');

-- ── 2. Substitui/cria as CHECK constraints com o vocabulario padronizado ───

ALTER TABLE ovino_abates DROP CONSTRAINT IF EXISTS ovino_abates_destino_check;
ALTER TABLE ovino_abates ADD CONSTRAINT ovino_abates_destino_check
  CHECK (destino IS NULL OR destino IN ('venda','morte','abate_proprio','abate_frigorif','doacao','permuta'));

ALTER TABLE bovino_abates DROP CONSTRAINT IF EXISTS bovino_abates_tipo_check;
ALTER TABLE bovino_abates ADD CONSTRAINT bovino_abates_tipo_check
  CHECK (tipo IN ('venda','morte','abate_proprio','abate_frigorif','doacao','permuta'));

ALTER TABLE caprino_abates DROP CONSTRAINT IF EXISTS caprino_abates_destino_check;
ALTER TABLE caprino_abates ADD CONSTRAINT caprino_abates_destino_check
  CHECK (destino IS NULL OR destino IN ('venda','morte','abate_proprio','abate_frigorif','doacao','permuta'));

ALTER TABLE suino_abates DROP CONSTRAINT IF EXISTS suino_abates_destino_check;
ALTER TABLE suino_abates ADD CONSTRAINT suino_abates_destino_check
  CHECK (destino IS NULL OR destino IN ('venda','morte','abate_proprio','abate_frigorif','doacao','permuta'));

COMMIT;

-- ── 3. Conferencia rapida (rode depois do commit) ──────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname IN ('ovino_abates_destino_check','bovino_abates_tipo_check',
--                    'caprino_abates_destino_check','suino_abates_destino_check');
