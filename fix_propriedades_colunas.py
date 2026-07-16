content = open("app/routers/propriedades_rural.py", encoding="utf-8", errors="replace").read()

old = '"SELECT id, nome, municipio as localidade, uf, area_total, caepf, nirf, produtor_id FROM imoveis_rurais WHERE produtor_id=%s ORDER BY created_at LIMIT 1",'
new = '"SELECT id, nome, municipio as localidade, area_total, produtor_id FROM imoveis_rurais WHERE produtor_id=%s ORDER BY created_at LIMIT 1",'
content = content.replace(old, new, 1)
print("ativa:", "OK" if new in content else "ERRO")

old2 = "                SELECT id, nome, municipio as localidade, uf, area_total,\n                       caepf, nirf, produtor_id, 'propria' as tipo,\n                       'ativo' as status, created_at, 0 AS total_lancamentos\n                FROM imoveis_rurais\n                WHERE produtor_id = %s\n                ORDER BY nome"
new2 = "                SELECT id, nome, municipio as localidade, area_total,\n                       produtor_id, 'propria' as tipo,\n                       'ativo' as status, created_at, 0 AS total_lancamentos\n                FROM imoveis_rurais\n                WHERE produtor_id = %s\n                ORDER BY nome"
content = content.replace(old2, new2, 1)
print("listar:", "OK" if new2 in content else "ERRO")

open("app/routers/propriedades_rural.py", "w", encoding="utf-8").write(content)
print("Salvo")
