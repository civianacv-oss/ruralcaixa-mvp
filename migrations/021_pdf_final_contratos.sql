-- migrations/021_pdf_final_contratos.sql
-- Guarda o PDF final (convertido do docx editado) direto no banco, servido
-- via endpoint proprio. pdf_url ja existia na tabela mas nunca era usado --
-- agora aponta pra rota que serve esse conteudo.

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS pdf_bytes BYTEA;
