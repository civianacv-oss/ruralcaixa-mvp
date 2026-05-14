from app.services.classifier import classificar

testes = [
    "vendi 3 bois por 15000 reais",
    "comprei diesel 500 reais posto agro",
    "compra de 10 ovelhas por 8000 reais",
    "adubo npk 3800 reais agropecuaria",
    "venda de 5 cabras recebeu 2500",
]

for t in testes:
    r = classificar(t)
    print(f"TEXTO: {t}")
    print(f"RESULTADO: {r}")
    print()