"""
patch_gravar_lancamento_erro_v1.py

Complementa patch_gravar_lancamento_telefone_v1.py (app/db.py). Depois
que gravar_lancamento() passa a levantar ValueError quando nao consegue
identificar o produtor pelo telefone (em vez de cair silenciosamente no
produtor_id=1), este patch garante que esse erro vire uma mensagem clara
pro usuario em vez de estourar cru ate o "Erro interno. Tente novamente."
generico do router.

Mesmo estilo do bloco de tratamento de erro ja existente logo acima
(baixa de estoque em consumo puro).

Uso:
  python3 patch_gravar_lancamento_erro_v1.py            # diagnostico
  python3 patch_gravar_lancamento_erro_v1.py --aplicar   # aplica
"""

import argparse
import sys
from pathlib import Path

CAMINHO_ARQUIVO = Path("app/services/mensagem_handler.py")

TRECHO_ORIGINAL = """            lancamento_id = gravar_lancamento(sess)"""

TRECHO_NOVO = (
    "            try:\n"
    "                lancamento_id = gravar_lancamento(sess)\n"
    "            except ValueError as e:\n"
    '                logger.error("Erro ao gravar lancamento (produtor nao identificado): %s", e)\n'
    '                return f"⚠️ Não consegui gravar o lançamento: {e}"'
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    if not CAMINHO_ARQUIVO.exists():
        print(f"ERRO: {CAMINHO_ARQUIVO} nao encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = CAMINHO_ARQUIVO.read_text(encoding="utf-8")

    ja_aplicado = "Erro ao gravar lancamento (produtor nao identificado)" in conteudo
    ocorrencias = conteudo.count(TRECHO_ORIGINAL)

    if not args.aplicar:
        print(f"--- Diagnostico: {CAMINHO_ARQUIVO} ---\n")
        if ja_aplicado:
            print("[JA APLICADA] - nada a fazer.")
        elif ocorrencias == 1:
            print("[PRONTA PARA APLICAR] - trecho original encontrado (1 ocorrencia).")
        elif ocorrencias == 0:
            print(
                "[ERRO] Trecho original nao encontrado. O arquivo pode ter "
                "mudado desde que este patch foi escrito - revisar manualmente."
            )
        else:
            print(
                f"[ERRO] Trecho encontrado {ocorrencias} vezes (esperava 1) - "
                f"ambiguo demais para aplicar automaticamente. Revisar manualmente."
            )
        return

    if ja_aplicado:
        print("Ja estava aplicado - pulando.")
        return

    if ocorrencias != 1:
        print(f"ERRO: trecho original encontrado {ocorrencias} vezes (esperava exatamente 1). Abortando.")
        sys.exit(1)

    conteudo_novo = conteudo.replace(TRECHO_ORIGINAL, TRECHO_NOVO)
    CAMINHO_ARQUIVO.write_text(conteudo_novo, encoding="utf-8")
    print(f"{CAMINHO_ARQUIVO} atualizado com sucesso.")
    print("Revise com: git diff app/services/mensagem_handler.py")


if __name__ == "__main__":
    main()
