"""
RuralCaixa — migrate_014_locacoes_pontos_classificacao.py
Cria as tabelas de Locação de Maquinário e Ponto Comercial (ainda inexistentes
no banco), e adiciona classificação fiscal RURAL/COMERCIAL onde já existem
tabelas do módulo Compra e Venda (cv_compras, cv_vendas).

Rodar localmente (mesmo padrão do run_migration.py):
    python migrate_014_locacoes_pontos_classificacao.py

Regra de negócio (definida pelo produtor):
  - Receita de venda da produção rural                          -> RURAL     (LCDPR)
  - Despesa de locação de máquina DE terceiro p/ produção própria -> RURAL   (LCDPR)
  - Receita de locação de máquina PARA terceiro                  -> COMERCIAL (fora do LCDPR)
  - Qualquer operação de Ponto Comercial                         -> COMERCIAL (fora do LCDPR)
  - cv_compras / cv_vendas (animais/produção não caracterizada
    como produto rural) -> COMERCIAL por padrão, editável por
    lançamento, e sujeito à reclassificação automática pelo
    alerta fiscal já existente em /compravenda/alertas-fiscais
"""
import psycopg2
import sys

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"


def ok(m):   print(f"  OK  {m}")
def skip(m): print(f"  --  {m} (ja existe)")
def err(m):  print(f"  ERR {m}"); sys.exit(1)


def exists_table(cur, n):
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s", (n,))
    return cur.fetchone()


def exists_enum(cur, n):
    cur.execute("SELECT 1 FROM pg_type WHERE typname=%s AND typtype='e'", (n,))
    return cur.fetchone()


def exists_col(cur, t, c):
    cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name=%s AND column_name=%s", (t, c))
    return cur.fetchone()


