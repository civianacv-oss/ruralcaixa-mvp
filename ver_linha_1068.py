caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

for i in range(1055, 1100):  # linhas 1056 a 1100 (1-indexed)
    print(f"{i+1}: {linhas[i]!r}")
