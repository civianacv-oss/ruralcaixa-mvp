# -*- coding: utf-8 -*-
"""
ADICIONA app/services/ocr_handler.py: função inferir_operacao_por_itens,
que cruza a descrição de cada item da nota com o catálogo de insumos já
cadastrado no imóvel. Se TODOS os itens baterem com insumos de uma única
categoria conhecida, retorna a conta de despesa correspondente -- um sinal
independente do CPF, usado quando o OCR não consegue decidir compra vs
venda sozinho (em vez de sempre cair em 9.9 Pendente de Classificação).

Rodar localmente:
    python3 adicionar_inferencia_insumo_ocr_v1.py            # dry-run
    python3 adicionar_inferencia_insumo_ocr_v1.py --aplicar   # aplica
"""
import sys

CAMINHO = "app/services/ocr_handler.py"

FUNCAO_NOVA = '''

_MAPA_CATEGORIA_INSUMO_PARA_CONTA = {
    "racao": "2.2",
    "medicamento": "2.2",
    "agricola": "2.1",
    "combustivel": "2.3",
    "reproducao": "2.2.3",
}


def inferir_operacao_por_itens(itens: list, imovel_id: int):
    """
    Cruza a descrição de cada item da nota com o catálogo de insumos já
    cadastrado nesse imóvel. Se TODOS os itens baterem (por palavra-chave)
    com insumos de uma única categoria conhecida, retorna a conta de
    despesa correspondente -- sinal independente do CPF, usado quando o
    OCR não consegue decidir compra vs venda sozinho (achado em 30/07:
    nota real de ração caiu em "CPF ambíguo" e precisou de wizard manual
    completo, quando os próprios itens já indicavam claramente ser compra
    de insumo de ração).

    Retorna None se não bater com nada conhecido, ou se os itens baterem
    em mais de uma categoria (não dá pra sugerir uma única conta) -- nesse
    caso o chamador mantém o fluxo manual de histórico -> tipo -> conta.
    """
    if not itens:
        return None

    from app.db import engine
    from sqlalchemy import text as sqlt
    import unicodedata

    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT nome, categoria FROM insumos
            WHERE fazenda_id = :fid AND ativo = TRUE
        """), {"fid": imovel_id}).fetchall()

    if not rows:
        return None

    def _normalizar(t):
        t2 = unicodedata.normalize("NFD", (t or "").lower())
        return "".join(c for c in t2 if unicodedata.category(c) != "Mn")

    catalogo = [(_normalizar(r[0]), r[1]) for r in rows]

    itens_batidos = []
    categorias_encontradas = set()
    for item in itens:
        desc_norm = _normalizar(item.get("descricao", ""))
        if not desc_norm:
            return None  # item sem descrição -- não arrisca

        achou = None
        for nome_cat, categoria in catalogo:
            palavras_nome = [p for p in nome_cat.split() if len(p) > 3]
            if palavras_nome and any(p in desc_norm for p in palavras_nome):
                achou = categoria
                break

        if not achou:
            return None  # pelo menos 1 item não bateu -- mantém fluxo manual

        itens_batidos.append({"descricao": item.get("descricao"), "categoria": achou})
        categorias_encontradas.add(achou)

    if len(categorias_encontradas) != 1:
        return None  # itens de categorias diferentes -- não dá pra sugerir 1 conta só

    categoria_unica = categorias_encontradas.pop()
    conta = _MAPA_CATEGORIA_INSUMO_PARA_CONTA.get(categoria_unica)
    if not conta:
        return None

    return {"conta": conta, "categoria": categoria_unica, "itens_batidos": itens_batidos}
'''


def main():
    aplicar = "--aplicar" in sys.argv
    with open(CAMINHO, "r", encoding="utf-8") as f:
        original = f.read()

    if "def inferir_operacao_por_itens" in original:
        print("✗ A função já existe nesse arquivo — não vou duplicar. Abortando.")
        return

    corrigido = original.rstrip("\n") + "\n" + FUNCAO_NOVA

    if aplicar:
        with open(CAMINHO, "w", encoding="utf-8") as f:
            f.write(corrigido)
        print("✓ Função anexada e arquivo gravado.")
    else:
        print(">>> DRY-RUN — a função seria anexada ao final do arquivo. Nada foi gravado.")
        print(f"Tamanho do trecho novo: {len(FUNCAO_NOVA)} caracteres.")


if __name__ == "__main__":
    main()
