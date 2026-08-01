"""
patch_gravar_lancamento_telefone_v1.py

Corrige app/db.py:gravar_lancamento() - dois problemas achados na
investigacao de 31/07:

  1. Busca de produtor por telefone usava IGUALDADE EXATA
     ("telefone = :tel"), diferente do padrao tolerante ja usado em
     _autorizar_numero ("telefone LIKE :tel" com ultimos 8 digitos).
     Qualquer diferenca de formatacao (com/sem +55, espacos, DDD) fazia
     a busca falhar.

  2. Quando a busca falhava, caia num FALLBACK SILENCIOSO:
     produtor_id = prod[0] if prod else 1
     Ou seja: lancamento de QUALQUER numero nao encontrado era gravado
     como se fosse do produtor_id=1 (Cicero), sem aviso nenhum. Foi
     assim que um lancamento real do Bira (produtor_id=6, nota fiscal
     de Racoes Porto Alegre, R$3.905,00, 31/07) acabou gravado com
     produtor_id=1.

Correcao: busca tolerante (mesmo padrao de _autorizar_numero) + se ainda
assim nao encontrar, LEVANTA ValueError em vez de gravar no produtor
errado. O chamador (mensagem_handler.py) deve tratar essa excecao com
uma mensagem amigavel pro usuario, em vez de deixar o try/except
generico converter em "Erro interno" cru - mas ate isso ser refinado,
falhar visivelmente e ja MUITO melhor que corromper dado silenciosamente.

Uso:
  python3 patch_gravar_lancamento_telefone_v1.py            # diagnostico
  python3 patch_gravar_lancamento_telefone_v1.py --aplicar   # aplica
"""

import argparse
import sys
from pathlib import Path

CAMINHO_ARQUIVO = Path("app/db.py")

TRECHO_ORIGINAL = """def gravar_lancamento(dados: dict):
    with engine.connect() as conn:
        prod = conn.execute(text('SELECT id FROM produtores WHERE telefone = :tel'), {'tel': dados.get('numero', '')}).fetchone()
        produtor_id = prod[0] if prod else 1"""

TRECHO_NOVO = """def gravar_lancamento(dados: dict):
    with engine.connect() as conn:
        numero = (dados.get('numero') or '').strip()
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true")
    args = parser.parse_args()

    if not CAMINHO_ARQUIVO.exists():
        print(f"ERRO: {CAMINHO_ARQUIVO} nao encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    conteudo = CAMINHO_ARQUIVO.read_text(encoding="utf-8")

    ja_aplicado = "NUNCA mais cair silenciosamente em produtor_id=1" in conteudo
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
    print("Revise com: git diff app/db.py")
    print(
        "\nIMPORTANTE: gravar_lancamento() agora pode levantar ValueError. "
        "Confira nos chamadores (mensagem_handler.py, main.py, etc.) se ha "
        "um try/except cobrindo essa chamada - se sim, a mensagem de erro "
        "generica ('Erro interno') ainda vai aparecer pro usuario, mas pelo "
        "menos o dado nao sera mais gravado no produtor errado. Um ajuste "
        "futuro pode capturar ValueError especificamente para dar uma "
        "mensagem mais amigavel."
    )


if __name__ == "__main__":
    main()
