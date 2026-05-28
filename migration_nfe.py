"""
RuralCaixa — Migration NF-e Produtor Rural
Execute: python migration_nfe.py
"""
import psycopg2, sys

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

# ── 1. Colunas fiscais em produtores ─────────────────────────────────────────
print("[1/5] Colunas fiscais em produtores")
for col, ddl in [
    ("inscricao_estadual", "VARCHAR(20)"),
    ("caepf",             "VARCHAR(20)"),
    ("municipio",         "VARCHAR(100)"),
    ("uf",                "CHAR(2)"),
    ("cep",               "VARCHAR(10)"),
    ("endereco",          "VARCHAR(200)"),
    ("numero",            "VARCHAR(20)"),
    ("bairro",            "VARCHAR(100)"),
]:
    if not col_exists(cur, "produtores", col):
        cur.execute(f"ALTER TABLE produtores ADD COLUMN {col} {ddl}")
        ok(f"coluna produtores.{col}")
    else:
        skip(f"produtores.{col}")

# ── 2. nfe_config ─────────────────────────────────────────────────────────────
print("\n[2/5] Tabela nfe_config")
if table_exists(cur, "nfe_config"):
    skip("nfe_config")
else:
    cur.execute("""
        CREATE TABLE nfe_config (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            serie           VARCHAR(3) DEFAULT '001',
            proxima_numero  INTEGER DEFAULT 1,
            ambiente        CHAR(1) DEFAULT '2',  -- 1=producao, 2=homologacao
            regime_tributario INTEGER DEFAULT 1,  -- 1=simples, 3=normal
            csc_id          VARCHAR(10),           -- para NFC-e (futuro)
            csc_token       VARCHAR(100),
            created_at      TIMESTAMP DEFAULT NOW(),
            UNIQUE(produtor_id)
        )
    """)
    ok("nfe_config")

# ── 3. nfe_destinatarios ──────────────────────────────────────────────────────
print("\n[3/5] Tabela nfe_destinatarios")
if table_exists(cur, "nfe_destinatarios"):
    skip("nfe_destinatarios")
