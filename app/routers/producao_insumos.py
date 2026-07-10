"""
Rotas de producao x insumos, no contrato exato que o frontend (railway.ts)
ja espera:

  GET /bovino/animais/{animal_id}/producao-insumos?dias=X
      -> { animal_id, tipo: "corte"|"leite", periodo_dias,
           gmd_kg_dia?, ganho_total_kg?, litros_dia?, producao_total_l?,
           custo_insumos_periodo, custo_por_kg_ganho?, custo_por_litro?, aviso? }

  GET /suino/animais/{animal_id}/producao-insumos?dias=X
      -> { animal_id, periodo_dias, gmd_kg_dia?, ganho_total_kg?,
           custo_insumos_periodo, custo_por_kg_ganho?, aviso? }

  GET /ovino/indicadores/animal/{animal_id}
  GET /caprino/indicadores/animal/{animal_id}
      -> { gmd_geral?, ganho_total_kg?, custo_insumos_periodo?, custo_por_kg_ganho? }
      (sem filtro de dias -- usa historico completo de pesagens)

Tambem mantem o endpoint generico anterior /producao/insumos-animal
(em kg, nao em custo) para uso futuro se necessario.

Custo vem de movimentacoes_insumo.custo_total (R$), rateado entre os
animais do lote pela mesma logica de proporcao (producao ou peso metabolico)
usada no endpoint generico em kg.
"""
from fastapi import APIRouter, Query, HTTPException
from datetime import date, timedelta
from typing import Optional
import psycopg2
import psycopg2.extras
import os

router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")


