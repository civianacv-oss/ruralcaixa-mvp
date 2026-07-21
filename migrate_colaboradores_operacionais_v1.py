"""
RuralCaixa — Migration: colaboradores_operacionais

Cadastro LEVE pra trabalhadores operacionais (ex: peao que alimenta o
rebanho) que precisam so reportar consumo de insumo pelo bot, sem virar
um "produtor" de verdade (sem CPF, sem login no app, sem participacao
societaria nem responsabilidade tributaria).

Diferenca pro "administrador" (participacoes_imovel.tipo_vinculo):
- administrador  -> tem cadastro de produtor completo (CPF), pode logar no
                    app, so nao tem participacao societaria
- colaborador_operacional -> so nome + telefone, NUNCA loga no app, so
                    interage via bot (Telegram/WhatsApp), autorizado
                    apenas pra reportar consumo de insumo daquele imovel

Idempotente. Uso: DATABASE_URL="postgresql://..." python3 migrate_colaboradores_operacionais_v1.py
"""
import os
import psycopg2

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

SQL = """
CREATE TABLE IF NOT EXISTS colaboradores_operacionais (
    id                  SERIAL PRIMARY KEY,
    imovel_id           INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE CASCADE,
    nome                VARCHAR(150) NOT NULL,
    telefone            VARCHAR(20) NOT NULL,
    telegram_chat_id    VARCHAR(30),
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_operacionais_imovel
    ON colaboradores_operacionais(imovel_id) WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_colaboradores_operacionais_telegram
    ON colaboradores_operacionais(telegram_chat_id) WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_colaboradores_operacionais_telefone
    ON colaboradores_operacionais(telefone) WHERE ativo = TRUE;
"""

def run():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute(SQL)
        conn.commit()
        print("OK -- tabela colaboradores_operacionais pronta.")
    except Exception as e:
        conn.rollback()
        print(f"ERRO -- rollback: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run()
