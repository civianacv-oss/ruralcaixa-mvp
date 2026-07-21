"""
RuralCaixa — Diagnostico: insumo "Milho" existe pra fazenda_id=1?
Somente LEITURA.
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, nome, categoria, unidade, estoque_atual, ativo
        FROM insumos
        WHERE fazenda_id = 1 AND ativo = true
        ORDER BY nome
    """)
    rows = cur.fetchall()
    print(f"Total de insumos ativos (fazenda_id=1): {len(rows)}")
    for r in rows:
        print(f"  {dict(r)}")
    conn.close()

if __name__ == "__main__":
    run()
