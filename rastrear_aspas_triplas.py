caminho = r"C:\ruralcaixa\ruralcaixa-mvp\app\routers\bovino.py"

with open(caminho, encoding="utf-8", errors="replace") as f:
    linhas = f.readlines()

dentro_de_string = False
contador = 0

print("Rastreando aspas triplas (\"\"\") linha por linha ate a linha 1768...\n")
print("Se 'dentro_de_string' ficar True bem antes da linha 1758 (onde")
print("deveria abrir o docstring de 'resolver_brincos_duplicados'), achamos o culpado.\n")

for i, linha in enumerate(linhas[:1768]):
    n_ocorrencias = linha.count('"""')
    if n_ocorrencias % 2 == 1:
        dentro_de_string = not dentro_de_string
        contador += 1
        print(f"Linha {i+1}: alternou para dentro_de_string={dentro_de_string}  (ocorrencia #{contador})")
        print(f"    conteudo: {linha!r}")

print(f"\nEstado final (apos processar ate a linha 1768): dentro_de_string={dentro_de_string}")
print("Se isso for True, o parser acha que ainda estamos dentro de uma string")
print("quando chega na linha 1768 - ou seja, o docstring da linha 1758 foi")
print("interpretado como FECHAMENTO de uma string aberta antes, nao abertura.")
