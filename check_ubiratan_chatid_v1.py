"""
RuralCaixa — Diagnostico: telegram_chat_id do Ubiratan (produtor_id=6) hoje
Somente LEITURA.
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

def run():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()
    cur.execute("SELECT id, nome, telegram_chat_id FROM produtores WHERE id = 6")
    print(dict(cur.fetchone()))
    conn.close()

if __name__ == "__main__":
    run()
