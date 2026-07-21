-- migration_020_fiscal.sql
-- Cria as tabelas do módulo fiscal que ainda não existirem.
-- IF NOT EXISTS: seguro rodar mesmo se algumas já existirem com outro nome
-- (nesse caso, ajuste os nomes nas queries de fiscal_resumo.py em vez de
-- rodar esta migration).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS nfe_emitidas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
    numero_nfe TEXT,
    serie TEXT NOT NULL DEFAULT '001',
    data_emissao DATE NOT NULL,
    valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    destinatario TEXT,
    chave_acesso TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfe_emitidas_imovel_data ON nfe_emitidas(imovel_id, data_emissao);

CREATE TABLE IF NOT EXISTS esocial_eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
    tipo_evento TEXT NOT NULL,          -- ex: 'S-1260', 'S-1200', 'S-1210'
    competencia TEXT NOT NULL,          -- ex: '06/2026'
    vencimento DATE NOT NULL,
    transmitido BOOLEAN NOT NULL DEFAULT FALSE,
    data_transmissao TIMESTAMP,
    recibo TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_esocial_eventos_imovel_pendente ON esocial_eventos(imovel_id, transmitido);

CREATE TABLE IF NOT EXISTS efdreinf_apuracoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
    competencia TEXT NOT NULL,
    vencimento DATE NOT NULL,
    valor_darf NUMERIC(14,2) NOT NULL DEFAULT 0,
    valor_multa NUMERIC(14,2) NOT NULL DEFAULT 0,
    quitado BOOLEAN NOT NULL DEFAULT FALSE,
    data_quitacao DATE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_efdreinf_imovel_quitado ON efdreinf_apuracoes(imovel_id, quitado);

CREATE TABLE IF NOT EXISTS dctfweb_transmissoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
    competencia TEXT NOT NULL,
    proxima_competencia TEXT,
    data_transmissao TIMESTAMP NOT NULL,
    situacao TEXT NOT NULL DEFAULT 'aceita',  -- 'aceita' | 'pendente' | 'rejeitada'
    recibo TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dctfweb_imovel_data ON dctfweb_transmissoes(imovel_id, data_transmissao);

CREATE TABLE IF NOT EXISTS simulacoes_tributarias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
    regime_atual TEXT NOT NULL,          -- ex: 'Pessoa Física', 'Pessoa Jurídica'
    economia_potencial NUMERIC(14,2),
    data_simulacao TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_simulacoes_imovel ON simulacoes_tributarias(imovel_id);
