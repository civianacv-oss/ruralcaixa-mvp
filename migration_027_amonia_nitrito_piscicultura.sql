-- migration_026_amonia_nitrito_piscicultura.sql
--
-- Garante que registros_diarios_piscicultura tenha as colunas amonia_mg_l e
-- nitrito_mg_l. O cron de alertas (app/services/piscicultura_cron.py) já lia
-- essas colunas antes de existir qualquer caminho de escrita para elas
-- (painel/bot), o que sugere que possam já existir na produção a partir de
-- algum ajuste manual anterior -- por isso o IF NOT EXISTS, para ser seguro
-- rodar em qualquer ambiente.
--
-- Ver: scripts/patches_aplicados/patch_amonia_nitrito_piscicultura_v1.py

ALTER TABLE registros_diarios_piscicultura
    ADD COLUMN IF NOT EXISTS amonia_mg_l DECIMAL(5,2);

ALTER TABLE registros_diarios_piscicultura
    ADD COLUMN IF NOT EXISTS nitrito_mg_l DECIMAL(5,2);
