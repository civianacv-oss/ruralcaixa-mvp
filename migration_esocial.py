"""
RuralCaixa — Migration eSocial
Eventos: S-1260 (Comercializacao Rural PF), S-1200 (Remuneracao), S-1210 (Pagamento)
Execute: python migration_esocial.py
"""
import psycopg2, sys
from datetime import date

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def ok(m):   print(f"  OK  {m}")
def skip(m): print(f"  --  {m} (ja existe)")
def err(m):  print(f"  ERR {m}"); sys.exit(1)

def table_exists(cur, name):
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s", (name,))
    return cur.fetchone()

def col_exists(cur, table, col):
    cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name=%s AND column_name=%s", (table, col))
    return cur.fetchone()

conn = psycopg2.connect(DB_URL, connect_timeout=15)
conn.autocommit = False
cur = conn.cursor()
print("Conectado!\n")

# ── 1. esocial_config ─────────────────────────────────────────────────────────
print("[1/5] Tabela esocial_config")
if table_exists(cur, "esocial_config"):
    skip("esocial_config")
else:
    cur.execute("""
        CREATE TABLE esocial_config (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            ambiente        CHAR(1) DEFAULT '2',  -- 1=producao, 2=homologacao
            versao_layout   VARCHAR(10) DEFAULT 'S-1.3',
            tipo_inscricao  CHAR(1) DEFAULT '1',  -- 1=CNPJ, 2=CPF
            transmissor_nif VARCHAR(20),           -- CPF/CNPJ do transmissor
            created_at      TIMESTAMP DEFAULT NOW(),
            UNIQUE(produtor_id)
        )
    """)
    ok("esocial_config")

# ── 2. esocial_trabalhadores ──────────────────────────────────────────────────
print("\n[2/5] Tabela esocial_trabalhadores")
if table_exists(cur, "esocial_trabalhadores"):
    skip("esocial_trabalhadores")
