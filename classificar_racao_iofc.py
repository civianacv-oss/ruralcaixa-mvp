import psycopg2
import psycopg2.extras

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

PALAVRAS_CHAVE_LEITE = {
    'lacmaster', 'leite', 'lactacao', 'lactação', 'lactante',
    'vaca de leite', 'vacas lactacao', 'bezerra', 'bezerro',
    'ccpr', 'nucleo leite', 'nucleo de leite', 'nucleo vaca',
    'fos 80', 'fos 90', 'sucedaneo', 'sucedâneo',
    'leite em po', 'leite em pó', 'leite po',
}
PALAVRAS_CHAVE_CORTE = {
    'engorda', 'terminacao', 'terminação', 'boi', 'novilho',
    'gado de corte', 'corte', 'recria', 'sobreano',
    'milho para engorda', 'farelo para engorda',
}
PALAVRAS_CHAVE_AMBOS = {
    'milho', 'soja', 'farelo de soja', 'farelo', 'ureia',
    'silagem', 'balaio de silagem', 'colheita de silagem',
    'lona silagem', 'inoculante', 'adubo npk', 'npk', 'zizinho',
}

def normalizar(s):
    s = s.lower()
    repl = {'á':'a','à':'a','â':'a','ã':'a','é':'e','ê':'e','í':'i','ó':'o','ô':'o','õ':'o','ú':'u','ç':'c'}
    for k, v in repl.items():
        s = s.replace(k, v)
    return s

def classificar(nome):
    n = normalizar(nome)
    if any(normalizar(kw) in n for kw in PALAVRAS_CHAVE_LEITE):
        return 'leite'
    if any(normalizar(kw) in n for kw in PALAVRAS_CHAVE_CORTE):
        return 'corte'
    if any(normalizar(kw) in n for kw in PALAVRAS_CHAVE_AMBOS):
        return 'ambos'
    return 'indefinido'

conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("--- Classificacao das subcontas de racao (codigo_conta = 3.1.3.1) ---\n")
cur.execute("SELECT id, nome FROM subcontas WHERE codigo_conta = '3.1.3.1' ORDER BY nome;")
subcontas = cur.fetchall()

ids_leite = []
ids_ambos = []
ids_corte = []
ids_indef = []

for s in subcontas:
    classe = classificar(s['nome'])
    print(f"  [{classe:10}] {s['nome']}")
    if classe == 'leite':
        ids_leite.append(s['id'])
    elif classe == 'ambos':
        ids_ambos.append(s['id'])
    elif classe == 'corte':
        ids_corte.append(s['id'])
    else:
        ids_indef.append(s['id'])

print(f"\nResumo: leite={len(ids_leite)}, ambos={len(ids_ambos)}, corte={len(ids_corte)}, indefinido={len(ids_indef)}")

def custo_por_ids(ids, label):
    if not ids:
        print(f"\n{label}: nenhuma subconta, custo = 0")
        return
    cur.execute("""
        SELECT date_trunc('month', l.data)::date AS mes, SUM(l.valor) AS custo
        FROM lancamentos l
        WHERE l.subconta_id = ANY(%s::uuid[])
        GROUP BY date_trunc('month', l.data)
        ORDER BY mes DESC;
    """, (ids,))
    print(f"\n--- Custo mensal: {label} ---")
    for row in cur.fetchall():
        print(f"  {dict(row)}")

custo_por_ids(ids_leite, "SO 'leite'")
custo_por_ids(ids_leite + ids_ambos, "'leite' + 'ambos'")
custo_por_ids([s['id'] for s in subcontas], "TOTAL (todas, sem filtro)")

print("\n\n--- IOFC recalculado (custo = SO itens 'leite') ---")
cur.execute("""
    WITH producao_mensal AS (
        SELECT ir.produtor_id, date_trunc('month', o.data)::date AS mes, SUM(o.volume_l) AS volume_l
        FROM bovino_ordenha o JOIN imoveis_rurais ir ON ir.id = o.imovel_id
        WHERE o.destinacao = 'venda'
        GROUP BY ir.produtor_id, date_trunc('month', o.data)
    ),
    receita_real AS (
        SELECT l.produtor_id, date_trunc('month', l.data)::date AS mes, SUM(l.valor) AS receita_leite_real
        FROM lancamentos l
        WHERE l.subconta_id = '1d3e0f2c-9bfb-49ab-a603-1c42fc434a75'
        GROUP BY l.produtor_id, date_trunc('month', l.data)
    ),
    preco_cepea AS (
        SELECT data_referencia AS mes, valor AS preco_litro
        FROM cotacoes_mercado WHERE produto = 'leite_litro_brasil'
    ),
    custo_racao_leite AS (
        SELECT l.produtor_id, date_trunc('month', l.data)::date AS mes, SUM(l.valor) AS custo_racao
        FROM lancamentos l
        WHERE l.subconta_id = ANY(%s::uuid[])
        GROUP BY l.produtor_id, date_trunc('month', l.data)
    )
    SELECT
        p.produtor_id, p.mes, p.volume_l,
        COALESCE(r.receita_leite_real, 0) AS receita_real,
        pc.preco_litro AS preco_cepea_mes,
        ROUND(COALESCE(r.receita_leite_real, p.volume_l * pc.preco_litro)::numeric, 2) AS receita_leite_final,
        COALESCE(c.custo_racao, 0) AS custo_racao_leite,
        ROUND((COALESCE(r.receita_leite_real, p.volume_l * pc.preco_litro) - COALESCE(c.custo_racao, 0))::numeric, 2) AS iofc
    FROM producao_mensal p
    LEFT JOIN receita_real r ON r.produtor_id = p.produtor_id AND r.mes = p.mes
    LEFT JOIN preco_cepea pc ON pc.mes = p.mes
    LEFT JOIN custo_racao_leite c ON c.produtor_id = p.produtor_id AND c.mes = p.mes
    ORDER BY p.produtor_id, p.mes DESC
    LIMIT 12;
""", (ids_leite,))
for row in cur.fetchall():
    print(dict(row))

cur.close()
conn.close()
print("\nConcluido.")
