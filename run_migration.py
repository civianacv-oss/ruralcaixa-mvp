import psycopg2, sys

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def ok(m):   print(f"  OK  {m}")
def skip(m): print(f"  --  {m} (ja existe)")
def err(m):  print(f"  ERR {m}"); sys.exit(1)

def exists_table(cur, n):
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s",(n,))
    return cur.fetchone()
def exists_enum(cur, n):
    cur.execute("SELECT 1 FROM pg_type WHERE typname=%s AND typtype='e'",(n,))
    return cur.fetchone()
def exists_idx(cur, n):
    cur.execute("SELECT 1 FROM pg_indexes WHERE indexname=%s",(n,))
    return cur.fetchone()
def exists_col(cur, t, c):
    cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name=%s AND column_name=%s",(t,c))
    return cur.fetchone()

try:
    conn = psycopg2.connect(DB_URL, connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()
    print("Conectado!\n")
except Exception as e:
    err(f"Conexao falhou: {e}")

cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
print("Tabelas:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT typname FROM pg_type WHERE typtype='e' ORDER BY typname")
print("ENUMs:  ", [r[0] for r in cur.fetchall()])
print()

if not exists_table(cur,"produtores"): err("Tabela produtores nao encontrada!")
else: ok("produtores ok")

for nome,vals in [
    ("tipo_sociedade_enum","('individual','condominio','parceria','arrendamento','arrendador')"),
    ("tipo_lancamento_enum","('receita','despesa','intermediacao')"),
    ("subconta_enum","('Venda de Graos','Venda de Animais','Receita de Aluguel','Outras Receitas','Sementes e Mudas','Fertilizantes e Corretivos','Defensivos Agricolas','Combustivel e Lubrificantes','Mao de Obra','Maquinas e Implementos','Arrendamento Pago','Outras Despesas','Comissao Recebida','Comissao Paga')")
]:
    if exists_enum(cur,nome): skip(nome)
    else: cur.execute(f"CREATE TYPE {nome} AS ENUM {vals}"); ok(f"ENUM {nome}")

if exists_table(cur,"imoveis_rurais"): skip("imoveis_rurais")
else:
    cur.execute("""CREATE TABLE imoveis_rurais(id SERIAL PRIMARY KEY,nome VARCHAR(200) NOT NULL,nirf VARCHAR(20),municipio VARCHAR(100),uf CHAR(2),area_total_ha NUMERIC(10,4),tipo_sociedade tipo_sociedade_enum NOT NULL DEFAULT 'individual',ativo BOOLEAN DEFAULT TRUE,created_at TIMESTAMP DEFAULT NOW())""")
    ok("imoveis_rurais")

if exists_table(cur,"participacoes_imovel"): skip("participacoes_imovel")
else:
    cur.execute("""CREATE TABLE participacoes_imovel(id SERIAL PRIMARY KEY,imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),produtor_id INTEGER NOT NULL REFERENCES produtores(id),percentual NUMERIC(5,2) NOT NULL,nome_participante VARCHAR(200),vigencia_inicio DATE NOT NULL,vigencia_fim DATE,CONSTRAINT chk_pct CHECK(percentual>0 AND percentual<=100))""")
    ok("participacoes_imovel")
if not exists_idx(cur,"idx_part_imovel"):
    cur.execute("CREATE INDEX idx_part_imovel ON participacoes_imovel(imovel_id,produtor_id,vigencia_inicio)"); ok("idx_part_imovel")
else: skip("idx_part_imovel")

if exists_table(cur,"lancamentos"):
    skip("lancamentos (verificando colunas)")
    for col,ddl in [("imovel_id","INTEGER REFERENCES imoveis_rurais(id)"),("subconta","subconta_enum"),("safra","VARCHAR(10)")]:
        if not exists_col(cur,"lancamentos",col):
            cur.execute(f"ALTER TABLE lancamentos ADD COLUMN {col} {ddl}"); ok(f"  coluna {col} adicionada")
        else: skip(f"  coluna {col}")
else:
    cur.execute("""CREATE TABLE lancamentos(id SERIAL PRIMARY KEY,produtor_id INTEGER NOT NULL REFERENCES produtores(id),imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),data_lancamento DATE NOT NULL,tipo tipo_lancamento_enum NOT NULL,subconta subconta_enum NOT NULL,descricao TEXT,valor_total NUMERIC(14,2) NOT NULL,documento VARCHAR(100),safra VARCHAR(10),created_at TIMESTAMP DEFAULT NOW())""")
    ok("lancamentos")
for n,d in [("idx_lanc_prod","ON lancamentos(produtor_id,data_lancamento)"),("idx_lanc_imovel","ON lancamentos(imovel_id)")]:
    if not exists_idx(cur,n): cur.execute(f"CREATE INDEX {n} {d}"); ok(f"idx {n}")
    else: skip(f"idx {n}")

cur.execute("SELECT id FROM imoveis_rurais WHERE nome='Fazenda Boa Esperanca'")
row = cur.fetchone()
if row: skip(f"Fazenda Boa Esperanca (id={row[0]})")
else:
    cur.execute("INSERT INTO imoveis_rurais(nome,tipo_sociedade) VALUES('Fazenda Boa Esperanca','condominio') RETURNING id")
    ok(f"Fazenda Boa Esperanca inserida id={cur.fetchone()[0]}")

print()
cur.execute("SELECT id,nome,cpf FROM produtores ORDER BY nome")
prod = cur.fetchall()
print("Produtores no banco:")
for r in prod: print(f"  id={r[0]}  {r[1]}  {r[2]}")

conn.commit(); cur.close(); conn.close()
print("\nMigration OK!")
