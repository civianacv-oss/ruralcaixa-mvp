"""
Ajusta a clausula "Percentual de divisao" e adiciona "Rateio de custos" nos
4 tipos de parceria (agricola, pecuaria, agroindustrial, extrativa).

Motivo: as areas/custeios de cada parte podem ser diferentes -- primeiro se
abate o custeio de cada lado (rateio), depois o SALDO resultante e' que se
divide entre as partes, e essa divisao pode ou nao levar a area em conta
(depende do que for combinado).

Roda uma vez:
    python fix_clausula_divisao_parceria.py
"""
import os
import psycopg2
import psycopg2.extras

DB_URL = (
    os.getenv("DATABASE_URL")
    or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

TIPOS_PARCERIA = ["agricola", "pecuaria", "agroindustrial", "extrativa"]

NOVA_DESCRICAO_PERCENTUAL = (
    "Ex: 60% pro dono da terra, 40% pro parceiro — sobre o SALDO depois do "
    "rateio de custos (veja a cláusula de rateio abaixo), não sobre a "
    "produção bruta. Áreas e custeio de cada parte podem ser diferentes; "
    "o percentual de divisão é um acordo à parte, pode ou não levar a área "
    "em conta."
)

CLAUSULA_RATEIO = (
    "Rateio de custos antes da divisão",
    "Cada parte pode entrar com área e custeio diferentes (um pode gastar "
    "mais em insumos, outro mais em mão de obra). Antes de dividir o "
    "resultado, primeiro se abate o custeio de cada lado — só o SALDO "
    "depois desse rateio é que entra na divisão percentual combinada.",
    True,
)


def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    atualizadas, inseridas = 0, 0

    for slug in TIPOS_PARCERIA:
        cur.execute("SELECT id FROM tipos_contrato_rural WHERE slug = %s", (slug,))
        row = cur.fetchone()
        if not row:
            print(f"AVISO: tipo '{slug}' não encontrado, pulando.")
            continue
        tipo_id = row["id"]

        # 1) Atualiza a descrição da cláusula "Percentual de divisão"
        cur.execute(
            """
            UPDATE clausulas_contrato
            SET descricao = %s
            WHERE tipo_contrato_id = %s AND titulo = 'Percentual de divisão'
            """,
            (NOVA_DESCRICAO_PERCENTUAL, tipo_id),
        )
        if cur.rowcount:
            atualizadas += 1

        # 2) Insere a nova cláusula de rateio de custos, logo antes de
        #    "Percentual de divisão" (reordena as posteriores +1)
        cur.execute(
            "SELECT ordem FROM clausulas_contrato "
            "WHERE tipo_contrato_id = %s AND titulo = 'Percentual de divisão'",
            (tipo_id,),
        )
        ref = cur.fetchone()
        if not ref:
            continue
        ordem_alvo = ref["ordem"]

        cur.execute(
            "SELECT 1 FROM clausulas_contrato WHERE tipo_contrato_id = %s AND titulo = %s",
            (tipo_id, CLAUSULA_RATEIO[0]),
        )
        if cur.fetchone():
            continue  # já existe, não duplica

        cur.execute(
            "UPDATE clausulas_contrato SET ordem = ordem + 1 "
            "WHERE tipo_contrato_id = %s AND ordem >= %s",
            (tipo_id, ordem_alvo),
        )
        cur.execute(
            "INSERT INTO clausulas_contrato (tipo_contrato_id, ordem, titulo, descricao, obrigatoria) "
            "VALUES (%s,%s,%s,%s,%s)",
            (tipo_id, ordem_alvo, *CLAUSULA_RATEIO),
        )
        inseridas += 1

    conn.commit()
    conn.close()
    print(f"Cláusulas 'Percentual de divisão' atualizadas: {atualizadas}")
    print(f"Cláusulas 'Rateio de custos' inseridas: {inseridas}")


if __name__ == "__main__":
    main()
