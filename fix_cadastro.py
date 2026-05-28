with open("frontend/app/cadastro/page.tsx", encoding="utf-8") as f:
    c = f.read()

# Remove o link Inicio que adicionamos (cadastro ja tem link pro painel do contador)
old = '<a href="/" className="text-xs opacity-70">\u2190 Inicio</a>\n        <div className="text-lg font-medium mt-1">{modoEdicao ? "Editar produtor"'
new = '<div className="text-lg font-medium mt-1">{modoEdicao ? "Editar produtor"'

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("frontend/app/cadastro/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
