with open("frontend/app/contador/page.tsx", encoding="utf-8") as f:
    c = f.read()

old = 'href={`/nfe?produtor_id=${produtor.id}`}'
new = 'href={`/esocial?produtor_id=${produtor.id}`} className="w-full flex items-center gap-3 py-3 border-b text-sm hover:bg-gray-50"><span className="text-lg">ES</span><span>eSocial Rural</span><span className="ml-auto text-gray-400">\u203a</span></a>\n                  <a href={`/nfe?produtor_id=${produtor.id}`}'

c2 = c.replace(old, new, 1)
print("Changed:", c != c2)
with open("frontend/app/contador/page.tsx", "w", encoding="utf-8") as f:
    f.write(c2)
