caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

inicio = max(0, 1768 - 12)
fim = min(len(linhas), 1768 + 8)

for i in range(inicio, fim):
    marcador = ">>> " if i == 1767 else "    "  # 1767 = indice 0-based da linha 1768
    print(f"{marcador}{i+1}: {repr(linhas[i])}")
