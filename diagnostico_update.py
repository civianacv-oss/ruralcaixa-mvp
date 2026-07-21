import psycopg2

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def testar(nome, fn):
    print(f"\n--- {nome} ---")
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
        conn.autocommit = False
        cur = conn.cursor()
        fn(cur)
        conn.rollback()  # nunca commitar neste diagnostico
        cur.close()
        conn.close()
        print("  OK")
    except Exception as e:
        print(f"  FALHOU: {type(e).__name__}: {e}")

# Teste 1: SELECT simples na tabela subcontas
def t1(cur):
    cur.execute("SELECT id, nome, tipo FROM subcontas LIMIT 1;")
    print("  Resultado:", cur.fetchone())

# Teste 2: checar se existem triggers na tabela subcontas
def t2(cur):
    cur.execute("""
        SELECT trigger_name, event_manipulation, action_statement
        FROM information_schema.triggers
        WHERE event_object_table = 'subcontas';
    """)
    rows = cur.fetchall()
    print(f"  Triggers encontrados: {len(rows)}")
    for r in rows:
        print("   ", r)

# Teste 3: UPDATE no-op (seta a coluna pro mesmo valor que ja tem) em 1 linha so
def t3(cur):
    cur.execute("SELECT id, tipo FROM subcontas LIMIT 1;")
    row = cur.fetchone()
    print(f"  Testando UPDATE no-op na linha: {row}")
    cur.execute("UPDATE subcontas SET tipo = tipo WHERE id = %s;", (row[0],))
    print(f"  UPDATE rodou, rowcount={cur.rowcount}")

# Teste 4: UPDATE real (tipo = 'DESPESA') em 1 unica linha conhecida
def t4(cur):
    test_id = '1863b00f-009d-4dd4-a514-85f4fa86b3f1'  # 03 Tubos de 50mm
    cur.execute("SELECT tipo FROM subcontas WHERE id = %s;", (test_id,))
    print(f"  Tipo atual: {cur.fetchone()}")
    cur.execute("UPDATE subcontas SET tipo = 'DESPESA' WHERE id = %s;", (test_id,))
    print(f"  UPDATE rodou, rowcount={cur.rowcount}")

# Teste 5: UPDATE com ANY(array) - a forma que estava sendo usada na migration
def t5(cur):
    ids = ['1863b00f-009d-4dd4-a514-85f4fa86b3f1', '2e844c3a-4cd5-435b-9588-c8afa9a47288']
    cur.execute("UPDATE subcontas SET tipo = 'DESPESA' WHERE id = ANY(%s);", (ids,))
    print(f"  UPDATE com ANY() rodou, rowcount={cur.rowcount}")

testar("Teste 1: SELECT simples", t1)
testar("Teste 2: checar triggers", t2)
testar("Teste 3: UPDATE no-op (1 linha)", t3)
testar("Teste 4: UPDATE real com valor fixo (1 linha)", t4)
testar("Teste 5: UPDATE com ANY(array) (2 linhas)", t5)

print("\n\nDiagnostico concluido.")
