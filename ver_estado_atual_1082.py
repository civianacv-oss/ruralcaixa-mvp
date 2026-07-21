caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

for i in range(1065, 1160):  # linhas 1066 a 1160 (1-indexed)
    print(f"{i+1}: {linhas[i]}", end="")
