"""
GET /producao/insumos-animal?animal_id=963&especie=bovinos&dias=30

Versao final com schema real confirmado:
- bovino_animais / bovino_lotes / bovino_pesagens / bovino_ordenha
- caprino_animais / caprino_lotes / caprino_pesagens
- ovino_animais   / ovino_lotes   / ovino_pesagens
- suino_animais   / suino_lotes   / suino_pesagens
- movimentacoes_insumo (com especie/lote_id/animal_id, migration 013)

Nota: bovino_pesagens usa coluna 'data'; caprino/ovino/suino_pesagens usam
'data_pesagem'. Todos usam 'peso_kg' (nao 'peso'). Documentado explicitamente
na config abaixo para nao reintroduzir o erro.
"""
from fastapi import APIRouter, Query, HTTPException
from datetime import date, timedelta
import psycopg2
import psycopg2.extras
import os

router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")


ESPECIE_CONFIG = {
    "bovinos": {
        "tabela_animal": "bovino_animais",
        "campo_finalidade": "aptidao_manejo",  # valores reais: 'leite' | 'corte'
        "valor_finalidade_continua": "leite",
        "producao_continua": {
            "tabela": "bovino_ordenha",
            "coluna_producao": "volume_l",
            "coluna_animal_id": "animal_id",
            "coluna_data": "data",
        },
        "pesagens": {
            "tabela": "bovino_pesagens",
            "coluna_peso": "peso_kg",
            "coluna_data": "data",
        },
        "consumo_individual": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "animal_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'bovinos'",
        },
        "consumo_lote": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "lote_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'bovinos'",
        },
    },
    "caprinos": {
        "tabela_animal": "caprino_animais",
        "campo_finalidade": None,   # sempre ganho de peso
        "valor_finalidade_continua": None,
        "producao_continua": None,
        "pesagens": {
            "tabela": "caprino_pesagens",
            "coluna_peso": "peso_kg",
            "coluna_data": "data_pesagem",
        },
        "consumo_individual": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "animal_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'caprinos'",
        },
        "consumo_lote": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "lote_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'caprinos'",
        },
    },
    "ovinos": {
        "tabela_animal": "ovino_animais",
        "campo_finalidade": None,
        "valor_finalidade_continua": None,
        "producao_continua": None,
        "pesagens": {
            "tabela": "ovino_pesagens",
            "coluna_peso": "peso_kg",
            "coluna_data": "data_pesagem",
        },
        "consumo_individual": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "animal_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'ovinos'",
        },
        "consumo_lote": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "lote_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'ovinos'",
        },
    },
    "suinos": {
        "tabela_animal": "suino_animais",
        "campo_finalidade": None,
        "valor_finalidade_continua": None,
        "producao_continua": None,
        "pesagens": {
            "tabela": "suino_pesagens",
            "coluna_peso": "peso_kg",
            "coluna_data": "data_pesagem",
        },
        "consumo_individual": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "animal_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'suinos'",
        },
        "consumo_lote": {
            "tabela": "movimentacoes_insumo",
            "coluna_animal_ou_lote": "lote_id",
            "coluna_qtd": "quantidade",
            "coluna_data": "data_movim",
            "filtro_extra": "AND tipo = 'uso' AND especie = 'suinos'",
        },
    },
}


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


