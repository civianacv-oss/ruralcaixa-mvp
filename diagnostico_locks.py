import psycopg2

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

print("Conectando (com timeout curto para nao travar)...")
conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()

print("\n--- Sessoes ativas (pg_stat_activity) ---")
cur.execute("""
    SELECT pid, state, wait_event_type, wait_event, query_start, now() - query_start AS duracao,
           left(query, 100) AS query_inicio
    FROM pg_stat_activity
    WHERE datname = current_database()
    ORDER BY query_start ASC NULLS LAST;
""")
rows = cur.fetchall()
for r in rows:
    print(r)

print(f"\nTotal de sessoes: {len(rows)}")

print("\n--- Locks ativos na tabela subcontas ---")
cur.execute("""
    SELECT l.pid, l.mode, l.granted, a.state, a.query_start, left(a.query, 100)
    FROM pg_locks l
    JOIN pg_stat_activity a ON l.pid = a.pid
    JOIN pg_class c ON l.relation = c.oid
    WHERE c.relname = 'subcontas';
""")
lock_rows = cur.fetchall()
for r in lock_rows:
    print(r)

print(f"\nTotal de locks na tabela subcontas: {len(lock_rows)}")

print("\n--- Queries bloqueadas (esperando lock) ---")
cur.execute("""
    SELECT blocked_locks.pid AS pid_bloqueado,
           blocking_locks.pid AS pid_bloqueando,
           blocked_activity.query AS query_bloqueada,
           blocking_activity.query AS query_bloqueando
    FROM pg_catalog.pg_locks blocked_locks
    JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
    JOIN pg_catalog.pg_locks blocking_locks
        ON blocking_locks.locktype = blocked_locks.locktype
        AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
        AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
        AND blocking_locks.pid != blocked_locks.pid
    JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
    WHERE NOT blocked_locks.granted;
""")
blocked_rows = cur.fetchall()
for r in blocked_rows:
    print(r)
print(f"\nTotal de queries bloqueadas: {len(blocked_rows)}")

cur.close()
conn.close()
print("\nDiagnostico concluido.")
