import psycopg2

conn = psycopg2.connect(
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
conn.autocommit = True
cur = conn.cursor()

sqls = [

# 1. Configurações do condomínio (regras de votação)
"""
CREATE TABLE IF NOT EXISTS contrato_config (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id         UUID NOT NULL UNIQUE REFERENCES contratos(id) ON DELETE CASCADE,

    -- Quórum
    quorum_tipo         TEXT NOT NULL DEFAULT 'maioria'
                            CHECK (quorum_tipo IN ('maioria','unanimidade','qualquer_um','numero_fixo')),
    quorum_numero       INT DEFAULT NULL,  -- usado quando quorum_tipo = 'numero_fixo'

    -- Prazo
    prazo_aprovacao_h   INT NOT NULL DEFAULT 24,

    -- Comportamento em empate/expiração
    empate_resultado    TEXT NOT NULL DEFAULT 'aprovado'
                            CHECK (empate_resultado IN ('aprovado','rejeitado')),
    expiracao_resultado TEXT NOT NULL DEFAULT 'aprovado'
                            CHECK (expiracao_resultado IN ('aprovado','rejeitado')),

    -- Permissões por papel
    -- JSON: {"gestor": ["receita","despesa"], "parceiro": ["despesa"], "investidor": []}
    permissoes_papel    JSONB NOT NULL DEFAULT '{
        "gestor":     ["receita","despesa","aporte"],
        "parceiro":   ["despesa"],
        "investidor": []
    }',

    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
""",

# 2. Papéis dos condôminos no contrato
"""
CREATE TABLE IF NOT EXISTS contrato_papeis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    produtor_id     INTEGER REFERENCES produtores(id),
    parceiro_id     UUID REFERENCES parceiros_externos(id),
    papel           TEXT NOT NULL DEFAULT 'parceiro'
                        CHECK (papel IN ('gestor','parceiro','investidor')),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_papel_parte CHECK (
        (produtor_id IS NOT NULL)::INT +
        (parceiro_id IS NOT NULL)::INT = 1
    ),
    UNIQUE(contrato_id, produtor_id),
    UNIQUE(contrato_id, parceiro_id)
)
""",

# 3. Lançamentos do contrato (com aprovação)
"""
CREATE TABLE IF NOT EXISTS contrato_lancamentos2 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id         UUID NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,

    -- Quem lançou
    produtor_id         INTEGER REFERENCES produtores(id),
    parceiro_id         UUID REFERENCES parceiros_externos(id),

    -- O lançamento
    tipo                TEXT NOT NULL CHECK (tipo IN ('receita','despesa','aporte','retirada')),
    descricao           TEXT NOT NULL,
    valor               NUMERIC(15,2) NOT NULL CHECK (valor > 0),
    data_lancamento     DATE NOT NULL DEFAULT CURRENT_DATE,
    subconta_id         INTEGER,  -- FK opcional para subcontas existentes

    -- Aprovação
    status              TEXT NOT NULL DEFAULT 'pendente'
                            CHECK (status IN (
                                'pendente','em_votacao','aprovado',
                                'rejeitado','expirado','cancelado'
                            )),
    votos_aprovacao     INT NOT NULL DEFAULT 0,
    votos_rejeicao      INT NOT NULL DEFAULT 0,
    total_votantes      INT NOT NULL DEFAULT 0,  -- calculado na criação
    expira_em           TIMESTAMPTZ,             -- prazo_aprovacao_h a partir da criação
    aprovado_em         TIMESTAMPTZ,
    aprovado_motivo     TEXT,  -- 'quorum'|'empate'|'expiracao'|'unanimidade'

    -- Efeito nas cotas (preenchido após aprovação para tipo=aporte)
    recalculo_cotas     BOOLEAN NOT NULL DEFAULT FALSE,

    -- Metadados
    observacao          TEXT,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_lancamento_autor CHECK (
        (produtor_id IS NOT NULL)::INT +
        (parceiro_id IS NOT NULL)::INT = 1
    )
)
""",

# 4. Votos nos lançamentos
"""
CREATE TABLE IF NOT EXISTS contrato_votos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lancamento_id   UUID NOT NULL REFERENCES contrato_lancamentos2(id) ON DELETE CASCADE,
    contrato_id     UUID NOT NULL,

    -- Quem votou
    produtor_id     INTEGER REFERENCES produtores(id),
    parceiro_id     UUID REFERENCES parceiros_externos(id),

    voto            TEXT NOT NULL CHECK (voto IN ('aprovar','rejeitar')),
    justificativa   TEXT,
    whatsapp_msg_id TEXT,
    votado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_voto_autor CHECK (
        (produtor_id IS NOT NULL)::INT +
        (parceiro_id IS NOT NULL)::INT = 1
    ),
    -- Cada condômino vota uma vez por lançamento
    UNIQUE(lancamento_id, produtor_id),
    UNIQUE(lancamento_id, parceiro_id)
)
""",

# 5. Índices
"CREATE INDEX IF NOT EXISTS idx_lancamentos2_contrato ON contrato_lancamentos2(contrato_id)",
"CREATE INDEX IF NOT EXISTS idx_lancamentos2_status   ON contrato_lancamentos2(status)",
"CREATE INDEX IF NOT EXISTS idx_lancamentos2_expira   ON contrato_lancamentos2(expira_em) WHERE status = 'em_votacao'",
"CREATE INDEX IF NOT EXISTS idx_votos_lancamento      ON contrato_votos(lancamento_id)",
"CREATE INDEX IF NOT EXISTS idx_papeis_contrato       ON contrato_papeis(contrato_id)",

# 6. View de cotas dinâmicas (percentual calculado pelo saldo de aportes)
"""
CREATE OR REPLACE VIEW vw_cotas_dinamicas AS
WITH saldo_aportes AS (
    SELECT
        cl.contrato_id,
        COALESCE(cl.produtor_id::TEXT, cl.parceiro_id::TEXT) AS participante_id,
        COALESCE(p.nome, pe.nome)                            AS participante_nome,
        SUM(CASE WHEN cl.tipo = 'aporte'    THEN cl.valor
                 WHEN cl.tipo = 'retirada'  THEN -cl.valor
                 ELSE 0 END)                                 AS saldo_atual
    FROM contrato_lancamentos2 cl
    LEFT JOIN produtores p          ON p.id  = cl.produtor_id
    LEFT JOIN parceiros_externos pe ON pe.id = cl.parceiro_id
    WHERE cl.status = 'aprovado'
      AND cl.tipo IN ('aporte','retirada')
    GROUP BY cl.contrato_id,
             COALESCE(cl.produtor_id::TEXT, cl.parceiro_id::TEXT),
             COALESCE(p.nome, pe.nome)
),
total_por_contrato AS (
    SELECT contrato_id, SUM(saldo_atual) AS total
    FROM saldo_aportes
    GROUP BY contrato_id
)
SELECT
    sa.contrato_id,
    sa.participante_id,
    sa.participante_nome,
    sa.saldo_atual,
    t.total AS total_contrato,
    ROUND(sa.saldo_atual * 100.0 / NULLIF(t.total, 0), 4) AS percentual_cota
FROM saldo_aportes sa
JOIN total_por_contrato t ON t.contrato_id = sa.contrato_id
WHERE sa.saldo_atual > 0
ORDER BY sa.contrato_id, percentual_cota DESC
""",

# 7. View de lançamentos com detalhes de votação
"""
CREATE OR REPLACE VIEW vw_lancamentos_votacao AS
SELECT
    cl.id,
    cl.contrato_id,
    cl.tipo,
    cl.descricao,
    cl.valor,
    cl.data_lancamento,
    cl.status,
    cl.votos_aprovacao,
    cl.votos_rejeicao,
    cl.total_votantes,
    cl.expira_em,
    cl.aprovado_em,
    cl.aprovado_motivo,
    cl.criado_em,
    COALESCE(p.nome,  pe.nome)       AS autor_nome,
    COALESCE(p.cpf,   pe.documento)  AS autor_documento,
    -- Votos detalhados como JSON
    (SELECT json_agg(json_build_object(
        'participante', COALESCE(vp.nome, vpe.nome),
        'voto',         cv.voto,
        'votado_em',    cv.votado_em,
        'justificativa',cv.justificativa
    ))
     FROM contrato_votos cv
     LEFT JOIN produtores vp          ON vp.id  = cv.produtor_id
     LEFT JOIN parceiros_externos vpe ON vpe.id = cv.parceiro_id
     WHERE cv.lancamento_id = cl.id
    ) AS votos_detalhe
FROM contrato_lancamentos2 cl
LEFT JOIN produtores p          ON p.id  = cl.produtor_id
LEFT JOIN parceiros_externos pe ON pe.id = cl.parceiro_id
""",

]

for i, sql in enumerate(sqls, 1):
    try:
        cur.execute(sql)
        print(f"[OK] passo {i}")
    except Exception as e:
        print(f"[ERRO] passo {i}: {e}")

conn.close()
print("\nMigration de aprovação concluída!")