ESPECIE_CONFIG = {
    "bovinos": {
        "tabela_animal": "bovino_animais",
        "campo_finalidade": "aptidao_manejo",  # 'leite' | 'corte'
        "valor_finalidade_continua": "leite",
        "producao_continua": {
            "tabela": "bovino_ordenha",
            "coluna_producao": "volume_l",
            "coluna_animal_id": "animal_id",
            "coluna_data": "data",
        },
        "pesagens": {"tabela": "bovino_pesagens", "coluna_peso": "peso_kg", "coluna_data": "data"},
    },
    "caprinos": {
        "tabela_animal": "caprino_animais",
        "campo_finalidade": None,
        "valor_finalidade_continua": None,
        "producao_continua": None,
        "pesagens": {"tabela": "caprino_pesagens", "coluna_peso": "peso_kg", "coluna_data": "data_pesagem"},
    },
    "ovinos": {
        "tabela_animal": "ovino_animais",
        "campo_finalidade": None,
        "valor_finalidade_continua": None,
        "producao_continua": None,
        "pesagens": {"tabela": "ovino_pesagens", "coluna_peso": "peso_kg", "coluna_data": "data_pesagem"},
    },
    "suinos": {
        "tabela_animal": "suino_animais",
        "campo_finalidade": None,
        "valor_finalidade_continua": None,
        "producao_continua": None,
        "pesagens": {"tabela": "suino_pesagens", "coluna_peso": "peso_kg", "coluna_data": "data_pesagem"},
    },
}


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _calcular_producao_e_custo(cur, especie: str, animal_id: int, dias: Optional[int]):
    """
    Nucleo compartilhado: calcula producao (litros ou kg de ganho) e o custo
    de insumo (R$) no periodo, com rateio individual -> lote -> impossivel.

    dias=None significa 'sem filtro de data' (historico completo), usado
    por ovino/caprino.
    """
    cfg = ESPECIE_CONFIG.get(especie)
    if not cfg:
        raise HTTPException(400, f"Especie '{especie}' nao configurada")

    data_inicio = (date.today() - timedelta(days=dias)) if dias is not None else None

    cur.execute(
        f"""
        SELECT id, lote_id
        FROM {cfg['tabela_animal']}
        WHERE id = %s
        """,
        (animal_id,),
    )
    animal = cur.fetchone()
    if not animal:
        raise HTTPException(404, "Animal nao encontrado")

    if cfg["campo_finalidade"]:
        cur.execute(
            f"SELECT {cfg['campo_finalidade']} AS finalidade FROM {cfg['tabela_animal']} WHERE id = %s",
            (animal_id,),
        )
        finalidade = cur.fetchone()["finalidade"]
    else:
        finalidade = None

    usa_leite = (
        cfg["producao_continua"] is not None and finalidade == cfg["valor_finalidade_continua"]
    )

    pesagens = []
    if usa_leite:
        pc = cfg["producao_continua"]
        filtro_data = f"AND {pc['coluna_data']} >= %s" if data_inicio else ""
        params = (animal_id, data_inicio) if data_inicio else (animal_id,)
        cur.execute(
            f"""
            SELECT COALESCE(SUM({pc['coluna_producao']}), 0) AS total
            FROM {pc['tabela']}
            WHERE {pc['coluna_animal_id']} = %s {filtro_data}
            """,
            params,
        )
        producao = float(cur.fetchone()["total"])
        tipo_producao = "leite"
    else:
        pg = cfg["pesagens"]
        filtro_data = f"AND {pg['coluna_data']} >= %s" if data_inicio else ""
        params = (animal_id, data_inicio) if data_inicio else (animal_id,)
        cur.execute(
            f"""
            SELECT {pg['coluna_peso']} AS peso, {pg['coluna_data']} AS data_p
            FROM {pg['tabela']}
            WHERE animal_id = %s {filtro_data}
            ORDER BY {pg['coluna_data']} ASC
            """,
            params,
        )
        pesagens = cur.fetchall()
        producao = (
            float(pesagens[-1]["peso"]) - float(pesagens[0]["peso"])
            if len(pesagens) >= 2
            else 0.0
        )
        tipo_producao = "ganho_peso"

    # Custo individual
    filtro_data_mov = "AND data_movim >= %s" if data_inicio else ""
    params_ci = (animal_id, data_inicio, especie) if data_inicio else (animal_id, especie)
    cur.execute(
        f"""
        SELECT COALESCE(SUM(custo_total), 0) AS total
        FROM movimentacoes_insumo
        WHERE animal_id = %s {filtro_data_mov} AND especie = %s AND tipo = 'uso'
        """,
        params_ci,
    )
    custo_individual = float(cur.fetchone()["total"])

    if custo_individual > 0:
        custo = custo_individual
        aviso = None
    else:
        lote_id = animal["lote_id"]
        if lote_id is None:
            return producao, tipo_producao, None, "Animal sem lote definido e sem consumo individual registrado."

        params_cl = (lote_id, data_inicio, especie) if data_inicio else (lote_id, especie)
        cur.execute(
            f"""
            SELECT COALESCE(SUM(custo_total), 0) AS total
            FROM movimentacoes_insumo
            WHERE lote_id = %s {filtro_data_mov} AND especie = %s AND tipo = 'uso'
            """,
            params_cl,
        )
        custo_lote = float(cur.fetchone()["total"])

        if custo_lote == 0:
            return producao, tipo_producao, None, "Sem consumo de insumo registrado para este animal ou lote no periodo."

        proporcao, criterio = _calcular_rateio(cur, cfg, especie, lote_id, data_inicio, tipo_producao, producao, pesagens)
        custo = custo_lote * proporcao
        aviso = (
            None if criterio != "igual"
            else "Custo estimado por divisao igual entre animais do lote (sem producao/peso suficiente para rateio proporcional)."
        )

    return producao, tipo_producao, custo, aviso


def _calcular_rateio(cur, cfg, especie, lote_id, data_inicio, tipo_producao, producao, pesagens):
    if tipo_producao == "leite":
        pc = cfg["producao_continua"]
        filtro_data = f"AND p.{pc['coluna_data']} >= %s" if data_inicio else ""
        params = (lote_id, data_inicio) if data_inicio else (lote_id,)
        cur.execute(
            f"""
            SELECT {pc['coluna_animal_id']} AS aid, COALESCE(SUM({pc['coluna_producao']}), 0) AS total
            FROM {pc['tabela']} p
            JOIN {cfg['tabela_animal']} a ON a.id = p.{pc['coluna_animal_id']}
            WHERE a.lote_id = %s {filtro_data}
            GROUP BY {pc['coluna_animal_id']}
            """,
            params,
        )
        linhas = cur.fetchall()
        total_lote = sum(float(r["total"]) for r in linhas)
        if total_lote > 0:
            return producao / total_lote, "producao"
        n = len(linhas) or 1
        return 1 / n, "igual"

    pg = cfg["pesagens"]
    filtro_data = f"AND {pg['coluna_data']} >= %s" if data_inicio else ""
    params = (data_inicio, lote_id) if data_inicio else (lote_id,)
    query = f"""
        SELECT b.id, p.peso_kg
        FROM {cfg['tabela_animal']} b
        LEFT JOIN LATERAL (
            SELECT peso_kg FROM {pg['tabela']}
            WHERE animal_id = b.id {filtro_data}
            ORDER BY {pg['coluna_data']} DESC LIMIT 1
        ) p ON true
        WHERE b.lote_id = %s
    """
    if data_inicio:
        cur.execute(query, (data_inicio, lote_id))
    else:
        cur.execute(query, (lote_id,))
    pesos_lote = [float(r["peso_kg"]) for r in cur.fetchall() if r["peso_kg"] is not None]
    total_metabolico = sum(p ** 0.75 for p in pesos_lote)
    peso_atual = pesagens[-1]["peso"] if pesagens else None
    if total_metabolico > 0 and peso_atual:
        return (float(peso_atual) ** 0.75) / total_metabolico, "peso"
    n = len(pesos_lote) or 1
    return 1 / n, "igual"


