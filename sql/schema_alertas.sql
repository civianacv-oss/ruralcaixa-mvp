-- Script SQL para criar/validar tabelas necessárias para o monitor de amônia/nitrito
-- Execute este script no seu banco PostgreSQL

-- 1. Tabela de ciclos (se não existir)
CREATE TABLE IF NOT EXISTS piscicultura_ciclos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    especie VARCHAR(100),
    status VARCHAR(50) DEFAULT 'ATIVO',
    data_inicio TIMESTAMP DEFAULT NOW(),
    data_fim TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabela de leituras de qualidade da água (se não existir)
CREATE TABLE IF NOT EXISTS piscicultura_leituras (
    id SERIAL PRIMARY KEY,
    ciclo_id INTEGER NOT NULL REFERENCES piscicultura_ciclos(id) ON DELETE CASCADE,
    data_medicao TIMESTAMP NOT NULL,
    amonia DECIMAL(5, 2),
    nitrito DECIMAL(5, 2),
    ph DECIMAL(3, 1),
    temperatura DECIMAL(5, 2),
    oxigenio DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabela de alertas (PRINCIPAL para o monitor)
CREATE TABLE IF NOT EXISTS piscicultura_alertas (
    id SERIAL PRIMARY KEY,
    ciclo_id INTEGER NOT NULL REFERENCES piscicultura_ciclos(id) ON DELETE CASCADE,
    leitura_id INTEGER NOT NULL REFERENCES piscicultura_leituras(id) ON DELETE CASCADE,
    parametro VARCHAR(50) NOT NULL, -- 'NH3' ou 'NO2'
    valor DECIMAL(5, 2) NOT NULL,
    nivel VARCHAR(50) NOT NULL, -- 'AVISO' ou 'CRÍTICO'
    data_alerta TIMESTAMP DEFAULT NOW(),
    resolvido BOOLEAN DEFAULT FALSE,
    data_resolucao TIMESTAMP,
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Índices para melhor performance
    UNIQUE(leitura_id, parametro) -- Evita alertas duplicados para mesma leitura
);

-- 4. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_piscicultura_ciclos_status 
    ON piscicultura_ciclos(status);

CREATE INDEX IF NOT EXISTS idx_piscicultura_leituras_ciclo_id 
    ON piscicultura_leituras(ciclo_id);

CREATE INDEX IF NOT EXISTS idx_piscicultura_leituras_data_medicao 
    ON piscicultura_leituras(data_medicao DESC);

CREATE INDEX IF NOT EXISTS idx_piscicultura_alertas_ciclo_id 
    ON piscicultura_alertas(ciclo_id);

CREATE INDEX IF NOT EXISTS idx_piscicultura_alertas_data_alerta 
    ON piscicultura_alertas(data_alerta DESC);

CREATE INDEX IF NOT EXISTS idx_piscicultura_alertas_resolvido 
    ON piscicultura_alertas(resolvido);

-- 5. Verificar estrutura das tabelas
-- Descomente para validar:
-- \d piscicultura_ciclos
-- \d piscicultura_leituras
-- \d piscicultura_alertas

-- 6. Dados de exemplo (opcional - comentado)
-- INSERT INTO piscicultura_ciclos (nome, especie, status) 
-- VALUES ('Tilápia Viveiro 1 – 2026/1', 'Tilápia do Nilo', 'ATIVO');

-- INSERT INTO piscicultura_leituras (ciclo_id, data_medicao, amonia, nitrito, ph, temperatura, oxigenio)
-- VALUES (1, NOW(), 0.72, 0.08, 7.2, 28.5, 6.8);
