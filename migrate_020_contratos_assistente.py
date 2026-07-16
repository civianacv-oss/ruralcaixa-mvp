"""
Roda a migracao 020 (tabelas do Assistente de Contratos Rurais).

Uso:
    python migrate_020_contratos_assistente.py

Le o arquivo migrations/020_contratos_assistente.sql e executa contra o
Postgres do Railway (DATABASE_URL). Idempotente -- usa CREATE TABLE IF NOT
EXISTS, entao pode rodar mais de uma vez sem erro.
"""
import os
import psycopg2

DB_URL = (
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

SQL_PATH = os.path.join("migrations", "020_contratos_assistente.sql")


def main():
    if not os.path.exists(SQL_PATH):
        print(f"ERRO: nao encontrei {SQL_PATH}")
        print("Confirme que o arquivo 020_contratos_assistente.sql esta em migrations\\")
        return

    sql = open(SQL_PATH, encoding="utf-8").read()

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    try:
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
        print("Migracao 020 aplicada com sucesso.")

        # Confere que as 4 tabelas existem
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                'tipos_contrato_rural', 'clausulas_contrato',
                'alertas_contrato', 'recomendacoes_contrato'
              )
            ORDER BY table_name
        """)
        tabelas = [r[0] for r in cur.fetchall()]
        print("Tabelas confirmadas no banco:")
        for t in tabelas:
            print(" -", t)
        faltando = {"tipos_contrato_rural", "clausulas_contrato", "alertas_contrato", "recomendacoes_contrato"} - set(tabelas)
        if faltando:
            print("ATENCAO -- faltando:", faltando)
    except Exception as e:
        conn.rollback()
        print("ERRO ao aplicar migracao:", e)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
