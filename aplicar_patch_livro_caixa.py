# -*- coding: utf-8 -*-
"""
Aplica as 4 edicoes de integracao do Livro Caixa automaticamente:
  1. Import do icone BookOpen em RuralLayout.tsx
  2. Item de menu em RuralLayout.tsx
  3. Import de LivroCaixa em App.tsx
  4. Rota /livro-caixa em App.tsx

Faz backup de cada arquivo antes de editar (.bak).
"""

import sys

RURAL_LAYOUT = r"C:\ruralcaixa\ruralcaixa-mvp\client\src\components\RuralLayout.tsx"
APP_TSX = r"C:\ruralcaixa\ruralcaixa-mvp\client\src\App.tsx"


def aplicar_edicao(caminho, busca, substituicao, descricao):
    with open(caminho, encoding="utf-8") as f:
        conteudo = f.read()

    if substituicao in conteudo:
        print(f"  [JA APLICADO] {descricao} - pulando (idempotente)")
        return True

    ocorrencias = conteudo.count(busca)
    if ocorrencias == 0:
        print(f"  [ERRO] {descricao}: texto de busca NAO encontrado no arquivo!")
        print(f"         Procurado: {busca!r}")
        return False
    if ocorrencias > 1:
        print(f"  [ERRO] {descricao}: texto de busca aparece {ocorrencias}x (esperado 1). Abortando essa edicao.")
        return False

    novo_conteudo = conteudo.replace(busca, substituicao)

    # backup
    with open(caminho + ".bak", "w", encoding="utf-8") as f:
        f.write(conteudo)

    with open(caminho, "w", encoding="utf-8") as f:
        f.write(novo_conteudo)

    print(f"  [OK] {descricao} aplicada com sucesso (backup em {caminho}.bak)")
    return True


print("=" * 60)
print("1/4 - Import do icone BookOpen em RuralLayout.tsx")
print("=" * 60)
busca_1 = "  ClipboardList,\n  Globe,\n  TrendingDown,\n"
sub_1 = "  ClipboardList,\n  Globe,\n  TrendingDown,\n  BookOpen,\n"
ok1 = aplicar_edicao(RURAL_LAYOUT, busca_1, sub_1, "Import BookOpen")

print("\n" + "=" * 60)
print("2/4 - Item de menu Livro Caixa em RuralLayout.tsx")
print("=" * 60)
busca_2 = (
    '      { icon: ClipboardList, label: "EFD-Reinf / DARF",     path: "/efd-reinf" },\n'
    '      { icon: Globe,        label: "DCTFWeb",                path: "/dctfweb" },\n'
    '      { icon: TrendingDown, label: "Simulador Tributário",   path: "/simulador-tributario" },\n'
    '    ],\n'
)
sub_2 = (
    '      { icon: ClipboardList, label: "EFD-Reinf / DARF",     path: "/efd-reinf" },\n'
    '      { icon: Globe,        label: "DCTFWeb",                path: "/dctfweb" },\n'
    '      { icon: BookOpen,     label: "Livro Caixa",            path: "/livro-caixa" },\n'
    '      { icon: TrendingDown, label: "Simulador Tributário",   path: "/simulador-tributario" },\n'
    '    ],\n'
)
ok2 = aplicar_edicao(RURAL_LAYOUT, busca_2, sub_2, "Item de menu Livro Caixa")

print("\n" + "=" * 60)
print("3/4 - Import de LivroCaixa em App.tsx")
print("=" * 60)
busca_3 = 'import EFDReinf from "./pages/EFDReinf";\nimport DCTFWeb from "./pages/DCTFWeb";\n'
sub_3 = 'import EFDReinf from "./pages/EFDReinf";\nimport DCTFWeb from "./pages/DCTFWeb";\nimport LivroCaixa from "./pages/LivroCaixa";\n'
ok3 = aplicar_edicao(APP_TSX, busca_3, sub_3, "Import LivroCaixa")

print("\n" + "=" * 60)
print("4/4 - Rota /livro-caixa em App.tsx")
print("=" * 60)
busca_4 = (
    '      <Route path="/efd-reinf">{() => <ProtectedRoute component={EFDReinf} />}</Route>\n'
    '      <Route path="/dctfweb">{() => <ProtectedRoute component={DCTFWeb} />}</Route>\n'
    '      <Route path="/simulador-tributario">{() => <ProtectedRoute component={SimuladorTributacao} />}</Route>\n'
)
sub_4 = (
    '      <Route path="/efd-reinf">{() => <ProtectedRoute component={EFDReinf} />}</Route>\n'
    '      <Route path="/dctfweb">{() => <ProtectedRoute component={DCTFWeb} />}</Route>\n'
    '      <Route path="/livro-caixa">{() => <ProtectedRoute component={LivroCaixa} />}</Route>\n'
    '      <Route path="/simulador-tributario">{() => <ProtectedRoute component={SimuladorTributacao} />}</Route>\n'
)
ok4 = aplicar_edicao(APP_TSX, busca_4, sub_4, "Rota /livro-caixa")

print("\n" + "=" * 60)
if all([ok1, ok2, ok3, ok4]):
    print("TODAS AS 4 EDICOES APLICADAS COM SUCESSO.")
    print("Proximo passo: rodar 'npm run build' dentro de client/")
else:
    print("ALGUMA EDICAO FALHOU - revise as mensagens [ERRO] acima antes de continuar.")
print("=" * 60)
