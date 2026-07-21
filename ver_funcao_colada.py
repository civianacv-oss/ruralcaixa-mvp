caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

for i in range(1414, 1475):  # linhas 1415 a 1475 (1-indexed)
    print(f"{i+1}: {linhas[i]}", end="")
