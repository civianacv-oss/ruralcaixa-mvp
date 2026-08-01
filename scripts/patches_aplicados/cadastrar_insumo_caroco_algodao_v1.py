# -*- coding: utf-8 -*-
"""
Cadastra o insumo "Caroço de Algodão" pro imovel_id=6 (Bira) — insumo
que faltava, identificado no diagnóstico de 30/07 (ração de produção
própria: soja, caroço de algodão, milho, ureia e núcleo de leite).

Dry-run por padrão (só mostra o que faria). Rodar localmente:
    python3 cadastrar_insumo_caroco_algodao_v1.py            # dry-run
    python3 cadastrar_insumo_caroco_algodao_v1.py --aplicar   # aplica
"""
import sys
import psycopg2

CONN_STR = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

FAZENDA_ID = 6  # imóvel do Bira
NOME = "Caroço de Algodão"
CATEGORIA = "racao"
UNIDADE = "kg"


def main():
    aplicar = "--aplicar" in sys.argv
    conn = psycopg2.connect(CONN_STR)
    cur = conn.cursor()

    cur.execute(
        "SELECT id FROM insumos WHERE fazenda_id = %s AND LOWER(TRIM(nome)) LIKE %s",
        (FAZENDA_ID, "%caroço de algodão%".lower()),
    )
    ja_existe = cur.fetchone()
    if ja_existe:
        print(f"✗ Já existe um insumo parecido (id={ja_existe[0]}) — não vou duplicar.")
        conn.close()
        return

    if not aplicar:
        print(">>> DRY-RUN — nada será gravado.")
        print(f"Inseriria: fazenda_id={FAZENDA_ID}, nome='{NOME}', categoria='{CATEGORIA}', unidade='{UNIDADE}', estoque_atual=0")
        conn.close()
        return

    cur.execute(
        """
        INSERT INTO insumos (fazenda_id, nome, categoria, unidade, origem, estoque_atual, ativo)
        VALUES (%s, %s, %s, %s, 'comprado', 0, true)
        RETURNING id
        """,
        (FAZENDA_ID, NOME, CATEGORIA, UNIDADE),
    )
    novo_id = cur.fetchone()[0]
    conn.commit()
    print(f"✓ Insumo '{NOME}' cadastrado com id={novo_id} pra fazenda_id={FAZENDA_ID}.")
    conn.close()


if __name__ == "__main__":
    main()
