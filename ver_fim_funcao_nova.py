caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

for i in range(1159, 1200):  # linhas 1160 a 1200 (1-indexed)
    print(f"{i+1}: {linhas[i]}", end="")
