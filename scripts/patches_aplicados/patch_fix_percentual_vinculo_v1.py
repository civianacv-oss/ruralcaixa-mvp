"""
patch_fix_percentual_vinculo_v1.py

Corrige o bug achado em 28/07 no comando "vincular administrador/
procurador/contador CPF": o INSERT em participacoes_imovel não incluía a
coluna "percentual", que é NOT NULL sem default no banco (confirmado via
information_schema). Isso quebrava a gravação com erro genérico "Erro
interno. Tente novamente." (capturado em telegram_bot_router.py).

Correção: inclui percentual=0 no INSERT -- administrador/procurador/
contador não são condôminos com participação societária real (isso é
conceito de proprietário/condômino com capital aportado, tratado em
outro lugar), então 0 é o valor correto pra esses papéis.

USO:
    python3 patch_fix_percentual_vinculo_v1.py            # dry-run
    python3 patch_fix_percentual_vinculo_v1.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/services/mensagem_handler.py")
BACKUP = Path("app/services/mensagem_handler.py.bak_fix_percentual_v1")

BLOCO_ANTIGO = '''        conn.execute(sqlt("""
            INSERT INTO participacoes_imovel
                (imovel_id, produtor_id, nome_participante, tipo_vinculo, vigencia_inicio)
            VALUES (:iid, :pid, :nome, :tipo, CURRENT_DATE)
        """), {"iid": imovel_id, "pid": pessoa["id"], "nome": pessoa["nome"], "tipo": tipo_vinculo})
        conn.commit()'''

BLOCO_NOVO = '''        conn.execute(sqlt("""
            INSERT INTO participacoes_imovel
                (imovel_id, produtor_id, nome_participante, tipo_vinculo, vigencia_inicio, percentual)
            VALUES (:iid, :pid, :nome, :tipo, CURRENT_DATE, 0)
        """), {"iid": imovel_id, "pid": pessoa["id"], "nome": pessoa["nome"], "tipo": tipo_vinculo})
        conn.commit()'''

BLOCOS = [("adiciona percentual=0 no INSERT de vinculo", BLOCO_ANTIGO, BLOCO_NOVO)]


def main():
    aplicar = "--aplicar" in sys.argv
    if not ARQUIVO.exists():
        print(f"ERRO: {ARQUIVO} não encontrado.")
        sys.exit(1)

    conteudo = ARQUIVO.read_text(encoding="utf-8")
    original = conteudo
    for nome, antigo, novo in BLOCOS:
        n = conteudo.count(antigo)
        print(f"[{nome}] ocorrências encontradas: {n}")
        if n != 1:
            print(f"  ABORTANDO: esperava 1, achei {n}.")
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
