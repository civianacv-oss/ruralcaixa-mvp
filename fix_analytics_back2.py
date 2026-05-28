with open("frontend/app/analytics/page.tsx", encoding="utf-8") as f:
    c = f.read()

old = '<h1 className="text-xl font-bold text-green-800">Dashboard'
new = '<a href="/" className="text-xs text-green-700 opacity-70 block mb-1">\u2190 Inicio</a>\n      <h1 className="text-xl font-bold text-green-800">Dashboard'

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("frontend/app/analytics/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
