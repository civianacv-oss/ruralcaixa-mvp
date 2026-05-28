with open("app/main.py", encoding="utf-8") as f:
    c = f.read()

old = '"SELECT COALESCE(SUM(percentual),0) FROM participacoes_imovel WHERE imovel_id = :iid AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)"'
new = '"SELECT COALESCE(SUM(percentual),0) FROM participacoes_imovel WHERE imovel_id = :iid AND vigencia_fim IS NULL"'
c2 = c.replace(old, new, 1)

old2 = '"SELECT COUNT(*) FROM participacoes_imovel WHERE imovel_id = :iid AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)"'
new2 = '"SELECT COUNT(*) FROM participacoes_imovel WHERE imovel_id = :iid AND vigencia_fim IS NULL"'
c2 = c2.replace(old2, new2, 1)

print("Changed:", c != c2)
with open("app/main.py", "w", encoding="utf-8") as f:
    f.write(c2)
