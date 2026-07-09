"""
GET /producao/insumos-animal?animal_id=963&especie=bovinos&dias=30

Design generico: um mapa de configuracao por especie define onde buscar
producao (leite/ganho de peso/outro) e consumo (individual/lote), para que
o algoritmo de rateio (individual -> lote -> igual) seja reaproveitado por
todas as especies (bovinos, equinos, caprinos, ovinos, suinos, ...).

AJUSTAR: preencher ESPECIE_CONFIG com os nomes reais de tabela/coluna de
cada especie. O que estiver como None indica "essa especie nao rastreia
essa granularidade ainda" -- o algoritmo pula essa etapa automaticamente.
"""
from fastapi import APIRouter, Query, HTTPException
from datetime import date, timedelta
import psycopg2
import psycopg2.extras
import os

router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")


# --------------------------------------------------------------------------
# CONFIGURACAO POR ESPECIE -- AJUSTAR nomes reais de tabela/coluna
# --------------------------------------------------------------------------
# tabela_animal: tabela com os individuos dessa especie (deve ter id, lote_id)
# campo_finalidade: coluna que diz se o individuo eh "leiteiro"/produtivo por
#                   producao continua (leite, ovos, la) ou por ganho de peso
# producao_continua: {tabela, coluna_producao, coluna_animal_id, coluna_data}
#                     usado quando finalidade = producao continua (ex: leite)
# usa_pesagem: True se a producao dessa especie/finalidade eh medida por
#              ganho de peso (usa tabela `pesagens` generica, ja existente
#              para todas as especies conforme os 4 roteadores de rebanho)
# consumo_individual / consumo_lote: {tabela, coluna_animal_ou_lote, coluna_qtd, coluna_data}
#                                     None se essa granularidade nao existir
ESPECIE_CONFIG = {
    "bovinos": {
        "tabela_animal": "bovinos",
        "campo_finalidade": "finalidade",  # 'leiteiro' | 'corte'
        "producao_continua": {
            "tabela": "bovino_lactacoes",
            "coluna_producao": "producao_leite_controle",
            "coluna_animal_id": "identificador_animal",
            "coluna_data": "data_controle",
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
        "tabela_animal": "caprinos",
        "campo_finalidade": None,      # sempre ganho de peso, sem bifurcacao
        "producao_continua": None,
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
        "tabela_animal": "ovinos",
        "campo_finalidade": None,
        "producao_continua": None,
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
        "tabela_animal": "suinos",
        "campo_finalidade": None,
        "producao_continua": None,
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
            # 1) Animal + lote
            cur.execute(
                f"""
                SELECT id, lote_id
                       {', ' + cfg['campo_finalidade'] if cfg['campo_finalidade'] else ''}
                FROM {cfg['tabela_animal']}
                WHERE id = %s
                """,
                (animal_id,),
            )
            animal = cur.fetchone()
            if not animal:
                raise HTTPException(404, "Animal nao encontrado")

            finalidade = animal.get(cfg["campo_finalidade"]) if cfg["campo_finalidade"] else None
            usa_producao_continua = cfg["producao_continua"] is not None and finalidade not in (
                "corte",
                None,
            )

            # 2) Producao do periodo: continua (leite/ovos/la) OU ganho de peso
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
                tipo_producao = "continua"
                pesagens = []
            else:
                cur.execute(
                    """
                    SELECT peso, data_pesagem
                    FROM pesagens
                    WHERE animal_id = %s AND especie = %s AND data_pesagem >= %s
                    ORDER BY data_pesagem ASC
                    """,
                    (animal_id, especie, data_inicio),
                )
                pesagens = cur.fetchall()
                producao = (
                    float(pesagens[-1]["peso"]) - float(pesagens[0]["peso"])
                    if len(pesagens) >= 2
                    else 0.0
                )
                tipo_producao = "ganho_peso"

            # 3) Consumo individual, se essa especie rastreia
            consumo_individual = 0.0
            if cfg["consumo_individual"]:
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

            elif cfg["consumo_lote"]:
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

                if consumo_lote == 0:
                    return _sem_dado(animal_id, especie, dias, tipo_producao, producao)

                proporcao, criterio_rateio = _calcular_rateio(
                    cur, cfg, especie, lote_id, animal_id, data_inicio,
                    tipo_producao, producao, pesagens,
                )
                insumo_kg = consumo_lote * proporcao
                origem_consumo = "lote_rateado"
                confiabilidade = "media" if criterio_rateio != "igual" else "baixa"
            else:
                return _sem_dado(animal_id, especie, dias, tipo_producao, producao)

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


def _calcular_rateio(cur, cfg, especie, lote_id, animal_id, data_inicio, tipo_producao, producao, pesagens):
    """Retorna (proporcao, criterio) para dividir o consumo do lote entre os animais."""
    if tipo_producao == "continua":
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

    # ganho de peso -> pondera por peso metabolico (peso^0.75)
    cur.execute(
        f"""
        SELECT b.id, p.peso
        FROM {cfg['tabela_animal']} b
        LEFT JOIN LATERAL (
            SELECT peso FROM pesagens
            WHERE animal_id = b.id AND especie = %s AND data_pesagem >= %s
            ORDER BY data_pesagem DESC LIMIT 1
        ) p ON true
        WHERE b.lote_id = %s
        """,
        (especie, data_inicio, lote_id),
    )
    pesos_lote = [float(r["peso"]) for r in cur.fetchall() if r["peso"] is not None]
    total_metabolico = sum(p ** 0.75 for p in pesos_lote)
    peso_atual = pesagens[-1]["peso"] if pesagens else None
    if total_metabolico > 0 and peso_atual:
        return (float(peso_atual) ** 0.75) / total_metabolico, "peso"
    n = len(pesos_lote) or 1
    return 1 / n, "igual"
