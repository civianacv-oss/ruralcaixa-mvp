with open("frontend/app/contador/page.tsx", encoding="utf-8") as f:
    content = f.read()

old = 'href={`/relatorio?produtor_id=${produtor.id}`}'
new = 'href={`/nfe?produtor_id=${produtor.id}`} className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50"><span className="text-lg">NF</span><span>Emitir NF-e</span><span className="ml-auto text-gray-400">></span></a>\n                  <a href={`/relatorio?produtor_id=${produtor.id}`}'

result = content.replace(old, new, 1)
print("Changed:", content != result)

with open("frontend/app/contador/page.tsx", "w", encoding="utf-8") as f:
    f.write(result)
