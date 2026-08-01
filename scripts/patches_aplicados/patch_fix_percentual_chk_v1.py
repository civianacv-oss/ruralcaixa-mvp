"""
patch_fix_percentual_chk_v1.py

Corrige o bug achado em 28/07 (segunda rodada): o patch anterior
(patch_fix_percentual_vinculo_v1.py) resolveu o "NOT NULL" faltando, mas
usou percentual=0 -- que quebra com outra constraint do banco:

    CHECK (percentual > 0 AND percentual <= 100)  -- nome: chk_pct

Confirmado via traceback real do Railway (Deploy Logs, 28/07 14:17 BRT):
    psycopg2.errors.CheckViolation: new row for relation
    "participacoes_imovel" violates check constraint "chk_pct"

Correção: usa percentual=0.01 (valor simbólico mínimo que passa na
constraint) em vez de 0 -- administrador/procurador/contador não têm
participação societária real (isso é conceito de proprietário/condômino
com capital aportado), mas o banco exige um valor > 0 de qualquer forma.

USO:
    python3 patch_fix_percentual_chk_v1.py            # dry-run
    python3 patch_fix_percentual_chk_v1.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/services/mensagem_handler.py")
BACKUP = Path("app/services/mensagem_handler.py.bak_fix_percentual_chk_v1")

BLOCO_ANTIGO = '''        conn.execute(sqlt("""
            INSERT INTO participacoes_imovel
                (imovel_id, produtor_id, nome_participante, tipo_vinculo, vigencia_inicio, percentual)
            VALUES (:iid, :pid, :nome, :tipo, CURRENT_DATE, 0)
        """), {"iid": imovel_id, "pid": pessoa["id"], "nome": pessoa["nome"], "tipo": tipo_vinculo})
        conn.commit()'''

BLOCO_NOVO = '''        conn.execute(sqlt("""
            INSERT INTO participacoes_imovel
                (imovel_id, produtor_id, nome_participante, tipo_vinculo, vigencia_inicio, percentual)
            VALUES (:iid, :pid, :nome, :tipo, CURRENT_DATE, 0.01)
        """), {"iid": imovel_id, "pid": pessoa["id"], "nome": pessoa["nome"], "tipo": tipo_vinculo})
        conn.commit()'''

BLOCOS = [("percentual 0 -> 0.01 (constraint chk_pct exige > 0)", BLOCO_ANTIGO, BLOCO_NOVO)]


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
