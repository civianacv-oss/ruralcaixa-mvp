import psycopg2
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()

print("=== SUBCONTAS ===")
cur.execute("SELECT id, nome, tipo, atividade_tipo FROM subcontas ORDER BY tipo, nome")
for r in cur.fetchall():
    print(f"  {r[2]:8} {r[3]:10} {r[1]}")

print("\n=== LANCAMENTOS por tipo ===")
cur.execute("""
    SELECT s.tipo, COUNT(*), SUM(l.valor)
    FROM lancamentos l
    LEFT JOIN subcontas s ON s.id = l.subconta_id
    GROUP BY s.tipo
""")
for r in cur.fetchall():
    print(f"  {r}")

print("\n=== MAIN.PY usa colunas: ===")
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='lancamentos' ORDER BY ordinal_position")
print(" ", [r[0] for r in cur.fetchall()])

conn.close()
