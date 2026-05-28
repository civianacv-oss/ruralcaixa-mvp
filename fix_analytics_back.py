with open("frontend/app/analytics/page.tsx", encoding="utf-8") as f:
    c = f.read()

old = '<div className="text-xl font-bold text-green-800">Dashboard {produtor?.nome?.split(" ")[0]}</div>'
new = '<a href="/" className="text-xs text-green-700 opacity-70">\u2190 Inicio</a>\n        <div className="text-xl font-bold text-green-800">Dashboard {produtor?.nome?.split(" ")[0]}</div>'

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("frontend/app/analytics/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
