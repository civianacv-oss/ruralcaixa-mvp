import psycopg2
import os

conn = psycopg2.connect(
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)
cur = conn.cursor()
cur.execute(
    "SELECT conname, pg_get_constraintdef(oid) "
    "FROM pg_constraint "
    "WHERE conname = 'bovino_pesagens_motivo_check'"
)
row = cur.fetchone()
if row:
    print("Nome:", row[0])
    print("Definicao:", row[1])
else:
    print("Constraint 'bovino_pesagens_motivo_check' nao encontrada.")

# Também lista os motivos já usados de fato na tabela, se houver dados
cur.execute("SELECT DISTINCT motivo FROM bovino_pesagens LIMIT 20")
print()
print("Valores ja usados na tabela (se houver):")
for r in cur.fetchall():
    print(" -", r[0])

conn.close()
