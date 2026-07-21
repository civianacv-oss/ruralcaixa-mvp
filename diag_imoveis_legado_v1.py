"""
RuralCaixa — Diagnostico: tabela "imoveis" (legado) existe? Ha dados em outras especies?
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

    print("1) Tabela 'imoveis' (legado) existe?")
    cur.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'imoveis'
        ) AS existe
    """)
    print(f"   {cur.fetchone()['existe']}")

    print()
    print("2) Contagem de animais por especie (imovel_id=1 e =6)")
    for tabela in ["bovino_animais", "ovino_animais", "caprino_animais", "suino_animais"]:
        try:
            cur.execute(f"SELECT imovel_id, COUNT(*) AS qtd FROM {tabela} WHERE imovel_id IN (1,6) GROUP BY imovel_id")
            rows = cur.fetchall()
            print(f"   {tabela}: {[dict(r) for r in rows] or 'vazio'}")
        except Exception as e:
            conn.rollback()
            print(f"   {tabela}: ERRO ({e})")

    conn.close()

if __name__ == "__main__":
    run()
