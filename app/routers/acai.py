"""
RuralCaixa — routers/acai.py
Módulo Cultivo de Açaí (atividade rural — Livro Caixa / LCDPR).

Adicione em app/main.py:
    from app.routers.acai import router as acai_router
    if acai_router: app.include_router(acai_router)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import date, datetime
import psycopg2
import psycopg2.extras
import logging

from app.services.estoque_insumos import aplicar_movimentacao_insumo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/acai", tags=["Acai"])
FAZENDA_ID = 1  # MVP: fazenda_id fixo, mesmo padrão de app/routers/insumos.py

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ─────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────

class TalhaoCreate(BaseModel):
    imovel_id: int
    nome: str
    area_ha: float
    sistema: Literal["varzea", "terra_firme", "igapo", "outro"] = "varzea"
    especie: Literal["euterpe_oleracea", "euterpe_precatoria", "outro"] = "euterpe_oleracea"
    data_plantio: Optional[date] = None
    espacamento_m: Optional[float] = None
    num_plantas: Optional[int] = None
    fase: Literal["implantacao", "crescimento", "producao", "reforma", "abandonado"] = "implantacao"
    observacoes: Optional[str] = None

class TalhaoUpdate(BaseModel):
    nome: Optional[str] = None
    area_ha: Optional[float] = None
    sistema: Optional[Literal["varzea", "terra_firme", "igapo", "outro"]] = None
    especie: Optional[Literal["euterpe_oleracea", "euterpe_precatoria", "outro"]] = None
    data_plantio: Optional[date] = None
    espacamento_m: Optional[float] = None
    num_plantas: Optional[int] = None
    fase: Optional[Literal["implantacao", "crescimento", "producao", "reforma", "abandonado"]] = None
    observacoes: Optional[str] = None
    ativo: Optional[bool] = None

class SafraCreate(BaseModel):
    imovel_id: int
    talhao_id: int
    data_colheita: date = Field(default_factory=date.today)
    quantidade_kg: float
    preco_kg: float
    comprador: Optional[str] = None
    tipo_venda: Literal["in_natura", "polpa", "cooperativa", "industria", "outro"] = "in_natura"
    nota_fiscal: Optional[str] = None
    observacoes: Optional[str] = None

class InsumoCreate(BaseModel):
    imovel_id: int
    talhao_id: Optional[int] = None
    data_lancamento: date = Field(default_factory=date.today)
    descricao: str
    categoria: Literal["insumo", "mao_de_obra", "maquinario", "frete", "irrigacao", "outros"] = "insumo"
    quantidade: Optional[float] = None
    unidade: Optional[str] = None
    valor_unitario: Optional[float] = None
    valor_total: Optional[float] = None
    observacoes: Optional[str] = None
    insumo_id: Optional[int] = None


# ─────────────────────────────────────────────────────────────
# TALHÕES
# ─────────────────────────────────────────────────────────────

@router.post("/talhoes", status_code=201)
def criar_talhao(dados: TalhaoCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO acai_talhoes
                (imovel_id, nome, area_ha, sistema, especie, data_plantio,
                 espacamento_m, num_plantas, fase, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (dados.imovel_id, dados.nome, dados.area_ha, dados.sistema,
              dados.especie, dados.data_plantio, dados.espacamento_m,
              dados.num_plantas, dados.fase, dados.observacoes))
        tid = cur.fetchone()["id"]
        conn.commit()
        return {"id": tid}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/talhoes")
def listar_talhoes(imovel_id: int = Query(...), apenas_ativos: bool = Query(default=True)):
    conn = get_db()
    try:
        cur = conn.cursor()
        filtro = "WHERE t.imovel_id = %s"
        params = [imovel_id]
        if apenas_ativos:
            filtro += " AND t.ativo = TRUE"
        cur.execute(f"""
            SELECT
                t.*,
                COALESCE(SUM(s.quantidade_kg), 0)   AS total_kg_colhido,
                COALESCE(SUM(s.valor_total), 0)      AS receita_total,
                COUNT(s.id)                          AS num_colheitas,
                CASE WHEN t.area_ha > 0 AND SUM(s.quantidade_kg) > 0
                     THEN ROUND(SUM(s.quantidade_kg) / t.area_ha, 2)
                     ELSE 0 END                      AS produtividade_kg_ha,
                (CURRENT_DATE - t.data_plantio)      AS dias_desde_plantio
            FROM acai_talhoes t
            LEFT JOIN acai_safras s ON s.talhao_id = t.id
            {filtro}
            GROUP BY t.id
            ORDER BY t.nome
        """, params)
        return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.patch("/talhoes/{talhao_id}")
def atualizar_talhao(talhao_id: int, dados: TalhaoUpdate):
    conn = get_db()
    try:
        cur = conn.cursor()
        campos = {k: v for k, v in dados.dict().items() if v is not None}
        if not campos:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar.")
        set_clause = ", ".join(f"{k} = %s" for k in campos)
        cur.execute(f"UPDATE acai_talhoes SET {set_clause} WHERE id = %s",
                    list(campos.values()) + [talhao_id])
        conn.commit()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# SAFRAS / COLHEITAS
# ─────────────────────────────────────────────────────────────

@router.post("/safras", status_code=201)
def registrar_safra(dados: SafraCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        valor_total = round(dados.quantidade_kg * dados.preco_kg, 2)
        cur.execute("""
            INSERT INTO acai_safras
                (imovel_id, talhao_id, data_colheita, quantidade_kg, preco_kg,
                 valor_total, comprador, tipo_venda, nota_fiscal, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (dados.imovel_id, dados.talhao_id, dados.data_colheita,
              dados.quantidade_kg, dados.preco_kg, valor_total,
              dados.comprador, dados.tipo_venda, dados.nota_fiscal, dados.observacoes))
        sid = cur.fetchone()["id"]
        conn.commit()
        return {"id": sid, "valor_total": valor_total}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/safras")
