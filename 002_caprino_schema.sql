-- ============================================================
-- RuralCaixa — Módulo Ovino de Corte
-- Migration: 001_ovino_schema.sql
-- Compatível com o PostgreSQL existente no Railway
-- ============================================================

-- ── ANIMAIS ─────────────────────────────────────────────────
CREATE TABLE caprino_animais (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE RESTRICT,
    brinco          VARCHAR(30) NOT NULL,          -- identificação de campo
    nome            VARCHAR(60),                   -- opcional
    raca            VARCHAR(60),                   -- ex: Santa Inês, Dorper, Morada Nova
    sexo            CHAR(1) NOT NULL CHECK (sexo IN ('M','F')),
    data_nascimento DATE,
    peso_nascimento NUMERIC(6,2),                  -- kg
    mae_id          INTEGER REFERENCES caprino_animais(id),
    pai_id          INTEGER REFERENCES caprino_animais(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo','vendido','abatido','morto','descartado')),
    lote_id         INTEGER,                       -- FK adicionada após criar tabela lotes
    observacoes     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (imovel_id, brinco)
);

-- ── LOTES ───────────────────────────────────────────────────
CREATE TABLE caprino_lotes (
    id          SERIAL PRIMARY KEY,
    imovel_id   INTEGER NOT NULL REFERENCES imoveis(id),
    nome        VARCHAR(60) NOT NULL,              -- ex: "Engorda Lote 1 – Mai/26"
    fase        VARCHAR(20) NOT NULL DEFAULT 'cria'
                    CHECK (fase IN ('cria','recria','engorda','reprodução','descarte')),
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim    DATE,
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE caprino_animais
    ADD CONSTRAINT fk_lote FOREIGN KEY (lote_id) REFERENCES caprino_lotes(id);

-- ── PESAGENS ────────────────────────────────────────────────
CREATE TABLE caprino_pesagens (
    id          SERIAL PRIMARY KEY,
    animal_id   INTEGER NOT NULL REFERENCES caprino_animais(id) ON DELETE CASCADE,
    data_pesagem DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_kg     NUMERIC(6,2) NOT NULL,
    motivo      VARCHAR(30) DEFAULT 'rotina'
                    CHECK (motivo IN ('nascimento','desmame','entrada_lote','rotina','pre_abate','abate')),
    registrado_por VARCHAR(80),                    -- nome ou telefone WhatsApp
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── EVENTOS DE REPRODUÇÃO ───────────────────────────────────
CREATE TABLE caprino_reproducao (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    tipo            VARCHAR(30) NOT NULL
                        CHECK (tipo IN ('monta','inseminacao','parto','aborto','desmame')),
    data_evento     DATE NOT NULL,
    matriz_id       INTEGER REFERENCES caprino_animais(id),
    reprodutor_id   INTEGER REFERENCES caprino_animais(id),
    cabritos_vivos INTEGER DEFAULT 0,
    cabritos_mortos INTEGER DEFAULT 0,
    observacoes     TEXT,
    registrado_por  VARCHAR(80),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── SAÚDE / MANEJO SANITÁRIO ────────────────────────────────
CREATE TABLE caprino_saude (
    id              SERIAL PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    animal_id       INTEGER REFERENCES caprino_animais(id),   -- NULL = lote inteiro
    lote_id         INTEGER REFERENCES caprino_lotes(id),
    tipo            VARCHAR(30) NOT NULL
                        CHECK (tipo IN ('vacinacao','vermifugacao','famacha','tratamento','exame','outro')),
    data_evento     DATE NOT NULL DEFAULT CURRENT_DATE,
    produto         VARCHAR(120),                  -- ex: "Closivac", "Ivomec"
    dose_ml         NUMERIC(6,2),
    via             VARCHAR(20),                   -- SC, IM, VO, tópica
    proximo_em      DATE,                          -- data do próximo manejo
    resultado       VARCHAR(30),                   -- ex: escore FAMACHA 1-5
    registrado_por  VARCHAR(80),
    observacoes     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── ABATES / SAÍDAS ─────────────────────────────────────────
CREATE TABLE caprino_abates (
    id              SERIAL PRIMARY KEY,
    animal_id       INTEGER NOT NULL REFERENCES caprino_animais(id),
    data_abate      DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_vivo_kg    NUMERIC(6,2),
    peso_carcaca_kg NUMERIC(6,2),
    rendimento_pct  NUMERIC(5,2) GENERATED ALWAYS AS
                        (CASE WHEN peso_vivo_kg > 0
                              THEN ROUND((peso_carcaca_kg / peso_vivo_kg) * 100, 2)
                              ELSE NULL END) STORED,
    destino         VARCHAR(30) DEFAULT 'frigorifico'
                        CHECK (destino IN ('frigorifico','consumo_proprio','venda_direta','feira')),
    valor_total_rs  NUMERIC(10,2),
    comprador       VARCHAR(120),
    registrado_por  VARCHAR(80),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── LOG DE MENSAGENS WHATSAPP → OVINO ───────────────────────
-- Rastreia cada mensagem recebida e o evento gerado pela IA
CREATE TABLE caprino_whatsapp_log (
    id              SERIAL PRIMARY KEY,
    telefone        VARCHAR(20) NOT NULL,
    tipo_midia      VARCHAR(20) NOT NULL CHECK (tipo_midia IN ('texto','audio','imagem')),
    conteudo_raw    TEXT,                          -- transcrição ou texto bruto
    intent_detectada VARCHAR(40),                  -- ex: 'pesagem', 'vacinacao', 'parto'
    entidades_json  JSONB,                         -- ex: {"brinco":"A001","peso":32.5}
    status          VARCHAR(20) DEFAULT 'pendente'
                        CHECK (status IN ('pendente','processado','erro','ignorado')),
    evento_id       INTEGER,                       -- ID do registro criado (qualquer tabela)
    evento_tabela   VARCHAR(40),                   -- ex: 'caprino_pesagens'
    erro_msg        TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES ─────────────────────────────────────────────────
CREATE INDEX idx_caprino_animais_imovel   ON caprino_animais(imovel_id);
CREATE INDEX idx_caprino_animais_status   ON caprino_animais(status);
CREATE INDEX idx_caprino_pesagens_animal  ON caprino_pesagens(animal_id, data_pesagem);
CREATE INDEX idx_caprino_saude_imovel     ON caprino_saude(imovel_id, data_evento);
CREATE INDEX idx_caprino_reprod_imovel    ON caprino_reproducao(imovel_id, data_evento);
CREATE INDEX idx_caprino_wpp_status       ON caprino_whatsapp_log(status, created_at);

-- ── TRIGGER updated_at ──────────────────────────────────────
-- Reutiliza a função set_updated_at se já existir no projeto,
-- caso contrário cria aqui.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_caprino_animais_updated
    BEFORE UPDATE ON caprino_animais
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
