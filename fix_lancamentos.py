with open("app/db.py", encoding="utf-8") as f:
    lines = f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if "def buscar_lancamentos(" in line:
        start = i
    if start and i > start and ("def buscar_resumo" in line or "def atualizar" in line):
        end = i
        break

print(f"buscar_lancamentos: linhas {start+1} a {end}")

nova = (
    "def buscar_lancamentos(produtor_id: int, mes: str = None, atividade: str = None):\n"
    "    with engine.connect() as conn:\n"
    "        params = {'pid': produtor_id}\n"
    "        filtro_atv = ' AND s.atividade_tipo = :atv' if atividade else ''\n"
    "        if atividade: params['atv'] = atividade.upper()\n"
    "        if mes:\n"
    "            filtro_data = \"AND to_char(l.data, 'YYYY-MM') = :mes\"\n"
    "            params['mes'] = mes\n"
    "        else:\n"
    "            filtro_data = \"AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)\"\n"
    "        sql = f\"\"\"\n"
    "            SELECT l.id, LOWER(s.tipo) as tipo, s.nome as descricao, l.valor,\n"
    "                   l.data as data_lancamento, l.documento_url, l.created_at,\n"
    "                   s.atividade_tipo as atividade, '' as conta_codigo,\n"
    "                   FALSE as confirmado\n"
    "            FROM lancamentos l\n"
    "            LEFT JOIN subcontas s ON s.id = l.subconta_id\n"
    "            WHERE l.produtor_id = :pid\n"
    "            {filtro_data}\n"
    "            {filtro_atv}\n"
    "            ORDER BY l.data DESC\n"
    "        \"\"\"\n"
    "        rows = conn.execute(text(sql), params).fetchall()\n"
    "        return [dict(r._mapping) for r in rows]\n"
    "\n"
)

new_lines = lines[:start] + [nova] + lines[end:]
with open("app/db.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("OK - buscar_lancamentos atualizado")
