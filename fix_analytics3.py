with open("app/main.py", encoding="utf-8") as f:
    lines = f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if "def get_analytics(" in line:
        start = i
    if start and i > start and ("@app." in line or "def get_lancamentos" in line):
        end = i
        break

print(f"get_analytics: linhas {start+1} a {end}")

nova = (
    'def get_analytics(produtor_id: int, mes: Optional[str] = None):\n'
    '    from app.db import engine\n'
    '    from sqlalchemy import text\n'
    '    with engine.connect() as conn:\n'
    '        fm = "AND to_char(l.data, \'YYYY-MM\') = :mes" if mes else "AND date_trunc(\'month\', l.data) = date_trunc(\'month\', CURRENT_DATE)"\n'
    '        params = {"pid": produtor_id}\n'
    '        if mes: params["mes"] = mes\n'
    '        rec = conn.execute(text(\n'
    '            "SELECT s.nome as label, SUM(l.valor) as total"\n'
    '            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"\n'
    '            " WHERE l.produtor_id = :pid AND s.tipo = \'RECEITA\' " + fm +\n'
    '            " GROUP BY s.nome ORDER BY total DESC"\n'
    '        ), params).fetchall()\n'
    '        desp = conn.execute(text(\n'
    '            "SELECT s.nome as label, SUM(l.valor) as total"\n'
    '            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"\n'
    '            " WHERE l.produtor_id = :pid AND s.tipo = \'DESPESA\' AND s.atividade_tipo = \'RURAL\' " + fm +\n'
    '            " GROUP BY s.nome ORDER BY total DESC"\n'
    '        ), params).fetchall()\n'
    '        inv = conn.execute(text(\n'
    '            "SELECT s.nome as label, SUM(l.valor) as total"\n'
    '            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"\n'
    '            " WHERE l.produtor_id = :pid AND s.atividade_tipo = \'INVESTIMENTO\' " + fm +\n'
    '            " GROUP BY s.nome ORDER BY total DESC"\n'
    '        ), params).fetchall()\n'
    '        evo = conn.execute(text(\n'
    '            "SELECT to_char(l.data, \'YYYY-MM\') as mes, LOWER(s.tipo) as tipo, SUM(l.valor) as total"\n'
    '            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"\n'
    '            " WHERE l.produtor_id = :pid AND l.data >= CURRENT_DATE - INTERVAL \'6 months\'"\n'
    '            " GROUP BY mes, s.tipo ORDER BY mes"\n'
    '        ), {"pid": produtor_id}).fetchall()\n'
    '        return {\n'
    '            "receitas_por_produto": [{"conta": "", "label": r[0], "total": float(r[1])} for r in rec],\n'
    '            "despesas_por_categoria": [{"conta": "", "label": d[0], "total": float(d[1])} for d in desp],\n'
    '            "investimentos": [{"conta": "", "label": i[0], "total": float(i[1])} for i in inv],\n'
    '            "evolucao_mensal": [{"mes": e[0], "tipo": e[1], "total": float(e[2])} for e in evo],\n'
    '        }\n'
    '\n'
)

new_lines = lines[:start] + [nova] + lines[end:]
with open("app/main.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("OK - funcao substituida")
