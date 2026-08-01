# -*- coding: utf-8 -*-
"""
DESFAZ as 2 movimentações erradas gravadas na sandbox (produtor_id=1),
lançamento #96e3c7e5-518f-4508-8e46-f7e8fb431236 -- ambas foram pro
insumo id=4 ("Farelo de Soja", categoria=racao, unidade=saco), quando na
verdade eram 2 itens diferentes (e nenhum dos dois insumos certos existe
cadastrado nessa fazenda de teste).

Remove os registros movimentacoes_insumo id=123 e id=124, e devolve
estoque_atual do insumo id=4 pro valor de antes do teste (4.000).

Dry-run por padrão. Rodar localmente:
    python3 desfazer_movimentacoes_teste_v1.py            # dry-run
    python3 desfazer_movimentacoes_teste_v1.py --aplicar   # aplica
"""
import sys
import psycopg2

CONN_STR = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

IDS_MOVIMENTACAO = [123, 124]
INSUMO_ID = 4
ESTOQUE_ANTES_DO_TESTE = 4.000  # 54 (atual) - 30 - 20 = 4


def main():
    aplicar = "--aplicar" in sys.argv
    conn = psycopg2.connect(CONN_STR)
    cur = conn.cursor()

    cur.execute(
        "SELECT id, insumo_id, quantidade, custo_unitario FROM movimentacoes_insumo WHERE id = ANY(%s)",
        (IDS_MOVIMENTACAO,),
    )
    encontradas = cur.fetchall()
    print(f"Movimentações encontradas: {encontradas}")
    if len(encontradas) != len(IDS_MOVIMENTACAO):
        print("✗ Nem todas as movimentações esperadas foram encontradas — abortando por segurança.")
        conn.close()
        return

    cur.execute("SELECT estoque_atual, custo_medio FROM insumos WHERE id = %s", (INSUMO_ID,))
    atual = cur.fetchone()
    print(f"Estado atual do insumo id={INSUMO_ID}: estoque_atual={atual[0]}, custo_medio={atual[1]}")

    if not aplicar:
        print(">>> DRY-RUN — nada será gravado.")
        print(f"Removeria movimentacoes_insumo ids {IDS_MOVIMENTACAO}")
        print(f"Voltaria insumos.estoque_atual (id={INSUMO_ID}) pra {ESTOQUE_ANTES_DO_TESTE}")
        conn.close()
        return

    cur.execute("DELETE FROM movimentacoes_insumo WHERE id = ANY(%s)", (IDS_MOVIMENTACAO,))
    cur.execute(
        "UPDATE insumos SET estoque_atual = %s WHERE id = %s",
        (ESTOQUE_ANTES_DO_TESTE, INSUMO_ID),
    )
    conn.commit()
    print(f"✓ Movimentações removidas e estoque_atual do insumo id={INSUMO_ID} voltou pra {ESTOQUE_ANTES_DO_TESTE}.")
    print("Nota: custo_medio não foi revertido automaticamente -- confira manualmente se fizer diferença nesse insumo de teste.")
    conn.close()


if __name__ == "__main__":
    main()
