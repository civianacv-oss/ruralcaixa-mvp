path = r"app\beta\page.tsx"
content = open(path, encoding="utf-8", errors="replace").read()

# Adiciona import React no topo
old = '"use client";\n// frontend/app/beta/page.tsx'
new = '"use client";\nimport React from "react";\n// frontend/app/beta/page.tsx'

if old in content:
    content = content.replace(old, new)
    open(path, "w", encoding="utf-8").write(content)
    print("OK")
else:
    # Alternativa: substitui React.CSSProperties por object
    content = content.replace("React.CSSProperties", "object")
    open(path, "w", encoding="utf-8").write(content)
    print("OK alternativo")