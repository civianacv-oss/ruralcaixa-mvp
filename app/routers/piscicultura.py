"""
Router FastAPI — Módulo Piscicultura
RuralCaixa MVP
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
import psycopg2
from psycopg2.extras import RealDictCursor
import sys, os
import logging

logger = logging.getLogger(__name__)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.db import get_db
from app.schemas_piscicultura import (
    CicloCreate, CicloUpdate, CicloResponse,
    BiometriaCreate, BiometriaResponse,
    RegistroDiarioCreate, RegistroDiarioResponse,
    CompraInsumoCreate, CompraInsumoResponse,
    DespescaCreate, DespescaResponse,
    DashboardCiclo,
)
from app.services.estoque_insumos import aplicar_movimentacao_insumo, estornar_movimentacao

FAZENDA_ID = 1  # MVP: fazenda_id fixo, mesmo padrão de app/routers/insumos.py

router = APIRouter(prefix="/piscicultura", tags=["Piscicultura"])


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

# Faixas de densidade recomendada (peixes/ha) por sistema — referência técnica p/ tilápia
DENSIDADE_RECOMENDADA_HA = {
    "extensivo": (1000, 3000),
    "semi_intensivo": (5000, 15000),
    "intensivo": (20000, 50000),
    # superintensivo é medido em biomassa (ton/ha), não em nº de peixes — não validado aqui
}

# Faixa de preço de referência do alevino de tilápia (R$/unidade), por faixa de peso
PRECO_ALEVINO_TILAPIA_REF = [
    (1, 5, 0.08, 0.20),      # 1-5 g
    (50, 100, 0.50, 1.20),   # 50-100 g (juvenil)
]

# Fases de ração por peso do peixe (granulometria/proteína) — referência técnica p/ tilápia
FASES_RACAO = [
    (1, 30, "Alevino", "Pó / farelo fino", "40-45%"),
    (30, 100, "Juvenil", "Peletinho 2-3 mm", "36-40%"),
    (100, 300, "Recria", "Pelete 3-5 mm", "32-36%"),
    (300, float("inf"), "Engorda", "Pelete 5-8 mm", "28-32%"),
]


def _validar_povoamento(sistema: str, area_ha: float, qtd_alevinos: int,
                         especie: str, peso_medio_inicial_g: float,
                         preco_alevino_unit: Optional[float]) -> list:
    """Confere densidade de estocagem e preço do alevino contra faixas de referência.
    Retorna avisos (não bloqueia o cadastro — o produtor pode ter motivo válido)."""
    alertas = []

    faixa_dens = DENSIDADE_RECOMENDADA_HA.get(sistema)
    if faixa_dens and area_ha:
        densidade = qtd_alevinos / float(area_ha)
        minimo, maximo = faixa_dens
        if densidade < minimo:
            alertas.append(
                f"ℹ️ Densidade de estocagem baixa: {densidade:,.0f} peixes/ha "
                f"(faixa recomendada para {sistema.replace('_',' ')}: {minimo:,}-{maximo:,}/ha)"
            )
        elif densidade > maximo:
            alertas.append(
                f"⚠️ Densidade de estocagem acima da faixa recomendada: {densidade:,.0f} peixes/ha "
                f"(recomendado para {sistema.replace('_',' ')}: {minimo:,}-{maximo:,}/ha) — "
                f"avalie aeração mecânica adicional"
            )

    if "tilapia" in especie.lower().replace("á", "a").replace("í", "i") and preco_alevino_unit:
        for peso_min, peso_max, preco_min, preco_max in PRECO_ALEVINO_TILAPIA_REF:
            if peso_min <= float(peso_medio_inicial_g) <= peso_max:
                if preco_alevino_unit < preco_min * 0.5 or preco_alevino_unit > preco_max * 1.5:
                    alertas.append(
                        f"ℹ️ Preço do alevino (R$ {preco_alevino_unit:.2f}/un) fora da faixa de "
                        f"referência de mercado para tilápia {peso_min}-{peso_max}g "
                        f"(R$ {preco_min:.2f}-{preco_max:.2f}/un) — confira se está correto"
                    )
                break

    return alertas


def _sugestao_racao(peso_medio_g: Optional[float]) -> Optional[dict]:
    """Sugere fase/granulometria/proteína da ração conforme o peso médio atual dos peixes."""
    if peso_medio_g is None:
        return None
    for peso_min, peso_max, fase, granulometria, proteina in FASES_RACAO:
        if peso_min <= float(peso_medio_g) < peso_max:
            return {
                "fase": fase, "granulometria": granulometria, "proteina_recomendada": proteina,
                "faixa_peso_g": f"{peso_min}-{peso_max if peso_max != float('inf') else '+'} g",
            }
    return None


def _calcular_aeracao_recomendada(sistema: str, area_ha: Optional[float],
                                   biomassa_atual_kg: Optional[float],
                                   racao_dia_kg: Optional[float]) -> Optional[dict]:
    """HP de aeração mecânica recomendado, conforme sistema/biomassa/arraçoamento por ha.
    Só se aplica a cultivo intensivo/superintensivo (extensivo/semi-intensivo dependem
    majoritariamente de aeração natural)."""
    if sistema not in ("intensivo", "superintensivo") or not area_ha:
        return None
    area_ha = float(area_ha)
    hp_por_ha = 4.0  # baseline cultivo intensivo
    biomassa_ton_ha = (float(biomassa_atual_kg) / 1000 / area_ha) if biomassa_atual_kg else 0.0
    racao_kg_ha_dia = (float(racao_dia_kg) / area_ha) if racao_dia_kg else 0.0
    motivo = "cultivo intensivo (base)"
    if biomassa_ton_ha > 50:
        hp_por_ha = 8.0
        motivo = f"biomassa {biomassa_ton_ha:.1f} ton/ha > 50 ton/ha"
    elif racao_kg_ha_dia > 120:
        hp_por_ha = 5.0
        motivo = f"arraçoamento {racao_kg_ha_dia:.0f} kg/ha/dia > 120 kg/ha/dia"
    return {
        "hp_por_ha": hp_por_ha,
        "hp_total_recomendado": round(hp_por_ha * area_ha, 1),
        "biomassa_ton_ha": round(biomassa_ton_ha, 2),
        "racao_kg_ha_dia": round(racao_kg_ha_dia, 2),
        "motivo": motivo,
    }


# Palavras-chave específicas de cada fase, usadas para checar se o tipo_racao
# lançado no dia condiz com a fase esperada pelo peso médio atual do lote.
FASE_RACAO_KEYWORDS = {
    "Alevino": ["alevino", "pó", "po ", "farelo fino", "farelo", "inicial"],
    "Juvenil": ["juvenil", "peletinho", "2-3", "2mm", "3mm"],
    "Recria": ["recria", "3-5", "3mm", "4mm", "5mm"],
    "Engorda": ["engorda", "5-8", "6mm", "7mm", "8mm", "final", "terminação"],
}


def _alerta_racao_divergente(tipo_racao: Optional[str], peso_medio_g: Optional[float]) -> Optional[str]:
    """Compara o tipo de ração lançado no dia contra a fase/granulometria esperada
    pelo peso médio atual do lote (heurística por texto — não bloqueia o lançamento)."""
    sugestao = _sugestao_racao(peso_medio_g)
    if not sugestao or not tipo_racao:
        return None
    texto = tipo_racao.lower()
    keywords = FASE_RACAO_KEYWORDS.get(sugestao["fase"], [])
    if any(kw in texto for kw in keywords):
        return None
    return (
        f"ℹ️ Ração lançada ('{tipo_racao}') pode não corresponder à fase esperada "
        f"pelo peso médio atual ({peso_medio_g:.0f}g): {sugestao['fase']} — "
        f"{sugestao['granulometria']}, proteína {sugestao['proteina_recomendada']}"
    )


def _gerar_alertas_agua(registro: dict) -> list:
    """Verifica parâmetros da água e retorna lista de alertas."""
    alertas = []
    o2 = registro.get("oxigenio_dissolvido")
    ph = registro.get("ph")
    temp = registro.get("temperatura_c")
    secchi = registro.get("transparencia_secchi_cm")

    if o2 is not None:
        if o2 < 2:
            alertas.append(f"⚠️ CRÍTICO: O₂ dissolvido = {o2} mg/L — aeração emergencial!")
        elif o2 < 3:
            alertas.append(f"⚠️ O₂ dissolvido baixo = {o2} mg/L (ideal > 3)")

    if ph is not None:
        if ph < 6.5:
            alertas.append(f"⚠️ pH ácido = {ph} — aplicar calcário")
        elif ph > 8.5:
            alertas.append(f"⚠️ pH alcalino = {ph} — renovação de água")

    if temp is not None:
        if temp < 20:
            alertas.append(f"⚠️ Temperatura baixa = {temp}°C — reduzir/suspender alimentação")
        elif temp > 34:
            alertas.append(f"⚠️ Temperatura alta = {temp}°C — suspender alimentação")

    if secchi is not None:
        if secchi < 30:
            alertas.append(f"⚠️ Transparência baixa = {secchi} cm — trocar água")
        elif secchi > 70:
            alertas.append(f"⚠️ Transparência alta = {secchi} cm — adubar viveiro")

    return alertas


def _calcular_ica(ciclo_id: int, conn) -> Optional[Decimal]:
    """ICA = total ração / ganho de peso (biomassa atual - biomassa inicial)."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT COALESCE(SUM(racao_kg), 0) as total_racao
            FROM registros_diarios_piscicultura
            WHERE ciclo_id = %s
        """, (ciclo_id,))
        total_racao = cur.fetchone()["total_racao"] or Decimal("0")

        cur.execute("""
            SELECT peso_medio_g, biomassa_estimada_kg
            FROM biometrias_piscicultura
            WHERE ciclo_id = %s
            ORDER BY data_biometria DESC
            LIMIT 1
        """, (ciclo_id,))
        ultima_bio = cur.fetchone()

        cur.execute("""
            SELECT peso_medio_inicial_g, qtd_alevinos
            FROM ciclos_piscicultura
            WHERE id = %s
        """, (ciclo_id,))
        ciclo = cur.fetchone()

    if not ciclo or total_racao == 0:
        return None

    biomassa_atual = ultima_bio["biomassa_estimada_kg"] if ultima_bio else None
    if biomassa_atual is None:
        return None

    biomassa_inicial = Decimal(str(ciclo["peso_medio_inicial_g"])) * Decimal(str(ciclo["qtd_alevinos"])) / Decimal("1000")
    ganho = Decimal(str(biomassa_atual)) - biomassa_inicial

    if ganho <= 0:
        return None

    ica = Decimal(str(total_racao)) / ganho
    return ica.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _estoque_vivo(ciclo_id: int, conn) -> int:
    """Estoque vivo = qtd_alevinos - mortalidade acumulada."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT qtd_alevinos FROM ciclos_piscicultura WHERE id = %s
        """, (ciclo_id,))
        row = cur.fetchone()
        if not row:
            return 0
        qtd_alevinos = row["qtd_alevinos"]

        cur.execute("""
            SELECT COALESCE(SUM(mortalidade_qtd), 0) as total_mortes
            FROM registros_diarios_piscicultura
            WHERE ciclo_id = %s
        """, (ciclo_id,))
        total_mortes = cur.fetchone()["total_mortes"] or 0

    return max(0, qtd_alevinos - total_mortes)


def _criar_lancamento_lcdpr(conn, imovel_id: int, produtor_id: Optional[int],
                             data: date, tipo: str, valor: Decimal,
                             descricao: str, origem: str) -> Optional[int]:
    """
    Cria lancamento LCDPR automaticamente em conexao separada.
    tipo: 'receita' | 'despesa'
    Retorna o id do lancamento criado.
    Usa conexao propria para nao interferir com a transacao principal.
    """
    tipo_lancamento = "Receita" if tipo == "receita" else "Despesa"
    lcdpr_conn = None
    try:
        lcdpr_conn = get_db()
        with lcdpr_conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id FROM subcontas
                WHERE LOWER(tipo) = LOWER(%s)
                LIMIT 1
            """, (tipo_lancamento,))
            sub = cur.fetchone()
            subconta_id = sub["id"] if sub else None
            cur.execute("""
                INSERT INTO lancamentos
                    (produtor_id, subconta_id, valor, data, origem)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (
                produtor_id, subconta_id,
                float(valor), data, origem
            ))
            row = cur.fetchone()
            lcdpr_conn.commit()
            return row["id"] if row else None
    except Exception as e:
        print(f"[PISCICULTURA] Erro ao criar lancamento LCDPR: {e}")
        if lcdpr_conn:
            lcdpr_conn.rollback()
        return None
    finally:
        if lcdpr_conn:
            lcdpr_conn.close()

@router.post("/ciclos", response_model=CicloResponse, status_code=201)
def criar_ciclo(data: CicloCreate):
    """Inicia um novo ciclo de produção."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Valida imóvel
            cur.execute("SELECT id FROM imoveis_rurais WHERE id = %s", (data.imovel_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Imóvel não encontrado")

            # Valida produtor (se informado)
            if data.produtor_id:
                cur.execute("SELECT id FROM produtores WHERE id = %s", (data.produtor_id,))
                if not cur.fetchone():
                    raise HTTPException(404, "Produtor não encontrado")

            cur.execute("""
                INSERT INTO ciclos_piscicultura
                    (imovel_id, produtor_id, nome_ciclo, especie, sistema,
                     area_ha, data_povoamento, data_despesca_prevista,
                     qtd_alevinos, peso_medio_inicial_g, preco_alevino_unit,
                     meta_peso_final_g, meta_preco_venda_kg, observacoes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                data.imovel_id, data.produtor_id, data.nome_ciclo, data.especie,
                data.sistema.value, float(data.area_ha), data.data_povoamento,
                data.data_despesca_prevista, data.qtd_alevinos,
                float(data.peso_medio_inicial_g),
                float(data.preco_alevino_unit) if data.preco_alevino_unit else None,
                float(data.meta_peso_final_g) if data.meta_peso_final_g else None,
                float(data.meta_preco_venda_kg) if data.meta_preco_venda_kg else None,
                data.observacoes,
            ))
            ciclo = cur.fetchone()

            # Se informou preço do alevino, gera lançamento LCDPR de despesa
            if data.preco_alevino_unit and data.qtd_alevinos:
                valor_alevinos = Decimal(str(data.preco_alevino_unit)) * data.qtd_alevinos
                _criar_lancamento_lcdpr(
                    conn, data.imovel_id, data.produtor_id,
                    data.data_povoamento, "despesa", valor_alevinos,
                    f"Aquisição de alevinos — {data.especie} ({data.qtd_alevinos} un.) — {data.nome_ciclo}",
                    "piscicultura_alevinos"
                )

            conn.commit()

        ciclo_resp = dict(ciclo)
        ciclo_resp["estoque_vivo"] = ciclo_resp["qtd_alevinos"]
        ciclo_resp["biomassa_atual_kg"] = None
        ciclo_resp["total_racao_kg"] = Decimal("0")
        ciclo_resp["total_custo_insumos"] = Decimal("0")
        ciclo_resp["ica_atual"] = None
        ciclo_resp["mortalidade_acumulada"] = 0
        ciclo_resp["alertas_povoamento"] = _validar_povoamento(
            data.sistema.value, float(data.area_ha), data.qtd_alevinos, data.especie,
            float(data.peso_medio_inicial_g),
            float(data.preco_alevino_unit) if data.preco_alevino_unit else None,
        ) or None
        ciclo_resp["mortalidade_perc"] = Decimal("0")
        return CicloResponse(**ciclo_resp)
    finally:
        conn.close()


@router.get("/ciclos", response_model=List[CicloResponse])
def listar_ciclos(
    imovel_id: Optional[int] = None,
    produtor_id: Optional[int] = None,
    status: Optional[str] = None,
):
    """Lista ciclos com métricas calculadas."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            where = ["1=1"]
            params = []
            if imovel_id:
                where.append("imovel_id = %s"); params.append(imovel_id)
            if produtor_id:
                where.append("produtor_id = %s"); params.append(produtor_id)
            if status:
                where.append("status = %s"); params.append(status)

            cur.execute(f"""
                SELECT * FROM ciclos_piscicultura
                WHERE {' AND '.join(where)}
                ORDER BY data_povoamento DESC
            """, tuple(params))
            ciclos = cur.fetchall()

        result = []
        for c in ciclos:
            row = dict(c)
            cid = row["id"]
            row["estoque_vivo"] = _estoque_vivo(cid, conn)
            row["mortalidade_acumulada"] = row["qtd_alevinos"] - row["estoque_vivo"]
            row["mortalidade_perc"] = (
                Decimal(str(row["mortalidade_acumulada"])) /
                Decimal(str(row["qtd_alevinos"])) * 100
            ).quantize(Decimal("0.01")) if row["qtd_alevinos"] else Decimal("0")
            row["ica_atual"] = _calcular_ica(cid, conn)

            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT COALESCE(SUM(racao_kg),0) as total_racao,
                           COALESCE(SUM(custo_racao_dia),0) as custo_racao
                    FROM registros_diarios_piscicultura WHERE ciclo_id = %s
                """, (cid,))
                r = cur.fetchone()
                row["total_racao_kg"] = r["total_racao"]

                cur.execute("""
                    SELECT COALESCE(SUM(valor_total),0) as total_insumos
                    FROM compras_insumos_piscicultura WHERE ciclo_id = %s
                """, (cid,))
                row["total_custo_insumos"] = cur.fetchone()["total_insumos"]

                cur.execute("""
                    SELECT biomassa_estimada_kg FROM biometrias_piscicultura
                    WHERE ciclo_id = %s ORDER BY data_biometria DESC LIMIT 1
                """, (cid,))
                bio = cur.fetchone()
                row["biomassa_atual_kg"] = bio["biomassa_estimada_kg"] if bio else None

            result.append(CicloResponse(**row))
        return result
    finally:
        conn.close()


@router.get("/ciclos/{ciclo_id}", response_model=CicloResponse)
def buscar_ciclo(ciclo_id: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM ciclos_piscicultura WHERE id = %s", (ciclo_id,))
            row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Ciclo não encontrado")

        row = dict(row)
        row["estoque_vivo"] = _estoque_vivo(ciclo_id, conn)
        row["mortalidade_acumulada"] = row["qtd_alevinos"] - row["estoque_vivo"]
        row["mortalidade_perc"] = (
            Decimal(str(row["mortalidade_acumulada"])) /
            Decimal(str(row["qtd_alevinos"])) * 100
        ).quantize(Decimal("0.01")) if row["qtd_alevinos"] else Decimal("0")
        row["ica_atual"] = _calcular_ica(ciclo_id, conn)

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT COALESCE(SUM(racao_kg),0) as tr,
                       COALESCE(SUM(custo_racao_dia),0) as cr
                FROM registros_diarios_piscicultura WHERE ciclo_id = %s
            """, (ciclo_id,))
            r = cur.fetchone()
            row["total_racao_kg"] = r["tr"]

            cur.execute("""
                SELECT COALESCE(SUM(valor_total),0) as ti
                FROM compras_insumos_piscicultura WHERE ciclo_id = %s
            """, (ciclo_id,))
            row["total_custo_insumos"] = cur.fetchone()["ti"]

            cur.execute("""
                SELECT biomassa_estimada_kg FROM biometrias_piscicultura
                WHERE ciclo_id = %s ORDER BY data_biometria DESC LIMIT 1
            """, (ciclo_id,))
            bio = cur.fetchone()
            row["biomassa_atual_kg"] = bio["biomassa_estimada_kg"] if bio else None

        return CicloResponse(**row)
    finally:
        conn.close()


@router.patch("/ciclos/{ciclo_id}", response_model=CicloResponse)
def atualizar_ciclo(ciclo_id: int, data: CicloUpdate):
    conn = get_db()
    try:
        campos = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        if not campos:
            raise HTTPException(400, "Nenhum campo para atualizar")

        set_clause = ", ".join([f"{k} = %s" for k in campos])
        valores = list(campos.values()) + [ciclo_id]

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"""
                UPDATE ciclos_piscicultura SET {set_clause}, updated_at = NOW()
                WHERE id = %s RETURNING *
            """, valores)
            row = cur.fetchone()
            conn.commit()

        if not row:
            raise HTTPException(404, "Ciclo não encontrado")
        return buscar_ciclo(ciclo_id)
    finally:
        conn.close()


# ─────────────────────────────────────────
# BIOMETRIAS
# ─────────────────────────────────────────

@router.post("/biometrias", response_model=BiometriaResponse, status_code=201)
def registrar_biometria(data: BiometriaCreate):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM ciclos_piscicultura WHERE id = %s", (data.ciclo_id,))
            ciclo = cur.fetchone()
            if not ciclo:
                raise HTTPException(404, "Ciclo não encontrado")

            estoque = _estoque_vivo(data.ciclo_id, conn)
            peso_medio = float(data.peso_total_amostra_g) / data.qtd_amostrada
            biomassa_kg = round(peso_medio * estoque / 1000, 2)

            # Calcula ICA atualizado
            with conn.cursor(cursor_factory=RealDictCursor) as cur2:
                cur2.execute("""
                    SELECT COALESCE(SUM(racao_kg),0) as total_racao
                    FROM registros_diarios_piscicultura WHERE ciclo_id = %s
                """, (data.ciclo_id,))
                total_racao = float(cur2.fetchone()["total_racao"] or 0)

            biomassa_inicial = float(ciclo["peso_medio_inicial_g"]) * ciclo["qtd_alevinos"] / 1000
            ganho = biomassa_kg - biomassa_inicial
            ica = round(total_racao / ganho, 3) if ganho > 0 and total_racao > 0 else None

            cur.execute("""
                INSERT INTO biometrias_piscicultura
                    (ciclo_id, data_biometria, qtd_amostrada, peso_total_amostra_g,
                     biomassa_estimada_kg, ica_acumulado, tecnico_responsavel, observacoes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                data.ciclo_id, data.data_biometria, data.qtd_amostrada,
                float(data.peso_total_amostra_g), biomassa_kg, ica,
                data.tecnico_responsavel, data.observacoes,
            ))
            row = cur.fetchone()
            conn.commit()
        return BiometriaResponse(**dict(row))
    finally:
        conn.close()


@router.get("/biometrias/{ciclo_id}", response_model=List[BiometriaResponse])
def listar_biometrias(ciclo_id: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM biometrias_piscicultura
                WHERE ciclo_id = %s ORDER BY data_biometria ASC
            """, (ciclo_id,))
            return [BiometriaResponse(**dict(r)) for r in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────
# REGISTROS DIÁRIOS
# ─────────────────────────────────────────


@router.get("/preco-medio-racao/{ciclo_id}")
def preco_medio_racao(ciclo_id: int):
    """PMP da racao = soma(valor_total) / soma(quantidade_kg) das compras do ciclo."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT
                    COALESCE(SUM(valor_total), 0) as total_valor,
                    COALESCE(SUM(quantidade), 0)  as total_kg,
                    COUNT(*) as qtd_compras
                FROM compras_insumos_piscicultura
                WHERE ciclo_id = %s AND tipo_insumo = 'racao' AND quantidade > 0
            """, (ciclo_id,))
            row = cur.fetchone()
        total_valor = float(row["total_valor"] or 0)
        total_kg    = float(row["total_kg"] or 0)
        pmp = round(total_valor / total_kg, 4) if total_kg > 0 else None
        return {
            "ciclo_id": ciclo_id,
            "preco_medio_kg": pmp,
            "total_valor": total_valor,
            "total_kg": total_kg,
            "qtd_compras": int(row["qtd_compras"] or 0),
            "tem_dados": pmp is not None,
        }
    finally:
        conn.close()

@router.post("/registros-diarios", response_model=RegistroDiarioResponse, status_code=201)
def registrar_dia(data: RegistroDiarioCreate):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, nome_ciclo FROM ciclos_piscicultura
                WHERE id = %s AND status = 'ativo'
            """, (data.ciclo_id,))
            ciclo = cur.fetchone()
            if not ciclo:
                raise HTTPException(404, "Ciclo ativo não encontrado")

            # Gera alertas automáticos
            alertas = _gerar_alertas_agua(data.dict())
            alertas_str = " | ".join(alertas) if alertas else None

            # Se este dia já existe, estorna a baixa de ração anterior antes de
            # recalcular — evita duplicar/errar o saldo do estoque em reedições.
            cur.execute("""
                SELECT movimentacao_id FROM registros_diarios_piscicultura
                WHERE ciclo_id = %s AND data_registro = %s
            """, (data.ciclo_id, data.data_registro))
            existente = cur.fetchone()
            if existente and existente["movimentacao_id"]:
                estornar_movimentacao(
                    cur, FAZENDA_ID, existente["movimentacao_id"],
                    motivo=f"Reedição do registro diário de {data.data_registro}",
                )

            custo_racao_dia = float(data.custo_racao_dia) if data.custo_racao_dia else None
            movimentacao_id = None

            # Baixa automática de ração no estoque geral (PMP global), se ligado a um insumo
            if data.insumo_racao_id and data.racao_kg and float(data.racao_kg) > 0:
                resultado = aplicar_movimentacao_insumo(
                    cur, fazenda_id=FAZENDA_ID, insumo_id=data.insumo_racao_id,
                    tipo="uso", quantidade=float(data.racao_kg),
                    origem_modulo="piscicultura", origem_tipo="ciclo", origem_id=data.ciclo_id,
                    origem_descricao=f"Ciclo #{data.ciclo_id} — {ciclo['nome_ciclo']}",
                    observacao=f"Ração do dia {data.data_registro}", data_movim=data.data_registro,
                )
                movimentacao_id = resultado["movimentacao_id"]
                # Custo do dia passa a vir do PMP vigente, não de preço digitado manualmente
                custo_racao_dia = resultado["custo_total"]

            cur.execute("""
                INSERT INTO registros_diarios_piscicultura
                    (ciclo_id, data_registro, racao_kg, tipo_racao, custo_racao_dia,
                     preco_kg_racao, mortalidade_qtd, mortalidade_causa,
                     oxigenio_dissolvido, ph, temperatura_c, transparencia_secchi_cm, alertas,
                     insumo_racao_id, movimentacao_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (ciclo_id, data_registro) DO UPDATE SET
                    racao_kg = EXCLUDED.racao_kg,
                    tipo_racao = EXCLUDED.tipo_racao,
                    custo_racao_dia = EXCLUDED.custo_racao_dia,
                    preco_kg_racao = EXCLUDED.preco_kg_racao,
                    mortalidade_qtd = EXCLUDED.mortalidade_qtd,
                    mortalidade_causa = EXCLUDED.mortalidade_causa,
                    oxigenio_dissolvido = EXCLUDED.oxigenio_dissolvido,
                    ph = EXCLUDED.ph,
                    temperatura_c = EXCLUDED.temperatura_c,
                    transparencia_secchi_cm = EXCLUDED.transparencia_secchi_cm,
                    alertas = EXCLUDED.alertas,
                    insumo_racao_id = EXCLUDED.insumo_racao_id,
                    movimentacao_id = EXCLUDED.movimentacao_id
                RETURNING *
            """, (
                data.ciclo_id, data.data_registro,
                float(data.racao_kg) if data.racao_kg else None,
                data.tipo_racao,
                custo_racao_dia,
                float(data.preco_kg_racao) if data.preco_kg_racao else None,
                data.mortalidade_qtd, data.mortalidade_causa,
                float(data.oxigenio_dissolvido) if data.oxigenio_dissolvido else None,
                float(data.ph) if data.ph else None,
                float(data.temperatura_c) if data.temperatura_c else None,
                data.transparencia_secchi_cm,
                alertas_str,
                data.insumo_racao_id, movimentacao_id,
            ))
            row = cur.fetchone()
            conn.commit()

            # Alerta (não persistido) comparando o tipo_racao lançado com a fase
            # esperada pelo peso médio da última biometria do ciclo
            cur.execute("""
                SELECT peso_medio_g FROM biometrias_piscicultura
                WHERE ciclo_id = %s ORDER BY data_biometria DESC LIMIT 1
            """, (data.ciclo_id,))
            ult_bio = cur.fetchone()
            peso_medio_atual = float(ult_bio["peso_medio_g"]) if ult_bio and ult_bio["peso_medio_g"] else None

        row = dict(row)
        row["alerta_racao"] = _alerta_racao_divergente(data.tipo_racao, peso_medio_atual)
        return RegistroDiarioResponse(**row)
    finally:
        conn.close()


@router.get("/registros-diarios/{ciclo_id}", response_model=List[RegistroDiarioResponse])
def listar_registros_diarios(
    ciclo_id: int,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            where = ["ciclo_id = %s"]
            params = [ciclo_id]
            if data_inicio:
                where.append("data_registro >= %s"); params.append(data_inicio)
            if data_fim:
                where.append("data_registro <= %s"); params.append(data_fim)

            cur.execute(f"""
                SELECT * FROM registros_diarios_piscicultura
                WHERE {' AND '.join(where)}
                ORDER BY data_registro DESC
            """, tuple(params))
            return [RegistroDiarioResponse(**dict(r)) for r in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────
# COMPRAS DE INSUMOS
# ─────────────────────────────────────────

@router.post("/compras-insumos", response_model=CompraInsumoResponse, status_code=201)
def registrar_compra_insumo(data: CompraInsumoCreate):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT c.id, c.imovel_id, c.produtor_id, c.nome_ciclo, c.especie
                FROM ciclos_piscicultura c WHERE c.id = %s
            """, (data.ciclo_id,))
            ciclo = cur.fetchone()
            if not ciclo:
                raise HTTPException(404, "Ciclo não encontrado")

            cur.execute("""
                INSERT INTO compras_insumos_piscicultura
                    (ciclo_id, data_compra, tipo_insumo, descricao,
                     quantidade, unidade, valor_total, fornecedor, nota_fiscal, insumo_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                data.ciclo_id, data.data_compra, data.tipo_insumo.value,
                data.descricao,
                float(data.quantidade) if data.quantidade else None,
                data.unidade, float(data.valor_total),
                data.fornecedor, data.nota_fiscal, data.insumo_id,
            ))
            row = dict(cur.fetchone())

            # Entrada no estoque geral de Insumos (PMP global), se ligado a um insumo do catálogo
            if data.insumo_id and data.quantidade:
                custo_unitario = float(data.valor_total) / float(data.quantidade)
                resultado = aplicar_movimentacao_insumo(
                    cur, fazenda_id=FAZENDA_ID, insumo_id=data.insumo_id,
                    tipo="compra", quantidade=float(data.quantidade),
                    custo_unitario=custo_unitario,
                    origem_modulo="piscicultura", origem_tipo="ciclo", origem_id=data.ciclo_id,
                    origem_descricao=f"Ciclo #{data.ciclo_id} — {ciclo['nome_ciclo']}",
                    observacao=f"Compra: {data.descricao}", data_movim=data.data_compra,
                )
                cur.execute("""
                    UPDATE compras_insumos_piscicultura SET movimentacao_id = %s WHERE id = %s
                """, (resultado["movimentacao_id"], row["id"]))
                row["movimentacao_id"] = resultado["movimentacao_id"]
        conn.commit()

        # Gera lançamento LCDPR automaticamente
        descricao_lcdpr = (
            f"Piscicultura — {data.tipo_insumo.value.capitalize()}: "
            f"{data.descricao} — {ciclo['nome_ciclo']}"
        )
        lancamento_id = _criar_lancamento_lcdpr(
            conn, ciclo["imovel_id"], ciclo["produtor_id"],
            data.data_compra, "despesa",
            data.valor_total, descricao_lcdpr,
            f"piscicultura_{data.tipo_insumo.value}"
        )

        if lancamento_id:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE compras_insumos_piscicultura
                    SET lancamento_id = %s WHERE id = %s
                """, (lancamento_id, row["id"]))
                conn.commit()
            row["lancamento_id"] = lancamento_id

        return CompraInsumoResponse(**row)
    finally:
        conn.close()


@router.get("/compras-insumos/{ciclo_id}", response_model=List[CompraInsumoResponse])
def listar_compras_insumos(ciclo_id: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM compras_insumos_piscicultura
                WHERE ciclo_id = %s ORDER BY data_compra DESC
            """, (ciclo_id,))
            return [CompraInsumoResponse(**dict(r)) for r in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────
# DESPESCAS / VENDAS
# ─────────────────────────────────────────

@router.post("/despescas", response_model=DespescaResponse, status_code=201)
def registrar_despesca(data: DespescaCreate):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, imovel_id, produtor_id, nome_ciclo, especie, status
                FROM ciclos_piscicultura WHERE id = %s
            """, (data.ciclo_id,))
            ciclo = cur.fetchone()
            if not ciclo:
                raise HTTPException(404, "Ciclo não encontrado")
            if ciclo["status"] not in ("ativo",):
                raise HTTPException(400, "Ciclo não está ativo")

            valor_total = float(data.peso_total_kg) * float(data.preco_kg)

            cur.execute("""
                INSERT INTO despescas_piscicultura
                    (ciclo_id, data_despesca, tipo, qtd_peixes_vendidos,
                     peso_total_kg, preco_kg, comprador, nota_fiscal, observacoes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                data.ciclo_id, data.data_despesca, data.tipo.value,
                data.qtd_peixes_vendidos,
                float(data.peso_total_kg), float(data.preco_kg),
                data.comprador, data.nota_fiscal, data.observacoes,
            ))
            row = dict(cur.fetchone())

            # Se despesca total, encerra o ciclo
            if data.tipo.value == "total":
                cur.execute("""
                    UPDATE ciclos_piscicultura
                    SET status = 'encerrado', data_despesca_real = %s, updated_at = NOW()
                    WHERE id = %s
                """, (data.data_despesca, data.ciclo_id))

            conn.commit()

        # Gera lançamento LCDPR de receita
        descricao_lcdpr = (
            f"Venda de peixes — {ciclo['especie']} "
            f"{float(data.peso_total_kg):.1f} kg × R$ {float(data.preco_kg):.2f}/kg "
            f"— {ciclo['nome_ciclo']}"
        )
        lancamento_id = _criar_lancamento_lcdpr(
            conn, ciclo["imovel_id"], ciclo["produtor_id"],
            data.data_despesca, "receita",
            Decimal(str(valor_total)), descricao_lcdpr,
            "piscicultura_venda"
        )

        if lancamento_id:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE despescas_piscicultura
                    SET lancamento_id = %s WHERE id = %s
                """, (lancamento_id, row["id"]))
                conn.commit()
            row["lancamento_id"] = lancamento_id

        return DespescaResponse(**row)
    finally:
        conn.close()


@router.get("/despescas/{ciclo_id}", response_model=List[DespescaResponse])
def listar_despescas(ciclo_id: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM despescas_piscicultura
                WHERE ciclo_id = %s ORDER BY data_despesca DESC
            """, (ciclo_id,))
            return [DespescaResponse(**dict(r)) for r in cur.fetchall()]
    finally:
        conn.close()


# ─────────────────────────────────────────
# DASHBOARD DO CICLO
# ─────────────────────────────────────────

@router.get("/dashboard/{ciclo_id}", response_model=DashboardCiclo)
def dashboard_ciclo(ciclo_id: int):
    """Retorna todos os indicadores econômicos e zootécnicos do ciclo."""
    ciclo = buscar_ciclo(ciclo_id)
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Totais de ração e custo
            cur.execute("""
                SELECT COALESCE(SUM(racao_kg),0) as total_racao,
                       COALESCE(SUM(custo_racao_dia),0) as custo_racao
                FROM registros_diarios_piscicultura WHERE ciclo_id = %s
            """, (ciclo_id,))
            r = cur.fetchone()
            total_racao_kg = Decimal(str(r["total_racao"]))
            custo_racao = Decimal(str(r["custo_racao"]))

            # Insumos por tipo
            cur.execute("""
                SELECT tipo_insumo, COALESCE(SUM(valor_total),0) as total
                FROM compras_insumos_piscicultura WHERE ciclo_id = %s
                GROUP BY tipo_insumo
            """, (ciclo_id,))
            insumos = {row["tipo_insumo"]: Decimal(str(row["total"])) for row in cur.fetchall()}
            custo_alevinos = insumos.get("alevinos", Decimal("0"))
            custo_outros = sum(v for k, v in insumos.items() if k != "alevinos" and k != "racao")

            # Receitas realizadas
            cur.execute("""
                SELECT COALESCE(SUM(valor_total),0) as total_receita
                FROM despescas_piscicultura WHERE ciclo_id = %s
            """, (ciclo_id,))
            receita_realizada = Decimal(str(cur.fetchone()["total_receita"]))

            # Registros recentes (7 dias)
            cur.execute("""
                SELECT * FROM registros_diarios_piscicultura
                WHERE ciclo_id = %s AND data_registro >= %s
                ORDER BY data_registro DESC
            """, (ciclo_id, date.today() - timedelta(days=7)))
            registros_recentes = [RegistroDiarioResponse(**dict(r)) for r in cur.fetchall()]

            # Mortalidade
            cur.execute("""
                SELECT COALESCE(SUM(mortalidade_qtd),0) as total_mortes
                FROM registros_diarios_piscicultura WHERE ciclo_id = %s
            """, (ciclo_id,))
            mortalidade_acumulada = int(cur.fetchone()["total_mortes"])

            # Última biometria (peso médio atual real do lote)
            cur.execute("""
                SELECT peso_medio_g FROM biometrias_piscicultura
                WHERE ciclo_id = %s ORDER BY data_biometria DESC LIMIT 1
            """, (ciclo_id,))
            ultima_bio_row = cur.fetchone()
            peso_medio_atual = ultima_bio_row["peso_medio_g"] if ultima_bio_row else None

        estoque_vivo = max(0, ciclo.qtd_alevinos - mortalidade_acumulada)
        mortalidade_perc = (
            Decimal(str(mortalidade_acumulada)) / Decimal(str(ciclo.qtd_alevinos)) * 100
        ).quantize(Decimal("0.01")) if ciclo.qtd_alevinos else Decimal("0")

        biomassa_atual_kg = None
        if ciclo.biomassa_atual_kg:
            biomassa_atual_kg = ciclo.biomassa_atual_kg
        elif peso_medio_atual and estoque_vivo:
            biomassa_atual_kg = (Decimal(str(peso_medio_atual)) * estoque_vivo / 1000).quantize(Decimal("0.01"))

        # Custo total
        custo_total = custo_racao + custo_alevinos + custo_outros

        # Custo por kg (baseado na biomassa atual)
        custo_por_kg = None
        if biomassa_atual_kg and biomassa_atual_kg > 0:
            custo_por_kg = (custo_total / biomassa_atual_kg).quantize(Decimal("0.01"))

        # Receita projetada
        receita_projetada = None
        lucro_estimado = None
        margem_perc = None
        if biomassa_atual_kg and ciclo.meta_preco_venda_kg:
            receita_projetada = (biomassa_atual_kg * ciclo.meta_preco_venda_kg).quantize(Decimal("0.01"))
            lucro_estimado = (receita_projetada - custo_total).quantize(Decimal("0.01"))
            if receita_projetada > 0:
                margem_perc = (lucro_estimado / receita_projetada * 100).quantize(Decimal("0.01"))

        dias_em_producao = (date.today() - ciclo.data_povoamento).days

        # Alertas ativos
        alertas = []
        if mortalidade_perc > 15:
            alertas.append(f"🚨 Mortalidade acima de 15% ({mortalidade_perc}%) — investigar causa")
        if ciclo.ica_atual and ciclo.ica_atual > 2.5:
            alertas.append(f"⚠️ ICA alto = {ciclo.ica_atual} — revisar manejo alimentar")
        if ciclo.data_despesca_prevista and date.today() > ciclo.data_despesca_prevista:
            alertas.append("📅 Prazo de despesca prevista já ultrapassado")
        if biomassa_atual_kg and biomassa_atual_kg > 0 and custo_racao > 0 and ciclo.meta_preco_venda_kg:
            custo_racao_kg = (custo_racao / biomassa_atual_kg).quantize(Decimal("0.01"))
            if custo_racao_kg > 0:
                relacao_peixe_racao = (ciclo.meta_preco_venda_kg / custo_racao_kg).quantize(Decimal("0.01"))
                if relacao_peixe_racao < Decimal("1.25"):
                    alertas.append(
                        f"💰 Relação peixe-ração inviável = {relacao_peixe_racao} "
                        f"(1 kg vendido paga só {relacao_peixe_racao} kg de ração) — revisar preço ou custo de ração"
                    )
                elif relacao_peixe_racao < Decimal("1.50"):
                    alertas.append(
                        f"💰 Relação peixe-ração abaixo do satisfatório = {relacao_peixe_racao} — margem apertada"
                    )

        racao_ultimo_dia = float(registros_recentes[0].racao_kg) if registros_recentes and registros_recentes[0].racao_kg else None
        aeracao = _calcular_aeracao_recomendada(
            ciclo.sistema, float(ciclo.area_ha) if ciclo.area_ha else None,
            float(biomassa_atual_kg) if biomassa_atual_kg else None, racao_ultimo_dia,
        )

        return DashboardCiclo(
            ciclo=ciclo,
            estoque_vivo=estoque_vivo,
            mortalidade_acumulada=mortalidade_acumulada,
            mortalidade_perc=mortalidade_perc,
            peso_medio_atual_g=peso_medio_atual,
            biomassa_atual_kg=biomassa_atual_kg,
            ica_atual=ciclo.ica_atual,
            dias_em_producao=dias_em_producao,
            total_racao_kg=total_racao_kg,
            custo_racao_total=custo_racao,
            custo_alevinos=custo_alevinos,
            custo_outros_insumos=custo_outros,
            custo_total=custo_total,
            custo_por_kg_estimado=custo_por_kg,
            receita_realizada=receita_realizada,
            receita_projetada=receita_projetada,
            lucro_estimado=lucro_estimado,
            margem_estimada_perc=margem_perc,
            registros_recentes=registros_recentes,
            alertas=alertas,
            sugestao_racao=_sugestao_racao(peso_medio_atual),
            aeracao_recomendada=aeracao,
        )
    finally:
        conn.close()


# ── WEBHOOK WHATSAPP/TELEGRAM (IA) ──────────────────────────────────────────

class WhatsAppMensagemPiscicultura(BaseModel):
    telefone: str
    tipo_midia: str = "texto"
    conteudo: str
    imovel_id: Optional[int] = None


_TIPO_INSUMO_MAP = {
    "racao": "racao", "ração": "racao", "alevino": "alevinos", "alevinos": "alevinos",
    "cal": "cal", "calcario": "calcario", "calcário": "calcario",
    "medicamento": "medicamento", "aerador": "aerador",
}


def _ciclo_ativo_do_imovel(cur, imovel_id: int) -> Optional[dict]:
    cur.execute("""
        SELECT id, nome_ciclo FROM ciclos_piscicultura
        WHERE imovel_id = %s AND status = 'ativo'
        ORDER BY created_at DESC LIMIT 1
    """, (imovel_id,))
    row = cur.fetchone()
    return dict(row) if row else None


@router.post("/webhook-whatsapp")
def webhook_whatsapp_piscicultura(payload: WhatsAppMensagemPiscicultura):
    from app.services.piscicultura_ia import classificar_mensagem_sync

    classificacao = classificar_mensagem_sync(texto=payload.conteudo, imovel_id=payload.imovel_id)
    intent = classificacao["intent"]
    entidades = classificacao["entidades"]
    confianca = classificacao["confianca"]
    resumo = classificacao["resumo"]
    evento_id = None
    evento_tab = None
    status_log = "processado"
    erro_msg = None

    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        ciclo = _ciclo_ativo_do_imovel(cur, payload.imovel_id) if payload.imovel_id else None

        if confianca >= 0.5 and ciclo:
            ciclo_id = ciclo["id"]

            if intent == "registro_diario":
                alertas = _gerar_alertas_agua(entidades)
                alertas_str = " | ".join(alertas) if alertas else None
                cur.execute("""
                    INSERT INTO registros_diarios_piscicultura
                        (ciclo_id, data_registro, racao_kg, tipo_racao, mortalidade_qtd,
                         mortalidade_causa, oxigenio_dissolvido, ph, temperatura_c,
                         transparencia_secchi_cm, alertas)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (ciclo_id, data_registro) DO UPDATE SET
                        racao_kg = COALESCE(EXCLUDED.racao_kg, registros_diarios_piscicultura.racao_kg),
                        mortalidade_qtd = COALESCE(EXCLUDED.mortalidade_qtd, registros_diarios_piscicultura.mortalidade_qtd),
                        oxigenio_dissolvido = COALESCE(EXCLUDED.oxigenio_dissolvido, registros_diarios_piscicultura.oxigenio_dissolvido),
                        ph = COALESCE(EXCLUDED.ph, registros_diarios_piscicultura.ph),
                        temperatura_c = COALESCE(EXCLUDED.temperatura_c, registros_diarios_piscicultura.temperatura_c),
                        transparencia_secchi_cm = COALESCE(EXCLUDED.transparencia_secchi_cm, registros_diarios_piscicultura.transparencia_secchi_cm),
                        alertas = COALESCE(EXCLUDED.alertas, registros_diarios_piscicultura.alertas)
                    RETURNING id
                """, (
                    ciclo_id, entidades.get("data_evento"), entidades.get("racao_kg"),
                    entidades.get("tipo_racao"), entidades.get("mortalidade_qtd"),
                    entidades.get("mortalidade_causa"), entidades.get("oxigenio_dissolvido"),
                    entidades.get("ph"), entidades.get("temperatura_c"),
                    entidades.get("transparencia_secchi_cm"), alertas_str,
                ))
                evento_id = cur.fetchone()["id"]
                evento_tab = "registros_diarios_piscicultura"
                if alertas:
                    resumo = resumo + " ⚠️ " + " | ".join(alertas)

            elif intent == "biometria":
                qtd = entidades.get("qtd_amostrada")
                peso_medio = entidades.get("peso_medio_g")
                if qtd and peso_medio:
                    peso_total_amostra = float(peso_medio) * int(qtd)
                    cur.execute("""
                        INSERT INTO biometrias_piscicultura
                            (ciclo_id, data_biometria, qtd_amostrada, peso_total_amostra_g,
                             peso_medio_g, tecnico_responsavel)
                        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id
                    """, (ciclo_id, entidades.get("data_evento"), qtd, peso_total_amostra,
                          peso_medio, entidades.get("tecnico_responsavel")))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "biometrias_piscicultura"
                else:
                    status_log = "pendente"
                    resumo = "Entendi que é uma biometria, mas faltou a quantidade de peixes pesados ou o peso médio."

            elif intent == "compra_insumo":
                valor_total = entidades.get("valor_total")
                if valor_total:
                    tipo_raw = (entidades.get("tipo_insumo") or "outro").lower()
                    tipo_insumo = _TIPO_INSUMO_MAP.get(tipo_raw, "outro")
                    cur.execute("""
                        INSERT INTO compras_insumos_piscicultura
                            (ciclo_id, data_compra, tipo_insumo, descricao, quantidade,
                             unidade, valor_total, fornecedor)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
                    """, (ciclo_id, entidades.get("data_evento"), tipo_insumo,
                          entidades.get("descricao", tipo_raw), entidades.get("quantidade"),
                          entidades.get("unidade"), valor_total, entidades.get("fornecedor")))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "compras_insumos_piscicultura"
                else:
                    status_log = "pendente"
                    resumo = "Entendi que foi uma compra, mas não identifiquei o valor. Pode informar o valor total?"

            elif intent == "despesca":
                peso_total_kg = entidades.get("peso_total_kg")
                preco_kg = entidades.get("preco_kg")
                valor_total = entidades.get("valor_total")
                if peso_total_kg and not preco_kg and valor_total:
                    preco_kg = float(valor_total) / float(peso_total_kg)
                if peso_total_kg and preco_kg:
                    cur.execute("""
                        INSERT INTO despescas_piscicultura
                            (ciclo_id, data_despesca, tipo, qtd_peixes_vendidos,
                             peso_total_kg, preco_kg, comprador)
                        VALUES (%s,%s,'parcial',%s,%s,%s,%s) RETURNING id
                    """, (ciclo_id, entidades.get("data_evento"), entidades.get("qtd_peixes_vendidos"),
                          peso_total_kg, preco_kg, entidades.get("comprador")))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "despescas_piscicultura"
                    resumo = (
                        f"✅ Despesca registrada: {float(peso_total_kg):,.1f} kg a "
                        f"R$ {float(preco_kg):,.2f}/kg (total R$ {float(peso_total_kg) * float(preco_kg):,.2f})"
                    )
                else:
                    status_log = "pendente"
                    resumo = "Entendi que foi uma despesca, mas faltou o peso total ou o preço/valor. Pode completar?"

            else:
                status_log = "ignorado"

        elif confianca >= 0.5 and not ciclo:
            status_log = "pendente"
            resumo = "Não encontrei um ciclo de piscicultura ativo neste imóvel. Cadastre um ciclo antes de lançar eventos."

        elif confianca < 0.5:
            status_log = "pendente"
            resumo = "Não entendi bem. Pode repetir com mais detalhes?"
        else:
            status_log = "ignorado"

        conn.commit()

    except Exception as e:
        conn.rollback()
        status_log = "erro"
        erro_msg = str(e)
        resumo = "Erro ao salvar. Tente novamente."
        logger.error("webhook_piscicultura erro: %s", e, exc_info=True)

    # Log da mensagem
    try:
        import json as _json
        cur2 = conn.cursor()
        cur2.execute("""
            INSERT INTO piscicultura_whatsapp_log
                (telefone, tipo_midia, conteudo_raw, intent_detectada,
                 entidades_json, status, evento_id, evento_tabela, erro_msg)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
        """, (payload.telefone, payload.tipo_midia, payload.conteudo[:2000],
              intent, _json.dumps(entidades, default=str),
              status_log, evento_id, evento_tab, erro_msg))
        conn.commit()
    except Exception as e:
        logger.warning("Falha ao salvar log WhatsApp piscicultura: %s", e)
    finally:
        conn.close()

    return {
        "intent": intent,
        "confianca": confianca,
        "status": status_log,
        "resumo": resumo,
        "evento_id": evento_id,
        "evento_tabela": evento_tab,
    }
