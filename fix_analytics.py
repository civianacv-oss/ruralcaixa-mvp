with open("app/main.py", encoding="utf-8") as f:
    c = f.read()

old = """def get_analytics(produtor_id: int, mes: Optional[str] = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        filtro_mes = "AND to_char(data_lancamento, 'YYYY-MM') = :mes" if mes else "AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)"
        params = {"pid": produtor_id}
        if mes:
            params["mes"] = mes
        # Receitas por conta/produto
        receitas = conn.execute(text(f\"\"\"
            SELECT conta_codigo,
                   COALESCE(produto, subconta,
                     CASE conta_codigo
                       WHEN '1.1.1' THEN 'Venda Agricola'
                       WHEN '1.1.2' THEN 'Venda Pecuaria'
                       WHEN '1.2' THEN 'Servicos'
                       ELSE conta_codigo
                     END
                   ) as label,
                   SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid AND tipo = 'receita'
            {filtro_mes}
            GROUP BY conta_codigo, produto, subconta
            ORDER BY total DESC
        \"\"\"), params).fetchall()
        # Despesas por conta
        despesas = conn.execute(text(f\"\"\"
            SELECT conta_codigo,
                   COALESCE(subconta,
                     CASE conta_codigo
                       WHEN '3.1.1' THEN 'Custeio Agricola'
                       WHEN '3.1.2' THEN 'Combustivel'
                       WHEN '3.1.3' THEN 'Pecuaria'
                       WHEN '3.1.4' THEN 'Mao de obra'
                       WHEN '3.1.5' THEN 'Manutencao'
                       WHEN '3.1.6' THEN 'Energia'
                       WHEN '3.1.7' THEN 'Arrendamento'
                       ELSE conta_codigo
                     END
                   ) as label,
                   SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid AND tipo = 'despesa'
            {filtro_mes}
            GROUP BY conta_codigo, subconta
            ORDER BY total DESC
        \"\"\"), params).fetchall()
        # Investimentos por conta
        investimentos = conn.execute(text(f\"\"\"
            SELECT conta_codigo, COALESCE(subconta, conta_codigo) as label,
                   SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid AND tipo = 'investimento'
            {filtro_mes}
            GROUP BY conta_codigo, subconta
            ORDER BY total DESC
        \"\"\"), params).fetchall()
        # Evolucao mensal ultimos 6 meses
        evolucao = conn.execute(text(\"\"\"
            SELECT to_char(data_lancamento, 'YYYY-MM') as mes,
                   tipo, SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid
            AND data_lancamento >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY mes, tipo
            ORDER BY mes
        \"\"\"), {"pid": produtor_id}).fetchall()
        return {
            "receitas_por_produto": [{"conta": r[0], "label": r[1], "total": float(r[2])} for r in receitas],
            "despesas_por_categoria": [{"conta": d[0], "label": d[1], "total": float(d[2])} for d in despesas],
            "investimentos": [{"conta": i[0], "label": i[1], "total": float(i[2])} for i in investimentos],
            "evolucao_mensal": [{"mes": e[0], "tipo": e[1], "total": float(e[2])} for e in evolucao],
        }"""

new = """def get_analytics(produtor_id: int, mes: Optional[str] = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        filtro_mes = "AND to_char(l.data, 'YYYY-MM') = :mes" if mes else "AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)"
        params = {"pid": produtor_id}
        if mes:
            params["mes"] = mes
        receitas = conn.execute(text(f\"\"\"
            SELECT s.nome as label, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid AND s.tipo = 'RECEITA'
            {filtro_mes}
            GROUP BY s.nome ORDER BY total DESC
        \"\"\"), params).fetchall()
        despesas = conn.execute(text(f\"\"\"
            SELECT s.nome as label, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid AND s.tipo = 'DESPESA' AND s.atividade_tipo = 'RURAL'
            {filtro_mes}
            GROUP BY s.nome ORDER BY total DESC
        \"\"\"), params).fetchall()
        investimentos = conn.execute(text(f\"\"\"
            SELECT s.nome as label, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid AND s.atividade_tipo = 'INVESTIMENTO'
            {filtro_mes}
            GROUP BY s.nome ORDER BY total DESC
        \"\"\"), params).fetchall()
        evolucao = conn.execute(text(\"\"\"
            SELECT to_char(l.data, 'YYYY-MM') as mes,
                   LOWER(s.tipo) as tipo, SUM(l.valor) as total
            FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid
            AND l.data >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY mes, s.tipo ORDER BY mes
        \"\"\"), {"pid": produtor_id}).fetchall()
        return {
            "receitas_por_produto": [{"conta": "", "label": r[0], "total": float(r[1])} for r in receitas],
            "despesas_por_categoria": [{"conta": "", "label": d[0], "total": float(d[1])} for d in despesas],
            "investimentos": [{"conta": "", "label": i[0], "total": float(i[1])} for i in investimentos],
            "evolucao_mensal": [{"mes": e[0], "tipo": e[1], "total": float(e[2])} for e in evolucao],
        }"""

result = c.replace(old, new, 1)
print("Changed:", c != result)
with open("app/main.py", "w", encoding="utf-8") as f:
    f.write(result)
