caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

encontrado = False
for i, linha in enumerate(linhas):
    if "def iofc_mensal" in linha:
        encontrado = True
        inicio = max(0, i - 3)
        fim = min(len(linhas), i + 15)
        print(f"Funcao 'iofc_mensal' encontrada na linha {i+1}\n")
        for j in range(inicio, fim):
            print(f"{j+1}: {linhas[j]}", end="")
        break

if not encontrado:
    print("Nao encontrei 'def iofc_mensal' no arquivo.")
