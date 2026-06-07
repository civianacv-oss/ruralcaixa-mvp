"""
Router FastAPI — Módulo Piscicultura
RuralCaixa MVP
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
import psycopg2
from psycopg2.extras import RealDictCursor
import sys, os
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

router = APIRouter(prefix="/piscicultura", tags=["Piscicultura"])


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

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
            cur.execute("SELECT id FROM ciclos_piscicultura WHERE id = %s AND status = 'ativo'", (data.ciclo_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Ciclo ativo não encontrado")

            # Gera alertas automáticos
            alertas = _gerar_alertas_agua(data.dict())
            alertas_str = " | ".join(alertas) if alertas else None

            cur.execute("""
                INSERT INTO registros_diarios_piscicultura
                    (ciclo_id, data_registro, racao_kg, tipo_racao, custo_racao_dia,
                     preco_kg_racao, mortalidade_qtd, mortalidade_causa,
                     oxigenio_dissolvido, ph, temperatura_c, transparencia_secchi_cm, alertas)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
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
                    alertas = EXCLUDED.alertas
                RETURNING *
            """, (
                data.ciclo_id, data.data_registro,
                float(data.racao_kg) if data.racao_kg else None,
                data.tipo_racao,
                float(data.custo_racao_dia) if data.custo_racao_dia else None,
                float(data.preco_kg_racao) if data.preco_kg_racao else None,
                data.mortalidade_qtd, data.mortalidade_causa,
                float(data.oxigenio_dissolvido) if data.oxigenio_dissolvido else None,
                float(data.ph) if data.ph else None,
                float(data.temperatura_c) if data.temperatura_c else None,
                data.transparencia_secchi_cm,
                alertas_str,
            ))
            row = cur.fetchone()
            conn.commit()
        return RegistroDiarioResponse(**dict(row))
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
                     quantidade, unidade, valor_total, fornecedor, nota_fiscal)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                data.ciclo_id, data.data_compra, data.tipo_insumo.value,
                data.descricao,
                float(data.quantidade) if data.quantidade else None,
                data.unidade, float(data.valor_total),
                data.fornecedor, data.nota_fiscal,
            ))
            row = dict(cur.fetchone())
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

        estoque_vivo = max(0, ciclo.qtd_alevinos - mortalidade_acumulada)
        mortalidade_perc = (
            Decimal(str(mortalidade_acumulada)) / Decimal(str(ciclo.qtd_alevinos)) * 100
        ).quantize(Decimal("0.01")) if ciclo.qtd_alevinos else Decimal("0")

        # Última biometria
        ultima_bio = None
        peso_medio_atual = None
        biomassa_atual_kg = None
        if ciclo.biomassa_atual_kg:
            biomassa_atual_kg = ciclo.biomassa_atual_kg

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
        )
    finally:
        conn.close()
