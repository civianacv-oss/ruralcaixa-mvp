content = open("app/main.py", encoding="utf-8").read()
marker = '@app.get("/imoveis/{imovel_id}/terceiros/validacao")'
parts = content.split(marker)
print(f"Ocorrencias: {len(parts)-1}")
# Mantém tudo antes da primeira ocorrência + só uma cópia do endpoint
primeiro_idx = content.find(marker)
antes = content[:primeiro_idx]
# Pega o bloco completo da primeira ocorrência até a próxima função
resto = content[primeiro_idx:]
proxima = resto.find("\n@app.", 1)
if proxima == -1:
    bloco = resto
else:
    bloco = resto[:proxima]
# Reconstrui com apenas uma ocorrência
novo = antes + bloco
open("app/main.py", "w", encoding="utf-8").write(novo)
content2 = open("app/main.py").read()
print(f"Apos limpeza: {content2.count(marker)} ocorrencia(s)")
