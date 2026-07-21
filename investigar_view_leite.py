import psycopg2

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()

def secao(t):
    print("\n" + "="*70)
    print(t)
    print("="*70)

secao("1. Definicao da view vw_producao_leite_mensal")
cur.execute("SELECT pg_get_viewdef('vw_producao_leite_mensal'::regclass, true);")
print(cur.fetchone()[0])

secao("2. Definicao da view vw_bovino_dashboard")
cur.execute("SELECT pg_get_viewdef('vw_bovino_dashboard'::regclass, true);")
print(cur.fetchone()[0])

secao("3. Estatisticas de preco_litro / valor_total em bovino_ordenha")
cur.execute("""
    SELECT
        COUNT(*) as total_linhas,
        COUNT(preco_litro) as com_preco,
        COUNT(*) FILTER (WHERE preco_litro IS NULL) as sem_preco,
        COUNT(*) FILTER (WHERE valor_total > 0) as valor_maior_zero,
        COUNT(*) FILTER (WHERE valor_total = 0 OR valor_total IS NULL) as valor_zero_ou_null,
        MIN(data) as data_min,
        MAX(data) as data_max,
        SUM(volume_l) as volume_total_litros
    FROM bovino_ordenha;
""")
row = cur.fetchone()
cols = [d[0] for d in cur.description]
for c, v in zip(cols, row):
    print(f"  {c}: {v}")

secao("4. Distribuicao por 'fonte' em bovino_ordenha")
cur.execute("""
    SELECT fonte, COUNT(*), COUNT(preco_litro) as com_preco, SUM(volume_l)
    FROM bovino_ordenha
    GROUP BY fonte;
""")
for row in cur.fetchall():
    print(f"  {row}")

secao("5. Distribuicao por 'destinacao' em bovino_ordenha")
cur.execute("""
    SELECT destinacao, COUNT(*), COUNT(preco_litro) as com_preco
    FROM bovino_ordenha
    GROUP BY destinacao;
""")
for row in cur.fetchall():
    print(f"  {row}")

secao("6. imovel_id presentes em bovino_ordenha (para saber qual propriedade)")
cur.execute("SELECT imovel_id, COUNT(*) FROM bovino_ordenha GROUP BY imovel_id;")
for row in cur.fetchall():
    print(f"  {row}")

cur.close()
conn.close()
print("\n\nInvestigacao concluida.")
