# -*- coding: utf-8 -*-
"""
VALIDAÇÃO PÓS-MIGRAÇÃO (SOMENTE LEITURA)
Confirma que a migração do plano de contas terminou por completo.

Rodar localmente:
    python3 validar_pos_migracao_v1.py
"""
import psycopg2
import psycopg2.extras

CONN_STR = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"


def main():
    conn = psycopg2.connect(CONN_STR)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("=" * 70)
    print("1) plano_contas tem 120 linhas?")
    print("=" * 70)
    cur.execute("SELECT COUNT(*) AS total FROM plano_contas")
    print(cur.fetchone())

    print()
    print("=" * 70)
    print("2) A conta-sentinela 9.9 existe em plano_contas?")
    print("=" * 70)
    cur.execute("SELECT * FROM plano_contas WHERE codigo = '9.9'")
    print(cur.fetchone())

    print()
    print("=" * 70)
    print("3) Ainda existe algum codigo_conta do esquema ANTIGO em subcontas?")
    print("   (esperado: nenhuma linha)")
    print("=" * 70)
    codigos_antigos = [
        "1.1", "1.1.1", "1.1.2", "1.1.3", "3.1.1", "3.1.2", "3.1.3",
        "3.1.3.1", "3.1.3.1.1", "3.1.3.2", "3.1.3.3", "3.1.4", "3.1.5",
        "3.1.6", "3.1.7", "3.1.99", "1.2", "3.9", "4.1.2", "5.1", "5.2", "5.3",
        "2.1.1", "3.1.4.1", "3.1.5.1", "3.1.5.2", "3.1.6.1", "3.1.7.1",
        "3.1.8.1", "3.1.9.1", "4.1.1",
    ]
    cur.execute(
        "SELECT codigo_conta, COUNT(*) FROM subcontas WHERE codigo_conta = ANY(%s) GROUP BY codigo_conta",
        (codigos_antigos,),
    )
    restantes = cur.fetchall()
    if restantes:
        print("⚠ Ainda restam códigos antigos:")
        for r in restantes:
            print(" ", r)
    else:
        print("✓ Nenhum código antigo restante — migração completa.")

    print()
    print("=" * 70)
    print("4) Quantas subcontas estão em 9.9 (pendentes) agora?")
    print("   (esperado: 7)")
    print("=" * 70)
    cur.execute("SELECT nome, tipo FROM subcontas WHERE codigo_conta = '9.9' ORDER BY nome")
    for row in cur.fetchall():
        print(" ", row)

    print()
    print("=" * 70)
    print("5) Conferir a conta usada no cálculo de IOFC")
    print("=" * 70)
    cur.execute("SELECT id, nome, codigo_conta FROM subcontas WHERE codigo_conta = '2.2.1.2.1'")
    for row in cur.fetchall():
        print(" ", row)

    cur.close()
    conn.close()
    print()
    print("Validação concluída.")


if __name__ == "__main__":
    main()
