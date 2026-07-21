caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

for i in range(1589, 1690):  # linhas 1590 a 1690 (1-indexed)
    print(f"{i+1}: {linhas[i]}", end="")
