"""
RuralCaixa — Diagnóstico: escopo da correção Emboque (mover rebanho de imovel_id=1 -> 6)

Somente LEITURA.
Uso: DATABASE_URL="postgresql://..." python3 diagnostico_escopo_emboque_v1.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

BRINCOS_EMBOQUE = ['1905', '2306', '2002', '2205', '2207', '1904', '2101', '1903', '2102', '1801', '1802', '2001', '1803', '2204', '1901']

def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    print("=" * 70)
    print("1) Cadastro atual dessas 15 vacas em bovino_animais")
    print("=" * 70)
    cur.execute("""
        SELECT id, brinco, nome, imovel_id, status
        FROM bovino_animais
        WHERE brinco = ANY(%s)
        ORDER BY brinco::int
    """, (BRINCOS_EMBOQUE,))
    animais = cur.fetchall()
    for r in animais:
        print(f"  {dict(r)}")
    print(f"\nTotal encontrado: {len(animais)} / {len(BRINCOS_EMBOQUE)} esperados")
    animal_ids = [r["id"] for r in animais]

    print()
    print("=" * 70)
    print("2) Registros de bovino_ordenha (fonte=gisleite) desses animais")
    print("=" * 70)
    cur.execute("""
        SELECT animal_id, imovel_id, COUNT(*) AS qtd
        FROM bovino_ordenha
        WHERE animal_id = ANY(%s)
        GROUP BY animal_id, imovel_id
        ORDER BY animal_id
    """, (animal_ids,))
    for r in cur.fetchall():
        print(f"  {dict(r)}")

    print()
    print("=" * 70)
    print("3) Registros de bovino_lactacoes desses animais")
    print("=" * 70)
    cur.execute("""
        SELECT animal_id, imovel_id, COUNT(*) AS qtd
        FROM bovino_lactacoes
        WHERE animal_id = ANY(%s)
        GROUP BY animal_id, imovel_id
        ORDER BY animal_id
    """, (animal_ids,))
    rows3 = cur.fetchall()
    if rows3:
        for r in rows3:
            print(f"  {dict(r)}")
    else:
        print("  Nenhum.")

    print()
    print("=" * 70)
    print("4) Outras tabelas de bovino que referenciam esses animal_id (pesagens, protocolo_iatf, etc)")
    print("=" * 70)
    for tabela in ["bovino_pesagens", "bovino_protocolo_iatf", "bovino_dieta_transicao", "bovino_confinamento", "bovino_classificacao_carcaca", "bovino_custo_producao"]:
        try:
            cur.execute(f"""
                SELECT COUNT(*) AS qtd FROM {tabela} WHERE animal_id = ANY(%s)
            """, (animal_ids,))
            qtd = cur.fetchone()["qtd"]
            if qtd > 0:
                print(f"  {tabela}: {qtd} registro(s)")
        except Exception as e:
            conn.rollback()
            print(f"  {tabela}: erro ao consultar ({e})")

    print()
    print("=" * 70)
    print("5) Lancamentos financeiros com origem_tipo apontando pra esses animais")
    print("=" * 70)
    cur.execute("""
        SELECT COUNT(*) AS qtd, imovel_id
        FROM lancamentos
        WHERE origem_tipo = 'bovino' AND origem_id = ANY(%s::text[])
        GROUP BY imovel_id
    """, ([str(a) for a in animal_ids],))
    rows5 = cur.fetchall()
    if rows5:
        for r in rows5:
            print(f"  {dict(r)}")
    else:
        print("  Nenhum lancamento com origem_tipo='bovino' apontando pra esses animais.")

    print()
    print("=" * 70)
    print("6) Confirma que imovel_id=6 (Emboque) ja existe e esta ativo")
    print("=" * 70)
    cur.execute("SELECT id, nome, produtor_id FROM imoveis_rurais WHERE id = 6")
    print(f"  {dict(cur.fetchone())}")

    conn.close()

if __name__ == "__main__":
    run()