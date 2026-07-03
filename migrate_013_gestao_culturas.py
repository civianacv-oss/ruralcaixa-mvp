"""
RuralCaixa — Migração 013: Gestão de Culturas
Catálogo de culturas, sugestões de produtores, protocolos de cultivo,
casos de sucesso, avaliações, tags, fórum por cultura e cache de clima (INMET).

Idempotente via schema_migrations.
Uso: DATABASE_URL="postgresql://..." python3 migrate_013_gestao_culturas.py
"""
import os, sys, psycopg2, psycopg2.extras
from datetime import datetime

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
MIGRATION_ID = "013_gestao_culturas"

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
        log(f"  [OK]  Migração '{MIGRATION_ID}' já aplicada.")
        conn.close(); return

    try:
        log("-- Criando tabelas de Culturas")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS culturas (
                id                     SERIAL PRIMARY KEY,
                nome                   VARCHAR(100) NOT NULL,
                nome_cientifico        VARCHAR(200),
                tipo                   VARCHAR(50) NOT NULL DEFAULT 'temporaria',
                ciclo_dias             INTEGER,
                epoca_plantio_inicio   DATE,
                epoca_plantio_fim      DATE,
                epoca_colheita_inicio  DATE,
                epoca_colheita_fim     DATE,
                temperatura_minima     DECIMAL(5,2),
                temperatura_maxima     DECIMAL(5,2),
                temperatura_ideal      DECIMAL(5,2),
                precipitacao_minima    DECIMAL(8,2),
                precipitacao_maxima    DECIMAL(8,2),
                altitude_minima        INTEGER,
                altitude_maxima        INTEGER,
                produtividade_media    DECIMAL(10,2),
                unidade_produtividade  VARCHAR(20),
                observacoes            TEXT,
                status                 VARCHAR(20) NOT NULL DEFAULT 'ativo',
                created_by             INTEGER REFERENCES produtores(id),
                created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  culturas")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS sugestoes_culturas (
                id                  SERIAL PRIMARY KEY,
                produtor_id         INTEGER REFERENCES produtores(id),
                imovel_id           INTEGER REFERENCES imoveis_rurais(id),
                nome                VARCHAR(100) NOT NULL,
                descricao           TEXT,
                motivo              TEXT,
                experiencia         TEXT,
                resultados_esperados TEXT,
                status              VARCHAR(20) NOT NULL DEFAULT 'pendente',
                data_sugestao       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                data_analise        TIMESTAMPTZ,
                analisado_por       INTEGER REFERENCES produtores(id),
                parecer             TEXT,
                cultura_id          INTEGER REFERENCES culturas(id),
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  sugestoes_culturas")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS protocolos_cultivo (
                id                   SERIAL PRIMARY KEY,
                cultura_id           INTEGER REFERENCES culturas(id),
                produtor_id          INTEGER REFERENCES produtores(id),
                titulo               VARCHAR(200) NOT NULL,
                descricao            TEXT,
                tipo                 VARCHAR(50) NOT NULL DEFAULT 'tratos_culturais',
                dificuldade          VARCHAR(20) DEFAULT 'intermediario',
                tempo_execucao       VARCHAR(50),
                epoca_aplicacao      TEXT,
                materiais            TEXT,
                equipamentos         TEXT,
                passos               JSONB,
                dicas                TEXT,
                resultados_esperados TEXT,
                status               VARCHAR(20) NOT NULL DEFAULT 'publicado',
                nivel_confianca      INTEGER NOT NULL DEFAULT 3,
                fonte                VARCHAR(200),
                tags                 TEXT[],
                created_by           INTEGER REFERENCES produtores(id),
                created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  protocolos_cultivo")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS praticas_sucesso (
                id               SERIAL PRIMARY KEY,
                produtor_id      INTEGER REFERENCES produtores(id),
                imovel_id        INTEGER REFERENCES imoveis_rurais(id),
                cultura_id       INTEGER REFERENCES culturas(id),
                titulo           VARCHAR(200) NOT NULL,
                descricao        TEXT,
                desafio          TEXT,
                solucao          TEXT,
                resultados       TEXT,
                metricas         JSONB,
                periodo_inicio   DATE,
                periodo_fim      DATE,
                area_hectare     DECIMAL(10,2),
                producao_total   DECIMAL(12,2),
                produtividade    DECIMAL(10,2),
                custo_total      DECIMAL(12,2),
                receita_total    DECIMAL(12,2),
                lucro            DECIMAL(12,2),
                fotos            TEXT[],
                videos           TEXT[],
                status           VARCHAR(20) NOT NULL DEFAULT 'publicado',
                destaque         BOOLEAN NOT NULL DEFAULT FALSE,
                aprovado_por     INTEGER REFERENCES produtores(id),
                data_aprovacao   TIMESTAMPTZ,
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        log("  [OK]  praticas_sucesso")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS avaliacoes_protocolos (
                id            SERIAL PRIMARY KEY,
                protocolo_id  INTEGER REFERENCES protocolos_cultivo(id) ON DELETE CASCADE,
                produtor_id   INTEGER REFERENCES produtores(id),
                nota          INTEGER CHECK (nota BETWEEN 1 AND 5),
                comentario    TEXT,
                utilizou      BOOLEAN NOT NULL DEFAULT FALSE,
                resultado     TEXT,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (protocolo_id, produtor_id)
            )
        """)
        log("  [OK]  avaliacoes_protocolos")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS tags (
                id          SERIAL PRIMARY KEY,
                nome        VARCHAR(50) UNIQUE NOT NULL,
                categoria   VARCHAR(50),
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cultura_tags (
                cultura_id INTEGER REFERENCES culturas(id) ON DELETE CASCADE,
                tag_id     INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (cultura_id, tag_id)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS protocolo_tags (
                protocolo_id INTEGER REFERENCES protocolos_cultivo(id) ON DELETE CASCADE,
                tag_id       INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (protocolo_id, tag_id)
            )
        """)
        log("  [OK]  tags / cultura_tags / protocolo_tags")
        conn.commit()

        log("-- Criando tabelas de Fórum por Cultura")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS forum_topicos (
                id                SERIAL PRIMARY KEY,
                cultura_id        INTEGER REFERENCES culturas(id) ON DELETE CASCADE,
                produtor_id       INTEGER REFERENCES produtores(id),
                titulo            VARCHAR(200) NOT NULL,
                conteudo          TEXT NOT NULL,
                visualizacoes     INTEGER NOT NULL DEFAULT 0,
                curtidas          INTEGER NOT NULL DEFAULT 0,
                fixado            BOOLEAN NOT NULL DEFAULT FALSE,
                resolvido         BOOLEAN NOT NULL DEFAULT FALSE,
                resposta_solucao_id INTEGER,
                tags              TEXT[],
                data_criacao      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                ultima_atividade  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS forum_respostas (
                id           SERIAL PRIMARY KEY,
                topico_id    INTEGER REFERENCES forum_topicos(id) ON DELETE CASCADE,
                produtor_id  INTEGER REFERENCES produtores(id),
                conteudo     TEXT NOT NULL,
                curtidas     INTEGER NOT NULL DEFAULT 0,
                resolucao    BOOLEAN NOT NULL DEFAULT FALSE,
                data_criacao TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        # Evita curtidas duplicadas do mesmo produtor no mesmo tópico/resposta
        cur.execute("""
            CREATE TABLE IF NOT EXISTS forum_curtidas (
                id           SERIAL PRIMARY KEY,
                produtor_id  INTEGER REFERENCES produtores(id),
                topico_id    INTEGER REFERENCES forum_topicos(id) ON DELETE CASCADE,
                resposta_id  INTEGER REFERENCES forum_respostas(id) ON DELETE CASCADE,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (produtor_id, topico_id, resposta_id)
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_forum_topicos_cultura ON forum_topicos(cultura_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_forum_respostas_topico ON forum_respostas(topico_id)")
        log("  [OK]  forum_topicos / forum_respostas / forum_curtidas")
        conn.commit()

        log("-- Criando cache de previsão climática (INMET)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clima_cache (
                id             SERIAL PRIMARY KEY,
                codigo_ibge    VARCHAR(10) NOT NULL,
                municipio      VARCHAR(120),
                uf             VARCHAR(2),
                dados          JSONB NOT NULL,
                fonte          VARCHAR(30) NOT NULL DEFAULT 'inmet',
                atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (codigo_ibge)
            )
        """)
        log("  [OK]  clima_cache")
        conn.commit()

        # ── Registrar ────────────────────────────────────────────────────
        cur.execute("""
            INSERT INTO schema_migrations (id, description)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (MIGRATION_ID, "Gestão de Culturas: catálogo, sugestões, protocolos, casos de sucesso, fórum, cache climático INMET"))
        conn.commit()

        print()
        print("✅  Migração 013 aplicada com sucesso!")
        for t in ["culturas", "sugestoes_culturas", "protocolos_cultivo", "praticas_sucesso",
                  "avaliacoes_protocolos", "tags", "cultura_tags", "protocolo_tags",
                  "forum_topicos", "forum_respostas", "forum_curtidas", "clima_cache"]:
            print(f"    ✓ {t}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  ERRO — rollback: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    run()
