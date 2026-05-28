# RELATORIO
with open("frontend/app/relatorio/page.tsx", encoding="utf-8") as f:
    c = f.read()
old = '<div className="text-lg font-medium mt-1">LCDPR'
new = '<a href="/" className="text-xs opacity-70">\u2190 Inicio</a>\n        <div className="text-lg font-medium mt-1">LCDPR'
c2 = c.replace(old, new, 1)
print("relatorio:", c != c2)
with open("frontend/app/relatorio/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)

# CADASTRO
with open("frontend/app/cadastro/page.tsx", encoding="utf-8") as f:
    c = f.read()
old = '<div className="text-lg font-medium mt-1">{modoEdicao ? "Editar produtor"'
new = '<a href="/" className="text-xs opacity-70">\u2190 Inicio</a>\n        <div className="text-lg font-medium mt-1">{modoEdicao ? "Editar produtor"'
c2 = c.replace(old, new, 1)
print("cadastro:", c != c2)
with open("frontend/app/cadastro/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
