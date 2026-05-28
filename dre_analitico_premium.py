import psycopg2
import json
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def get_premium_report(produtor_id=1):
    try:
        conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
        cur = conn.cursor()

        # 1. Coleta de Dados
        cur.execute("SELECT SUM(vr_bruto_comerc) FROM esocial_s1260 WHERE produtor_id=%s", (produtor_id,))
        receita = cur.fetchone()[0] or Decimal('0')
        
        cur.execute("SELECT SUM(vr_salario) FROM esocial_s1200 WHERE produtor_id=%s", (produtor_id,))
        folha = cur.fetchone()[0] or Decimal('0')

        cur.execute("""
            SELECT sc.nome, SUM(l.valor) FROM lancamentos l
            JOIN subcontas sc ON l.subconta_id = sc.id
            WHERE l.produtor_id=%s GROUP BY sc.nome
        """, (produtor_id,))
        despesas = cur.fetchall()
        total_despesas = sum(d[1] for d in despesas)

        # 2. Cálculos de Inteligência
        ebitda = receita - folha - total_despesas
        margem_ebitda = (ebitda / receita * 100) if receita > 0 else 0
        
        # Análise Vertical (AV)
        analise_vertical = {nome: float((valor / receita * 100)) for nome, valor in despesas}
        analise_vertical["Folha_Pagamento"] = float((folha / receita * 100))

        # 3. Estrutura do Relatório Premium
        report = {
            "performance_geral": {
                "faturamento_total": receita,
                "ebitda_valor": ebitda,
                "margem_lucratividade_pct": round(float(margem_ebitda), 2)
            },
            "analise_de_custos_av": {
                "detalhamento_pct": analise_vertical,
                "insight": "Sua maior despesa e " + max(analise_vertical, key=analise_vertical.get)
            },
            "eficiencia_operacional": {
                "custo_por_real_faturado": round(float((folha + total_despesas) / receita), 2) if receita > 0 else 0,
                "status": "SAUDAVEL" if margem_ebitda > 20 else "ATENCAO"
            }
        }

        print("\n=== RELATORIO ANALITICO PREMIUM (CAMPO DIGITAL) ===")
        print(json.dumps(report, indent=4, cls=DecimalEncoder))

        conn.close()
    except Exception as e:
        print(f"Erro: {e}")

if __name__ == "__main__":
    get_premium_report()
