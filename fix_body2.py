with open("app/main.py", encoding="utf-8") as f:
    c = f.read()

old = "@app.get(\"/produtores/{produtor_id}/esocial/config\")"
new = "from fastapi import Body\n\n@app.get(\"/produtores/{produtor_id}/esocial/config\")"

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("app/main.py", "w", encoding="utf-8") as f:
    f.write(c2)
