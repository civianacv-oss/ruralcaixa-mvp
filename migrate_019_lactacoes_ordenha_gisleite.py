"""
RuralCaixa — Migração 019: Lactações + Ordenha (destrava importação GISleite)

Esta migration estava pendente e é o bloqueio real do import GISleite:

1. Completa `bovino_ordenha` (criada na migration 011) com as colunas que o
   endpoint /leiteiro/ordenha/importar já espera mas o banco nao tem:
   lactose_pct, es_pct, numero_ordenhas_dia, numero_controle_externo, fonte.

2. Cria `bovino_lactacoes` do zero — a tabela nao existe em NENHUMA
   migration anterior, apesar do endpoint /leiteiro/lactacoes/importar
   (app/routers/bovino.py) ja fazer INSERT nela.

3. Adiciona os indices UNIQUE de deduplicacao que faltam. Sem isso, o
   `except psycopg2.errors.UniqueViolation` no codigo de import NUNCA
   dispara — reimportar a mesma planilha GISleite duplicaria os dados
   em vez de cair na lista de "duplicados".
   - bovino_lactacoes: UNIQUE(animal_id, data_parto) — cheio (uma vaca nao
     pare duas vezes no mesmo dia, entao vale pra qualquer fonte).
   - bovino_ordenha: UNIQUE PARCIAL (animal_id, data) WHERE fonte='gisleite'
     — parcial e nao cheio, pra nao quebrar lancamentos manuais que podem
     ter multiplos turnos (manha/tarde) no mesmo dia. O import GISleite
     sempre grava turno='total', entao (animal_id, data) ja basta pra ele.

Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_019_lactacoes_ordenha_gisleite.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "019_lactacoes_ordenha_gisleite"

def log(msg): print(f"  {msg}")

def run():
    print("=" * 60)
    print(f"  RuralCaixa — Migração {MIGRATION_ID}")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id VARCHAR(100) PRIMARY KEY, description TEXT,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    conn.commit()

    cur.execute("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = %s", (MIGRATION_ID,))
    if cur.fetchone()["n"] > 0:
        log(f"[OK]  Migração '{MIGRATION_ID}' já aplicada.")
        conn.close(); return

    try:
        log("-- Completando bovino_ordenha (colunas do import GISleite)")
        cur.execute("""
            ALTER TABLE bovino_ordenha
                ADD COLUMN IF NOT EXISTS lactose_pct              NUMERIC(4,2),
                ADD COLUMN IF NOT EXISTS es_pct                    NUMERIC(4,2),
                ADD COLUMN IF NOT EXISTS numero_ordenhas_dia       SMALLINT,
                ADD COLUMN IF NOT EXISTS numero_controle_externo   INTEGER,
                ADD COLUMN IF NOT EXISTS fonte                     VARCHAR(20)
                    NOT NULL DEFAULT 'manual'
        """)
        # CHECK precisa ser separado: ADD COLUMN ... CHECK inline no mesmo
        # ALTER acima daria erro se a coluna ja existir de execucao anterior
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_bovino_ordenha_fonte'
                ) THEN
                    ALTER TABLE bovino_ordenha
                        ADD CONSTRAINT chk_bovino_ordenha_fonte
                        CHECK (fonte IN ('manual','gisleite'));
                END IF;
            END $$;
        """)
        conn.commit()
        log("[OK]  bovino_ordenha.lactose_pct / es_pct / numero_ordenhas_dia / numero_controle_externo / fonte")

        log("-- Dedup GISleite em bovino_ordenha (indice unico parcial)")
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_bovino_ordenha_gisleite_dedup
            ON bovino_ordenha(animal_id, data)
            WHERE fonte = 'gisleite'
        """)
        conn.commit()
        log("[OK]  idx_bovino_ordenha_gisleite_dedup (animal_id, data) WHERE fonte='gisleite'")

        log("-- Criando bovino_lactacoes (tabela nunca existiu no banco)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bovino_lactacoes (
                id                          SERIAL PRIMARY KEY,
                imovel_id                   INTEGER NOT NULL REFERENCES imoveis_rurais(id) ON DELETE RESTRICT,
                animal_id                   INTEGER NOT NULL REFERENCES bovino_animais(id) ON DELETE CASCADE,
                ordem_parto                 INTEGER,
                data_parto                  DATE NOT NULL,
                duracao_lactacao_dias       INTEGER,
                producao_total_litros       NUMERIC(9,2),
                producao_305d_litros        NUMERIC(9,2),
                producao_acumulada_gordura  NUMERIC(9,2),
                producao_acumulada_proteina NUMERIC(9,2),
                escore_corporal             NUMERIC(3,1),
                raca_registro               VARCHAR(60),
                ccs_media                   INTEGER,
                data_encerramento           DATE,
                causa_encerramento          VARCHAR(100),
                fonte                       VARCHAR(20) NOT NULL DEFAULT 'manual'
                    CHECK (fonte IN ('manual','gisleite')),
                observacoes                 TEXT,
                created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_bovino_lactacoes_animal_parto UNIQUE (animal_id, data_parto)
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_bovino_lactacoes_imovel
            ON bovino_lactacoes(imovel_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_bovino_lactacoes_animal
            ON bovino_lactacoes(animal_id)
        """)
        conn.commit()
        log("[OK]  bovino_lactacoes criada com UNIQUE(animal_id, data_parto)")

        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Completa bovino_ordenha + cria bovino_lactacoes + dedup GISleite"))
        conn.commit()

        print()
        print("✅  Migração 019 aplicada com sucesso!")
        print("    GISleite (ordenha + lactacoes) esta destravado.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
