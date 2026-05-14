-- Produtores
CREATE TABLE produtores (
    id SERIAL PRIMARY KEY,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    nome VARCHAR(200) NOT NULL,
    telefone VARCHAR(20),
    nirf VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Imóveis rurais
CREATE TABLE imoveis_rurais (
    id SERIAL PRIMARY KEY,
    produtor_id INTEGER REFERENCES produtores(id),
    nome VARCHAR(200) NOT NULL,
    nirf VARCHAR(20),
    area_ha DECIMAL(10,2),
    municipio VARCHAR(100),
    uf CHAR(2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Plano de contas
CREATE TABLE plano_contas (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(10) UNIQUE NOT NULL,
    descricao VARCHAR(200) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    dedutivel BOOLEAN DEFAULT TRUE
);

-- Lançamentos
CREATE TABLE lancamentos (
    id SERIAL PRIMARY KEY,
    produtor_id INTEGER REFERENCES produtores(id),
    imovel_id INTEGER REFERENCES imoveis_rurais(id),
    conta_codigo VARCHAR(10) REFERENCES plano_contas(codigo),
    tipo VARCHAR(20) NOT NULL,
    descricao TEXT,
    valor DECIMAL(12,2) NOT NULL,
    data_lancamento DATE NOT NULL,
    origem VARCHAR(20) DEFAULT 'manual',
    status VARCHAR(20) DEFAULT 'confirmado',
    texto_original TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Log de auditoria
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    tabela VARCHAR(50),
    registro_id INTEGER,
    acao VARCHAR(20),
    usuario VARCHAR(100),
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Plano de contas básico
INSERT INTO plano_contas (codigo, descricao, tipo, dedutivel) VALUES
('1.1',   'Receita da atividade rural',              'receita',      false),
('1.1.1', 'Venda de produtos agricolas',             'receita',      false),
('1.1.2', 'Venda de produtos pecuarios',             'receita',      false),
('1.1.3', 'Receita de arrendamento rural',           'receita',      false),
('3.1.1', 'Custeio agricola',                        'despesa',      true),
('3.1.2', 'Combustiveis e lubrificantes',            'despesa',      true),
('3.1.3', 'Despesas com pecuaria',                   'despesa',      true),
('3.1.4', 'Mao de obra e encargos',                  'despesa',      true),
('3.1.5', 'Manutencao de maquinas',                  'despesa',      true),
('3.1.6', 'Energia eletrica rural',                  'despesa',      true),
('3.1.7', 'Arrendamentos pagos',                     'despesa',      true),
('5.1',   'Aquisicao de maquinas e equipamentos',    'investimento', false),
('5.2',   'Obras e benfeitorias',                    'investimento', false),
('5.3',   'Aquisicao de animais',                    'investimento', false);

-- Produtor de teste
INSERT INTO produtores (cpf, nome, telefone) VALUES
('123.456.789-00', 'João Batista Neves', '5598992002705');

INSERT INTO imoveis_rurais (produtor_id, nome, nirf, area_ha, municipio, uf) VALUES
(1, 'Fazenda Boa Esperança', '1234567-8', 450.00, 'Barretos', 'SP');