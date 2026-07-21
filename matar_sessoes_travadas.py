import psycopg2

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()

meu_pid = conn.get_backend_pid()
print(f"PID desta propria conexao (nao sera encerrado): {meu_pid}")

print("\n--- Sessoes 'idle in transaction' (candidatas a travar tudo) ---")
cur.execute("""
    SELECT pid, state, now() - xact_start AS tempo_parado, left(query, 80)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state = 'idle in transaction'
      AND pid <> pg_backend_pid()
    ORDER BY xact_start ASC;
""")
rows = cur.fetchall()
for r in rows:
    print(r)

if not rows:
    print("Nenhuma sessao 'idle in transaction' encontrada.")
else:
    print(f"\nEncerrando {len(rows)} sessao(oes) travada(s)...")
    for r in rows:
        pid = r[0]
        cur.execute("SELECT pg_terminate_backend(%s);", (pid,))
        result = cur.fetchone()
        print(f"  PID {pid}: terminado = {result[0]}")

print("\n--- Conferindo se ainda ha queries bloqueadas ---")
cur.execute("""
    SELECT COUNT(*)
    FROM pg_catalog.pg_locks blocked_locks
    WHERE NOT blocked_locks.granted;
""")
print(f"Locks nao concedidos restantes: {cur.fetchone()[0]}")

cur.close()
conn.close()
print("\nConcluido.")
