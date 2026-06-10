import psycopg2
from decimal import Decimal

try:
    conn = psycopg2.connect("postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")
    cur = conn.cursor()

    print("\n--- RELATORIO ANALITICO DE CUSTO PREVIDENCIARIO ---")

    cur.execute("SELECT SUM(vr_bruto_comerc) FROM esocial_s1260 WHERE produtor_id=1")
    valor_comerc = cur.fetchone()[0] or Decimal('0')
    inss_comerc = valor_comerc * Decimal('0.013') 
    senar_comerc = valor_comerc * Decimal('0.002')

    print(f"Faturamento Bruto (S-1260): R$ {valor_comerc:,.2f}")
    print(f"  > Contribuicao Previdenciaria (1,3%): R$ {inss_comerc:,.2f}")
    print(f"  > Contribuicao SENAR (0,2%): R$ {senar_comerc:,.2f}")

    cur.execute("SELECT SUM(vr_salario) FROM esocial_s1200 WHERE produtor_id=1")
    valor_folha = cur.fetchone()[0] or Decimal('0')
    inss_folha = valor_folha * Decimal('0.08') 

    print(f"\nFolha de Pagamento (S-1200): R$ {valor_folha:,.2f}")
    print(f"  > INSS Retido dos Trabalhadores (aprox. 8%): R$ {inss_folha:,.2f}")

    custo_total = inss_comerc + senar_comerc
    print(f"\n--- IMPACTO NO RESULTADO (DRE) ---")
    print(f"Custo Tributario Total da Atividade: R$ {custo_total:,.2f}")
    print(f"Margem Liquida apos Encargos: R$ {(valor_comerc - custo_total):,.2f}")

    conn.close()
except Exception as e:
    print(f"Erro: {e}")
