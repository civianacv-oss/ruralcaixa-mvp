import psycopg2
import json
from decimal import Decimal
from datetime import datetime

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def get_dre_data(produtor_id, view_type='managerial'):
    try:
        conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
        cur = conn.cursor()

        # 1. Buscar Receitas (S-1260)
        cur.execute("SELECT SUM(vr_bruto_comerc) FROM esocial_s1260 WHERE produtor_id=%s", (produtor_id,))
        receita_bruta = cur.fetchone()[0] or Decimal('0')

        # 2. Calcular Impostos sobre Receita (Funrural/SENAR)
        # No Fiscal, isso abate o lucro. No Gerencial, é custo de venda.
        inss_comerc = receita_bruta * Decimal('0.013')
        senar_comerc = receita_bruta * Decimal('0.002')
        total_impostos_receita = inss_comerc + senar_comerc

        # 3. Buscar Custos de Pessoal (S-1200)
        cur.execute("SELECT SUM(vr_salario) FROM esocial_s1200 WHERE produtor_id=%s", (produtor_id,))
        folha_pagamento = cur.fetchone()[0] or Decimal('0')

        # Estrutura do DRE Híbrido
        dre = {
            "metadata": {
                "produtor_id": produtor_id,
                "view_type": view_type,
                "generated_at": datetime.now().isoformat()
            },
            "data": {
                "receita_bruta": receita_bruta,
                "deducoes_receita": {
                    "inss_funrural": inss_comerc,
                    "senar": senar_comerc,
                    "total": total_impostos_receita
                },
                "receita_liquida": receita_bruta - total_impostos_receita,
                "custos_operacionais": {
                    "folha_pagamento": folha_pagamento,
                    "outros_custos": 0.00 # Aqui entrariam os dados do LCDPR (Sementes, etc)
                },
                "resultado_periodo": (receita_bruta - total_impostos_receita) - folha_pagamento
            }
        }

        conn.close()
        return dre

    except Exception as e:
        return {"error": str(e)}

# Teste de Saída para o Frontend
produtor_id = 1
relatorio = get_dre_data(produtor_id)

print("\n--- JSON PARA O FRONTEND (DRE HIBRIDO) ---")
print(json.dumps(relatorio, indent=4, cls=DecimalEncoder))