@router.get("/producao/insumos-animal")
def producao_insumos_animal(
    animal_id: int = Query(...),
    especie: str = Query(...),
    dias: int = Query(30),
):
    cfg = ESPECIE_CONFIG.get(especie)
    if not cfg:
        raise HTTPException(400, f"Especie '{especie}' nao configurada")

    data_inicio = date.today() - timedelta(days=dias)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 1) Animal + lote + finalidade (se aplicavel)
            campos_extra = f", {cfg['campo_finalidade']}" if cfg["campo_finalidade"] else ""
            cur.execute(
                f"""
                SELECT id, lote_id{campos_extra}
                FROM {cfg['tabela_animal']}
                WHERE id = %s
                """,
                (animal_id,),
            )
            animal = cur.fetchone()
            if not animal:
                raise HTTPException(404, "Animal nao encontrado")

            finalidade = animal.get(cfg["campo_finalidade"]) if cfg["campo_finalidade"] else None
            usa_producao_continua = (
                cfg["producao_continua"] is not None
                and finalidade == cfg["valor_finalidade_continua"]
            )

            # 2) Producao do periodo: continua (leite) OU ganho de peso
            pesagens = []
            if usa_producao_continua:
                pc = cfg["producao_continua"]
                cur.execute(
                    f"""
                    SELECT COALESCE(SUM({pc['coluna_producao']}), 0) AS total
                    FROM {pc['tabela']}
                    WHERE {pc['coluna_animal_id']} = %s AND {pc['coluna_data']} >= %s
                    """,
                    (animal_id, data_inicio),
                )
                producao = float(cur.fetchone()["total"])
                tipo_producao = "leite"
            else:
                pg = cfg["pesagens"]
                cur.execute(
                    f"""
                    SELECT {pg['coluna_peso']} AS peso, {pg['coluna_data']} AS data_p
                    FROM {pg['tabela']}
                    WHERE animal_id = %s AND {pg['coluna_data']} >= %s
                    ORDER BY {pg['coluna_data']} ASC
                    """,
                    (animal_id, data_inicio),
                )
                pesagens = cur.fetchall()
                producao = (
                    float(pesagens[-1]["peso"]) - float(pesagens[0]["peso"])
                    if len(pesagens) >= 2
                    else 0.0
                )
                tipo_producao = "ganho_peso"

            # 3) Consumo individual
            ci = cfg["consumo_individual"]
            cur.execute(
                f"""
                SELECT COALESCE(SUM({ci['coluna_qtd']}), 0) AS total
                FROM {ci['tabela']}
                WHERE {ci['coluna_animal_ou_lote']} = %s AND {ci['coluna_data']} >= %s
                {ci.get('filtro_extra', '')}
                """,
                (animal_id, data_inicio),
            )
            consumo_individual = float(cur.fetchone()["total"])

            if consumo_individual > 0:
                insumo_kg = consumo_individual
                origem_consumo = "individual"
                criterio_rateio = None
                confiabilidade = "alta"
            else:
                cl = cfg["consumo_lote"]
                lote_id = animal["lote_id"]
                cur.execute(
                    f"""
                    SELECT COALESCE(SUM({cl['coluna_qtd']}), 0) AS total
                    FROM {cl['tabela']}
                    WHERE {cl['coluna_animal_ou_lote']} = %s AND {cl['coluna_data']} >= %s
                    {cl.get('filtro_extra', '')}
                    """,
                    (lote_id, data_inicio),
                )
                consumo_lote = float(cur.fetchone()["total"])

                if consumo_lote == 0 or lote_id is None:
                    return _sem_dado(animal_id, especie, dias, tipo_producao, producao)

                proporcao, criterio_rateio = _calcular_rateio(
                    cur, cfg, lote_id, animal_id, data_inicio,
                    tipo_producao, producao, pesagens,
                )
                insumo_kg = consumo_lote * proporcao
                origem_consumo = "lote_rateado"
                confiabilidade = "media" if criterio_rateio != "igual" else "baixa"

            eficiencia = producao / insumo_kg if insumo_kg else None
            return {
                "animalId": animal_id,
                "especie": especie,
                "dias": dias,
                "tipoProducao": tipo_producao,
                "producao": round(producao, 2),
                "insumoConsumidoKg": round(insumo_kg, 2),
                "eficiencia": round(eficiencia, 3) if eficiencia else None,
                "origemConsumo": origem_consumo,
                "criterioRateio": criterio_rateio,
                "confiabilidade": confiabilidade,
                "calculavel": True,
            }
    finally:
        conn.close()


def _sem_dado(animal_id, especie, dias, tipo_producao, producao):
    return {
        "animalId": animal_id,
        "especie": especie,
        "dias": dias,
        "tipoProducao": tipo_producao,
        "producao": round(producao, 2),
        "insumoConsumidoKg": None,
        "eficiencia": None,
        "origemConsumo": None,
        "criterioRateio": None,
        "confiabilidade": None,
        "calculavel": False,
    }


def _calcular_rateio(cur, cfg, lote_id, animal_id, data_inicio, tipo_producao, producao, pesagens):
    """Retorna (proporcao, criterio) para dividir o consumo do lote entre os animais."""
    if tipo_producao == "leite":
        pc = cfg["producao_continua"]
        cur.execute(
            f"""
            SELECT {pc['coluna_animal_id']} AS aid, COALESCE(SUM({pc['coluna_producao']}), 0) AS total
            FROM {pc['tabela']} p
            JOIN {cfg['tabela_animal']} a ON a.id = p.{pc['coluna_animal_id']}
            WHERE a.lote_id = %s AND p.{pc['coluna_data']} >= %s
            GROUP BY {pc['coluna_animal_id']}
            """,
            (lote_id, data_inicio),
        )
        linhas = cur.fetchall()
        total_lote = sum(float(r["total"]) for r in linhas)
        if total_lote > 0:
            return producao / total_lote, "producao"
        n = len(linhas) or 1
        return 1 / n, "igual"

    # ganho de peso -> pondera por peso metabolico (peso_kg^0.75) do peso mais recente
    pg = cfg["pesagens"]
    cur.execute(
        f"""
        SELECT b.id, p.peso_kg
        FROM {cfg['tabela_animal']} b
        LEFT JOIN LATERAL (
            SELECT peso_kg FROM {pg['tabela']}
            WHERE animal_id = b.id AND {pg['coluna_data']} >= %s
            ORDER BY {pg['coluna_data']} DESC LIMIT 1
        ) p ON true
        WHERE b.lote_id = %s
        """,
        (data_inicio, lote_id),
    )
    pesos_lote = [float(r["peso_kg"]) for r in cur.fetchall() if r["peso_kg"] is not None]
    total_metabolico = sum(p ** 0.75 for p in pesos_lote)
    peso_atual = pesagens[-1]["peso"] if pesagens else None
    if total_metabolico > 0 and peso_atual:
        return (float(peso_atual) ** 0.75) / total_metabolico, "peso"
    n = len(pesos_lote) or 1
    return 1 / n, "igual"
