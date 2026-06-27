content = open(r"app\importacao\page.tsx", encoding="utf-8", errors="replace").read()
lines = content.split("\n")
for i, l in enumerate(lines):
    print(f"{i+1}: {l[:90]}")