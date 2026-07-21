"""
RuralCaixa — Roda migration_023_tipo_vinculo_participacoes.sql

Idempotente (so ADD COLUMN IF NOT EXISTS / CHECK constraint recriada).
Uso: DATABASE_URL="postgresql://..." python3 rodar_migration_023_v2.py
"""
import os
import psycopg2

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

SQL = """
ALTER TABLE participacoes_imovel
    ADD COLUMN IF NOT EXISTS tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'proprietario';

ALTER TABLE participacoes_imovel
    DROP CONSTRAINT IF EXISTS chk_tipo_vinculo;

ALTER TABLE participacoes_imovel
    ADD CONSTRAINT chk_tipo_vinculo CHECK (tipo_vinculo IN ('proprietario', 'administrador'));

CREATE INDEX IF NOT EXISTS idx_participacoes_imovel_tipo
    ON participacoes_imovel(imovel_id, tipo_vinculo)
    WHERE vigencia_fim IS NULL;
"""

def run():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute(SQL)
        conn.commit()
        print("OK -- migration 023 aplicada (tipo_vinculo em participacoes_imovel).")
    except Exception as e:
        conn.rollback()
        print(f"ERRO -- rollback: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run()