def listar_safras(
    imovel_id: int = Query(...),
    talhao_id: Optional[int] = Query(default=None),
    ano: Optional[int] = Query(default=None),
    limit: int = Query(default=200),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        filtros = ["s.imovel_id = %s"]
        params: list = [imovel_id]
        if talhao_id:
            filtros.append("s.talhao_id = %s"); params.append(talhao_id)
        if ano:
            filtros.append("EXTRACT(YEAR FROM s.data_colheita) = %s"); params.append(ano)
        params.append(limit)
        cur.execute(f"""
            SELECT s.*, t.nome AS talhao_nome, t.area_ha,
                   ROUND(s.quantidade_kg / NULLIF(t.area_ha, 0), 2) AS kg_por_ha
            FROM acai_safras s
            JOIN acai_talhoes t ON t.id = s.talhao_id
            WHERE {' AND '.join(filtros)}
            ORDER BY s.data_colheita DESC
            LIMIT %s
        """, params)
        return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# INSUMOS E MANEJO
# ─────────────────────────────────────────────────────────────

@router.post("/insumos", status_code=201)
def registrar_insumo(dados: InsumoCreate):
    conn = get_db()
    try:
        cur = conn.cursor()

        valor_total = dados.valor_total
        movimentacao_id = None

        # Aplicação de insumo do catálogo geral: baixa automática pelo PMP global
        if dados.categoria == "insumo" and dados.insumo_id and dados.quantidade:
            resultado = aplicar_movimentacao_insumo(
                cur, fazenda_id=FAZENDA_ID, insumo_id=dados.insumo_id,
                tipo="uso", quantidade=float(dados.quantidade),
                origem_modulo="acai",
                origem_tipo="talhao" if dados.talhao_id else "imovel",
                origem_id=dados.talhao_id or dados.imovel_id,
                origem_descricao=f"Açaí — imóvel #{dados.imovel_id}"
                                  + (f" — talhão #{dados.talhao_id}" if dados.talhao_id else ""),
                observacao=dados.descricao, data_movim=dados.data_lancamento,
            )
            movimentacao_id = resultado["movimentacao_id"]
            valor_total = resultado["custo_total"]  # custo real pelo PMP vigente

        if valor_total is None:
            raise HTTPException(400, "Informe valor_total, ou insumo_id + quantidade para calcular pelo PMP.")

        cur.execute("""
            INSERT INTO acai_insumos
                (imovel_id, talhao_id, data_lancamento, descricao, categoria,
                 quantidade, unidade, valor_unitario, valor_total, observacoes,
                 insumo_id, movimentacao_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (dados.imovel_id, dados.talhao_id, dados.data_lancamento,
              dados.descricao, dados.categoria, dados.quantidade,
              dados.unidade, dados.valor_unitario, valor_total, dados.observacoes,
              dados.insumo_id, movimentacao_id))
        iid = cur.fetchone()["id"]
        conn.commit()
        return {"id": iid, "movimentacao_id": movimentacao_id, "valor_total": valor_total}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/insumos")
def listar_insumos(
    imovel_id: int = Query(...),
    talhao_id: Optional[int] = Query(default=None),
    ano: Optional[int] = Query(default=None),
    limit: int = Query(default=200),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        filtros = ["i.imovel_id = %s"]
        params: list = [imovel_id]
        if talhao_id:
            filtros.append("i.talhao_id = %s"); params.append(talhao_id)
        if ano:
            filtros.append("EXTRACT(YEAR FROM i.data_lancamento) = %s"); params.append(ano)
        params.append(limit)
        cur.execute(f"""
            SELECT i.*, t.nome AS talhao_nome
            FROM acai_insumos i
            LEFT JOIN acai_talhoes t ON t.id = i.talhao_id
            WHERE {' AND '.join(filtros)}
            ORDER BY i.data_lancamento DESC
            LIMIT %s
        """, params)
        return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# DASHBOARD / KPIs
# ─────────────────────────────────────────────────────────────

@router.get("/dashboard/{imovel_id}")
def dashboard(imovel_id: int, ano: Optional[int] = Query(default=None)):
    conn = get_db()
    try:
        cur = conn.cursor()
        ano_filtro = ano or datetime.now().year

        # Totais gerais de safra no ano
        cur.execute("""
            SELECT
                COALESCE(SUM(quantidade_kg), 0)  AS total_kg,
                COALESCE(SUM(valor_total), 0)    AS receita_bruta,
                COALESCE(AVG(preco_kg), 0)       AS preco_medio_kg,
                COUNT(*)                         AS num_colheitas
            FROM acai_safras
            WHERE imovel_id = %s AND EXTRACT(YEAR FROM data_colheita) = %s
        """, (imovel_id, ano_filtro))
        safra = dict(cur.fetchone())

        # Total de custos no ano
        cur.execute("""
            SELECT COALESCE(SUM(valor_total), 0) AS total_custos,
                   categoria, COALESCE(SUM(valor_total), 0) AS valor
            FROM acai_insumos
            WHERE imovel_id = %s AND EXTRACT(YEAR FROM data_lancamento) = %s
            GROUP BY categoria
        """, (imovel_id, ano_filtro))
        custos_rows = cur.fetchall()
        custos_por_cat = {r["categoria"]: float(r["valor"]) for r in custos_rows}
        total_custos = sum(custos_por_cat.values())

        # Área total ativa
        cur.execute("""
            SELECT COALESCE(SUM(area_ha), 0) AS area_total,
                   COUNT(*) AS num_talhoes
            FROM acai_talhoes
            WHERE imovel_id = %s AND ativo = TRUE
        """, (imovel_id,))
        area = dict(cur.fetchone())

        receita = float(safra["receita_bruta"])
        total_kg = float(safra["total_kg"])
        area_ha = float(area["area_total"])

        return {
            "ano": ano_filtro,
            "receita_bruta": round(receita, 2),
            "total_custos": round(total_custos, 2),
            "lucro_liquido": round(receita - total_custos, 2),
            "margem_pct": round((receita - total_custos) / receita * 100, 2) if receita > 0 else 0,
            "total_kg": round(total_kg, 2),
            "preco_medio_kg": round(float(safra["preco_medio_kg"]), 4),
            "num_colheitas": safra["num_colheitas"],
            "area_total_ha": round(area_ha, 4),
            "num_talhoes": area["num_talhoes"],
            "produtividade_kg_ha": round(total_kg / area_ha, 2) if area_ha > 0 else 0,
            "custo_por_kg": round(total_custos / total_kg, 4) if total_kg > 0 else 0,
            "custo_por_ha": round(total_custos / area_ha, 2) if area_ha > 0 else 0,
            "custos_por_categoria": custos_por_cat,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# PRODUTIVIDADE — comparativo por talhão e por ano
# ─────────────────────────────────────────────────────────────

@router.get("/produtividade/{imovel_id}")
def produtividade(imovel_id: int, anos: int = Query(default=3, ge=1, le=10)):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Por talhão (todos os anos)
        cur.execute("""
            SELECT
                t.id, t.nome AS talhao, t.area_ha, t.sistema, t.fase,
                EXTRACT(YEAR FROM s.data_colheita)::int AS ano,
                ROUND(SUM(s.quantidade_kg)::numeric, 2) AS total_kg,
                ROUND(SUM(s.valor_total)::numeric, 2)   AS receita,
                ROUND(AVG(s.preco_kg)::numeric, 4)      AS preco_medio,
                COUNT(s.id)                             AS colheitas,
                CASE WHEN t.area_ha > 0
                     THEN ROUND((SUM(s.quantidade_kg) / t.area_ha)::numeric, 2)
                     ELSE 0 END                         AS kg_por_ha
            FROM acai_talhoes t
            JOIN acai_safras s ON s.talhao_id = t.id
            WHERE t.imovel_id = %s
              AND s.data_colheita >= CURRENT_DATE - INTERVAL '%s years'
            GROUP BY t.id, t.nome, t.area_ha, t.sistema, t.fase,
                     EXTRACT(YEAR FROM s.data_colheita)
            ORDER BY t.nome, ano
        """, (imovel_id, anos))
        por_talhao = cur.fetchall()

        # Evolução mensal (últimos N anos)
        cur.execute("""
            SELECT
                TO_CHAR(data_colheita, 'YYYY-MM') AS mes,
                ROUND(SUM(quantidade_kg)::numeric, 2) AS total_kg,
                ROUND(SUM(valor_total)::numeric, 2)   AS receita
            FROM acai_safras
            WHERE imovel_id = %s
              AND data_colheita >= CURRENT_DATE - INTERVAL '%s years'
            GROUP BY mes ORDER BY mes
        """, (imovel_id, anos))
        evolucao = cur.fetchall()

        return {"por_talhao": por_talhao, "evolucao_mensal": evolucao}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# DRE RURAL — por ano
# ─────────────────────────────────────────────────────────────

@router.get("/dre/{imovel_id}")
def dre_rural(imovel_id: int, ano: Optional[int] = Query(default=None)):
    conn = get_db()
    try:
        cur = conn.cursor()
        ano_filtro = ano or datetime.now().year

        cur.execute("""
            SELECT COALESCE(SUM(valor_total), 0) AS receita_bruta,
                   COALESCE(SUM(quantidade_kg), 0) AS total_kg
            FROM acai_safras
            WHERE imovel_id = %s AND EXTRACT(YEAR FROM data_colheita) = %s
        """, (imovel_id, ano_filtro))
        safra = dict(cur.fetchone())

        cur.execute("""
            SELECT categoria, COALESCE(SUM(valor_total), 0) AS total
            FROM acai_insumos
            WHERE imovel_id = %s AND EXTRACT(YEAR FROM data_lancamento) = %s
            GROUP BY categoria ORDER BY total DESC
        """, (imovel_id, ano_filtro))
        custos_cat = {r["categoria"]: float(r["total"]) for r in cur.fetchall()}
        total_custos = sum(custos_cat.values())

        receita = float(safra["receita_bruta"])
        resultado = receita - total_custos

        return {
            "ano": ano_filtro,
            "receita_bruta": round(receita, 2),
            "total_kg": round(float(safra["total_kg"]), 2),
            "custos_por_categoria": custos_cat,
            "total_custos": round(total_custos, 2),
            "resultado_liquido": round(resultado, 2),
            "margem_pct": round(resultado / receita * 100, 2) if receita > 0 else 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
