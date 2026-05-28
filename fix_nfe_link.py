with open("frontend/app/contador/page.tsx", encoding="utf-8") as f:
    content = f.read()

old = 'text-gray-400">></span>'
new = 'text-gray-400">\u203a</span>'

result = content.replace(old, new, 1)
print("Changed:", content != result)

with open("frontend/app/contador/page.tsx", "w", encoding="utf-8") as f:
    f.write(result)
