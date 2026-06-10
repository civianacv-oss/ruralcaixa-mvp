import psycopg2
import json
from decimal import Decimal
from datetime import datetime

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def run_everything():
    try:
        conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
        cur = conn.cursor()

        print("1. Resetando e Criando Tabelas...")
        # Deleta para garantir que a estrutura nova seja aplicada
        cur.execute("DROP TABLE IF EXISTS lancamentos CASCADE;")
        cur.execute("DROP TABLE IF EXISTS subcontas CASCADE;")

        cur.execute("""
            CREATE TABLE subcontas (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nome VARCHAR(255) NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                atividade_tipo VARCHAR(50) NOT NULL
            );
        """)

        cur.execute("""
            CREATE TABLE lancamentos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                produtor_id INTEGER NOT NULL,
                subconta_id UUID REFERENCES subcontas(id),
                valor DECIMAL(15,2) NOT NULL,
                data DATE DEFAULT CURRENT_DATE
            );
        """)

        print("2. Inserindo Dados de Teste (LCDPR)...")
        cur.execute("INSERT INTO subcontas (nome, tipo, atividade_tipo) VALUES ('Sementes', 'DESPESA', 'RURAL') RETURNING id")
        id_semente = cur.fetchone()[0]
        cur.execute("INSERT INTO subcontas (nome, tipo, atividade_tipo) VALUES ('Fertilizantes', 'DESPESA', 'RURAL') RETURNING id")
        id_fertilizante = cur.fetchone()[0]
        cur.execute("INSERT INTO subcontas (nome, tipo, atividade_tipo) VALUES ('Diesel', 'DESPESA', 'RURAL') RETURNING id")
        id_diesel = cur.fetchone()[0]

        cur.execute("INSERT INTO lancamentos (produtor_id, subconta_id, valor) VALUES (1, %s, 5000.00)", (id_semente,))
        cur.execute("INSERT INTO lancamentos (produtor_id, subconta_id, valor) VALUES (1, %s, 8500.00)", (id_fertilizante,))
        cur.execute("INSERT INTO lancamentos (produtor_id, subconta_id, valor) VALUES (1, %s, 1200.00)", (id_diesel,))

        conn.commit()
        print("3. Gerando Relatorio DRE Hibrido...")

        # Busca Receitas e Folha (eSocial)
        cur.execute("SELECT SUM(vr_bruto_comerc) FROM esocial_s1260 WHERE produtor_id=1")
        receita_bruta = cur.fetchone()[0] or Decimal('0')
        cur.execute("SELECT SUM(vr_salario) FROM esocial_s1200 WHERE produtor_id=1")
        folha_pagamento = cur.fetchone()[0] or Decimal('0')

        # Busca Despesas (LCDPR)
        cur.execute("""
            SELECT sc.nome, SUM(l.valor) 
            FROM lancamentos l
            JOIN subcontas sc ON l.subconta_id = sc.id
            WHERE l.produtor_id=1 AND sc.tipo='DESPESA'
            GROUP BY sc.nome
        """)
        despesas_lcdpr = cur.fetchall()
        total_despesas = sum(d[1] for d in despesas_lcdpr)

        # Monta o JSON
        dre = {
            "status": "Sucesso",
            "faturamento_esocial": receita_bruta,
            "custos_pessoal": folha_pagamento,
            "custos_operacionais_lcdpr": {nome: valor for nome, valor in despesas_lcdpr},
            "ebitda_rural": float(receita_bruta - folha_pagamento - total_despesas)
        }

        print("\n=== RESULTADO FINAL INTEGRADO ===")
        print(json.dumps(dre, indent=4, cls=DecimalEncoder))

        conn.close()
    except Exception as e:
        print(f"Erro critico: {e}")

if __name__ == "__main__":
    run_everything()
