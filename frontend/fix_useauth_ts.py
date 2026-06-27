path = r"lib\useAuth.ts"
content = open(path, encoding="utf-8", errors="replace").read()
old = 'if (cache) setProdutor(cache as Produtor);'
new = 'if (cache) setProdutor(cache as unknown as Produtor);'
if old in content:
    content = content.replace(old, new)
    open(path, "w", encoding="utf-8").write(content)
    print("OK")
else:
    print("ERRO")