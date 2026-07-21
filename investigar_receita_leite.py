import psycopg2

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()

def secao(titulo):
    print("\n" + "="*70)
    print(titulo)
    print("="*70)

# 1. Listar todas as tabelas do schema public que tenham "leite", "ordenha",
#    "lactacao" ou "bovino" no nome
secao("1. Tabelas relacionadas a leite/ordenha/lactacao/bovino")
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name ILIKE '%leite%' OR table_name ILIKE '%ordenha%'
           OR table_name ILIKE '%lactac%' OR table_name ILIKE '%bovino%'
           OR table_name ILIKE '%producao%')
    ORDER BY table_name;
""")
tabelas = [r[0] for r in cur.fetchall()]
for t in tabelas:
    print(f"  - {t}")

# 2. Para cada tabela encontrada, listar colunas
for t in tabelas:
    secao(f"2. Colunas de '{t}'")
    cur.execute("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position;
    """, (t,))
    for col, tipo in cur.fetchall():
        print(f"  {col}: {tipo}")

    # amostra de 3 linhas
    try:
        cur.execute(f"SELECT * FROM {t} LIMIT 3;")
        colnames = [desc[0] for desc in cur.description]
        print(f"\n  Amostra (colunas: {colnames}):")
        for row in cur.fetchall():
            print(f"    {row}")
        cur.execute(f"SELECT COUNT(*) FROM {t};")
        print(f"  Total de linhas em '{t}': {cur.fetchone()[0]}")
    except Exception as e:
        print(f"  Erro ao amostrar: {e}")

# 3. Subcontas com "leite" no nome (RECEITA especificamente)
secao("3. Subcontas com 'leite' no nome (qualquer tipo)")
cur.execute("""
    SELECT id, nome, tipo, codigo_conta FROM subcontas
    WHERE nome ILIKE '%leite%'
    ORDER BY tipo, nome;
""")
for row in cur.fetchall():
    print(f"  {row}")

# 4. Lancamentos ligados a essas subcontas de leite, com soma por tipo
secao("4. Soma de lancamentos vinculados a subcontas com 'leite' no nome")
cur.execute("""
    SELECT s.tipo, s.nome, COUNT(l.id) as qtd_lancamentos, COALESCE(SUM(l.valor), 0) as soma_valor
    FROM subcontas s
    LEFT JOIN lancamentos l ON l.subconta_id = s.id
    WHERE s.nome ILIKE '%leite%'
    GROUP BY s.tipo, s.nome
    ORDER BY s.tipo, s.nome;
""")
for row in cur.fetchall():
    print(f"  {row}")

# 5. Verificar se existe alguma coluna de preco/volume relacionada a leite
#    em qualquer tabela do schema (procurando por "preco_leite", "litros", etc)
secao("5. Colunas com 'litro', 'preco_leite', 'volume' em qualquer tabela")
cur.execute("""
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name ILIKE '%litro%' OR column_name ILIKE '%preco_leite%'
           OR column_name ILIKE '%volume%' OR column_name ILIKE '%producao_leite%')
    ORDER BY table_name, column_name;
""")
for row in cur.fetchall():
    print(f"  {row}")

cur.close()
conn.close()
print("\n\nInvestigacao concluida.")
