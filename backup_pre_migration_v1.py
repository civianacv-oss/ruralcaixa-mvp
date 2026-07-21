"""
Backup local de subcontas e lancamentos antes da migration.

COMO USAR:
1. Salve este arquivo em C:\\ruralcaixa\\ruralcaixa-mvp\\ (mesma pasta do script anterior)
2. Abra o PowerShell NESSA PASTA (nao no console web do Railway)
3. Rode: python backup_pre_migration_v1.py
4. Vao aparecer 2 arquivos .csv na mesma pasta:
   - backup_subcontas_pre_migration.csv
   - backup_lancamentos_pre_migration.csv

Requer psycopg2 (ja deve estar instalado, testado anteriormente).
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

TABLES = ["subcontas", "lancamentos"]


def backup_table(conn, table_name):
    output_file = f"backup_{table_name}_pre_migration.csv"
    print(f"Exportando '{table_name}'...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"SELECT * FROM {table_name};")
        rows = cur.fetchall()

    if not rows:
        print(f"  AVISO: tabela '{table_name}' retornou 0 linhas.")
        return

    fieldnames = list(rows[0].keys())
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"  OK: {len(rows)} linhas salvas em {output_file}")


def main():
    print("Conectando ao Postgres (Railway)...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"ERRO ao conectar: {e}")
        sys.exit(1)

    print("Conectado.\n")
    for table in TABLES:
        try:
            backup_table(conn, table)
        except Exception as e:
            print(f"  ERRO ao exportar '{table}': {e}")
            conn.rollback()

    conn.close()
    print("\nConcluido! Backup pronto antes da migration.")


if __name__ == "__main__":
    main()
