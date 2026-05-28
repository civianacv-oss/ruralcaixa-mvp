import psycopg2

conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

print("Iniciando migration...")

# 1. Criar tabela empreendimentos
cur.execute("""
CREATE TABLE IF NOT EXISTS empreendimentos (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(10) NOT NULL DEFAULT 'CAEPF', -- CAEPF ou CNPJ
    documento VARCHAR(20),                      -- numero do CAEPF ou CNPJ
    razao_social VARCHAR(200) NOT NULL,
    responsavel_cpf VARCHAR(14),               -- CPF do responsavel fiscal
    responsavel_nome VARCHAR(200),
    atividade VARCHAR(100) DEFAULT 'Producao agropecuaria',
    municipio VARCHAR(100),
    uf VARCHAR(2),
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT NOW()
);
""")
print("  tabela empreendimentos criada")

# 2. Criar tabela socios_empreendimento
cur.execute("""
CREATE TABLE IF NOT EXISTS socios_empreendimento (
    id SERIAL PRIMARY KEY,
    empreendimento_id INTEGER REFERENCES empreendimentos(id) ON DELETE CASCADE,
    produtor_id INTEGER REFERENCES produtores(id) ON DELETE CASCADE,
    participacao NUMERIC(5,2) NOT NULL DEFAULT 0,
    papel VARCHAR(50) DEFAULT 'socio', -- responsavel, socio, parceiro
    data_entrada DATE DEFAULT CURRENT_DATE,
    data_saida DATE,
    ativo BOOLEAN DEFAULT TRUE,
    UNIQUE(empreendimento_id, produtor_id)
);
""")
print("  tabela socios_empreendimento criada")

# 3. Adicionar coluna empreendimento_id em imoveis_rurais (se não existir)
cur.execute("""
ALTER TABLE imoveis_rurais 
ADD COLUMN IF NOT EXISTS empreendimento_id INTEGER REFERENCES empreendimentos(id);
""")
print("  coluna empreendimento_id adicionada em imoveis_rurais")

# 4. Adicionar coluna empreendimento_id em lancamentos (se não existir)
cur.execute("""
ALTER TABLE lancamentos
ADD COLUMN IF NOT EXISTS empreendimento_id INTEGER REFERENCES empreendimentos(id);
""")
print("  coluna empreendimento_id adicionada em lancamentos")

# 5. Criar view de socios com participacao
cur.execute("""
CREATE OR REPLACE VIEW vw_socios_empreendimento AS
SELECT 
    se.id,
    se.empreendimento_id,
    e.razao_social AS empreendimento_nome,
    e.tipo AS empreendimento_tipo,
    e.documento AS empreendimento_doc,
    se.produtor_id,
    p.nome AS produtor_nome,
    p.cpf AS produtor_cpf,
    p.telefone AS produtor_telefone,
    se.participacao,
    se.papel,
    se.ativo
FROM socios_empreendimento se
JOIN empreendimentos e ON e.id = se.empreendimento_id
JOIN produtores p ON p.id = se.produtor_id;
""")
print("  view vw_socios_empreendimento criada")

# 6. Inserir empreendimento do Condominio Rural Coqueiro
cur.execute("""
INSERT INTO empreendimentos (
    tipo, documento, razao_social, responsavel_cpf, responsavel_nome,
    atividade, municipio, uf
) VALUES (
    'CAEPF', NULL, 'Condominio Rural Coqueiro',
    '72839570491', 'Fernando Loyo Cadette',
    'Producao agropecuaria mista', 'Sao Luis', 'MA'
) RETURNING id;
""")
emp_id = cur.fetchone()[0]
print(f"  empreendimento criado id={emp_id}")

conn.commit()
print(f"\nMigration concluida! empreendimento_id={emp_id}")
print("Proximos passos:")
print("  1. Cadastrar os 3 produtores no app")
print("  2. Vincular como socios com participacoes: Fernando 40%, Cicero 20%, Geodilson 40%")
conn.close()
