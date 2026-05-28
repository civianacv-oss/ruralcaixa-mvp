import psycopg2
import json
from decimal import Decimal
from datetime import datetime

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def get_dre_full(produtor_id, ano=2026):
    try:
        conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
        cur = conn.cursor()

        # --- 1. DADOS DO ESOCIAL (Receitas e Encargos) ---
        cur.execute("SELECT SUM(vr_bruto_comerc) FROM esocial_s1260 WHERE produtor_id=%s", (produtor_id,))
        receita_bruta = cur.fetchone()[0] or Decimal('0')
        
        inss_funrural = receita_bruta * Decimal('0.013')
        senar = receita_bruta * Decimal('0.002')

        cur.execute("SELECT SUM(vr_salario) FROM esocial_s1200 WHERE produtor_id=%s", (produtor_id,))
        folha_pagamento = cur.fetchone()[0] or Decimal('0')

        # --- 2. DADOS DO LCDPR (Despesas de Insumos/Operacionais) ---
        # Simulando a busca na tabela de lancamentos que estruturamos na documentacao
        # Aqui filtramos por subcontas de despesa rural
        cur.execute("""
            SELECT sc.nome, SUM(l.valor) 
            FROM lancamentos l
            JOIN subcontas sc ON l.subconta_id = sc.id
            WHERE l.produtor_id=%s AND sc.tipo='DESPESA' AND sc.atividade_tipo='RURAL'
            GROUP BY sc.nome
        """, (produtor_id,))
        despesas_lcdpr = cur.fetchall()
        
        total_despesas_operacionais = sum(d[1] for d in despesas_lcdpr)

        # --- 3. CONSOLIDAÇÃO DO DRE HÍBRIDO ---
        dre_full = {
            "periodo": f"Ano Civil {ano}",
            "resumo_financeiro": {
                "faturamento_bruto": receita_bruta,
                "impostos_sobre_venda": inss_funrural + senar,
                "receita_liquida": receita_bruta - (inss_funrural + senar)
            },
            "custos_e_despesas": {
                "pessoal_esocial": folha_pagamento,
                "operacional_lcdpr": {
                    "detalhamento": {nome: valor for nome, valor in despesas_lcdpr},
                    "total": total_despesas_operacionais
                }
            },
            "indicadores_performance": {
                "ebitda_rural": (receita_bruta - (inss_funrural + senar)) - (folha_pagamento + total_despesas_operacionais),
                "margem_contribuicao_pct": float(((receita_bruta - total_despesas_operacionais) / receita_bruta * 100)) if receita_bruta > 0 else 0
            }
        }

        conn.close()
        return dre_full

    except Exception as e:
        return {"error": str(e)}

# Execução do Teste
relatorio_final = get_dre_full(1)
print("\n=== DRE FULL INTEGRADO (ESOCIAL + LCDPR) ===")
print(json.dumps(relatorio_final, indent=4, cls=DecimalEncoder))
