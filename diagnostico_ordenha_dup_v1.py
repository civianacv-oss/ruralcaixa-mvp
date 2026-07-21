"""
RuralCaixa — Diagnóstico: duplicatas em bovino_ordenha (fonte='gisleite')

Somente LEITURA. Não altera nada no banco.

Uso: DATABASE_URL="postgresql://..." python3 diagnostico_ordenha_dup_v1.py
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
    print("1) Quantos grupos (animal_id, data) tem mais de 1 linha fonte=gisleite")
    print("=" * 70)
    cur.execute("""
        SELECT animal_id, data, COUNT(*) AS qtd
        FROM bovino_ordenha
        WHERE fonte = 'gisleite'
        GROUP BY animal_id, data
        HAVING COUNT(*) > 1
        ORDER BY qtd DESC, animal_id, data
    """)
    grupos = cur.fetchall()
    print(f"Total de grupos duplicados: {len(grupos)}")
    for g in grupos[:20]:
        print(f"  animal_id={g['animal_id']}  data={g['data']}  qtd={g['qtd']}")
    if len(grupos) > 20:
        print(f"  ... e mais {len(grupos) - 20} grupo(s)")

    print()
    print("=" * 70)
    print("2) Total de linhas 'excedentes' (o que seria apagado, mantendo 1 por grupo)")
    print("=" * 70)
    cur.execute("""
        SELECT COUNT(*) AS excedentes FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY animal_id, data
                       ORDER BY created_at DESC, id DESC
                   ) AS rn
            FROM bovino_ordenha
            WHERE fonte = 'gisleite'
        ) sub
        WHERE rn > 1
    """)
    print(f"Linhas excedentes (se mantivermos a mais recente por grupo): {cur.fetchone()['excedentes']}")

    print()
    print("=" * 70)
    print("3) As linhas duplicadas dentro de um grupo sao IDENTICAS ou tem valores diferentes?")
    print("   (compara volume_l, gordura_pct, proteina_pct entre as linhas de cada grupo)")
    print("=" * 70)
    cur.execute("""
        SELECT animal_id, data,
               COUNT(DISTINCT volume_l) AS volumes_distintos,
               COUNT(DISTINCT gordura_pct) AS gordura_distintos,
               COUNT(DISTINCT proteina_pct) AS proteina_distintos,
               COUNT(*) AS qtd
        FROM bovino_ordenha
        WHERE fonte = 'gisleite'
        GROUP BY animal_id, data
        HAVING COUNT(*) > 1
        ORDER BY (COUNT(DISTINCT volume_l) > 1) DESC
        LIMIT 20
    """)
    for r in cur.fetchall():
        identico = (r['volumes_distintos'] <= 1 and r['gordura_distintos'] <= 1 and r['proteina_distintos'] <= 1)
        print(f"  animal_id={r['animal_id']}  data={r['data']}  qtd={r['qtd']}  "
              f"{'IDENTICAS' if identico else 'VALORES DIFERENTES <-- atencao'}")

    print()
    print("=" * 70)
    print("4) Exemplo completo do grupo mencionado no erro: animal_id=1071, data=2019-09-17")
    print("=" * 70)
    cur.execute("""
        SELECT id, imovel_id, animal_id, data, turno, volume_l, gordura_pct,
               proteina_pct, lactose_pct, es_pct, ccs, numero_ordenhas_dia,
               numero_controle_externo, fonte, created_at
        FROM bovino_ordenha
        WHERE animal_id = 1071 AND data = '2019-09-17'
        ORDER BY id
    """)
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    conn.close()

if __name__ == "__main__":
    run()
