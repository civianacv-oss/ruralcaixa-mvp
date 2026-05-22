with open("app/contador/page.tsx", encoding="utf-8") as f:
    content = f.read()

old = 'type Terceiro = {\n  id: number; nome_contraparte: string; id_contraparte: string;\n  tipo_contraparte: string; perc_contraparte: number;\n};'
new = 'type Terceiro = {\n  id: number; nome_contraparte: string; id_contraparte: string;\n  tipo_contraparte: string; perc_contraparte: number;\n  nome?: string; documento?: string; tipo?: string; percentual?: number;\n};'

result = content.replace(old, new)
print("Changed:", content != result)

with open("app/contador/page.tsx", "w", encoding="utf-8") as f:
    f.write(result)