else:
    cur.execute("""
        CREATE TABLE esocial_trabalhadores (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            imovel_id       INTEGER REFERENCES imoveis_rurais(id),
            cpf             VARCHAR(14) NOT NULL,
            nome            VARCHAR(200) NOT NULL,
            data_nascimento DATE,
            categoria       VARCHAR(5) DEFAULT '701',  -- 701=trabalhador rural por pequeno prazo
            matricula       VARCHAR(30),
            -- Contrato
            data_admissao   DATE NOT NULL,
            data_demissao   DATE,
            tipo_contrato   CHAR(1) DEFAULT '1',  -- 1=prazo indeterminado, 2=prazo determinado
            cargo           VARCHAR(100) DEFAULT 'Trabalhador Rural',
            cbo             VARCHAR(6) DEFAULT '613005',  -- CBO trabalhador rural
            -- Endereco
            municipio       VARCHAR(100),
            uf              CHAR(2),
            -- Status
            ativo           BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)
    ok("esocial_trabalhadores")

# ── 3. esocial_s1260 (Comercializacao Producao Rural PF) ─────────────────────
print("\n[3/5] Tabela esocial_s1260")
if table_exists(cur, "esocial_s1260"):
    skip("esocial_s1260")
else:
    cur.execute("""
        CREATE TABLE esocial_s1260 (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            imovel_id       INTEGER REFERENCES imoveis_rurais(id),
            -- Periodo
            per_apur        VARCHAR(7) NOT NULL,  -- YYYY-MM
            -- Adquirente (quem comprou)
            tipo_insc_adq   CHAR(1) DEFAULT '2',  -- 1=CNPJ, 2=CPF
            nif_adquirente  VARCHAR(18) NOT NULL,
            nome_adquirente VARCHAR(200),
            -- Valores
            vr_bruto_comerc NUMERIC(14,2) NOT NULL,  -- valor bruto comercializacao
            vr_rat          NUMERIC(14,2) DEFAULT 0, -- FUNRURAL (RAT)
            vr_senar        NUMERIC(14,2) DEFAULT 0, -- SENAR
            vr_contrib_desc NUMERIC(14,2) DEFAULT 0, -- contribuicao descontada
            -- Aliquotas
            aliq_rat        NUMERIC(5,2) DEFAULT 1.50,
            aliq_senar      NUMERIC(5,2) DEFAULT 0.20,
            -- Vinculo com lancamento
            lancamento_id   INTEGER REFERENCES lancamentos(id),
            -- Status
            status          VARCHAR(20) DEFAULT 'pendente',
            -- pendente | enviado | processado | erro
            xml_gerado      TEXT,
            protocolo       VARCHAR(50),
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX idx_s1260_produtor ON esocial_s1260(produtor_id, per_apur)")
    ok("esocial_s1260")

# ── 4. esocial_s1200 (Remuneracao Trabalhador) ────────────────────────────────
print("\n[4/5] Tabela esocial_s1200")
if table_exists(cur, "esocial_s1200"):
    skip("esocial_s1200")
else:
    cur.execute("""
        CREATE TABLE esocial_s1200 (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            trabalhador_id  INTEGER NOT NULL REFERENCES esocial_trabalhadores(id),
            per_apur        VARCHAR(7) NOT NULL,  -- YYYY-MM
            -- Remuneracao
            vr_salario      NUMERIC(14,2) NOT NULL,  -- salario base
            vr_horas_extras NUMERIC(14,2) DEFAULT 0,
            vr_adicional    NUMERIC(14,2) DEFAULT 0,
            vr_desconto_inss NUMERIC(14,2) DEFAULT 0,
            vr_desconto_irrf NUMERIC(14,2) DEFAULT 0,
            vr_liquido      NUMERIC(14,2),
            -- Dias trabalhados
            qtd_dias_trab   INTEGER DEFAULT 30,
            -- Status
            status          VARCHAR(20) DEFAULT 'pendente',
            xml_gerado      TEXT,
            protocolo       VARCHAR(50),
            created_at      TIMESTAMP DEFAULT NOW(),
            UNIQUE(trabalhador_id, per_apur)
        )
    """)
    ok("esocial_s1200")

# ── 5. esocial_s1210 (Pagamento Rendimentos) ──────────────────────────────────
print("\n[5/5] Tabela esocial_s1210")
if table_exists(cur, "esocial_s1210"):
    skip("esocial_s1210")
else:
    cur.execute("""
        CREATE TABLE esocial_s1210 (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            trabalhador_id  INTEGER NOT NULL REFERENCES esocial_trabalhadores(id),
            s1200_id        INTEGER REFERENCES esocial_s1200(id),
            per_apur        VARCHAR(7) NOT NULL,
            -- Pagamento
            dt_pagamento    DATE NOT NULL,
            vr_liquido      NUMERIC(14,2) NOT NULL,
            tipo_pagamento  VARCHAR(20) DEFAULT 'folha',
            -- Status
            status          VARCHAR(20) DEFAULT 'pendente',
            xml_gerado      TEXT,
            protocolo       VARCHAR(50),
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)
    ok("esocial_s1210")

# ── Seed: config eSocial produtor 1 ──────────────────────────────────────────
cur.execute("SELECT id FROM esocial_config WHERE produtor_id=1")
if not cur.fetchone():
    cur.execute("INSERT INTO esocial_config (produtor_id, ambiente, tipo_inscricao) VALUES (1, '2', '2')")
    ok("esocial_config seed produtor 1")

# ── Seed: trabalhador rural ficticio ─────────────────────────────────────────
cur.execute("SELECT id FROM esocial_trabalhadores WHERE produtor_id=1")
if not cur.fetchone():
    cur.execute("""
        INSERT INTO esocial_trabalhadores
            (produtor_id, imovel_id, cpf, nome, data_nascimento, data_admissao,
             cargo, municipio, uf, categoria)
        VALUES
            (1, 1, '111.222.333-44', 'Jose da Silva Trabalhador',
             '1985-03-15', '2026-01-01',
             'Trabalhador Rural', 'Barretos', 'SP', '701')
        RETURNING id
    """)
    tid = cur.fetchone()[0]
    ok(f"Trabalhador Jose da Silva inserido (id={tid})")

    # Seed: remuneracao de maio/2026
    cur.execute("""
        INSERT INTO esocial_s1200
            (produtor_id, trabalhador_id, per_apur, vr_salario,
             vr_desconto_inss, vr_liquido, qtd_dias_trab)
        VALUES (1, %s, '2026-05', 1518.00, 136.62, 1381.38, 30)
        RETURNING id
    """, (tid,))
    s1200_id = cur.fetchone()[0]
    ok(f"Remuneracao maio/2026 inserida (id={s1200_id})")

    # Seed: pagamento
    cur.execute("""
        INSERT INTO esocial_s1210
            (produtor_id, trabalhador_id, s1200_id, per_apur, dt_pagamento, vr_liquido)
        VALUES (1, %s, %s, '2026-05', '2026-05-30', 1381.38)
    """, (tid, s1200_id))
    ok("Pagamento maio/2026 inserido")

# ── Seed: S-1260 a partir dos lancamentos de receita ─────────────────────────
cur.execute("""
    SELECT id, valor, data_lancamento
    FROM lancamentos
    WHERE produtor_id=1 AND tipo='receita' AND confirmado=TRUE
    ORDER BY data_lancamento
    LIMIT 3
""")
receitas = cur.fetchall()
for rec in receitas:
    per = rec[2].strftime("%Y-%m")
    cur.execute("SELECT id FROM esocial_s1260 WHERE produtor_id=1 AND lancamento_id=%s", (rec[0],))
    if not cur.fetchone():
        vr_rat   = round(float(rec[1]) * 1.5 / 100, 2)
        vr_senar = round(float(rec[1]) * 0.2 / 100, 2)
        cur.execute("""
            INSERT INTO esocial_s1260
                (produtor_id, imovel_id, per_apur, tipo_insc_adq, nif_adquirente,
                 nome_adquirente, vr_bruto_comerc, vr_rat, vr_senar, lancamento_id)
            VALUES (1, 1, %s, '2', '000.000.000-00', 'Adquirente Teste',
                    %s, %s, %s, %s)
        """, (per, rec[1], vr_rat, vr_senar, rec[0]))
        ok(f"S-1260 {per} R$ {rec[1]} inserido")

conn.commit()
cur.close()
conn.close()
print("\nMigration eSocial concluida!")
print("Tabelas criadas: esocial_config, esocial_trabalhadores, esocial_s1260, esocial_s1200, esocial_s1210")
