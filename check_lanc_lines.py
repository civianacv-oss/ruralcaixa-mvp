# -*- coding: utf-8 -*-
with open("frontend/app/contador/page.tsx", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "new Date(l.data_lancamento).toLocaleDateString" in line and "conta_codigo" in lines[i+1] if i+1 < len(lines) else False:
        print(f"Encontrou data na linha {i+1}")
        print(repr(line))
        print(repr(lines[i+1]))
        break
    if "data_lancamento" in line and "toLocaleDateString" in line:
        print(f"data linha {i+1}: {repr(line)}")
    if "conta_codigo" in line and "{l.conta_codigo}" in line:
        print(f"conta linha {i+1}: {repr(line)}")
