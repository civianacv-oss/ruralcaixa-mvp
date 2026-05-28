with open("app/db.py", encoding="utf-8") as f:
    c = f.read()

old = """def listar_produtores():
    with engine.connect() as conn:
        rows = conn.execute(text(\"\"\"
            SELECT
                p.id, p.nome, p.cpf, p.telefone,
                i.municipio, i.uf,
                COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor ELSE 0 END), 0) as receita,
                COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor ELSE 0 END), 0) as despesa,
                COUNT(CASE WHEN l.confirmado = false THEN 1 END) as pendentes
            FROM produtores p
            LEFT JOIN imoveis_rurais i ON i.produtor_id = p.id
            LEFT JOIN lancamentos l ON l.produtor_id = p.id
                AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)
            GROUP BY p.id, p.nome, p.cpf, p.telefone, i.municipio, i.uf
            ORDER BY p.nome
        \"\"\")).fetchall()
        return [dict(r._mapping) for r in rows]"""

new = """def listar_produtores():
    with engine.connect() as conn:
        rows = conn.execute(text(\"\"\"
            SELECT
                p.id, p.nome, p.cpf, p.telefone,
                i.municipio, i.uf,
                COALESCE(SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END), 0) as receita,
                COALESCE(SUM(CASE WHEN s.tipo = 'DESPESA' THEN l.valor ELSE 0 END), 0) as despesa,
                0 as pendentes
            FROM produtores p
            LEFT JOIN imoveis_rurais i ON i.produtor_id = p.id
            LEFT JOIN lancamentos l ON l.produtor_id = p.id
                AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            GROUP BY p.id, p.nome, p.cpf, p.telefone, i.municipio, i.uf
            ORDER BY p.nome
        \"\"\")).fetchall()
        return [dict(r._mapping) for r in rows]"""

result = c.replace(old, new, 1)
print("Changed:", c != result)
with open("app/db.py", "w", encoding="utf-8") as f:
    f.write(result)