# ─────────────────────────────────────────────────────────────────────────
# ROTAS NO CONTRATO EXATO ESPERADO PELO FRONTEND
# ─────────────────────────────────────────────────────────────────────────

@router.get("/bovino/animais/{animal_id}/producao-insumos")
def bovino_producao_insumos(animal_id: int, dias: int = Query(30)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            producao, tipo_producao, custo, aviso = _calcular_producao_e_custo(cur, "bovinos", animal_id, dias)

            resultado = {
                "animal_id": animal_id,
                "tipo": "leite" if tipo_producao == "leite" else "corte",
                "periodo_dias": dias,
                "custo_insumos_periodo": round(custo, 2) if custo is not None else 0.0,
                "aviso": aviso,
            }
            if tipo_producao == "leite":
                resultado["litros_dia"] = round(producao / dias, 2) if dias else None
                resultado["producao_total_l"] = round(producao, 2)
                resultado["custo_por_litro"] = round(custo / producao, 2) if custo and producao else None
            else:
                resultado["gmd_kg_dia"] = round(producao / dias, 3) if dias else None
                resultado["ganho_total_kg"] = round(producao, 2)
                resultado["custo_por_kg_ganho"] = round(custo / producao, 2) if custo and producao else None
            return resultado
    finally:
        conn.close()


@router.get("/suino/animais/{animal_id}/producao-insumos")
def suino_producao_insumos(animal_id: int, dias: int = Query(30)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            producao, _, custo, aviso = _calcular_producao_e_custo(cur, "suinos", animal_id, dias)
            return {
                "animal_id": animal_id,
                "periodo_dias": dias,
                "gmd_kg_dia": round(producao / dias, 3) if dias else None,
                "ganho_total_kg": round(producao, 2),
                "custo_insumos_periodo": round(custo, 2) if custo is not None else 0.0,
                "custo_por_kg_ganho": round(custo / producao, 2) if custo and producao else None,
                "aviso": aviso,
            }
    finally:
        conn.close()


def _indicadores_sem_periodo(especie: str, animal_id: int):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            producao, _, custo, aviso = _calcular_producao_e_custo(cur, especie, animal_id, None)
            # GMD geral: precisa do periodo real entre 1a e ultima pesagem
            cfg = ESPECIE_CONFIG[especie]
            pg = cfg["pesagens"]
            cur.execute(
                f"""
                SELECT MIN({pg['coluna_data']}) AS inicio, MAX({pg['coluna_data']}) AS fim
                FROM {pg['tabela']} WHERE animal_id = %s
                """,
                (animal_id,),
            )
            row = cur.fetchone()
            dias_reais = (row["fim"] - row["inicio"]).days if row["inicio"] and row["fim"] and row["fim"] != row["inicio"] else None
            return {
                "gmd_geral": round(producao / dias_reais, 3) if dias_reais else None,
                "ganho_total_kg": round(producao, 2),
                "custo_insumos_periodo": round(custo, 2) if custo is not None else 0.0,
                "custo_por_kg_ganho": round(custo / producao, 2) if custo and producao else None,
            }
    finally:
        conn.close()


@router.get("/ovino/indicadores/animal/{animal_id}")
def ovino_indicadores_animal(animal_id: int):
    return _indicadores_sem_periodo("ovinos", animal_id)


@router.get("/caprino/indicadores/animal/{animal_id}")
def caprino_indicadores_animal(animal_id: int):
    return _indicadores_sem_periodo("caprinos", animal_id)
