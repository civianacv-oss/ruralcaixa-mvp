import psycopg2
conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

cur.execute("""
    INSERT INTO lancamentos (produtor_id, imovel_id, conta_codigo, tipo, descricao, valor, valor_bruto, data_lancamento, origem, confirmado, atividade, perc_participacao, subconta)
    VALUES (12, 1, '5.2', 'investimento', '150 estacas para cerca - Pix Fernando Loyo Cadette', 1500.00, 1500.00, '2026-05-19', 'manual', TRUE, 'rural', 20.00, 'Obras e Benfeitorias')
    RETURNING id
""")
lid = cur.fetchone()[0]
conn.commit()
print(f"Lancamento #{lid} gravado!")
print("Cicero (id=12) | R$ 1.500,00 | 5.2 Obras e Benfeitorias | 19/05/2026")
conn.close()
