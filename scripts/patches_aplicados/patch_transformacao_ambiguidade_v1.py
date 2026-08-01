"""
patch_transformacao_ambiguidade_v1.py

Adiciona a interceptacao de 'transformacao_ambiguidade_pendente' em
app/services/mensagem_handler.py, ANTES da interceptacao de
'transformacao_pendente' ja aplicada por patch_transformacao_v1.py.
Tambem adiciona 'transformacao_ambiguidade_pendente' na tupla de
exclusao do bloco generico de sessao.

Uso:
  python3 patch_transformacao_ambiguidade_v1.py            # diagnostico
  python3 patch_transformacao_ambiguidade_v1.py --aplicar   # aplica
"""

import argparse
import sys
from pathlib import Path

CAMINHO_ARQUIVO = Path("app/services/mensagem_handler.py")

TRECHO_ORIGINAL = '''    from app.services.handler_transformacao_insumo_v1 import (
        is_transformacao_pendente_ativo, processar_confirmacao_transformacao_pendente,
    )
    if is_transformacao_pendente_ativo(sessoes, key):
        auth_transf_conf = _autorizar_numero(msg.numero, msg.canal)
        return processar_confirmacao_transformacao_pendente(
            sessoes, key, texto, auth_transf_conf["imovel_id"], auth_transf_conf["produtor_id"],
        )

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "recibo_wizard", "recibo_pendente", "transformacao_pendente"):'''

TRECHO_NOVO = '''    from app.services.handler_transformacao_insumo_v1 import (
        is_ambiguidade_pendente_ativo, processar_escolha_ambiguidade,
        is_transformacao_pendente_ativo, processar_confirmacao_transformacao_pendente,
    )
    if is_ambiguidade_pendente_ativo(sessoes, key):
        return processar_escolha_ambiguidade(sessoes, key, texto)

    if is_transformacao_pendente_ativo(sessoes, key):
        auth_transf_conf = _autorizar_numero(msg.numero, msg.canal)
        return processar_confirmacao_transformacao_pendente(
            sessoes, key, texto, auth_transf_conf["imovel_id"], auth_transf_conf["produtor_id"],
        )

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "recibo_wizard", "recibo_pendente", "transformacao_pendente", "transformacao_ambiguidade_pendente"):'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    if not CAMINHO_ARQUIVO.exists():
        print(f"ERRO: {CAMINHO_ARQUIVO} nao encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = CAMINHO_ARQUIVO.read_text(encoding="utf-8")

    ja_aplicado = "is_ambiguidade_pendente_ativo" in conteudo
    trecho_presente = TRECHO_ORIGINAL in conteudo

    if not args.aplicar:
        print(f"--- Diagnostico: {CAMINHO_ARQUIVO} ---\n")
        if ja_aplicado:
            print("[JA APLICADA] - nada a fazer.")
        elif trecho_presente:
            print("[PRONTA PARA APLICAR] - trecho original encontrado.")
        else:
            print(
                "[ERRO] Trecho original nao encontrado. Verifique se "
                "patch_transformacao_v1.py ja foi aplicado antes deste "
                "(este patch depende daquele)."
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
    print("Revise com: git diff app/services/mensagem_handler.py")


if __name__ == "__main__":
    main()
