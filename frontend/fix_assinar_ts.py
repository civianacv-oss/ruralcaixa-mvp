path = r"app\assinar\[contrato_id]\page.tsx"
content = open(path, encoding="utf-8", errors="replace").read()

# Remove import React que foi inserido antes do use client
content = content.replace('"use client";\nimport React from "react";\n', '"use client";\n', 1)
content = content.replace('import React from "react";\n// v2-condominio\n"use client"\n', '"use client";\n// v2-condominio\n', 1)

# Garante use client na primeira linha
lines = content.split("\n")
if lines[0].strip() != '"use client";' and lines[0].strip() != '"use client"':
    content = re.sub(r'"use client"[;]?\n', '', content)
    content = '"use client";\n' + content

import re
# Remove React import duplicado se existir  
content = re.sub(r'import React from "react";\n', '', content)

open(path, "w", encoding="utf-8").write(content)

# Confirma
for i, l in enumerate(content.split("\n")[:6]):
    print(f"{i+1}: {l}")