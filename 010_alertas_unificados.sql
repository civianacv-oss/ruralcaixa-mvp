-- ============================================================
-- RuralCaixa — 010_alertas_unificados.sql
-- Sistema unificado de alertas para todos os módulos.
-- Segue o mesmo padrão de ovino_alertas / caprino_alertas.
-- ============================================================

-- ── 1. SUÍNOS: adicionar colunas faltantes em suino_alertas ──
-- A tabela já existe (003_suino_schema.sql).
-- Adicionamos: titulo, nivel, notificado_em, resolvido_em, hash_unicidade.

ALTER TABLE suino_alertas
    ADD COLUMN IF NOT EXISTS titulo         TEXT,
    ADD COLUMN IF NOT EXISTS nivel          VARCHAR(10) NOT NULL DEFAULT 'aviso'
                                                CHECK (nivel IN ('info','aviso','critico')),
    ADD COLUMN IF NOT EXISTS notificado_em  TIMESTAMP,
    ADD COLUMN IF NOT EXISTS resolvido_em   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS hash_unicidade VARCHAR(64) UNIQUE;

-- Preenche titulo a partir de mensagem para registros existentes
UPDATE suino_alertas SET titulo = LEFT(mensagem, 120) WHERE titulo IS NULL;

-- ── 2. BOVINOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bovino_alertas (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    animal_id       INTEGER,                        -- NULL = alerta de lote/rebanho
    lote_id         INTEGER,
    tipo_alerta     VARCHAR(60) NOT NULL,
    titulo          TEXT NOT NULL,
    descricao       TEXT,
    nivel           VARCHAR(10) NOT NULL DEFAULT 'aviso'
                        CHECK (nivel IN ('info','aviso','critico')),
    prioridade      VARCHAR(10) NOT NULL DEFAULT 'media'
                        CHECK (prioridade IN ('alta','media','baixa')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','enviado_whatsapp','resolvido','ignorado')),
    data_referencia DATE,
    data_vencimento DATE,
    origem_evento   VARCHAR(40) DEFAULT 'cron',
    notificado_em   TIMESTAMP,
    resolvido_em    TIMESTAMP,
    hash_unicidade  VARCHAR(64) UNIQUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bovino_alertas_imovel  ON bovino_alertas(imovel_id, status);
CREATE INDEX IF NOT EXISTS idx_bovino_alertas_venc    ON bovino_alertas(data_vencimento, status);

-- ── 3. AGRICULTURA ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agricultura_alertas (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    safra_id        INTEGER,
    tipo_alerta     VARCHAR(60) NOT NULL,
    titulo          TEXT NOT NULL,
    descricao       TEXT,
    nivel           VARCHAR(10) NOT NULL DEFAULT 'aviso'
                        CHECK (nivel IN ('info','aviso','critico')),
    prioridade      VARCHAR(10) NOT NULL DEFAULT 'media'
                        CHECK (prioridade IN ('alta','media','baixa')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','enviado_whatsapp','resolvido','ignorado')),
    data_referencia DATE,
    data_vencimento DATE,
    origem_evento   VARCHAR(40) DEFAULT 'cron',
    notificado_em   TIMESTAMP,
    resolvido_em    TIMESTAMP,
    hash_unicidade  VARCHAR(64) UNIQUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agri_alertas_imovel  ON agricultura_alertas(imovel_id, status);
CREATE INDEX IF NOT EXISTS idx_agri_alertas_venc    ON agricultura_alertas(data_vencimento, status);

-- ── 4. AÇAÍ ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acai_alertas (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    talhao_id       INTEGER,
    tipo_alerta     VARCHAR(60) NOT NULL,
    titulo          TEXT NOT NULL,
    descricao       TEXT,
    nivel           VARCHAR(10) NOT NULL DEFAULT 'aviso'
                        CHECK (nivel IN ('info','aviso','critico')),
    prioridade      VARCHAR(10) NOT NULL DEFAULT 'media'
                        CHECK (prioridade IN ('alta','media','baixa')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','enviado_whatsapp','resolvido','ignorado')),
    data_referencia DATE,
    data_vencimento DATE,
    origem_evento   VARCHAR(40) DEFAULT 'cron',
    notificado_em   TIMESTAMP,
    resolvido_em    TIMESTAMP,
    hash_unicidade  VARCHAR(64) UNIQUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_acai_alertas_imovel  ON acai_alertas(imovel_id, status);
CREATE INDEX IF NOT EXISTS idx_acai_alertas_venc    ON acai_alertas(data_vencimento, status);

-- ── 5. PISCICULTURA ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS piscicultura_alertas (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL,
    ciclo_id        INTEGER,
    tipo_alerta     VARCHAR(60) NOT NULL,
    titulo          TEXT NOT NULL,
    descricao       TEXT,
    nivel           VARCHAR(10) NOT NULL DEFAULT 'aviso'
                        CHECK (nivel IN ('info','aviso','critico')),
    prioridade      VARCHAR(10) NOT NULL DEFAULT 'media'
                        CHECK (prioridade IN ('alta','media','baixa')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','enviado_whatsapp','resolvido','ignorado')),
    data_referencia DATE,
    data_vencimento DATE,
    origem_evento   VARCHAR(40) DEFAULT 'cron',
    notificado_em   TIMESTAMP,
    resolvido_em    TIMESTAMP,
    hash_unicidade  VARCHAR(64) UNIQUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_piscic_alertas_imovel  ON piscicultura_alertas(imovel_id, status);
CREATE INDEX IF NOT EXISTS idx_piscic_alertas_venc    ON piscicultura_alertas(data_vencimento, status);

-- ── Triggers updated_at (idempotente) ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bovino_alertas_upd') THEN
    CREATE TRIGGER trg_bovino_alertas_upd
      BEFORE UPDATE ON bovino_alertas
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agri_alertas_upd') THEN
    CREATE TRIGGER trg_agri_alertas_upd
      BEFORE UPDATE ON agricultura_alertas
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_acai_alertas_upd') THEN
    CREATE TRIGGER trg_acai_alertas_upd
      BEFORE UPDATE ON acai_alertas
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_piscic_alertas_upd') THEN
    CREATE TRIGGER trg_piscic_alertas_upd
      BEFORE UPDATE ON piscicultura_alertas
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
