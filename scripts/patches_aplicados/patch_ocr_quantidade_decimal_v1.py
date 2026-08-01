"""
patch_ocr_quantidade_decimal_v1.py

Corrige app/services/ocr_handler.py: SISTEMA_OCR (prompt do Claude
Vision) nao tinha instrucao sobre o formato de numero da coluna
QUANT. em notas fiscais brasileiras (NF-e), que usa VIRGULA como
separador DECIMAL (geralmente 3 casas) -- ex: "30,000" significa 30
(trinta), nao 30 mil.

Bug real observado em producao (31/07): nota fiscal com QUANT. "30,000"
(Caroco de Algodao, SC 25KG) e "20,000" (Farelo de Soja, SC 50KG) foi
lida pela Claude como 30000 e 20000. Multiplicado pelo peso por saca
(25kg e 50kg, extraido corretamente da descricao), gerou
quantidade_estoque = 750.000kg e 1.000.000kg -- 1000x maior que o
correto (750kg e 1.000kg).

O prompt ja tinha um aviso equivalente pro campo de DATA (formato
DD/MM/AAAA). Este patch adiciona o mesmo tipo de aviso explicito pro
campo "quantidade".

Uso:
  python3 patch_ocr_quantidade_decimal_v1.py            # diagnostico
  python3 patch_ocr_quantidade_decimal_v1.py --aplicar   # aplica
"""

import argparse
import sys
from pathlib import Path

CAMINHO_ARQUIVO = Path("app/services/ocr_handler.py")

TRECHO_ORIGINAL = '''  "valor_total": 0.00,
  "itens": [
    {"descricao": "...", "quantidade": 1, "valor_unitario": 0.00, "valor_total": 0.00}
  ],
  "numero_documento": "número da nota/boleto ou null",'''

TRECHO_NOVO = '''  "valor_total": 0.00,
  "itens": [
    {"descricao": "...", "quantidade": 1, "valor_unitario": 0.00, "valor_total": 0.00}
  ],
  (ATENÇÃO no campo "quantidade" de cada item: a coluna QUANT. de notas fiscais brasileiras (NF-e) usa VÍRGULA como separador DECIMAL, geralmente com 3 casas -- ex: "30,000" significa TRINTA (30), NÃO trinta mil; "20,000" significa VINTE (20), NÃO vinte mil. NUNCA interprete essa vírgula como separador de milhar. Retorne sempre o valor decimal correto: "quantidade": 30, nunca "quantidade": 30000 para uma coluna QUANT. mostrando "30,000".)
  "numero_documento": "número da nota/boleto ou null",'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    if not CAMINHO_ARQUIVO.exists():
        print(f"ERRO: {CAMINHO_ARQUIVO} nao encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = CAMINHO_ARQUIVO.read_text(encoding="utf-8")

    ja_aplicado = "significa TRINTA (30)" in conteudo
    trecho_presente = TRECHO_ORIGINAL in conteudo

    if not args.aplicar:
        print(f"--- Diagnostico: {CAMINHO_ARQUIVO} ---\n")
        if ja_aplicado:
            print("[JA APLICADA] - nada a fazer.")
        elif trecho_presente:
            print("[PRONTA PARA APLICAR] - trecho original encontrado.")
        else:
            print(
                "[ERRO] Trecho original nao encontrado. O arquivo pode ter "
                "mudado desde que este patch foi escrito - revisar manualmente."
            )
        return

    if ja_aplicado:
        print("Ja estava aplicado - pulando.")
        return

    if not trecho_presente:
        print("ERRO: trecho original nao encontrado. Abortando.")
        sys.exit(1)

    conteudo_novo = conteudo.replace(TRECHO_ORIGINAL, TRECHO_NOVO)
    CAMINHO_ARQUIVO.write_text(conteudo_novo, encoding="utf-8")
    print(f"{CAMINHO_ARQUIVO} atualizado com sucesso.")
    print("Revise com: git diff app/services/ocr_handler.py")
    print(
        "\nNOTA: isso corrige o comportamento para NOVAS notas processadas "
        "a partir de agora. Os dois insumos ja inflados 1000x (Caroco de "
        "Algodao id=100 e Farelo de Soja id=74, fazenda_id=6) precisam de "
        "correcao de dado separada - nao mexido por este patch."
    )


if __name__ == "__main__":
    main()
