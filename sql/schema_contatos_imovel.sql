-- Script SQL para suporte a notificações WhatsApp

-- 1. Atualizar tabela imoveis_rurais (se ainda não tiver os campos)
ALTER TABLE imoveis_rurais 
ADD COLUMN IF NOT EXISTS gestor_whatsapp VARCHAR(20),
ADD COLUMN IF NOT EXISTS gestor_nome VARCHAR(100);

-- 2. Atualizar tabela piscicultura_alertas para controle de notificações
ALTER TABLE piscicultura_alertas
ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT FALSE;

-- 3. Criar tabela de múltiplos contatos (Opcional)
CREATE TABLE IF NOT EXISTS contatos_imovel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imovel_id UUID REFERENCES imoveis_rurais(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    tipo VARCHAR(20) CHECK (tipo IN ('gestor', 'proprietario', 'tecnico', 'funcionario')),
    recebe_alertas BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_contatos_imovel_imovel_id 
    ON contatos_imovel(imovel_id);

CREATE INDEX IF NOT EXISTS idx_piscicultura_alertas_notificado 
    ON piscicultura_alertas(notificado_whatsapp);
