with open("app/db.py", encoding="utf-8") as f:
    c = f.read()

# Fix buscar_saldo_mes
old1 = (
    "                COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) -\n"
    "                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0)\n"
    "            FROM lancamentos\n"
    "            WHERE produtor_id = :pid\n"
    "            AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)"
)
new1 = (
    "                COALESCE(SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END), 0) -\n"
    "                COALESCE(SUM(CASE WHEN s.tipo = 'DESPESA' THEN l.valor ELSE 0 END), 0)\n"
    "            FROM lancamentos l\n"
    "            LEFT JOIN subcontas s ON s.id = l.subconta_id\n"
    "            WHERE l.produtor_id = :pid\n"
    "            AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)"
)
c2 = c.replace(old1, new1, 1)
print("buscar_saldo_mes:", c != c2)
c = c2

# Fix buscar_resumo_mes
old2 = (
    "                COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) as receita,\n"
    "                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0) as despesa,\n"
    "                COUNT(*) as total_lancamentos,\n"
    "                COUNT(CASE WHEN confirmado = false THEN 1 END) as pendentes\n"
    "            FROM lancamentos\n"
    "            WHERE produtor_id = :pid\n"
    "            AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)"
)
new2 = (
    "                COALESCE(SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END), 0) as receita,\n"
    "                COALESCE(SUM(CASE WHEN s.tipo = 'DESPESA' THEN l.valor ELSE 0 END), 0) as despesa,\n"
    "                COUNT(*) as total_lancamentos,\n"
    "                0 as pendentes\n"
    "            FROM lancamentos l\n"
    "            LEFT JOIN subcontas s ON s.id = l.subconta_id\n"
    "            WHERE l.produtor_id = :pid\n"
    "            AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)"
)
c2 = c.replace(old2, new2, 1)
print("buscar_resumo_mes:", c != c2)
c = c2

# Fix atualizar_classificacao - nao faz mais sentido no novo schema, transforma em noop
old3 = (
    "def atualizar_classificacao(lancamento_id: int, conta: str, tipo: str):\n"
    "    with engine.connect() as conn:\n"
    "        conn.execute(text(\"\"\"\n"
    "            UPDATE lancamentos\n"
    "            SET conta_codigo = :conta, tipo = :tipo\n"
    "            WHERE id = :id\n"
    "        \"\"\"), {\"conta\": conta, \"tipo\": tipo, \"id\": lancamento_id})\n"
    "        conn.commit()"
)
new3 = (
    "def atualizar_classificacao(lancamento_id: int, conta: str, tipo: str):\n"
    "    # Schema novo usa subcontas - classificacao e feita via subconta_id\n"
    "    pass"
)
c2 = c.replace(old3, new3, 1)
print("atualizar_classificacao:", c != c2)
c = c2

# Fix fechar_mes
old4 = (
    "            UPDATE lancamentos\n"
    "            SET confirmado = true\n"
    "            WHERE produtor_id = :pid\n"
    "            AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)"
)
new4 = (
    "            -- fechar_mes: no schema novo nao ha campo confirmado\n"
    "            SELECT 1"
)
c2 = c.replace(old4, new4, 1)
print("fechar_mes:", c != c2)
c = c2

with open("app/db.py", "w", encoding="utf-8") as f:
    f.write(c)
print("OK - db.py corrigido!")
