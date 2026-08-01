# -*- coding: utf-8 -*-
"""
PATCH DE DOCUMENTAÇÃO — app/routers/bovino.py

IMPORTANTE: isso NÃO altera nenhuma lógica/query. O endpoint de IOFC usa
subconta_id fixo (UUID) e insumos.categoria, nenhum dos dois afetado pela
migração do plano de contas de 25/07 — só o comentário/docstring estava
desatualizado, citando codigo_conta como se fosse o mecanismo real.

Rodar localmente:
    python3 patch_bovino_docstring_v1.py            # dry-run
    python3 patch_bovino_docstring_v1.py --aplicar   # aplica de verdade
"""
import sys

PATCHES = [
    (
        "app/routers/bovino.py",
        "    Formula: IOFC = Receita de Leite - Custo de Racao (especifico do\n"
        "    rebanho leiteiro, codigo_conta 3.1.3.1.1).",
        "    Formula: IOFC = Receita de Leite - Custo de Racao (especifico do\n"
        "    rebanho leiteiro, via insumos.categoria IN ('racao','nutricao') --\n"
        "    NAO usa codigo_conta; e independente da migracao do plano de\n"
        "    contas de 25/07).",
        "Corrige docstring do IOFC — mecanismo real é insumos.categoria, não codigo_conta",
    ),
    (
        "app/routers/bovino.py",
        '      1. Lancamento financeiro real na subconta "Venda de Leite" (4.1.2),',
        '      1. Lancamento financeiro real na subconta "Venda de Leite"\n'
        "         (via subconta_id fixo, nao codigo_conta -- cod. atual 1.3.1\n"
        "         apos a migracao de 25/07, mas isso nao afeta o filtro),",
        "Corrige docstring — filtro real usa subconta_id, código citado era só ilustrativo",
    ),
    (
        "app/routers/bovino.py",
        "         (ex: '4.1.2' Venda de Leite, que so tem 1 subconta com esse codigo)",
        "         (ex: '1.3.1' Venda de Leite -- codigo atualizado na migracao de\n"
        "         25/07; antes era '4.1.2')",
        "Atualiza exemplo no docstring de _criar_lancamento_lcdpr_bovino",
    ),
]


def main():
    aplicar = "--aplicar" in sys.argv
    if not aplicar:
        print(">>> DRY-RUN — mostrando o que seria alterado, nada será escrito.\n")

    for caminho, antigo, novo, desc in PATCHES:
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                conteudo = f.read()
        except FileNotFoundError:
            print(f"✗ {caminho} não encontrado — rode este script na raiz do projeto.")
            continue

        ocorrencias = conteudo.count(antigo)
        if ocorrencias == 0:
            print(f"⚠ NÃO ENCONTRADO em {caminho}: {desc}")
            continue
        if ocorrencias > 1:
            print(f"⚠ Encontrado {ocorrencias}x em {caminho} (esperava 1x): {desc} — pulando por segurança")
            continue

        if aplicar:
            conteudo_novo = conteudo.replace(antigo, novo)
            with open(caminho, "w", encoding="utf-8") as f:
                f.write(conteudo_novo)
            print(f"✓ APLICADO em {caminho}: {desc}")
        else:
            print(f"  seria aplicado em {caminho}: {desc}")

    print()
    print("Concluído." if aplicar else "Dry-run concluído. Rode com --aplicar para gravar de verdade.")


if __name__ == "__main__":
    main()
