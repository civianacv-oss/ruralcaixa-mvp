"""
Exporta a tabela `subcontas` do Postgres (Railway) para um arquivo CSV local.

COMO USAR:
1. Salve este arquivo em C:\ruralcaixa\ (ou qualquer pasta local)
2. Abra o PowerShell nessa pasta
3. Rode: python exportar_subcontas_v1.py
4. O arquivo `subcontas_dump.csv` vai aparecer na mesma pasta
5. Envie esse .csv aqui no chat como upload

Requer psycopg2 instalado:
    pip install psycopg2-binary
"""

import csv
import sys

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERRO: psycopg2 nao esta instalado.")
    print("Rode primeiro: pip install psycopg2-binary")
    sys.exit(1)

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

QUERY = """
    SELECT id, nome, tipo, atividade_tipo,
           COUNT(*) OVER (PARTITION BY nome) as duplicatas
    FROM subcontas
    ORDER BY atividade_tipo, tipo, nome;
"""

OUTPUT_FILE = "subcontas_dump.csv"


def main():
    print("Conectando ao Postgres (Railway)...")
    try:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    except Exception as e:
        print(f"ERRO ao conectar: {e}")
        sys.exit(1)

    print("Conectado. Rodando query...")
    with conn.cursor() as cur:
        cur.execute(QUERY)
        rows = cur.fetchall()

    conn.close()

    if not rows:
        print("Nenhuma linha retornada. Verifique se a tabela 'subcontas' existe e tem dados.")
        sys.exit(0)

    print(f"{len(rows)} linhas retornadas. Salvando em {OUTPUT_FILE}...")

    fieldnames = list(rows[0].keys())
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"Concluido! Arquivo salvo em: {OUTPUT_FILE}")
    print("Agora envie esse arquivo .csv no chat.")


if __name__ == "__main__":
    main()
