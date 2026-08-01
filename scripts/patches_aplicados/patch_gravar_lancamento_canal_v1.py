"""
patch_gravar_lancamento_canal_v1.py

Corrige app/db.py:gravar_lancamento() - bug achado em producao (31/07,
teste do Cicero no Telegram apos patch_gravar_lancamento_telefone_v1.py):
a busca por telefone (mesmo tolerante, ultimos 8 digitos) NUNCA vai
encontrar nada no Telegram, porque "numero" nesse canal e o
telegram_chat_id (ex: '1256791002'), nao um telefone de verdade.

Mesmo padrao ja usado em _autorizar_numero (mensagem_handler.py):
  canal == 'telegram' -> produtores.telegram_chat_id (match exato)
  qualquer outro canal -> produtores.telefone (ultimos 8 digitos)

Depende de patch_sess_canal_v1.py ja aplicado (para que dados['canal']
exista quando gravar_lancamento e chamado a partir do fluxo de sessao).

Uso:
  python3 patch_gravar_lancamento_canal_v1.py            # diagnostico
  python3 patch_gravar_lancamento_canal_v1.py --aplicar   # aplica
"""

import argparse
import sys
from pathlib import Path

CAMINHO_ARQUIVO = Path("app/db.py")

TRECHO_ORIGINAL = """        numero = (dados.get('numero') or '').strip()
        # Busca tolerante por ultimos 8 digitos - mesmo padrao ja usado
        # em _autorizar_numero (mensagem_handler.py). Igualdade exata
        # falhava com qualquer diferenca de formatacao (+55, espacos, DDD).
        if len(numero) >= 8:
            prod = conn.execute(
                text('SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1'),
                {'tel': f'%{numero[-8:]}'}
            ).fetchone()
        else:
            prod = None
        if not prod:
            # NUNCA mais cair silenciosamente em produtor_id=1 (bug
            # achado em 31/07 - lancamento real do Bira foi parar no
            # Cicero por causa desse fallback). Falhar visivelmente
            # aqui e seguro; o chamador deve tratar este erro.
            raise ValueError(
                f"Nao foi possivel identificar o produtor para o numero "
                f"'{numero}'. Lancamento NAO foi gravado."
            )
        produtor_id = prod[0]"""

TRECHO_NOVO = """        numero = (dados.get('numero') or '').strip()
        canal = (dados.get('canal') or '').strip()
        # IMPORTANTE: "numero" nao e telefone em todo canal - no Telegram
        # e o chat_id (numerico, sem relacao com o telefone real da
        # pessoa). Mesmo padrao ja usado em _autorizar_numero
        # (mensagem_handler.py): canal=='telegram' -> telegram_chat_id
        # (match exato); qualquer outro canal -> telefone (ultimos 8
        # digitos, tolerante a formatacao). Bug achado em producao 31/07:
        # a versao anterior so buscava por telefone, entao NUNCA
        # encontrava ninguem vindo do Telegram.
        prod = None
        if canal == 'telegram':
            if numero:
                prod = conn.execute(
                    text('SELECT id FROM produtores WHERE telegram_chat_id = :num LIMIT 1'),
                    {'num': numero}
                ).fetchone()
        else:
            if len(numero) >= 8:
                prod = conn.execute(
                    text('SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1'),
                    {'tel': f'%{numero[-8:]}'}
                ).fetchone()
        if not prod:
            # NUNCA mais cair silenciosamente em produtor_id=1 (bug
            # achado em 31/07 - lancamento real do Bira foi parar no
            # Cicero por causa desse fallback). Falhar visivelmente
            # aqui e seguro; o chamador deve tratar este erro.
            raise ValueError(
                f"Nao foi possivel identificar o produtor para o numero "
                f"'{numero}' (canal={canal or 'desconhecido'}). Lancamento NAO foi gravado."
            )
        produtor_id = prod[0]"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    if not CAMINHO_ARQUIVO.exists():
        print(f"ERRO: {CAMINHO_ARQUIVO} nao encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = CAMINHO_ARQUIVO.read_text(encoding="utf-8")

    ja_aplicado = "so buscava por telefone, entao NUNCA" in conteudo
    ocorrencias = conteudo.count(TRECHO_ORIGINAL)

    if not args.aplicar:
        print(f"--- Diagnostico: {CAMINHO_ARQUIVO} ---\n")
        if ja_aplicado:
            print("[JA APLICADA] - nada a fazer.")
        elif ocorrencias == 1:
            print("[PRONTA PARA APLICAR] - trecho original encontrado (1 ocorrencia).")
        elif ocorrencias == 0:
            print(
                "[ERRO] Trecho original nao encontrado. Confirme que "
                "patch_gravar_lancamento_telefone_v1.py ja foi aplicado antes deste."
            )
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
    print("Revise com: git diff app/db.py")


if __name__ == "__main__":
    main()
