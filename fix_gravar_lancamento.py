with open("app/db.py", encoding="utf-8") as f:
    lines = f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if "def gravar_lancamento(" in line:
        start = i
    if start and i > start and ("def get_ultimo" in line or "def vincular" in line or "def buscar_saldo" in line):
        end = i
        break

print(f"gravar_lancamento: linhas {start+1} a {end}")

nova = (
    "def gravar_lancamento(dados: dict):\n"
    "    with engine.connect() as conn:\n"
    "        prod = conn.execute(text('SELECT id FROM produtores WHERE telefone = :tel'), {'tel': dados.get('numero', '')}).fetchone()\n"
    "        produtor_id = prod[0] if prod else 1\n"
    "        # Busca subconta pelo nome/tipo\n"
    "        tipo_raw = dados.get('tipo', 'despesa').upper()\n"
    "        nome_sub = dados.get('produto') or dados.get('subconta') or dados.get('descricao', 'Outros')\n"
    "        sub = conn.execute(text('SELECT id FROM subcontas WHERE LOWER(nome) LIKE LOWER(:nome) LIMIT 1'), {'nome': f'%{nome_sub[:20]}%'}).fetchone()\n"
    "        if not sub:\n"
    "            import uuid as _uuid\n"
    "            atividade = 'RURAL' if dados.get('atividade', 'rural').upper() == 'RURAL' else 'INVESTIMENTO'\n"
    "            sub_id = str(_uuid.uuid4())\n"
    "            conn.execute(text('INSERT INTO subcontas (id, nome, tipo, atividade_tipo) VALUES (:id, :nome, :tipo, :atv)'),\n"
    "                {'id': sub_id, 'nome': nome_sub[:100], 'tipo': tipo_raw, 'atv': atividade})\n"
    "        else:\n"
    "            sub_id = sub[0]\n"
    "        import uuid as _uuid2\n"
    "        lanc_id = str(_uuid2.uuid4())\n"
    "        conn.execute(text('INSERT INTO lancamentos (id, produtor_id, subconta_id, valor, data, documento_url) VALUES (:id, :pid, :sub, :valor, :data, NULL)'),\n"
    "            {'id': lanc_id, 'pid': produtor_id, 'sub': sub_id, 'valor': abs(float(dados.get('valor', 0))), 'data': dados.get('data')})\n"
    "        conn.commit()\n"
    "        import json as _json\n"
    "        try:\n"
    "            conn.execute(text('INSERT INTO audit_log (tabela, registro_id, acao, usuario, payload) VALUES (:tab, :id, :acao, :usr, cast(:payload as jsonb))'),\n"
    "                {'tab': 'lancamentos', 'id': lanc_id, 'acao': 'INSERT', 'usr': dados.get('numero', 'whatsapp'), 'payload': _json.dumps(dados)})\n"
    "            conn.commit()\n"
    "        except Exception:\n"
    "            pass\n"
    "        return lanc_id\n"
    "\n"
)

new_lines = lines[:start] + [nova] + lines[end:]
with open("app/db.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("OK - gravar_lancamento atualizado para schema novo")
