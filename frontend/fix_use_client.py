import glob, re

for path in glob.glob("app/**/*.tsx", recursive=True):
    try:
        content = open(path, encoding="utf-8", errors="replace").read()
        # Verifica se "use client" não está na primeira linha mas existe no arquivo
        linhas = content.split("\n")
        primeira = linhas[0].strip().strip('"').strip("'")
        if primeira != "use client" and ('"use client"' in content or "'use client'" in content):
            # Remove de onde está
            content = re.sub(r'["\']use client["\'];\n', '', content)
            # Coloca no topo
            content = '"use client";\n' + content
            open(path, "w", encoding="utf-8").write(content)
            print(f"Corrigido: {path}")
    except Exception as e:
        print(f"Erro {path}: {e}")
print("Concluído")