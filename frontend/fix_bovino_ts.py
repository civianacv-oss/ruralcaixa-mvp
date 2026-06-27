path = r"app\bovino\page.tsx"
content = open(path, encoding="utf-8", errors="replace").read()

# Encontra a definição do tipo Tab e adiciona "Leite"
import re

# Tenta encontrar o tipo Tab
match = re.search(r'type Tab = ([^\n]+)', content)
if match:
    print("Tipo Tab encontrado:", match.group(0))
    old = match.group(0)
    # Adiciona "Leite" se não estiver
    if '"Leite"' not in old:
        new = old.rstrip().rstrip(';') + ' | "Leite";'
        content = content.replace(old, new)
        print("Corrigido:", new)
else:
    print("Tipo Tab nao encontrado — buscando alternativa")
    # Busca contexto ao redor da linha 607
    lines = content.split("\n")
    for i, l in enumerate(lines[600:615], start=601):
        print(f"{i}: {l}")

open(path, "w", encoding="utf-8").write(content)