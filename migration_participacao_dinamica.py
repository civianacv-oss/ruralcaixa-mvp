import psycopg2
conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
cur = conn.cursor()

# 1. Adiciona coluna capital_aportado se nao existe
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='participacoes_imovel' AND column_name='capital_aportado'")
if not cur.fetchone():
    cur.execute("ALTER TABLE participacoes_imovel ADD COLUMN capital_aportado NUMERIC(14,2) DEFAULT 0")
    print("OK: coluna capital_aportado adicionada")

# 2. Adiciona tabela de aportes para auditoria
cur.execute("SELECT 1 FROM information_schema.tables WHERE table_name='aportes_capital'")
if not cur.fetchone():
    cur.execute("""
        CREATE TABLE aportes_capital (
            id          SERIAL PRIMARY KEY,
            imovel_id   INTEGER NOT NULL REFERENCES imoveis_rurais(id),
            produtor_id INTEGER NOT NULL REFERENCES produtores(id),
            valor       NUMERIC(14,2) NOT NULL,
            data_aporte DATE NOT NULL DEFAULT CURRENT_DATE,
            descricao   VARCHAR(200),
            lancamento_id UUID REFERENCES lancamentos(id),
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)
    print("OK: tabela aportes_capital criada")

# 3. Seed: popula capital_aportado inicial baseado nos percentuais atuais
# Assume capital total ficticio de R$ 100.000 para a Fazenda Boa Esperanca
capital_base = 100000.00
cur.execute("SELECT id, produtor_id, percentual FROM participacoes_imovel WHERE imovel_id=1")
participacoes = cur.fetchall()
for pid, prod_id, perc in participacoes:
    capital = round(float(perc) * capital_base / 100, 2)
    cur.execute("UPDATE participacoes_imovel SET capital_aportado=%s WHERE id=%s", (capital, pid))
    print(f"  OK: produtor_id={prod_id} capital_aportado=R$ {capital}")

# 4. Registra aportes iniciais na tabela de auditoria
cur.execute("SELECT produtor_id, percentual FROM participacoes_imovel WHERE imovel_id=1")
for prod_id, perc in cur.fetchall():
    capital = round(float(perc) * capital_base / 100, 2)
    cur.execute("SELECT 1 FROM aportes_capital WHERE imovel_id=1 AND produtor_id=%s", (prod_id,))
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO aportes_capital (imovel_id, produtor_id, valor, data_aporte, descricao)
            VALUES (1, %s, %s, '2024-01-01', 'Aporte inicial')
        """, (prod_id, capital))

conn.commit()
print("\nMigration participacao dinamica concluida!")
conn.close()
