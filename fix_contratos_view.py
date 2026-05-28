import psycopg2
conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
conn.autocommit = True
cur = conn.cursor()

# Verificar colunas da tabela produtores
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='produtores' ORDER BY ordinal_position")
cols = [r[0] for r in cur.fetchall()]
print("Colunas de produtores:", cols)

# Recriar a view com o nome correto
cur.execute("""
CREATE OR REPLACE VIEW vw_contratos_resumo AS
SELECT
    c.id, c.fazenda_id, c.tipo, c.status,
    c.data_inicio, c.data_fim,
    c.percentual_outorgante, c.percentual_outorgado,
    c.frequencia_pagamento, c.area_parceria_hectares,
    c.pdf_url, c.pdf_hash_sha256,
    c.outorgante_socio_id, c.outorgante_externo_id,
    c.outorgado_socio_id,  c.outorgado_externo_id,
    COALESCE(p_ote.nome,  pe_ote.nome) AS outorgante_nome,
    COALESCE(p_odo.nome,  pe_odo.nome) AS outorgado_nome,
    (SELECT COUNT(*) FROM assinaturas a WHERE a.contrato_id = c.id AND a.status = 'assinado') AS assinaturas_concluidas,
    (SELECT COUNT(*) FROM assinaturas a WHERE a.contrato_id = c.id)                          AS assinaturas_total,
    c.criado_em, c.atualizado_em
FROM contratos c
LEFT JOIN produtores p_ote          ON p_ote.id  = c.outorgante_socio_id
LEFT JOIN parceiros_externos pe_ote ON pe_ote.id = c.outorgante_externo_id
LEFT JOIN produtores p_odo          ON p_odo.id  = c.outorgado_socio_id
LEFT JOIN parceiros_externos pe_odo ON pe_odo.id = c.outorgado_externo_id
""")
print("[OK] view vw_contratos_resumo criada com sucesso!")

conn.close()
