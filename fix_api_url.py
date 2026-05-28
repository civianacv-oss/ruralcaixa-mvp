with open("frontend/app/analytics/page.tsx", encoding="utf-8") as f:
    c = f.read()

old = 'const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";'
new = 'const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";'

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("frontend/app/analytics/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
