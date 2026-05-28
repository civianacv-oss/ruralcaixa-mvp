import psycopg2

def setup_database():
    try:
        conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
        cur = conn.cursor()

        # 1. Criar Tabela de Subcontas
        cur.execute("""
            CREATE TABLE IF NOT EXISTS subcontas (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nome VARCHAR(255) NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                atividade_tipo VARCHAR(50) NOT NULL
            );
        """)

        # 2. Criar Tabela de Lancamentos
        cur.execute("""
            CREATE TABLE IF NOT EXISTS lancamentos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                produtor_id INTEGER NOT NULL,
                subconta_id UUID REFERENCES subcontas(id),
                valor DECIMAL(15,2) NOT NULL,
                data DATE DEFAULT CURRENT_DATE
            );
        """)

        # 3. Inserir Dados de Exemplo (apenas se estiver vazio)
        cur.execute("SELECT COUNT(*) FROM subcontas")
        if cur.fetchone()[0] == 0:
            print("Populando tabelas com dados de exemplo...")
            
            # Inserir Subcontas e pegar IDs
            cur.execute("INSERT INTO subcontas (nome, tipo, atividade_tipo) VALUES ('Sementes', 'DESPESA', 'RURAL') RETURNING id")
            id_semente = cur.fetchone()[0]
            
            cur.execute("INSERT INTO subcontas (nome, tipo, atividade_tipo) VALUES ('Fertilizantes', 'DESPESA', 'RURAL') RETURNING id")
            id_fertilizante = cur.fetchone()[0]

            cur.execute("INSERT INTO subcontas (nome, tipo, atividade_tipo) VALUES ('Diesel', 'DESPESA', 'RURAL') RETURNING id")
            id_diesel = cur.fetchone()[0]

            # Inserir Lancamentos para o Produtor 1
            cur.execute("INSERT INTO lancamentos (produtor_id, subconta_id, valor) VALUES (1, %s, 5000.00)", (id_semente,))
            cur.execute("INSERT INTO lancamentos (produtor_id, subconta_id, valor) VALUES (1, %s, 8500.00)", (id_fertilizante,))
            cur.execute("INSERT INTO lancamentos (produtor_id, subconta_id, valor) VALUES (1, %s, 1200.00)", (id_diesel,))

        conn.commit()
        print("Banco de dados configurado com sucesso!")
        conn.close()
    except Exception as e:
        print(f"Erro ao configurar banco: {e}")

if __name__ == "__main__":
    setup_database()
