"""
RuralCaixa — Diagnóstico: identificadores do arquivo GISleite x brincos cadastrados

Somente LEITURA.
Uso: DATABASE_URL="postgresql://..." python3 diagnostico_brincos_arquivo_v1.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

IDENTIFICADORES_ARQUIVO = [
    '5','15','20','21','22','25','26','28','29','30','42','44','55','56','66','71','72','74',
    '89','90','91','93','96','160','233','303','306','388','454','458','462','464','472','749',
    '788','796','802','826','1131','1291','1380','1512','1554','1567','1632','2001','2028','2101',
    '2102','2202','2204','2205','6036','7040',
]

def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    print("=" * 70)
    print("1) Brincos cadastrados em bovino_animais (imovel_id=1) -- amostra de 20")
    print("=" * 70)
    cur.execute("""
        SELECT id, brinco, nome, status
        FROM bovino_animais
        WHERE imovel_id = 1
        ORDER BY id
        LIMIT 20
    """)
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    print()
    print("=" * 70)
    print("2) Total de animais cadastrados no imovel_id=1")
    print("=" * 70)
    cur.execute("SELECT COUNT(*) AS total FROM bovino_animais WHERE imovel_id = 1")
    print(f"  Total: {cur.fetchone()['total']}")

    print()
    print("=" * 70)
    print("3) Quantos dos 54 identificadores do arquivo batem com brinco EXATO (case/trim)")
    print("=" * 70)
    cur.execute("""
        SELECT DISTINCT brinco FROM bovino_animais WHERE imovel_id = 1
    """)
    brincos_db = [r['brinco'] for r in cur.fetchall()]
    brincos_db_norm = {str(b).strip().lower() for b in brincos_db}

    encontrados = []
    nao_encontrados = []
    for ident in IDENTIFICADORES_ARQUIVO:
        if ident.strip().lower() in brincos_db_norm:
            encontrados.append(ident)
        else:
            nao_encontrados.append(ident)

    print(f"  Encontrados (match exato): {len(encontrados)} / {len(IDENTIFICADORES_ARQUIVO)}")
    print(f"  Nao encontrados: {nao_encontrados}")

    print()
    print("=" * 70)
    print("4) Pra cada identificador NAO encontrado, ha algo parecido no banco?")
    print("   (ex: com zeros a esquerda, ou como substring)")
    print("=" * 70)
    for ident in nao_encontrados[:15]:
        parecidos = [b for b in brincos_db if ident in str(b) or str(b).lstrip('0') == ident]
        print(f"  arquivo='{ident}'  parecidos_no_banco={parecidos[:5]}")

    print()
    print("=" * 70)
    print("5) Exemplo de 10 brincos reais no banco (pra comparar o FORMATO)")
    print("=" * 70)
    print(f"  {brincos_db[:20]}")

    conn.close()

if __name__ == "__main__":
    run()
