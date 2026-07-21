"""
RuralCaixa — Fix: remove bovino_ordenha.id=223 (colisao de brinco reaproveitado)

Contexto: brinco '91' foi usado por duas vacas diferentes ao longo do tempo
(Serena, nao cadastrada; e Baianinha, animal_id=1071). O import GISleite
casou pelo brinco e atribuiu um registro da Serena (controle no1, 0.00 L,
0 ordenhas) a Baianinha por engano.

Este script SO apaga a linha id=223 se ela ainda bater exatamente com os
valores confirmados no diagnostico (protecao contra rodar em estado
diferente do esperado). Uso: DATABASE_URL="postgresql://..." python3 fix_ordenha_id223_v1.py
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
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("""
        SELECT id, animal_id, data, volume_l, numero_ordenhas_dia, numero_controle_externo, fonte
        FROM bovino_ordenha
        WHERE id = 223
    """)
    row = cur.fetchone()

    if row is None:
        print("[OK] id=223 ja nao existe (talvez ja tenha sido apagado antes). Nada a fazer.")
        conn.close()
        return

    esperado = {
        "animal_id": 1071,
        "data": None,  # checado abaixo via str()
        "volume_l": None,
        "numero_ordenhas_dia": 0,
        "numero_controle_externo": 1,
        "fonte": "gisleite",
    }

    ok = (
        row["animal_id"] == 1071
        and str(row["data"]) == "2019-09-17"
        and float(row["volume_l"]) == 0.00
        and row["numero_ordenhas_dia"] == 0
        and row["numero_controle_externo"] == 1
        and row["fonte"] == "gisleite"
    )

    print(f"Registro encontrado: {dict(row)}")

    if not ok:
        print("\n[ABORTADO] O registro id=223 NAO bate com o esperado do diagnostico.")
        print("Nao vou apagar por seguranca. Confira manualmente antes de prosseguir.")
        conn.close()
        return

    cur.execute("DELETE FROM bovino_ordenha WHERE id = 223")
    conn.commit()
    print("\n[OK] id=223 apagado com sucesso (dado da Serena, mal atribuido a Baianinha).")
    print("Baianinha (animal_id=1071) mantem os demais 18 registros de ordenha GISleite intactos.")
    conn.close()

if __name__ == "__main__":
    run()
