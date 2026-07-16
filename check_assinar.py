content = open("frontend/components/Sidebar.tsx", encoding="utf-8", errors="replace").read()
lines = content.split("\n")
for i, l in enumerate(lines[30:120], start=31):
    print(f"{i}: {l[:90]}")