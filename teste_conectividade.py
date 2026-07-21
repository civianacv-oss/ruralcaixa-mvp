import psycopg2
import time

DATABASE_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

for tentativa in range(1, 4):
    print(f"\nTentativa {tentativa}...")
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        result = cur.fetchone()
        print(f"  OK: {result}")
        cur.execute("SELECT pg_backend_pid(), now();")
        print(f"  PID/hora: {cur.fetchone()}")
        cur.close()
        conn.close()
        print("  Conexao fechada normalmente.")
    except Exception as e:
        print(f"  FALHOU: {e}")
    time.sleep(2)
