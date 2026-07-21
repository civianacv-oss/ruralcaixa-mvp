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

secao("0. Checagem: propriedade_id nulo em lancamentos (racao e venda de leite)")
cur.execute("""
    SELECT
        s.codigo_conta,
        s.nome,
        COUNT(*) AS total_lancamentos,
        COUNT(*) FILTER (WHERE l.propriedade_id IS NULL) AS sem_propriedade_id
    FROM lancamentos l
    JOIN subcontas s ON s.id = l.subconta_id
    WHERE s.codigo_conta = '3.1.3.1' OR s.codigo_conta = '4.1.2'
    GROUP BY s.codigo_conta, s.nome
    ORDER BY s.codigo_conta;
""")
for row in cur.fetchall():
    print(dict(row))

secao("1. Query completa do IOFC mensal por propriedade")
cur.execute("""
    WITH producao_mensal AS (
        SELECT
            imovel_id,
            date_trunc('month', data)::date AS mes,
            SUM(volume_l) AS volume_l
        FROM bovino_ordenha
        WHERE destinacao = 'venda'
        GROUP BY imovel_id, date_trunc('month', data)
    ),
    receita_real AS (
        SELECT
            l.propriedade_id AS imovel_id,
            date_trunc('month', l.data)::date AS mes,
            SUM(l.valor) AS receita_leite_real
        FROM lancamentos l
        WHERE l.subconta_id = '1d3e0f2c-9bfb-49ab-a603-1c42fc434a75'
        GROUP BY l.propriedade_id, date_trunc('month', l.data)
    ),
    preco_cepea AS (
        SELECT data_referencia AS mes, valor AS preco_litro
        FROM cotacoes_mercado
        WHERE produto = 'leite_litro_brasil'
    ),
    custo_racao AS (
        SELECT
            l.propriedade_id AS imovel_id,
            date_trunc('month', l.data)::date AS mes,
            SUM(l.valor) AS custo_racao
        FROM lancamentos l
        JOIN subcontas s ON s.id = l.subconta_id
        WHERE s.codigo_conta = '3.1.3.1'
        GROUP BY l.propriedade_id, date_trunc('month', l.data)
    )
    SELECT
        p.imovel_id,
        p.mes,
        p.volume_l,
        COALESCE(r.receita_leite_real, 0) AS receita_real,
        pc.preco_litro AS preco_cepea_mes,
        ROUND(
            COALESCE(r.receita_leite_real, p.volume_l * pc.preco_litro)::numeric, 2
        ) AS receita_leite_final,
        COALESCE(c.custo_racao, 0) AS custo_racao,
        ROUND(
            (COALESCE(r.receita_leite_real, p.volume_l * pc.preco_litro)
             - COALESCE(c.custo_racao, 0))::numeric, 2
        ) AS iofc
    FROM producao_mensal p
    LEFT JOIN receita_real r ON r.imovel_id = p.imovel_id AND r.mes = p.mes
    LEFT JOIN preco_cepea pc ON pc.mes = p.mes
    LEFT JOIN custo_racao c ON c.imovel_id = p.imovel_id AND c.mes = p.mes
    ORDER BY p.imovel_id, p.mes DESC
    LIMIT 12;
""")
resultado = cur.fetchall()
for row in resultado:
    print(dict(row))

secao("2. Quantos meses de producao existem SEM preco CEPEA disponivel (gap)")
cur.execute("""
    WITH producao_mensal AS (
        SELECT DISTINCT date_trunc('month', data)::date AS mes
        FROM bovino_ordenha WHERE destinacao='venda'
    )
    SELECT COUNT(*) AS meses_totais,
           COUNT(*) FILTER (WHERE mes IN (SELECT data_referencia FROM cotacoes_mercado WHERE produto='leite_litro_brasil')) AS meses_com_preco
    FROM producao_mensal;
""")
print(dict(cur.fetchone()))

cur.close()
conn.close()
print("\nConcluido.")
