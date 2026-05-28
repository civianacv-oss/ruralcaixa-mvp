with open("frontend/app/contador/page.tsx", encoding="utf-8") as f:
    c = f.read()

# Fix 1: conta_codigo vazio - mostrar descricao/atividade
old1 = '{new Date(l.data_lancamento).toLocaleDateString("pt-BR")} ·\n                            {l.conta_codigo}'
new1 = '{l.data_lancamento ? l.data_lancamento.slice(0,10).split("-").reverse().join("/") : ""} ·\n                            {l.descricao || l.atividade || ""}'
c2 = c.replace(old1, new1, 1)
print("Fix data+conta:", c != c2)

with open("frontend/app/contador/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
