"""
Adiciona a clausula "Aquisicao do plantel inicial" ao tipo 'pecuaria' --
cobre quantos animais cada parte trouxe/comprou e quanto cada um desembolsou,
separado do custeio do dia a dia (que ja e' coberto por "Rateio de custos
antes da divisao").

Idempotente. Roda:
    python fix_clausula_aquisicao_plantel.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = (
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

TITULO = "Aquisição do plantel inicial"
DESCRICAO = (
    "Registre quantos animais cada parte comprou/trouxe pra formar o "
    "rebanho, e quanto cada um desembolsou na aquisição. Isso é diferente "
    "do custeio do dia a dia (ração, vacina, sal) — é o investimento inicial "
    "no plantel. Combinem e deixem escrito: esse valor investido será "
    "devolvido a quem entrou com mais animais/dinheiro no fim da parceria, "
    "vira parte do cálculo do percentual de divisão, ou é considerado aporte "
    "de capital sem devolução (cada um assume o que trouxe como perda "
    "possível)."
)

# Insere logo depois de "Rebanho envolvido", se existir
ANCORA = "Rebanho envolvido"


def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    cur.execute("SELECT id FROM tipos_contrato_rural WHERE slug = 'pecuaria'")
    row = cur.fetchone()
    if not row:
        print("AVISO: tipo 'pecuaria' não encontrado.")
        return
    tipo_id = row["id"]

    cur.execute(
        "SELECT 1 FROM clausulas_contrato WHERE tipo_contrato_id = %s AND titulo = %s",
        (tipo_id, TITULO),
    )
    if cur.fetchone():
        print("Cláusula já existe, nada a fazer.")
        conn.close()
        return

    cur.execute(
        "SELECT ordem FROM clausulas_contrato WHERE tipo_contrato_id = %s AND titulo = %s",
        (tipo_id, ANCORA),
    )
    ref = cur.fetchone()
    if ref:
        ordem_alvo = ref["ordem"] + 1
        cur.execute(
            "UPDATE clausulas_contrato SET ordem = ordem + 1 "
            "WHERE tipo_contrato_id = %s AND ordem >= %s",
            (tipo_id, ordem_alvo),
        )
    else:
        cur.execute(
            "SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM clausulas_contrato WHERE tipo_contrato_id = %s",
            (tipo_id,),
        )
        ordem_alvo = cur.fetchone()["proxima"]

    cur.execute(
        "INSERT INTO clausulas_contrato (tipo_contrato_id, ordem, titulo, descricao, obrigatoria) "
        "VALUES (%s,%s,%s,%s,%s)",
        (tipo_id, ordem_alvo, TITULO, DESCRICAO, True),
    )
    conn.commit()
    conn.close()
    print(f"Cláusula '{TITULO}' adicionada ao tipo 'pecuaria' na posição {ordem_alvo}.")


if __name__ == "__main__":
    main()
