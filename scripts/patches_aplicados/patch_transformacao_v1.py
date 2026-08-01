"""
patch_transformacao_v1.py

Insere os dois pontos de integracao do modulo de transformacao/mistura de
insumo em app/services/mensagem_handler.py:

  1. Gatilho inicial (mensagem completa "de um tiro so"), logo apos
     _eh_comando_vinculo e ANTES do bloco "Assistente de Recibo".
  2. Confirmacao pendente (SIM/NAO), logo apos o bloco recibo_pendente e
     ANTES do bloco generico de sessao - com "transformacao_pendente"
     adicionado a tupla de exclusao desse bloco generico.

Uso:
  python3 patch_transformacao_v1.py            # diagnostico (dry-run)
  python3 patch_transformacao_v1.py --aplicar   # aplica de fato

Idempotente: se os marcadores ja estiverem presentes no arquivo, o script
avisa e nao duplica a insercao.
"""

import argparse
import sys
from pathlib import Path

CAMINHO_ARQUIVO = Path("app/services/mensagem_handler.py")

# ---------------------------------------------------------------------------
# Insercao 1: gatilho inicial
# ---------------------------------------------------------------------------

TRECHO_ORIGINAL_1 = '''    if _eh_comando_vinculo(texto):
        return await _processar_comando_vinculo(texto, msg.numero, msg.canal)

    # ── Assistente de Recibo (Fase 2 da unificação de bots) ─────────────'''

TRECHO_NOVO_1 = '''    if _eh_comando_vinculo(texto):
        return await _processar_comando_vinculo(texto, msg.numero, msg.canal)

    # ── Transformação/mistura de insumo (mensagem completa, "de um tiro só") ──
    # Mesma prioridade de produção agrícola/vínculo acima - a mistura já vem
    # pronta numa única mensagem (ex: "misturei 30kg de milho..."), sem wizard.
    from app.services.handler_transformacao_insumo_v1 import tentar_iniciar_transformacao
    auth_transf = _autorizar_numero(msg.numero, msg.canal)
    if auth_transf.get("autorizado") and auth_transf.get("imovel_id"):
        resposta_transformacao = tentar_iniciar_transformacao(
            sessoes, key, texto, auth_transf["imovel_id"], auth_transf["produtor_id"],
        )
        if resposta_transformacao is not None:
            return resposta_transformacao

    # ── Assistente de Recibo (Fase 2 da unificação de bots) ─────────────'''

# ---------------------------------------------------------------------------
# Insercao 2: confirmacao pendente
# ---------------------------------------------------------------------------

TRECHO_ORIGINAL_2 = '''            return "❌ Recibo cancelado."
        else:
            return "Não entendi. Responda SIM para confirmar ou NAO para cancelar."

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "recibo_wizard", "recibo_pendente"):'''

TRECHO_NOVO_2 = '''            return "❌ Recibo cancelado."
        else:
            return "Não entendi. Responda SIM para confirmar ou NAO para cancelar."

    # ── Transformação/mistura de insumo (confirmação pendente) ──────────
    # Mesmo padrão de "recibo_pendente" acima: mensagem única com tudo,
    # só precisa de SIM/NAO (não é wizard multi-etapa). Precisa vir ANTES
    # do bloco genérico abaixo, senão um SIM/NAO durante a confirmação da
    # mistura seria capturado por engano.
    from app.services.handler_transformacao_insumo_v1 import (
        is_transformacao_pendente_ativo, processar_confirmacao_transformacao_pendente,
    )
    if is_transformacao_pendente_ativo(sessoes, key):
        auth_transf_conf = _autorizar_numero(msg.numero, msg.canal)
        return processar_confirmacao_transformacao_pendente(
            sessoes, key, texto, auth_transf_conf["imovel_id"], auth_transf_conf["produtor_id"],
        )

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "recibo_wizard", "recibo_pendente", "transformacao_pendente"):'''


