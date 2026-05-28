with open("app/db.py", encoding="utf-8") as f:
    c = f.read()

c2 = c.replace("l.data_lancamento", "l.data")
print("Changed:", c != c2)
with open("app/db.py", "w", encoding="utf-8") as f:
    f.write(c2)
