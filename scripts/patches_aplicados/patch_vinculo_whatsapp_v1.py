"""
patch_vinculo_whatsapp_v1.py

Dá ao WhatsApp (app/main.py) o comando "vincular administrador/
procurador/contador CPF" AGORA (decidido em 28/07), sem duplicar lógica:
importa e chama as mesmas funções que o patch_vinculo_handler_v1.py
adiciona em app/services/mensagem_handler.py (_eh_comando_vinculo,
_processar_comando_vinculo), em vez de reescrever a lógica de novo.

Isso é o mesmo princípio já usado no wizard de Recibo (Fase 2 da
unificação): lógica de negócio mora em UM lugar só, cada canal só chama.

IMPORTANTE: aplique patch_vinculo_handler_v1.py ANTES deste, senão as
funções que este patch importa ainda não existem em mensagem_handler.py.

USO:
    python3 patch_vinculo_whatsapp_v1.py            # dry-run
    python3 patch_vinculo_whatsapp_v1.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/main.py")
BACKUP = Path("app/main.py.bak_vinculo_v1")

BLOCO_ANTIGO = '''            if is_recibo_wizard_ativo(sessoes, numero):
                resposta = processar_etapa_recibo(sessoes, numero, texto)
                if resposta:
                    await send_msg(numero, resposta)
                return

            if texto_upper in ("CADASTRAR", "CADASTRO", "ME CADASTRAR", "QUERO ME CADASTRAR",
                               "OI", "OLA", "INICIO"):'''

BLOCO_NOVO = '''            if is_recibo_wizard_ativo(sessoes, numero):
                resposta = processar_etapa_recibo(sessoes, numero, texto)
                if resposta:
                    await send_msg(numero, resposta)
                return

            # Comando "vincular administrador/procurador/contador CPF" —
            # reaproveita a MESMA lógica do Telegram (mensagem_handler.py),
            # sem duplicar código (mesmo princípio já usado no Recibo).
            from app.services.mensagem_handler import (
                _eh_comando_vinculo, _processar_comando_vinculo,
            )
            if _eh_comando_vinculo(texto):
                resposta = await _processar_comando_vinculo(texto, numero, "whatsapp")
                await send_msg(numero, resposta)
                return

            if texto_upper in ("CADASTRAR", "CADASTRO", "ME CADASTRAR", "QUERO ME CADASTRAR",
                               "OI", "OLA", "INICIO"):'''

BLOCOS = [("hook do comando de vínculo no WhatsApp", BLOCO_ANTIGO, BLOCO_NOVO)]


def main():
    aplicar = "--aplicar" in sys.argv
    if not ARQUIVO.exists():
        print(f"ERRO: {ARQUIVO} não encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = ARQUIVO.read_text(encoding="utf-8")
    original = conteudo
    for nome, antigo, novo in BLOCOS:
        n = conteudo.count(antigo)
        print(f"[{nome}] ocorrências encontradas: {n}")
        if n != 1:
            print(f"  ABORTANDO: esperava 1, achei {n}.")
            print("  (Confira também se patch_vinculo_handler_v1.py já foi aplicado)")
            sys.exit(1)
        conteudo = conteudo.replace(antigo, novo)

    if not aplicar:
        print("\n=== DRY RUN (nada gravado) ===")
        print(f"Tamanho original: {len(original)} -> novo: {len(conteudo)}")
        return

    shutil.copy2(ARQUIVO, BACKUP)
    print(f"Backup: {BACKUP}")
    ARQUIVO.write_text(conteudo, encoding="utf-8")
    print(f"Aplicado em: {ARQUIVO}")


if __name__ == "__main__":
    main()