try:
    conn = psycopg2.connect(DB_URL, connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()
    print("Conectado!\n")
except Exception as e:
    err(f"Conexao falhou: {e}")

# ------------------------------------------------------------------
# 0. Pré-checagem: confirmar que as tabelas-base existem
# ------------------------------------------------------------------
for t in ("imoveis_rurais", "cv_compras", "cv_vendas", "livro_caixa_lancamentos"):
    if not exists_table(cur, t):
        err(f"Tabela base '{t}' nao encontrada — aborta migracao (schema pode ter mudado)")
    else:
        ok(f"tabela base {t} encontrada")

# ------------------------------------------------------------------
# 1. ENUM classificacao_fiscal
# ------------------------------------------------------------------
if not exists_enum(cur, "classificacao_fiscal"):
    cur.execute("CREATE TYPE classificacao_fiscal AS ENUM ('RURAL', 'COMERCIAL')")
    ok("enum classificacao_fiscal criado")
else:
    skip("enum classificacao_fiscal")

# ------------------------------------------------------------------
# 2. Tabela: locacoes_maquinas
# ------------------------------------------------------------------
if not exists_table(cur, "locacoes_maquinas"):
    cur.execute("""
        CREATE TABLE locacoes_maquinas (
            id SERIAL PRIMARY KEY,
            imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
            maquina VARCHAR(100) NOT NULL,
            tipo VARCHAR(30) NOT NULL,
            modelo VARCHAR(50),
            ano_fabricacao INTEGER,
            valor_compra NUMERIC(12,2),
            valor_depreciado NUMERIC(12,2),
            diaria_valor NUMERIC(12,2) NOT NULL DEFAULT 0,
            hora_valor NUMERIC(12,2) NOT NULL DEFAULT 0,
            locador VARCHAR(100) NOT NULL,
            locatario VARCHAR(100) NOT NULL,
            direcao VARCHAR(20) NOT NULL DEFAULT 'PARA_TERCEIRO'
                CHECK (direcao IN ('DE_TERCEIRO', 'PARA_TERCEIRO')),
            classificacao classificacao_fiscal NOT NULL DEFAULT 'COMERCIAL',
            data_locacao_inicio DATE NOT NULL,
            data_locacao_fim DATE,
            horas_trabalhadas NUMERIC(8,2),
            valor_total_locacao NUMERIC(12,2),
            observacoes TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'ativo',
            lancamento_lcdpr_id INTEGER,  -- id em livro_caixa_lancamentos, se DE_TERCEIRO
            criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
            atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX idx_locacoes_imovel ON locacoes_maquinas(imovel_id)")
    cur.execute("CREATE INDEX idx_locacoes_datas ON locacoes_maquinas(data_locacao_inicio, data_locacao_fim)")
    cur.execute("CREATE INDEX idx_locacoes_classificacao ON locacoes_maquinas(classificacao)")
    ok("tabela locacoes_maquinas criada")
else:
    skip("tabela locacoes_maquinas")

# Trigger: direcao -> classificacao é sempre determinística
cur.execute("""
    CREATE OR REPLACE FUNCTION trg_classificar_locacao() RETURNS TRIGGER AS $$
    BEGIN
        NEW.classificacao := CASE WHEN NEW.direcao = 'DE_TERCEIRO' THEN 'RURAL' ELSE 'COMERCIAL' END;
        NEW.atualizado_em := NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
""")
cur.execute("DROP TRIGGER IF EXISTS classificar_locacao ON locacoes_maquinas")
cur.execute("""
    CREATE TRIGGER classificar_locacao
    BEFORE INSERT OR UPDATE OF direcao ON locacoes_maquinas
    FOR EACH ROW EXECUTE FUNCTION trg_classificar_locacao()
""")
ok("trigger classificar_locacao aplicada")

# ------------------------------------------------------------------
# 3. Tabelas: pontos_comerciais e movimentos_ponto (sempre COMERCIAL)
# ------------------------------------------------------------------
if not exists_table(cur, "pontos_comerciais"):
    cur.execute("""
        CREATE TABLE pontos_comerciais (
            id SERIAL PRIMARY KEY,
            imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
            nome VARCHAR(200) NOT NULL,
            tipo VARCHAR(30) NOT NULL,   -- fisico, online, informal, feira, atacado, varejo
            endereco TEXT,
            telefone VARCHAR(20),
            whatsapp VARCHAR(20),
            responsavel VARCHAR(100),
            data_abertura DATE,
            status VARCHAR(20) NOT NULL DEFAULT 'ativo',
            classificacao classificacao_fiscal NOT NULL DEFAULT 'COMERCIAL',
            observacoes TEXT,
            criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
            atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX idx_pontos_imovel ON pontos_comerciais(imovel_id)")
    ok("tabela pontos_comerciais criada")
else:
    skip("tabela pontos_comerciais")

if not exists_table(cur, "movimentos_ponto"):
    cur.execute("""
        CREATE TABLE movimentos_ponto (
            id SERIAL PRIMARY KEY,
            ponto_id INTEGER NOT NULL REFERENCES pontos_comerciais(id),
            tipo VARCHAR(20) NOT NULL,  -- entrada, saida
            produto_nome VARCHAR(200),
            quantidade NUMERIC(12,2),
            valor_unitario NUMERIC(12,2),
            valor_total NUMERIC(12,2) NOT NULL,
            cliente_fornecedor VARCHAR(200),
            forma_pagamento VARCHAR(30) NOT NULL,
            status_pagamento VARCHAR(20) NOT NULL DEFAULT 'pago',
            classificacao classificacao_fiscal NOT NULL DEFAULT 'COMERCIAL',
            data_movimento DATE NOT NULL,
            observacoes TEXT,
            nota_fiscal VARCHAR(50),
            criado_em TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX idx_movimentos_ponto_ponto ON movimentos_ponto(ponto_id)")
    cur.execute("CREATE INDEX idx_movimentos_ponto_data ON movimentos_ponto(data_movimento)")
    ok("tabela movimentos_ponto criada")
else:
    skip("tabela movimentos_ponto")

# ------------------------------------------------------------------
# 4. Classificação no módulo Compra e Venda já existente (cv_compras / cv_vendas)
#    Padrão: COMERCIAL (o próprio router já documenta isso como
#    "atividade comercial não rural"); editável por lançamento e
#    sujeito a reclassificação pelo alerta fiscal já existente.
# ------------------------------------------------------------------
for tabela, default in (("cv_compras", "COMERCIAL"), ("cv_vendas", "COMERCIAL")):
    if not exists_col(cur, tabela, "classificacao"):
        cur.execute(f"ALTER TABLE {tabela} ADD COLUMN classificacao classificacao_fiscal NOT NULL DEFAULT '{default}'")
        ok(f"coluna classificacao adicionada em {tabela}")
    else:
        skip(f"coluna classificacao em {tabela}")

conn.commit()
print("\nMigracao concluida com sucesso.")
cur.close()
conn.close()
