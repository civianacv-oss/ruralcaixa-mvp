with open("app/main.py", encoding="utf-8") as f:
    lines = f.readlines()

# Encontra a linha da funcao get_analytics
start = None
end = None
for i, line in enumerate(lines):
    if "def get_analytics(" in line:
        start = i
    if start and i > start and line.startswith("@app.") or (start and i > start and "def get_lancamentos" in line):
        end = i
        break

print(f"get_analytics: linhas {start+1} a {end}")

nova_funcao = """def get_analytics(produtor_id: int, mes: Optional[str] = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        filtro_mes = "AND to_char(l.data, 'YYYY-MM') = :mes" if mes else "AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)"
        params = {"pid": produtor_id}
        if mes:
            params["mes"] = mes
        receitas = conn.execute(text(f"""
            SELECT s.nome as label, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid AND s.tipo = 'RECEITA'
            {filtro_mes}
            GROUP BY s.nome ORDER BY total DESC
        """), params).fetchall()
        despesas = conn.execute(text(f"""
            SELECT s.nome as label, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid AND s.tipo = 'DESPESA' AND s.atividade_tipo = 'RURAL'
            {filtro_mes}
            GROUP BY s.nome ORDER BY total DESC
        """), params).fetchall()
        investimentos = conn.execute(text(f"""
            SELECT s.nome as label, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid AND s.atividade_tipo = 'INVESTIMENTO'
            {filtro_mes}
            GROUP BY s.nome ORDER BY total DESC
        """), params).fetchall()
        evolucao = conn.execute(text("""
            SELECT to_char(l.data, 'YYYY-MM') as mes,
                   LOWER(s.tipo) as tipo, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid
            AND l.data >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY mes, s.tipo ORDER BY mes
        """), {"pid": produtor_id}).fetchall()
        return {
            "receitas_por_produto": [{"conta": "", "label": r[0], "total": float(r[1])} for r in receitas],
            "despesas_por_categoria": [{"conta": "", "label": d[0], "total": float(d[1])} for d in despesas],
            "investimentos": [{"conta": "", "label": i[0], "total": float(i[1])} for i in investimentos],
            "evolucao_mensal": [{"mes": e[0], "tipo": e[1], "total": float(e[2])} for e in evolucao],
        }

"""

new_lines = lines[:start] + [nova_funcao] + lines[end:]
with open("app/main.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("OK - funcao substituida")
