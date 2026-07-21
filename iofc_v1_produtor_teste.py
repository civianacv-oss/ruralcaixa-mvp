import psycopg2
import psycopg2.extras

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def secao(t):
    print("\n" + "="*70)
    print(t)
    print("="*70)

secao("0. Checagem: lancamentos de racao/leite SEM produtor_id (deve ser raro/zero)")
cur.execute("""
    SELECT s.codigo_conta, COUNT(*) AS total, COUNT(*) FILTER (WHERE l.produtor_id IS NULL) AS sem_produtor
    FROM lancamentos l
    JOIN subcontas s ON s.id = l.subconta_id
    WHERE s.codigo_conta IN ('3.1.3.1', '4.1.2')
    GROUP BY s.codigo_conta;
""")
for row in cur.fetchall():
    print(dict(row))

secao("1. IOFC v1 - nivel produtor (Cicero, produtor_id=1)")
cur.execute("""
    WITH producao_mensal AS (
        SELECT
            ir.produtor_id,
            date_trunc('month', o.data)::date AS mes,
            SUM(o.volume_l) AS volume_l
        FROM bovino_ordenha o
        JOIN imoveis_rurais ir ON ir.id = o.imovel_id
        WHERE o.destinacao = 'venda'
        GROUP BY ir.produtor_id, date_trunc('month', o.data)
    ),
    receita_real AS (
        SELECT
            l.produtor_id,
            date_trunc('month', l.data)::date AS mes,
            SUM(l.valor) AS receita_leite_real
        FROM lancamentos l
        WHERE l.subconta_id = '1d3e0f2c-9bfb-49ab-a603-1c42fc434a75'
        GROUP BY l.produtor_id, date_trunc('month', l.data)
    ),
    preco_cepea AS (
        SELECT data_referencia AS mes, valor AS preco_litro
        FROM cotacoes_mercado WHERE produto = 'leite_litro_brasil'
    ),
    custo_racao AS (
        SELECT
            l.produtor_id,
            date_trunc('month', l.data)::date AS mes,
            SUM(l.valor) AS custo_racao
        FROM lancamentos l
        JOIN subcontas s ON s.id = l.subconta_id
        WHERE s.codigo_conta = '3.1.3.1'
        GROUP BY l.produtor_id, date_trunc('month', l.data)
    )
    SELECT
        p.produtor_id,
        p.mes,
        p.volume_l,
        COALESCE(r.receita_leite_real, 0) AS receita_real,
        pc.preco_litro AS preco_cepea_mes,
        ROUND(COALESCE(r.receita_leite_real, p.volume_l * pc.preco_litro)::numeric, 2) AS receita_leite_final,
        COALESCE(c.custo_racao, 0) AS custo_racao,
        ROUND(
            (COALESCE(r.receita_leite_real, p.volume_l * pc.preco_litro) - COALESCE(c.custo_racao, 0))::numeric, 2
        ) AS iofc
    FROM producao_mensal p
    LEFT JOIN receita_real r ON r.produtor_id = p.produtor_id AND r.mes = p.mes
    LEFT JOIN preco_cepea pc ON pc.mes = p.mes
    LEFT JOIN custo_racao c ON c.produtor_id = p.produtor_id AND c.mes = p.mes
    ORDER BY p.produtor_id, p.mes DESC
    LIMIT 12;
""")
for row in cur.fetchall():
    print(dict(row))

secao("2. Custo de racao total (sem filtro de mes) - para conferir que agora aparece")
cur.execute("""
    SELECT l.produtor_id, COUNT(*) AS qtd, SUM(l.valor) AS total
    FROM lancamentos l
    JOIN subcontas s ON s.id = l.subconta_id
    WHERE s.codigo_conta = '3.1.3.1'
    GROUP BY l.produtor_id;
""")
for row in cur.fetchall():
    print(dict(row))

cur.close()
conn.close()
print("\nConcluido.")
