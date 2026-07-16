"""
Adiciona um alerta ao tipo 'condominio' explicando que:
- o condominio formaliza so a co-propriedade (cada condomino com sua cota/area,
  igual ou nao);
- nem todos os condominos precisam participar da mesma atividade;
- se um condomino quiser fazer uma parceria especifica pra area que usa --
  seja com outro condomino, seja com um parceiro de fora do condominio --
  isso e' um contrato SEPARADO (parceria), o condominio nao substitui.

Idempotente (checa se o alerta ja existe antes de inserir).

Roda:
    python fix_alerta_condominio_parcerias.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = (
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

TEXTO_ALERTA = (
    "O condomínio formaliza só a copropriedade em si (cada condômino com sua "
    "cota/área, igual ou não) — nem todos os condôminos precisam participar "
    "da mesma atividade. Se um condômino quiser fazer uma parceria específica "
    "(agrícola, pecuária, etc.) pra área que ele usa dentro do condomínio — "
    "seja com outro condômino, seja com alguém de fora — isso é um contrato "
    "SEPARADO (parceria), o condomínio não substitui. Use o assistente de "
    "novo pra essa parceria, respondendo 'cede uso' em vez de 'donas juntas'."
)


def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    cur.execute("SELECT id FROM tipos_contrato_rural WHERE slug = 'condominio'")
    row = cur.fetchone()
    if not row:
        print("AVISO: tipo 'condominio' não encontrado.")
        return
    tipo_id = row["id"]

    cur.execute(
        "SELECT 1 FROM alertas_contrato WHERE tipo_contrato_id = %s AND texto = %s",
        (tipo_id, TEXTO_ALERTA),
    )
    if cur.fetchone():
        print("Alerta já existe, nada a fazer.")
        conn.close()
        return

    cur.execute(
        "INSERT INTO alertas_contrato (tipo_contrato_id, texto, nivel) VALUES (%s,%s,%s)",
        (tipo_id, TEXTO_ALERTA, "aviso"),
    )
    conn.commit()
    conn.close()
    print("Alerta adicionado ao tipo 'condominio' com sucesso.")


if __name__ == "__main__":
    main()
