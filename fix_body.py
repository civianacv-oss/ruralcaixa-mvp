with open("app/main.py", encoding="utf-8") as f:
    c = f.read()

old = "# -- eSocial --------------------------------------------------------------------"
new = "# -- eSocial --------------------------------------------------------------------\nfrom fastapi import Body"

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("app/main.py", "w", encoding="utf-8") as f:
    f.write(c2)
