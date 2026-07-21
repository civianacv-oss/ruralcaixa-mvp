import psycopg2
import psycopg2.extras

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

# IDs classificados como 'leite' na rodada anterior (buscados de novo aqui
# para nao depender de lista hardcoded desatualizavel)

PALAVRAS_CHAVE_LEITE = {
    'lacmaster', 'leite', 'lactacao', 'lactação', 'lactante',
    'vaca de leite', 'vacas lactacao', 'bezerra', 'bezerro',
    'ccpr', 'nucleo leite', 'nucleo de leite', 'nucleo vaca',
    'fos 80', 'fos 90', 'sucedaneo', 'sucedâneo',
    'leite em po', 'leite em pó', 'leite po',
}

def normalizar(s):
    s = s.lower()
    repl = {'á':'a','à':'a','â':'a','ã':'a','é':'e','ê':'e','í':'i','ó':'o','ô':'o','õ':'o','ú':'u','ç':'c'}
    for k, v in repl.items():
        s = s.replace(k, v)
    return s

def eh_leite(nome):
    n = normalizar(nome)
    return any(normalizar(kw) in n for kw in PALAVRAS_CHAVE_LEITE)

conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT id, nome FROM subcontas WHERE codigo_conta = '3.1.3.1';")
subcontas = cur.fetchall()

ids_leite = [s['id'] for s in subcontas if eh_leite(s['nome'])]

print(f"Atualizando {len(ids_leite)} subcontas para codigo_conta = '3.1.3.1.1' (Racao - Leite)...")
cur.execute("""
    UPDATE subcontas SET codigo_conta = '3.1.3.1.1'
    WHERE id = ANY(%s::uuid[])
    RETURNING id, nome;
""", (ids_leite,))
for row in cur.fetchall():
    print(f"  {dict(row)}")

print("\nConferindo distribuicao final dentro de 3.1.3.1.x:")
cur.execute("""
    SELECT codigo_conta, COUNT(*) FROM subcontas
    WHERE codigo_conta LIKE '3.1.3.1%'
    GROUP BY codigo_conta ORDER BY codigo_conta;
""")
for row in cur.fetchall():
    print(f"  {dict(row)}")

cur.close()
conn.close()
print("\nConcluido.")