else:
    cur.execute("""
        CREATE TABLE nfe_destinatarios (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            tipo_doc        CHAR(1) DEFAULT 'F',  -- F=CPF, J=CNPJ, X=estrangeiro
            documento       VARCHAR(18) NOT NULL,
            razao_social    VARCHAR(200) NOT NULL,
            ie              VARCHAR(20),           -- inscricao estadual
            municipio       VARCHAR(100),
            uf              CHAR(2),
            cep             VARCHAR(10),
            endereco        VARCHAR(200),
            numero          VARCHAR(20),
            bairro          VARCHAR(100),
            telefone        VARCHAR(20),
            email           VARCHAR(100),
            ativo           BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)
    ok("nfe_destinatarios")

# ── 4. nfe_produtos ───────────────────────────────────────────────────────────
print("\n[4/5] Tabela nfe_produtos")
if table_exists(cur, "nfe_produtos"):
    skip("nfe_produtos")
else:
    cur.execute("""
        CREATE TABLE nfe_produtos (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            codigo          VARCHAR(20),
            descricao       VARCHAR(200) NOT NULL,
            ncm             VARCHAR(10),           -- Nomenclatura Comum Mercosul
            cfop            VARCHAR(5),            -- ex: 5101 venda prod rural
            unidade         VARCHAR(6) DEFAULT 'KG',
            preco_unitario  NUMERIC(14,4),
            ativo           BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMP DEFAULT NOW()
        )
    """)
    ok("nfe_produtos")

# ── 5. nfe_notas ──────────────────────────────────────────────────────────────
print("\n[5/5] Tabela nfe_notas")
if table_exists(cur, "nfe_notas"):
    skip("nfe_notas")
else:
    cur.execute("""
        CREATE TABLE nfe_notas (
            id              SERIAL PRIMARY KEY,
            produtor_id     INTEGER NOT NULL REFERENCES produtores(id),
            destinatario_id INTEGER REFERENCES nfe_destinatarios(id),
            numero          INTEGER NOT NULL,
            serie           VARCHAR(3) DEFAULT '001',
            data_emissao    DATE NOT NULL DEFAULT CURRENT_DATE,
            data_saida      DATE,
            natureza_operacao VARCHAR(100) DEFAULT 'Venda de Producao do Estabelecimento',
            cfop            VARCHAR(5) DEFAULT '5101',
            tipo_operacao   CHAR(1) DEFAULT '1',  -- 0=entrada, 1=saida
            -- Valores
            valor_produtos  NUMERIC(14,2) DEFAULT 0,
            valor_frete     NUMERIC(14,2) DEFAULT 0,
            valor_seguro    NUMERIC(14,2) DEFAULT 0,
            valor_desconto  NUMERIC(14,2) DEFAULT 0,
            valor_total     NUMERIC(14,2) DEFAULT 0,
            -- Impostos rurais
            valor_funrural  NUMERIC(14,2) DEFAULT 0,  -- 1.5% ou 1.2% pessoa fisica
            valor_senar     NUMERIC(14,2) DEFAULT 0,  -- 0.2%
            aliquota_funrural NUMERIC(5,2) DEFAULT 1.50,
            aliquota_senar  NUMERIC(5,2) DEFAULT 0.20,
            -- Transporte
            modalidade_frete INTEGER DEFAULT 9,  -- 9=sem frete
            -- Status
            status          VARCHAR(20) DEFAULT 'rascunho',
            -- rascunho | emitida | cancelada
            chave_acesso    VARCHAR(44),           -- para futuro XML SEFAZ
            protocolo       VARCHAR(20),
            -- Informacoes adicionais
            informacoes_adicionais TEXT,
            lancamento_id   INTEGER REFERENCES lancamentos(id),
            created_at      TIMESTAMP DEFAULT NOW(),
            UNIQUE(produtor_id, serie, numero)
        )
    """)
    ok("nfe_notas")

    cur.execute("""
        CREATE TABLE nfe_itens (
            id              SERIAL PRIMARY KEY,
            nota_id         INTEGER NOT NULL REFERENCES nfe_notas(id) ON DELETE CASCADE,
            produto_id      INTEGER REFERENCES nfe_produtos(id),
            numero_item     INTEGER NOT NULL,
            descricao       VARCHAR(200) NOT NULL,
            ncm             VARCHAR(10),
            cfop            VARCHAR(5),
            unidade         VARCHAR(6),
            quantidade      NUMERIC(14,4) NOT NULL,
            valor_unitario  NUMERIC(14,4) NOT NULL,
            valor_total     NUMERIC(14,2) NOT NULL,
            valor_desconto  NUMERIC(14,2) DEFAULT 0
        )
    """)
    ok("nfe_itens")

# ── Seed: config padrao para produtor 1 ──────────────────────────────────────
cur.execute("SELECT id FROM nfe_config WHERE produtor_id=1")
if not cur.fetchone():
    cur.execute("INSERT INTO nfe_config (produtor_id, serie, proxima_numero, ambiente) VALUES (1, '001', 1, '2')")
    ok("nfe_config seed produtor 1")

# ── Seed: produtos tipicos produtor rural ─────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM nfe_produtos WHERE produtor_id=1")
if cur.fetchone()[0] == 0:
    produtos = [
        (1, "SOJA", "Soja em Grao", "1201.10", "5101", "SC", 130.00),
        (1, "MILHO", "Milho em Grao", "1005.90", "5101", "SC", 65.00),
        (1, "BOI",   "Bovino Gordo", "0102.29", "5101", "CAB", 3500.00),
        (1, "BEZER", "Bezerro",       "0102.29", "5101", "CAB", 1800.00),
    ]
    for p in produtos:
        cur.execute("""
            INSERT INTO nfe_produtos (produtor_id, codigo, descricao, ncm, cfop, unidade, preco_unitario)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, p)
    ok(f"4 produtos seed inseridos")

conn.commit()
cur.close()
conn.close()

print("\nMigration NF-e concluida!")
print("Proximos passos:")
print("  1. Copiar nfe_router.py para app/services/")
print("  2. Adicionar endpoints no main.py")
print("  3. Copiar nfe_page.tsx para frontend/app/nfe/page.tsx")
