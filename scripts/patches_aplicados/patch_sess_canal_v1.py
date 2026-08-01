"""
patch_sess_canal_v1.py

Guarda o canal (telegram/whatsapp) em sess["canal"], no mesmo ponto onde
sess["numero"] ja e atribuido. Necessario para gravar_lancamento()
conseguir escolher a coluna certa (telegram_chat_id vs telefone) - ver
patch_gravar_lancamento_canal_v1.py.

Uso:
  python3 patch_sess_canal_v1.py            # diagnostico
  python3 patch_sess_canal_v1.py --aplicar   # aplica
"""

import argparse
import sys
from pathlib import Path

CAMINHO_ARQUIVO = Path("app/services/mensagem_handler.py")

TRECHO_ORIGINAL = """            sess = sessoes.pop(key)
            sess["numero"] = msg.numero"""

TRECHO_NOVO = """            sess = sessoes.pop(key)
            sess["numero"] = msg.numero
            sess["canal"] = msg.canal"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    if not CAMINHO_ARQUIVO.exists():
        print(f"ERRO: {CAMINHO_ARQUIVO} nao encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = CAMINHO_ARQUIVO.read_text(encoding="utf-8")

    ja_aplicado = 'sess["canal"] = msg.canal' in conteudo
    ocorrencias = conteudo.count(TRECHO_ORIGINAL)

    if not args.aplicar:
        print(f"--- Diagnostico: {CAMINHO_ARQUIVO} ---\n")
        if ja_aplicado:
            print("[JA APLICADA] - nada a fazer.")
        elif ocorrencias == 1:
            print("[PRONTA PARA APLICAR] - trecho original encontrado (1 ocorrencia).")
        elif ocorrencias == 0:
            print("[ERRO] Trecho original nao encontrado. Revisar manualmente.")
        else:
            print(f"[ERRO] Trecho encontrado {ocorrencias} vezes (esperava 1). Revisar manualmente.")
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
