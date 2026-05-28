import os

# 1. RELATORIO - adiciona link voltar no header
with open("frontend/app/relatorio/page.tsx", encoding="utf-8") as f:
    c = f.read()
old = '<div className="text-lg font-medium mt-1">Relat'
new = '<a href="/" className="text-xs opacity-70">\u2190 Inicio</a>\n        <div className="text-lg font-medium mt-1">Relat'
c2 = c.replace(old, new, 1)
print("relatorio:", c != c2)
with open("frontend/app/relatorio/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)

# 2. CADASTRO - adiciona link voltar no header
with open("frontend/app/cadastro/page.tsx", encoding="utf-8") as f:
    c = f.read()
old = '<div className="text-lg font-medium mt-1">Cad'
new = '<a href="/" className="text-xs opacity-70">\u2190 Inicio</a>\n        <div className="text-lg font-medium mt-1">Cad'
c2 = c.replace(old, new, 1)
print("cadastro:", c != c2)
with open("frontend/app/cadastro/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)

# 3. PRIVACIDADE - adiciona link voltar no header
with open("frontend/app/privacidade/page.tsx", encoding="utf-8") as f:
    c = f.read()
old = '<div className="text-lg font-medium">RuralCaixa</div>'
new = '<a href="/" className="text-xs opacity-70 block mb-1">\u2190 Inicio</a>\n          <div className="text-lg font-medium">RuralCaixa</div>'
c2 = c.replace(old, new, 1)
print("privacidade:", c != c2)
with open("frontend/app/privacidade/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
