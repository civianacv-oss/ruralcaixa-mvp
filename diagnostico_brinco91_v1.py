"""
RuralCaixa — Diagnóstico: brinco 91 (investigar reuso de identificador GISleite)

Somente LEITURA.
Uso: DATABASE_URL="postgresql://..." python3 diagnostico_brinco91_v1.py
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
    print("1) Cadastro(s) com brinco = 91, imovel_id = 1")
    print("=" * 70)
    cur.execute("""
        SELECT id, brinco, nome, data_nascimento, origem, categoria, status
        FROM bovino_animais
        WHERE brinco = '91' AND imovel_id = 1
        ORDER BY id
    """)
    rows = cur.fetchall()
    for r in rows:
        print(f"  {dict(r)}")
    print(f"Total de cadastros encontrados: {len(rows)}")

    print()
    print("=" * 70)
    print("2) O animal_id=1071 (o que ja esta gravado em bovino_ordenha) -- qual brinco/nome ele tem hoje?")
    print("=" * 70)
    cur.execute("""
        SELECT id, brinco, nome, data_nascimento, origem, categoria, status
        FROM bovino_animais
        WHERE id = 1071
    """)
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    print()
    print("=" * 70)
    print("3) Todos os registros de bovino_ordenha (fonte=gisleite) hoje ligados ao animal_id=1071")
    print("=" * 70)
    cur.execute("""
        SELECT id, data, volume_l, numero_ordenhas_dia, numero_controle_externo
        FROM bovino_ordenha
        WHERE animal_id = 1071 AND fonte = 'gisleite'
        ORDER BY data
    """)
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    conn.close()

if __name__ == "__main__":
    run()
