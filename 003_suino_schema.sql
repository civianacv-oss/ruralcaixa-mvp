-- ============================================================
-- RuralCaixa — Módulo Suíno
-- Migration: 003_suino_schema.sql
-- Compatível com o PostgreSQL existente no Railway
-- ============================================================

-- ── ANIMAIS ─────────────────────────────────────────────────
CREATE TABLE suino_animais (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE RESTRICT,
    brinco          VARCHAR(30) NOT NULL,          -- identificação de campo / brinco eletrônico
    nome            VARCHAR(60),                   -- opcional
    raca            VARCHAR(60),                   -- ex: Landrace, Large White, Duroc, Pietrain, AGPIC 337
    sexo            CHAR(1) NOT NULL CHECK (sexo IN ('M','F')),
    categoria       VARCHAR(20) NOT NULL DEFAULT 'leitao'
                        CHECK (categoria IN ('leitao','recria','terminacao','matriz','cachaço','descarte')),
    data_nascimento DATE,
    peso_nascimento NUMERIC(6,2),                  -- kg
    mae_id          INTEGER REFERENCES suino_animais(id),
    pai_id          INTEGER REFERENCES suino_animais(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo','vendido','abatido','morto','descartado')),
    lote_id         INTEGER,                       -- FK adicionada após criar tabela lotes
    observacoes     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (imovel_id, brinco)
);

-- ── LOTES ───────────────────────────────────────────────────
CREATE TABLE suino_lotes (
    id          SERIAL PRIMARY KEY,
    imovel_id   INTEGER NOT NULL REFERENCES imoveis(id),
    nome        VARCHAR(60) NOT NULL,              -- ex: "Terminação Lote 3 – Jun/26"
    fase        VARCHAR(20) NOT NULL DEFAULT 'leitao'
                    CHECK (fase IN ('maternidade','leitao','creche','recria','terminacao','gestacao','reproducao','descarte')),
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim    DATE,
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE suino_animais
    ADD CONSTRAINT fk_suino_lote FOREIGN KEY (lote_id) REFERENCES suino_lotes(id);

-- ── PESAGENS ────────────────────────────────────────────────
CREATE TABLE suino_pesagens (
    id           SERIAL PRIMARY KEY,
    animal_id    INTEGER NOT NULL REFERENCES suino_animais(id) ON DELETE CASCADE,
    data_pesagem DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_kg      NUMERIC(6,2) NOT NULL,
    motivo       VARCHAR(30) DEFAULT 'rotina'
                     CHECK (motivo IN ('nascimento','desmame','entrada_lote','rotina','pre_abate','abate')),
    registrado_por VARCHAR(80),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── EVENTOS DE REPRODUÇÃO ───────────────────────────────────
CREATE TABLE suino_reproducao (
    id               SERIAL PRIMARY KEY,
    imovel_id        INTEGER NOT NULL REFERENCES imoveis(id),
    tipo             VARCHAR(30) NOT NULL
                         CHECK (tipo IN ('cobertura','inseminacao','parto','aborto','desmame','retorno_cio')),
    data_evento      DATE NOT NULL,
    matriz_id        INTEGER REFERENCES suino_animais(id),
    cachaço_id       INTEGER REFERENCES suino_animais(id),
    leitoes_vivos    INTEGER DEFAULT 0,
    leitoes_mortos   INTEGER DEFAULT 0,
    leitoes_mumificados INTEGER DEFAULT 0,
    peso_medio_leitao NUMERIC(5,2),               -- kg ao nascimento
    observacoes      TEXT,
    registrado_por   VARCHAR(80),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── SAÚDE / MANEJO SANITÁRIO ────────────────────────────────
CREATE TABLE suino_saude (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    animal_id       INTEGER REFERENCES suino_animais(id),   -- NULL = lote inteiro
    lote_id         INTEGER REFERENCES suino_lotes(id),
    tipo            VARCHAR(30) NOT NULL
                        CHECK (tipo IN ('vacinacao','vermifugacao','tratamento','exame','biosseguridade','outro')),
    data_evento     DATE NOT NULL DEFAULT CURRENT_DATE,
    produto         VARCHAR(120),                  -- ex: "Circovac", "Suvaxyn"
    dose_ml         NUMERIC(6,2),
    via             VARCHAR(20),                   -- IM, SC, VO, intranasal
    proximo_em      DATE,
    resultado       VARCHAR(60),
    registrado_por  VARCHAR(80),
    observacoes     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── ABATES / SAÍDAS ─────────────────────────────────────────
CREATE TABLE suino_abates (
    id              SERIAL PRIMARY KEY,
    animal_id       INTEGER NOT NULL REFERENCES suino_animais(id),
    data_abate      DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_vivo_kg    NUMERIC(6,2),
    peso_carcaca_kg NUMERIC(6,2),
    rendimento_pct  NUMERIC(5,2) GENERATED ALWAYS AS
                        (CASE WHEN peso_vivo_kg > 0
                              THEN ROUND((peso_carcaca_kg / peso_vivo_kg) * 100, 2)
                              ELSE NULL END) STORED,
    classificacao   VARCHAR(20) DEFAULT 'suino_pesado'
                        CHECK (classificacao IN ('leitao','suino_leve','suino_pesado','descarte')),
    destino         VARCHAR(30) DEFAULT 'frigorifico'
                        CHECK (destino IN ('frigorifico','consumo_proprio','venda_direta','feira')),
    valor_total_rs  NUMERIC(10,2),
    comprador       VARCHAR(120),
    registrado_por  VARCHAR(80),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── ALERTAS AUTOMÁTICOS ─────────────────────────────────────
CREATE TABLE suino_alertas (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    animal_id       INTEGER REFERENCES suino_animais(id),
    lote_id         INTEGER REFERENCES suino_lotes(id),
    tipo            VARCHAR(40) NOT NULL,           -- ex: 'peso_baixo', 'vacina_vencida', 'parto_previsto'
    prioridade      VARCHAR(10) NOT NULL DEFAULT 'media'
                        CHECK (prioridade IN ('alta','media','baixa')),
    mensagem        TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','concluido','ignorado')),
    data_prevista   DATE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── LOG DE MENSAGENS WHATSAPP → SUÍNO ───────────────────────
CREATE TABLE suino_whatsapp_log (
    id              SERIAL PRIMARY KEY,
    telefone        VARCHAR(20) NOT NULL,
    tipo_midia      VARCHAR(20) NOT NULL CHECK (tipo_midia IN ('texto','audio','imagem')),
    conteudo_raw    TEXT,
    intent_detectada VARCHAR(40),
    entidades_json  JSONB,
    status          VARCHAR(20) DEFAULT 'pendente'
                        CHECK (status IN ('pendente','processado','erro','ignorado')),
    evento_id       INTEGER,
    evento_tabela   VARCHAR(40),
    erro_msg        TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES ─────────────────────────────────────────────────
CREATE INDEX idx_suino_animais_imovel    ON suino_animais(imovel_id);
CREATE INDEX idx_suino_animais_status    ON suino_animais(status);
CREATE INDEX idx_suino_animais_categoria ON suino_animais(categoria);
CREATE INDEX idx_suino_pesagens_animal   ON suino_pesagens(animal_id, data_pesagem);
CREATE INDEX idx_suino_saude_imovel      ON suino_saude(imovel_id, data_evento);
CREATE INDEX idx_suino_reprod_imovel     ON suino_reproducao(imovel_id, data_evento);
CREATE INDEX idx_suino_alertas_imovel    ON suino_alertas(imovel_id, status);
CREATE INDEX idx_suino_wpp_status        ON suino_whatsapp_log(status, created_at);

-- ── TRIGGER updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_suino_animais_updated
    BEFORE UPDATE ON suino_animais
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_suino_alertas_updated
    BEFORE UPDATE ON suino_alertas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
