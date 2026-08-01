"""
patch_enum_classificacao_v1.py

Corrige o bug achado em 27/07: "vendi 5 bois por 10000 reais" no Telegram
falhava com "invalid input value for enum classificacao_fiscal: NEGOCIACAO".

Causa raiz: a coluna cv_vendas.classificacao é do tipo ENUM
classificacao_fiscal no banco, que só aceita 'RURAL' ou 'COMERCIAL'
(confirmado via psycopg2: enum_range = ['RURAL', 'COMERCIAL']). O código em
app/routers/compravenda.py calcula classificacao_venda como "RURAL",
"NEGOCIACAO" ou "MISTA" (quando há baixas de tipos diferentes na mesma
venda) e grava esse valor direto na coluna enum — "NEGOCIACAO" e "MISTA"
nunca foram valores aceitos por esse enum, então a gravação sempre falhava
nesses dois casos.

Escopo do bug: SÓ a gravação em cv_vendas.classificacao (nível da venda
agregada). A tabela cv_vendas_baixas.classificacao (nível de cada baixa
FIFO) e a agregação de relatório em /resumo-fiscal NÃO são enum — usam
"NEGOCIACAO" livremente e continuam funcionando sem problema. Por isso a
correção só precisa mapear o valor no momento do INSERT em cv_vendas,
sem tocar em mais nada (mesmo padrão já usado em locacoes_pontos.py, que
já espera "COMERCIAL" como nome correto desse conceito).

USO:
    python3 patch_enum_classificacao_v1.py            # dry-run
    python3 patch_enum_classificacao_v1.py --aplicar   # grava de verdade
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/routers/compravenda.py")
BACKUP = Path("app/routers/compravenda.py.bak_enum_v1")

# ─────────────────────────────────────────────────────────────────────────
# BLOCO A — adiciona classificacao_venda_db logo após o cálculo original
# de classificacao_venda, sem alterar o valor original (que continua
# usado no retorno da API e no aviso ao usuário).
# ─────────────────────────────────────────────────────────────────────────
BLOCO_A_ANTIGO = '''    classificacoes_presentes = {b["classificacao"] for b in baixas}
    classificacao_venda = (
        classificacoes_presentes.pop() if len(classificacoes_presentes) == 1 else "MISTA"
    )'''

BLOCO_A_NOVO = '''    classificacoes_presentes = {b["classificacao"] for b in baixas}
    classificacao_venda = (
        classificacoes_presentes.pop() if len(classificacoes_presentes) == 1 else "MISTA"
    )
    # cv_vendas.classificacao é ENUM classificacao_fiscal no banco, que só
    # aceita 'RURAL' ou 'COMERCIAL' (bug achado em 27/07: gravar
    # "NEGOCIACAO" ou "MISTA" direto quebra com "invalid input value for
    # enum classificacao_fiscal"). Os nomes "NEGOCIACAO"/"MISTA" continuam
    # válidos como detalhe de negócio — usados em cv_vendas_baixas.classificacao
    # (não é enum) e no retorno da API/relatórios — só a gravação na coluna
    # enum de cv_vendas precisa do valor que o banco aceita.
    classificacao_venda_db = "RURAL" if classificacao_venda == "RURAL" else "COMERCIAL"'''

# ─────────────────────────────────────────────────────────────────────────
# BLOCO B — usa o valor mapeado (_db) apenas nos parâmetros do INSERT em
# cv_vendas, mantendo classificacao_venda (original) em todo o resto
# (retorno da API, checagem do aviso).
# ─────────────────────────────────────────────────────────────────────────
BLOCO_B_ANTIGO = '''    """, (imovel_id, produto_id, data_venda,
          quantidade, valor_unitario, valor_total,
          custo_total, lucro_bruto, margem_pct,
          comprador, nota_fiscal, observacoes,
          classificacao_venda, round(valor_rural, 2), round(valor_negociacao, 2),
          lancamento_id))'''

BLOCO_B_NOVO = '''    """, (imovel_id, produto_id, data_venda,
          quantidade, valor_unitario, valor_total,
          custo_total, lucro_bruto, margem_pct,
          comprador, nota_fiscal, observacoes,
          classificacao_venda_db, round(valor_rural, 2), round(valor_negociacao, 2),
          lancamento_id))'''

BLOCOS = [
    ("A — mapeamento classificacao_venda_db", BLOCO_A_ANTIGO, BLOCO_A_NOVO),
    ("B — uso do valor mapeado no INSERT cv_vendas", BLOCO_B_ANTIGO, BLOCO_B_NOVO),
]


def main():
    aplicar = "--aplicar" in sys.argv

    if not ARQUIVO.exists():
        print(f"ERRO: {ARQUIVO} não encontrado. Rode a partir da raiz do repo "
              f"(~/ruralcaixa/ruralcaixa-mvp).")
        sys.exit(1)

    conteudo = ARQUIVO.read_text(encoding="utf-8")
    conteudo_original = conteudo

    for nome, antigo, novo in BLOCOS:
        n_ocorrencias = conteudo.count(antigo)
        print(f"[{nome}] ocorrências encontradas: {n_ocorrencias}")
        if n_ocorrencias != 1:
            print(f"  ABORTANDO: esperava exatamente 1 ocorrência, achei {n_ocorrencias}.")
            print("  O arquivo pode ter mudado desde o diagnóstico. Nada foi gravado.")
            sys.exit(1)
        conteudo = conteudo.replace(antigo, novo)

    print()
    if not aplicar:
        print("=== DRY RUN (nada foi gravado) ===")
        print("Revise os blocos acima. Se estiver certo, rode de novo com --aplicar")
        print(f"Tamanho original: {len(conteudo_original)} chars -> novo: {len(conteudo)} chars")
        return

    shutil.copy2(ARQUIVO, BACKUP)
    print(f"Backup salvo em: {BACKUP}")
    ARQUIVO.write_text(conteudo, encoding="utf-8")
    print(f"Patch aplicado em: {ARQUIVO}")
    print()
    print("Próximo passo: 'git diff app/routers/compravenda.py', testar")
    print("localmente ('vendi 5 bois por 10000 reais' no Telegram), depois")
    print("commit + push + deploy Railway (SHA completo).")


if __name__ == "__main__":
    main()
