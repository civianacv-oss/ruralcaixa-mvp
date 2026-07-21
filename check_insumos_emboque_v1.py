"""
RuralCaixa — Diagnostico: insumos da Fazenda Emboque (fazenda_id=6)
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
        SELECT id, nome, categoria, unidade, estoque_atual, custo_medio, ativo
        FROM insumos
        WHERE fazenda_id = 6
        ORDER BY ativo DESC, nome
    """)
    rows = cur.fetchall()
    print(f"Total de insumos (fazenda_id=6): {len(rows)}")
    for r in rows:
        print(f"  {dict(r)}")
    if not rows:
        print("  NENHUM insumo cadastrado -- o bot nao vai reconhecer nada ate cadastrar.")
    conn.close()

if __name__ == "__main__":
    run()
