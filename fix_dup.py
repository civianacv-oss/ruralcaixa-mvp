import re
c = open('app/main.py', encoding='utf-8').read()
m = '@app.get(""/imoveis/{imovel_id}/terceiros/validacao"")'
parts = c.split(m)
print('Antes:', len(parts)-1, 'ocorrencias')
novo = parts[0] + m + parts[-1]
open('app/main.py', 'w', encoding='utf-8').write(novo)
print('Depois:', novo.count(m))