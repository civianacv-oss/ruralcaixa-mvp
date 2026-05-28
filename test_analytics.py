import psycopg2
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()
cur.execute("""
    SELECT s.nome as label, SUM(l.valor) as total
    FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
    WHERE l.produtor_id = 1 AND s.tipo = 'RECEITA'
    AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)
    GROUP BY s.nome ORDER BY total DESC
""")
print("Receitas mes atual:", cur.fetchall())
cur.execute("""
    SELECT to_char(l.data, 'YYYY-MM') as mes, LOWER(s.tipo) as tipo, SUM(l.valor) as total
    FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
    WHERE l.produtor_id = 1
    AND l.data >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY mes, s.tipo ORDER BY mes
""")
print("Evolucao 6 meses:", cur.fetchall())
conn.close()
