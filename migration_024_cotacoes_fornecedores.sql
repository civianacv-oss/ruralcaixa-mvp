-- migration_024_cotacoes_fornecedores.sql
--
-- Funcionalidade: "Solicitar cotação" — pedir preço a um ou mais
-- fornecedores ANTES de decidir a compra (diferente de pedidos_compra,
-- que já pressupõe que a compra foi decidida).

CREATE TABLE IF NOT EXISTS cotacoes_insumo (
    id SERIAL PRIMARY KEY,
    fazenda_id INTEGER NOT NULL DEFAULT 1,
    insumo_id INTEGER REFERENCES insumos(id),
    descricao_produto TEXT NOT NULL,
    quantidade NUMERIC NOT NULL,
    unidade TEXT NOT NULL DEFAULT 'unidade',
    observacoes TEXT,
    status TEXT NOT NULL DEFAULT 'aberta',
        -- 'aberta' | 'respondida_parcial' | 'respondida_completa' | 'fechada' | 'cancelada'
    data_solicitacao DATE DEFAULT CURRENT_DATE,
    data_limite_resposta DATE,
    fornecedor_vencedor_id INTEGER REFERENCES fornecedores(id),
    pedido_compra_id INTEGER REFERENCES pedidos_compra(id),
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cotacoes_insumo_fazenda ON cotacoes_insumo(fazenda_id, status);

CREATE TABLE IF NOT EXISTS cotacao_fornecedores (
    id SERIAL PRIMARY KEY,
    cotacao_id INTEGER NOT NULL REFERENCES cotacoes_insumo(id) ON DELETE CASCADE,
    fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
    enviado_em TIMESTAMPTZ,
    mensagem_enviada TEXT,
    enviado_via TEXT DEFAULT 'nao_enviado',  -- 'telegram' | 'whatsapp' | 'nao_enviado'
    preco_unitario NUMERIC,
    prazo_entrega_dias INTEGER,
    observacao_resposta TEXT,
    respondido_em TIMESTAMPTZ,
    UNIQUE (cotacao_id, fornecedor_id)
);

CREATE INDEX IF NOT EXISTS idx_cotacao_fornecedores_cotacao ON cotacao_fornecedores(cotacao_id);
