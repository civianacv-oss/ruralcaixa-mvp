import psycopg2
import psycopg2.extras
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()

print("=== Dados cadastrais dos dois registros ===")
cur.execute("SELECT * FROM imoveis_rurais WHERE id IN (6, 10)")
for r in cur.fetchall():
    print(dict(r))

print("\n=== Buscando todas as tabelas com coluna imovel_id ===")
cur.execute("""
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'imovel_id'
      AND table_schema = 'public'
    ORDER BY table_name
""")
tabelas = [r["table_name"] for r in cur.fetchall()]
print(f"Encontradas {len(tabelas)} tabelas: {tabelas}")

print("\n=== Contagem de linhas por tabela (imovel_id=6 vs imovel_id=10) ===")
resumo = []
for t in tabelas:
    try:
        cur.execute(f"""
            SELECT
                COUNT(*) FILTER (WHERE imovel_id = 6)  AS total_6,
                COUNT(*) FILTER (WHERE imovel_id = 10) AS total_10
            FROM {t}
            WHERE imovel_id IN (6, 10)
        """)
        row = cur.fetchone()
        if row["total_6"] > 0 or row["total_10"] > 0:
            resumo.append((t, row["total_6"], row["total_10"]))
    except Exception as e:
        print(f"  [erro em {t}]: {str(e)[:100]}")
        conn.rollback()

print(f"\n{'Tabela':<35} {'imovel_id=6':>12} {'imovel_id=10':>13}")
print("-" * 62)
for t, c6, c10 in resumo:
    print(f"{t:<35} {c6:>12} {c10:>13}")

if not resumo:
    print("Nenhuma tabela tem dados vinculados a nenhum dos dois IDs.")

conn.close()
