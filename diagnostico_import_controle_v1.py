"""
RuralCaixa — Diagnóstico: import de controle_todas_lactacoes realmente gravou dados?

Somente LEITURA.
Uso: DATABASE_URL="postgresql://..." python3 diagnostico_import_controle_v1.py
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

    print("=" * 70)
    print("1) Total de registros bovino_ordenha (fonte=gisleite) HOJE")
    print("=" * 70)
    cur.execute("SELECT COUNT(*) AS total FROM bovino_ordenha WHERE fonte = 'gisleite'")
    print(f"  Total: {cur.fetchone()['total']}")

    print()
    print("=" * 70)
    print("2) Quantos foram criados HOJE (created_at nas ultimas 2 horas)")
    print("=" * 70)
    cur.execute("""
        SELECT COUNT(*) AS total
        FROM bovino_ordenha
        WHERE fonte = 'gisleite' AND created_at >= NOW() - INTERVAL '2 hours'
    """)
    print(f"  Criados nas ultimas 2h: {cur.fetchone()['total']}")

    print()
    print("=" * 70)
    print("3) Distribuicao por data de criacao (agrupado por dia)")
    print("=" * 70)
    cur.execute("""
        SELECT DATE(created_at) AS dia, COUNT(*) AS qtd
        FROM bovino_ordenha
        WHERE fonte = 'gisleite'
        GROUP BY DATE(created_at)
        ORDER BY dia
    """)
    for r in cur.fetchall():
        print(f"  {r['dia']}: {r['qtd']} registro(s)")

    print()
    print("=" * 70)
    print("4) Volume de leite (volume_l) -- confere se nao esta tudo zerado")
    print("=" * 70)
    cur.execute("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE volume_l IS NULL OR volume_l = 0) AS zerados_ou_nulos,
            ROUND(AVG(volume_l), 2) AS media_volume,
            MIN(volume_l) AS min_volume,
            MAX(volume_l) AS max_volume
        FROM bovino_ordenha
        WHERE fonte = 'gisleite'
    """)
    print(f"  {dict(cur.fetchone())}")

    print()
    print("=" * 70)
    print("5) Amostra de 10 registros criados HOJE, com volume_l")
    print("=" * 70)
    cur.execute("""
        SELECT id, animal_id, data, volume_l, gordura_pct, numero_controle_externo, created_at
        FROM bovino_ordenha
        WHERE fonte = 'gisleite' AND created_at >= NOW() - INTERVAL '2 hours'
        ORDER BY id
        LIMIT 10
    """)
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    conn.close()

if __name__ == "__main__":
    run()
