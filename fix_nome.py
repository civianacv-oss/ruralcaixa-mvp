with open("frontend/app/layout.tsx", encoding="utf-8") as f:
    content = f.read()

result = content.replace("RuralCaixa Tech", "GestaoAgro Tech")
print("Changed:", content != result)

with open("frontend/app/layout.tsx", "w", encoding="utf-8") as f:
    f.write(result)