def diagnostico(conteudo: str) -> None:
    print(f"--- Diagnostico: {CAMINHO_ARQUIVO} ---\n")

    ja_tem_insercao_1 = "tentar_iniciar_transformacao" in conteudo
    ja_tem_insercao_2 = "is_transformacao_pendente_ativo" in conteudo

    tem_trecho_original_1 = TRECHO_ORIGINAL_1 in conteudo
    tem_trecho_original_2 = TRECHO_ORIGINAL_2 in conteudo

    print("Insercao 1 (gatilho inicial):")
    if ja_tem_insercao_1:
        print("  [JA APLICADA] - nada a fazer.")
    elif tem_trecho_original_1:
        print("  [PRONTA PARA APLICAR] - trecho original encontrado.")
    else:
        print(
            "  [ERRO] Trecho original NAO encontrado no arquivo atual. "
            "O arquivo pode ter mudado desde que este patch foi escrito - "
            "NAO aplicar as cegas, revisar manualmente."
        )

    print("\nInsercao 2 (confirmacao pendente):")
    if ja_tem_insercao_2:
        print("  [JA APLICADA] - nada a fazer.")
    elif tem_trecho_original_2:
        print("  [PRONTA PARA APLICAR] - trecho original encontrado.")
    else:
        print(
            "  [ERRO] Trecho original NAO encontrado no arquivo atual. "
            "O arquivo pode ter mudado desde que este patch foi escrito - "
            "NAO aplicar as cegas, revisar manualmente."
        )

    tudo_pronto = (
        (ja_tem_insercao_1 or tem_trecho_original_1)
        and (ja_tem_insercao_2 or tem_trecho_original_2)
    )
    print()
    if tudo_pronto:
        print("Rode com --aplicar para aplicar as insercoes pendentes.")
    else:
        print("Corrija manualmente antes de tentar --aplicar.")


def aplicar(conteudo: str) -> str:
    if "tentar_iniciar_transformacao" not in conteudo:
        if TRECHO_ORIGINAL_1 not in conteudo:
            print("ERRO: trecho original da insercao 1 nao encontrado. Abortando.")
            sys.exit(1)
        conteudo = conteudo.replace(TRECHO_ORIGINAL_1, TRECHO_NOVO_1)
        print("Insercao 1 (gatilho inicial) aplicada.")
    else:
        print("Insercao 1 ja estava aplicada - pulando.")

    if "is_transformacao_pendente_ativo" not in conteudo:
        if TRECHO_ORIGINAL_2 not in conteudo:
            print("ERRO: trecho original da insercao 2 nao encontrado. Abortando.")
            sys.exit(1)
        conteudo = conteudo.replace(TRECHO_ORIGINAL_2, TRECHO_NOVO_2)
        print("Insercao 2 (confirmacao pendente) aplicada.")
    else:
        print("Insercao 2 ja estava aplicada - pulando.")

    return conteudo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    if not CAMINHO_ARQUIVO.exists():
        print(f"ERRO: {CAMINHO_ARQUIVO} nao encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo_original = CAMINHO_ARQUIVO.read_text(encoding="utf-8")

    if not args.aplicar:
        diagnostico(conteudo_original)
        return

    print(
        "Nota: mensagem_handler.py já está versionado no Git — não crio "
        "arquivo .bak solto (evita repetir a bagunça que acabamos de "
        "limpar). Se quiser reverter depois de aplicar, use:\n"
        "  git diff app/services/mensagem_handler.py   # revisar\n"
        "  git checkout -- app/services/mensagem_handler.py   # reverter\n"
    )

    conteudo_novo = aplicar(conteudo_original)

    if conteudo_novo != conteudo_original:
        CAMINHO_ARQUIVO.write_text(conteudo_novo, encoding="utf-8")
        print(f"\n{CAMINHO_ARQUIVO} atualizado com sucesso.")
    else:
        print("\nNenhuma mudanca necessaria (tudo ja estava aplicado).")


if __name__ == "__main__":
    main()
