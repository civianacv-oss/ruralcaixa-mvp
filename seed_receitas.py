# -*- coding: utf-8 -*-
import psycopg2, uuid
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()

subcontas = [
    ("Venda de Soja", "RECEITA", "RURAL"),
    ("Venda de Milho", "RECEITA", "RURAL"),
    ("Venda de Bovinos", "RECEITA", "RURAL"),
    ("Venda de Bezerros", "RECEITA", "RURAL"),
    ("Servicos Prestados", "RECEITA", "RURAL"),
    ("Arrendamento Recebido", "RECEITA", "RURAL"),
    ("Mao de Obra", "DESPESA", "RURAL"),
    ("Manutencao Maquinas", "DESPESA", "RURAL"),
    ("Energia Eletrica", "DESPESA", "RURAL"),
    ("Arrendamento Pago", "DESPESA", "RURAL"),
    ("Medicamentos", "DESPESA", "RURAL"),
    ("Obras e Benfeitorias", "DESPESA", "INVESTIMENTO"),
    ("Maquinas e Equipamentos", "DESPESA", "INVESTIMENTO"),
    ("Animais", "DESPESA", "INVESTIMENTO"),
]
for nome, tipo, atv in subcontas:
    cur.execute("SELECT id FROM subcontas WHERE nome=%s", (nome,))
    if not cur.fetchone():
        cur.execute("INSERT INTO subcontas (id, nome, tipo, atividade_tipo) VALUES (%s, %s, %s, %s)",
                    (str(uuid.uuid4()), nome, tipo, atv))
        print(f"  OK {tipo} {nome}")
conn.commit()

cur.execute("SELECT id, nome FROM subcontas WHERE tipo='RECEITA'")
subs = {r[1]: r[0] for r in cur.fetchall()}
print("Subcontas receita:", list(subs.keys()))

lancamentos = [
    (subs.get("Venda de Soja"),    13000.00, "2026-05-10"),
    (subs.get("Venda de Bovinos"), 28500.00, "2026-05-15"),
    (subs.get("Venda de Soja"),     6500.00, "2026-04-20"),
    (subs.get("Venda de Milho"),    4200.00, "2026-04-25"),
]
for sub_id, valor, data in lancamentos:
    if sub_id:
        cur.execute("INSERT INTO lancamentos (id, produtor_id, subconta_id, valor, data) VALUES (%s, 1, %s, %s, %s)",
                    (str(uuid.uuid4()), sub_id, valor, data))
        print(f"  OK R$ {valor} em {data}")
conn.commit()
conn.close()
print("Seed concluido!")
