"""
patch_buscar_produtor_por_cpf_v1.py

Adiciona buscar_produtor_por_cpf() em app/db.py, espelhando
buscar_produtor_por_numero() já existente. Usado pelo cadastro_handler.py
pra checar duplicidade assim que o CPF é digitado no wizard (antes de
perguntar o resto), evitando o bug de imóvel duplicado achado em 28/07.

USO:
    python3 patch_buscar_produtor_por_cpf_v1.py            # dry-run
    python3 patch_buscar_produtor_por_cpf_v1.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/db.py")
BACKUP = Path("app/db.py.bak_cpf_lookup_v1")

BLOCO_ANTIGO = '''def buscar_produtor_por_numero(telefone: str):
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, nome FROM produtores WHERE telefone = :tel"
        ), {"tel": telefone}).fetchone()
        if result:
            return {"id": result[0], "nome": result[1]}
        return None

def cadastrar(produtor: dict, imovel: dict) -> int:'''

BLOCO_NOVO = '''def buscar_produtor_por_numero(telefone: str):
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, nome FROM produtores WHERE telefone = :tel"
        ), {"tel": telefone}).fetchone()
        if result:
            return {"id": result[0], "nome": result[1]}
        return None


def buscar_produtor_por_cpf(cpf: str):
    """Usado pelo wizard de cadastro (cadastro_handler.py) pra checar
    duplicidade assim que o CPF é digitado, antes de perguntar o resto —
    evita recadastro duplicado (produtor + imóvel) quando a pessoa já
    tem cadastro e confirma de novo, inclusive por outro canal."""
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, nome FROM produtores WHERE cpf = :cpf"
        ), {"cpf": cpf}).fetchone()
        if result:
            return {"id": result[0], "nome": result[1]}
        return None


def cadastrar(produtor: dict, imovel: dict) -> int:'''

BLOCOS = [("buscar_produtor_por_cpf", BLOCO_ANTIGO, BLOCO_NOVO)]


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
