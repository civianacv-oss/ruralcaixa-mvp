# -*- coding: utf-8 -*-
"""
PATCH DO CÓDIGO-FONTE — troca os códigos antigos pelos novos do plano
detalhado em classifier.py, mensagem_handler.py e audio_handler.py.

Não mexe em app/routers/bovino.py (isso vem num patch separado, depois
de localizar a query real do endpoint de IOFC).

Cada substituição é feita por string exata — se a string não for
encontrada (arquivo já mudou, ou já foi patcheado antes), o script avisa
e NÃO aplica nada silenciosamente.

Rodar localmente (dentro da pasta do projeto):
    python3 patch_codigo_fonte_v1.py            # dry-run (mostra o que faria)
    python3 patch_codigo_fonte_v1.py --aplicar   # aplica de verdade
"""
import sys

# (arquivo, texto_antigo, texto_novo, descrição)
PATCHES = [
    # ───────────── classifier.py ─────────────
    (
        "app/services/classifier.py",
        '(["diesel","gasolina","etanol","combustivel","abastec"], "3.1.2", "despesa", None),',
        '(["diesel","gasolina","etanol","combustivel","abastec"], "2.3", "despesa", None),',
        "Combustíveis (agregado) 3.1.2 -> 2.3",
    ),
    (
        "app/services/classifier.py",
        '(["semente","adubo","fertilizante","calcario","defensivo"], "3.1.1", "despesa", None),',
        '(["semente","adubo","fertilizante","calcario","defensivo"], "2.1", "despesa", None),',
        "Custeio agrícola (agregado) 3.1.1 -> 2.1",
    ),
    (
        "app/services/classifier.py",
        '''(["racao", "vacina", "vermifugo", "medicamento", "remedio", "farmacia",
      "antibiotico", "antiinflamatorio", "antiflamatorio"], "3.1.3", "despesa", None),''',
        '''(["racao", "vacina", "vermifugo", "medicamento", "remedio", "farmacia",
      "antibiotico", "antiinflamatorio", "antiflamatorio"], "2.2", "despesa", None),''',
        "Despesas pecuária (agregado) 3.1.3 -> 2.2",
    ),
    (
        "app/services/classifier.py",
        '(["salario","funcionario","diarista","mao de obra"], "3.1.4", "despesa", None),',
        '(["salario","funcionario","diarista","mao de obra"], "2.5", "despesa", None),',
        "Mão de obra (agregado) 3.1.4 -> 2.5",
    ),
    (
        "app/services/classifier.py",
        '(["manutencao","reparo","conserto","peca"], "3.1.5", "despesa", None),',
        '(["manutencao","reparo","conserto","peca"], "2.4.1", "despesa", None),',
        "Manutenção de máquinas 3.1.5 -> 2.4.1",
    ),
    (
        "app/services/classifier.py",
        '(["energia","luz","conta de luz"], "3.1.6", "despesa", None),',
        '(["energia","luz","conta de luz"], "2.2.7", "despesa", None),',
        "Energia 3.1.6 -> 2.2.7",
    ),
    (
        "app/services/classifier.py",
        '''(["arrendamento", "arrendei", "arrendar", "aluguel", "aluguei", "alugar",
      "alugado", "locacao", "locado"], "3.1.7", "despesa", None),''',
        '''(["arrendamento", "arrendei", "arrendar", "aluguel", "aluguei", "alugar",
      "alugado", "locacao", "locado"], "2.6.6", "despesa", None),''',
        "Arrendamentos pagos 3.1.7 -> 2.6.6",
    ),
    (
        "app/services/classifier.py",
        '(["trator","maquina","equipamento","implemento"], "5.1", "investimento", None),',
        '(["trator","maquina","equipamento","implemento"], "3.1", "investimento", None),',
        "Máquinas e equipamentos 5.1 -> 3.1",
    ),
    (
        "app/services/classifier.py",
        '(["obra","benfeitoria","cerca","curral"], "5.2", "investimento", None),',
        '(["obra","benfeitoria","cerca","curral"], "3.3", "investimento", None),',
        "Instalações e benfeitorias 5.2 -> 3.3",
    ),
    (
        "app/services/classifier.py",
        '(["novilho","bezerra","matriz","plantel","compra animal","compra ovelha","compra cabra"], "5.3", "investimento", None),',
        '(["novilho","bezerra","matriz","plantel","compra animal","compra ovelha","compra cabra"], "3.5.3", "investimento", None),',
        "Animais para formação de plantel 5.3 -> 3.5.3",
    ),
    (
        "app/services/classifier.py",
        '(["boi","vaca","gado","bovino","bezerro","novilho"], "1.1.2", "receita", "Bovino"),',
        '(["boi","vaca","gado","bovino","bezerro","novilho"], "1.2.1", "receita", "Bovino"),',
        "Receita bovino 1.1.2 (agregado) -> 1.2.1 (Bovinocultura de corte, específico)",
    ),
    (
        "app/services/classifier.py",
        '(["suino","suíno","porco"], "1.1.2", "receita", "Suino"),',
        '(["suino","suíno","porco"], "1.2.7", "receita", "Suino"),',
        "Receita suíno -> 1.2.7 Suinocultura",
    ),
    (
        "app/services/classifier.py",
        '(["frango","galinha","ave"], "1.1.2", "receita", "Aves"),',
        '(["frango","galinha","ave"], "1.2.8", "receita", "Aves"),',
        "Receita aves -> 1.2.8 Avicultura",
    ),
    (
        "app/services/classifier.py",
        '(["ovelha","carneiro","ovino"], "1.1.2", "receita", "Ovino"),',
        '(["ovelha","carneiro","ovino"], "1.2.3", "receita", "Ovino"),',
        "Receita ovino -> 1.2.3 Ovinocultura de corte",
    ),
    (
        "app/services/classifier.py",
        '(["cabra","bode","caprino"], "1.1.2", "receita", "Caprino"),',
        '(["cabra","bode","caprino"], "1.2.5", "receita", "Caprino"),',
        "Receita caprino -> 1.2.5 Caprinocultura de corte",
    ),
    (
        "app/services/classifier.py",
        '            melhor = ("5.3", "investimento", "Animais")\n        else:\n            melhor = ("3.9", "despesa", None)',
        '            melhor = ("3.5.3", "investimento", "Animais")\n        else:\n            melhor = ("9.9", "despesa", None)',
        "Compra de animal 5.3->3.5.3; fallback incerto 3.9 -> 9.9 PENDENTE (diretriz de 25/07 — não usar mais conta genérica)",
    ),
    (
        "app/services/classifier.py",
        'CONTAS_AMBIGUAS_DIRECAO = {"3.1.7"}',
        'CONTAS_AMBIGUAS_DIRECAO = {"2.6.6"}',
        "Conjunto de contas ambíguas quanto à direção 3.1.7 -> 2.6.6",
    ),

    # ───────────── mensagem_handler.py ─────────────
    (
        "app/services/mensagem_handler.py",
        'if sess.get("conta") == "5.3" and sess.get("produto"):',
        'if sess.get("conta") == "3.5.3" and sess.get("produto"):',
        "Checagem de compra de animal 5.3 -> 3.5.3",
    ),
    (
        "app/services/mensagem_handler.py",
        '''    ("3.1.1", "Despesa — insumos agrícolas (semente, adubo, defensivo)"),
    ("3.1.2", "Despesa — combustível"),
    ("3.1.3", "Despesa — ração/medicamento animal"),
    ("3.1.4", "Despesa — mão de obra/salários"),
    ("3.1.5", "Despesa — manutenção/reparo"),
    ("3.1.6", "Despesa — energia"),
    ("3.1.7", "Despesa — arrendamento/aluguel rural"),
    ("5.1", "Investimento — máquinas/equipamentos"),
    ("5.2", "Investimento — obras/benfeitorias"),
    ("5.3", "Investimento — compra de animais (matriz/plantel)"),
]''',
        '''    ("2.1", "Despesa — insumos agrícolas (semente, adubo, defensivo)"),
    ("2.3", "Despesa — combustível"),
    ("2.2", "Despesa — ração/medicamento animal"),
    ("2.5", "Despesa — mão de obra/salários"),
    ("2.4.1", "Despesa — manutenção/reparo"),
    ("2.2.7", "Despesa — energia"),
    ("2.6.6", "Despesa — arrendamento/aluguel rural"),
    ("3.1", "Investimento — máquinas/equipamentos"),
    ("3.3", "Investimento — obras/benfeitorias"),
    ("3.5.3", "Investimento — compra de animais (matriz/plantel)"),
    ("9.9", "Não sei / verificar depois — Pendente de Classificação"),
]''',
        "Lista de contas do menu manual — todos os códigos + opção nova 9.9 pendente",
    ),

    # ───────────── audio_handler.py ─────────────
    (
        "app/services/audio_handler.py",
        '''    MAPA_CATEGORIA = {
        "venda_produto": "1.1.1", "servico_prestado": "1.2",
        "custeio": "3.1.1", "combustivel": "3.1.2",
        "manutencao": "3.1.5", "salario": "3.1.4",
        "investimento": "5.2", "outros": "3.9",
    }''',
        '''    MAPA_CATEGORIA = {
        "venda_produto": "1.1.1", "servico_prestado": "1.4.2",
        "custeio": "2.1", "combustivel": "2.3",
        "manutencao": "2.4.1", "salario": "2.5.1",
        "investimento": "3.3", "outros": "9.9",
    }''',
        "Mapa de categorias da IA de áudio — 'outros' agora vai para 9.9 PENDENTE, não mais 3.9",
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
            print("   (o arquivo pode já ter mudado desde que este patch foi escrito)")
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
