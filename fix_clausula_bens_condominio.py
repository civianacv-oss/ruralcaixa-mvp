"""
Adiciona a clausula "Bens e equipamentos em copropriedade" ao tipo
'condominio' -- cobre o caso de maquinas/equipamentos comprados em conjunto
por dois ou mais condominos (ex: tratorzinho), separado da copropriedade
da terra em si.

Idempotente. Roda:
    python fix_clausula_bens_condominio.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = (
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

TITULO = "Bens e equipamentos em copropriedade"
DESCRICAO = (
    "Se dois ou mais condôminos comprarem junto uma máquina, equipamento ou "
    "benfeitoria (ex: trator, implemento, galpão) — mesmo que não seja com "
    "todos os condôminos —, registre aqui: percentual de participação de "
    "cada um na aquisição; regras de uso (quem usa quando, prioridade); "
    "rateio de manutenção, combustível e seguro; o que acontece se um dos "
    "participantes quiser vender sua parte do bem ou sair do condomínio. "
    "Isso é independente da cota de cada um na terra — a participação num "
    "bem específico pode ter proporção diferente da cota da propriedade."
)

# Insere logo depois de "Divisão de despesas comuns", se existir; senão, no fim
ANCORA = "Divisão de despesas comuns"


def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    cur.execute("SELECT id FROM tipos_contrato_rural WHERE slug = 'condominio'")
    row = cur.fetchone()
    if not row:
        print("AVISO: tipo 'condominio' não encontrado.")
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
        (tipo_id, ordem_alvo, TITULO, DESCRICAO, False),
    )
    conn.commit()
    conn.close()
    print(f"Cláusula '{TITULO}' adicionada ao tipo 'condominio' na posição {ordem_alvo}.")


if __name__ == "__main__":
    main()
