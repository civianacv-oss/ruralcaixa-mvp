-- migration_021_sync_livro_caixa.sql
--
-- Sincroniza automaticamente TODO lançamento criado na tabela `lancamentos`
-- (a tela normal de "Novo Lançamento") para `livro_caixa_lancamentos`
-- (o módulo fiscal Livro Caixa).
--
-- Por que trigger e não editar cada endpoint:
-- existem inserts em lancamentos espalhados em main.py, bovino.py, ovino.py,
-- agricultura.py, caprino.py, piscicultura.py e consorcios.py. Um trigger
-- no banco cobre todos de uma vez, sem precisar caçar cada insert.
--
-- LIMITAÇÃO CONHECIDA: lancamentos.produtor_id não diz qual imóvel — se um
-- produtor tiver mais de um imóvel (ex: seu caso, com o duplicado
-- imovel_id=6/10 do Fazenda Emboque), o trigger pega o de menor id como
-- palpite. Depois de resolver o duplicado, talvez valha revisar isso.

-- 1) Coluna pra rastrear a origem exata (evita duplicar no reprocessamento)
ALTER TABLE livro_caixa_lancamentos ADD COLUMN IF NOT EXISTS origem_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_livro_caixa_origem_uuid
    ON livro_caixa_lancamentos(origem_uuid)
    WHERE origem_uuid IS NOT NULL;

-- 2) Função + trigger — dispara em todo INSERT novo em lancamentos
CREATE OR REPLACE FUNCTION sync_lancamento_to_livro_caixa()
RETURNS TRIGGER AS $$
DECLARE
    v_imovel_id INTEGER;
    v_categoria VARCHAR(40);
    v_tipo_subconta VARCHAR(20);
    v_tipo VARCHAR(10);
BEGIN
    SELECT id INTO v_imovel_id
    FROM imoveis_rurais
    WHERE produtor_id = NEW.produtor_id
    ORDER BY id
    LIMIT 1;

    -- Sem imóvel vinculado ao produtor: não há como classificar no Livro
    -- Caixa (que exige imovel_id), então não sincroniza essa linha.
    IF v_imovel_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT nome, lower(tipo) INTO v_categoria, v_tipo_subconta
    FROM subcontas
    WHERE id = NEW.subconta_id;

    IF v_tipo_subconta IN ('receita', 'despesa') THEN
        v_tipo := v_tipo_subconta;
    ELSE
        -- 'condominio' ou subconta desconhecida: classifica pelo sinal do valor
        v_tipo := CASE WHEN NEW.valor >= 0 THEN 'receita' ELSE 'despesa' END;
    END IF;

    INSERT INTO livro_caixa_lancamentos
        (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
         valor, origem, origem_uuid, deducao_irpf)
    VALUES (
        v_imovel_id,
        EXTRACT(YEAR FROM COALESCE(NEW.data, CURRENT_DATE))::int,
        COALESCE(NEW.data, CURRENT_DATE),
        v_tipo,
        LEFT(COALESCE(v_categoria, 'outros'), 40),
        COALESCE(v_categoria, 'Lançamento'),
        ABS(NEW.valor),
        'lancamento_comum',
        NEW.id,
        true
    )
    ON CONFLICT (origem_uuid) WHERE origem_uuid IS NOT NULL DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_lancamento_livro_caixa ON lancamentos;
CREATE TRIGGER trg_sync_lancamento_livro_caixa
    AFTER INSERT ON lancamentos
    FOR EACH ROW
    EXECUTE FUNCTION sync_lancamento_to_livro_caixa();

-- 3) Backfill — sincroniza os lançamentos que já existiam ANTES do trigger
INSERT INTO livro_caixa_lancamentos
    (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
     valor, origem, origem_uuid, deducao_irpf)
SELECT
    (SELECT id FROM imoveis_rurais WHERE produtor_id = l.produtor_id ORDER BY id LIMIT 1) AS imovel_id,
    EXTRACT(YEAR FROM COALESCE(l.data, CURRENT_DATE))::int,
    COALESCE(l.data, CURRENT_DATE),
    CASE
        WHEN lower(s.tipo) IN ('receita', 'despesa') THEN lower(s.tipo)
        ELSE CASE WHEN l.valor >= 0 THEN 'receita' ELSE 'despesa' END
    END,
    COALESCE(LEFT(s.nome, 40), 'outros'),
    COALESCE(s.nome, 'Lançamento'),
    ABS(l.valor),
    'lancamento_comum',
    l.id,
    true
FROM lancamentos l
LEFT JOIN subcontas s ON s.id = l.subconta_id
WHERE EXISTS (SELECT 1 FROM imoveis_rurais i WHERE i.produtor_id = l.produtor_id)
ON CONFLICT (origem_uuid) WHERE origem_uuid IS NOT NULL DO NOTHING;
