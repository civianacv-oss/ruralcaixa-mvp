# routers/agricultura.py
# RuralCaixa -- Modulo Agricultura
# Sprint 1: safras + producao_agricola + DRE

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date
import psycopg2
import re

from app.db import get_db  # padrao ja usado no projeto

router = APIRouter(prefix="/agricultura", tags=["Agricultura"])


# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────

class SafraCreate(BaseModel):
    cultura: str
    ano_safra: str
    area_ha: float
    data_plantio: Optional[date] = None
    data_colheita_prevista: Optional[date] = None
    estimativa_producao_kg: Optional[float] = None
    custo_estimado: Optional[float] = None
    tipo_gestao: str = "propria"
    status: str = "planejada"
    cultura_normalizada: Optional[str] = None
    observacoes: Optional[str] = None

    @field_validator("ano_safra")
    @classmethod
    def validar_ano_safra(cls, v):
        if not re.match(r"^\d{4}(/\d{4})?$", v):
            raise ValueError("ano_safra deve ser '2026' ou '2025/2026'")
        return v

    @field_validator("tipo_gestao")
    @classmethod
    def validar_tipo_gestao(cls, v):
        validos = ("propria", "arrendada", "parceria")
        if v not in validos:
            raise ValueError(f"tipo_gestao deve ser: {validos}")
        return v

    @field_validator("status")
    @classmethod
    def validar_status(cls, v):
        validos = ("planejada", "em_andamento", "colhida", "encerrada")
        if v not in validos:
            raise ValueError(f"status deve ser: {validos}")
        return v

    @field_validator("area_ha")
    @classmethod
    def validar_area(cls, v):
        if v <= 0:
            raise ValueError("area_ha deve ser maior que 0")
        return v


class SafraUpdate(BaseModel):
    cultura: Optional[str] = None
    ano_safra: Optional[str] = None
    area_ha: Optional[float] = None
    data_plantio: Optional[date] = None
    data_colheita_prevista: Optional[date] = None
    data_colheita_real: Optional[date] = None
    estimativa_producao_kg: Optional[float] = None
    custo_estimado: Optional[float] = None
    tipo_gestao: Optional[str] = None
    observacoes: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validar_status(cls, v):
        validos = ("planejada", "em_andamento", "colhida", "encerrada")
        if v not in validos:
            raise ValueError(f"status deve ser: {validos}")
        return v


class ProducaoCreate(BaseModel):
    data_colheita: date
    quantidade_kg: float
    umidade_percentual: Optional[float] = None
    qualidade: Optional[str] = None
    preco_venda_kg: Optional[float] = None
    destino: str = "venda"
    nota_fiscal_id: Optional[str] = None
    observacoes: Optional[str] = None

    @field_validator("destino")
    @classmethod
    def validar_destino(cls, v):
        validos = ("venda", "consumo_proprio", "estoque")
        if v not in validos:
            raise ValueError(f"destino deve ser: {validos}")
        return v

    @field_validator("quantidade_kg")
    @classmethod
    def validar_quantidade(cls, v):
        if v <= 0:
            raise ValueError("quantidade_kg deve ser maior que 0")
        return v


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

TRANSICOES_VALIDAS = {
    "planejada":    {"em_andamento", "encerrada"},
    "em_andamento": {"colhida", "encerrada"},
    "colhida":      {"encerrada"},
    "encerrada":    set(),
}


def row_to_dict(cursor, row):
    # RealDictCursor ja retorna dicts; fallback para tuplas
    if row is None:
        return None
    if hasattr(row, 'keys'):
        return dict(row)
    cols = [d[0] for d in cursor.description]
    return dict(zip(cols, row))


def rows_to_list(cursor, rows):
    if not rows:
        return []
    if rows and hasattr(rows[0], 'keys'):
        return [dict(r) for r in rows]
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, r)) for r in rows]


def get_safra_or_404(safra_id: int, conn):
    cur = conn.cursor()
    cur.execute("SELECT * FROM safras WHERE id = %s", (safra_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Safra nao encontrada")
    return row_to_dict(cur, row)


def get_imovel_or_404(imovel_id: int, conn):
    cur = conn.cursor()
    cur.execute("SELECT id FROM imoveis_rurais WHERE id = %s", (imovel_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Imovel nao encontrado")


# ─────────────────────────────────────────────
# Catalogo de culturas
# ─────────────────────────────────────────────

@router.get("/culturas")
def listar_culturas(
    q: Optional[str] = Query(None, description="Filtro de autocomplete"),
    conn=Depends(get_db)
):
    """Retorna catalogo de culturas para autocomplete no frontend."""
    cur = conn.cursor()
    if q:
        cur.execute(
            "SELECT nome, categoria FROM culturas_catalogo "
            "WHERE ativo = TRUE AND LOWER(nome) LIKE LOWER(%s) "
            "ORDER BY nome LIMIT 20",
            (f"%{q}%",)
        )
    else:
        cur.execute(
            "SELECT nome, categoria FROM culturas_catalogo "
            "WHERE ativo = TRUE ORDER BY nome"
        )
    return rows_to_list(cur, cur.fetchall())


# ─────────────────────────────────────────────
# CRUD Safras
# ─────────────────────────────────────────────

@router.get("/imoveis/{imovel_id}/safras")
def listar_safras(
    imovel_id: int,
    ano_safra: Optional[str] = None,
    cultura: Optional[str] = None,
    status: Optional[str] = None,
    conn=Depends(get_db)
):
    """Lista safras de um imovel com filtros opcionais."""
    get_imovel_or_404(imovel_id, conn)

    filters = ["s.imovel_id = %s"]
    params = [imovel_id]

    if ano_safra:
        filters.append("s.ano_safra = %s")
        params.append(ano_safra)
    if cultura:
        filters.append("LOWER(s.cultura) LIKE LOWER(%s)")
        params.append(f"%{cultura}%")
    if status:
        filters.append("s.status = %s")
        params.append(status)

    where = " AND ".join(filters)
    cur = conn.cursor()
    cur.execute(f"""
        SELECT
          s.*,
          COALESCE(d.producao_total_kg, 0)        AS producao_total_kg,
          COALESCE(d.receita_total, 0)             AS receita_total,
          COALESCE(d.custo_total, 0)               AS custo_total,
          COALESCE(d.receita_total, 0)
            - COALESCE(d.custo_total, 0)           AS margem_bruta,
          d.produtividade_kg_ha,
          d.desvio_producao_percentual
        FROM safras s
        LEFT JOIN vw_dre_safra d ON d.safra_id = s.id
        WHERE {where}
        ORDER BY s.ano_safra DESC, s.cultura
    """, params)
    return rows_to_list(cur, cur.fetchall())


@router.post("/imoveis/{imovel_id}/safras", status_code=201)
def criar_safra(imovel_id: int, data: SafraCreate, conn=Depends(get_db)):
    """Cria uma nova safra para o imovel."""
    get_imovel_or_404(imovel_id, conn)

    # Normaliza cultura se nao informada
    cultura_norm = data.cultura_normalizada or data.cultura.split(" ")[0].title()

    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO safras (
              imovel_id, cultura, ano_safra, area_ha,
              data_plantio, data_colheita_prevista,
              estimativa_producao_kg, custo_estimado,
              tipo_gestao, status, cultura_normalizada, observacoes
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (
            imovel_id, data.cultura, data.ano_safra, data.area_ha,
            data.data_plantio, data.data_colheita_prevista,
            data.estimativa_producao_kg, data.custo_estimado,
            data.tipo_gestao, data.status, cultura_norm, data.observacoes
        ))
        conn.commit()
        row = cur.fetchone()
        result = row_to_dict(cur, row)

        # Adiciona cultura ao catalogo se nao existir
        cur.execute(
            "INSERT INTO culturas_catalogo (nome) VALUES (%s) ON CONFLICT DO NOTHING",
            (data.cultura,)
        )
        conn.commit()
        return result

    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Ja existe safra de '{data.cultura}' no ano '{data.ano_safra}' para este imovel"
        )


@router.get("/safras/{safra_id}")
def detalhar_safra(safra_id: int, conn=Depends(get_db)):
    """Retorna safra com metricas DRE calculadas."""
    cur = conn.cursor()
    cur.execute("""
        SELECT
          s.*,
          COALESCE(d.producao_total_kg, 0)    AS producao_total_kg,
          COALESCE(d.receita_total, 0)         AS receita_total,
          COALESCE(d.custo_total, 0)           AS custo_total,
          COALESCE(d.receita_total, 0)
            - COALESCE(d.custo_total, 0)       AS margem_bruta,
          CASE WHEN COALESCE(d.receita_total, 0) > 0
            THEN ROUND(
              (COALESCE(d.receita_total,0) - COALESCE(d.custo_total,0))
              / d.receita_total * 100, 2)
            ELSE NULL
          END                                  AS margem_percentual,
          CASE WHEN s.area_ha > 0
            THEN ROUND(COALESCE(d.receita_total,0) / s.area_ha, 2)
            ELSE NULL
          END                                  AS receita_por_ha,
          CASE WHEN s.area_ha > 0
            THEN ROUND(COALESCE(d.custo_total,0) / s.area_ha, 2)
            ELSE NULL
          END                                  AS custo_por_ha,
          d.produtividade_kg_ha,
          d.desvio_producao_percentual,
          d.qtd_registros_colheita
        FROM safras s
        LEFT JOIN vw_dre_safra d ON d.safra_id = s.id
        WHERE s.id = %s
    """, (safra_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Safra nao encontrada")
    return row_to_dict(cur, row)


@router.put("/safras/{safra_id}")
def atualizar_safra(safra_id: int, data: SafraUpdate, conn=Depends(get_db)):
    """Atualiza campos da safra."""
    safra = get_safra_or_404(safra_id, conn)

    campos = {k: v for k, v in data.model_dump().items() if v is not None}
    if not campos:
        return safra

    sets = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [safra_id]

    cur = conn.cursor()
    try:
        cur.execute(f"UPDATE safras SET {sets} WHERE id = %s RETURNING *", vals)
        conn.commit()
        return row_to_dict(cur, cur.fetchone())
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=409, detail="Cultura/ano_safra ja existe para este imovel")


@router.delete("/safras/{safra_id}", status_code=204)
def deletar_safra(safra_id: int, conn=Depends(get_db)):
    """Remove safra. Bloqueado se houver lancamentos ou producao vinculados."""
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM lancamentos WHERE safra_id = %s", (safra_id,))
    if cur.fetchone()[0] > 0:
        raise HTTPException(
            status_code=409,
            detail="Nao e possivel remover safra com lancamentos vinculados"
        )

    cur.execute("SELECT COUNT(*) FROM producao_agricola WHERE safra_id = %s", (safra_id,))
    if cur.fetchone()[0] > 0:
        raise HTTPException(
            status_code=409,
            detail="Nao e possivel remover safra com registros de producao"
        )

    cur.execute("DELETE FROM safras WHERE id = %s", (safra_id,))
    conn.commit()


# ─────────────────────────────────────────────
# Status
# ─────────────────────────────────────────────

@router.patch("/safras/{safra_id}/status")
def atualizar_status(safra_id: int, data: StatusUpdate, conn=Depends(get_db)):
    """Transicao de status com validacao de fluxo."""
    safra = get_safra_or_404(safra_id, conn)
    status_atual = safra["status"]
    novo_status = data.status

    if novo_status not in TRANSICOES_VALIDAS.get(status_atual, set()):
        raise HTTPException(
            status_code=422,
            detail=f"Transicao '{status_atual}' -> '{novo_status}' nao permitida. "
                   f"Transicoes validas: {list(TRANSICOES_VALIDAS[status_atual])}"
        )

    cur = conn.cursor()
    cur.execute(
        "UPDATE safras SET status = %s WHERE id = %s RETURNING id, status",
        (novo_status, safra_id)
    )
    conn.commit()
    return cur.fetchone()


# ─────────────────────────────────────────────
# Producao Agricola (Colheita)
# ─────────────────────────────────────────────

@router.post("/safras/{safra_id}/producao", status_code=201)
def registrar_producao(safra_id: int, data: ProducaoCreate, conn=Depends(get_db)):
    """
    Registra colheita de uma safra.
    - Se destino = 'venda': cria lancamento de receita automaticamente
    - Se destino = 'estoque': cria lancamento de producao propria
    - Se destino = 'consumo_proprio': apenas registra, sem lancamento LCDPR
    - Transiciona status da safra para 'colhida' se ainda em andamento
    """
    safra = get_safra_or_404(safra_id, conn)
    cur = conn.cursor()

    lancamento_id = None

    # Criar lancamento automatico se aplicavel
    if data.destino in ("venda", "estoque"):
        valor = (
            round(data.quantidade_kg * data.preco_venda_kg, 2)
            if data.destino == "venda" and data.preco_venda_kg
            else 0.0
        )
        tipo_lanc = "receita" if data.destino == "venda" else "producao_propria_agricola"
        descricao = (
            f"Venda de {safra['cultura']} - Safra {safra['ano_safra']} "
            f"({data.quantidade_kg:.0f} kg)"
            if data.destino == "venda"
            else f"Estoque {safra['cultura']} - Safra {safra['ano_safra']} "
                 f"({data.quantidade_kg:.0f} kg)"
        )

        if valor > 0 or data.destino == "estoque":
            # Buscar produtor_id principal do imovel
            cur.execute(
                """SELECT produtor_id FROM participacoes_imovel
                   WHERE imovel_id = %s AND vigencia_fim IS NULL
                   ORDER BY id LIMIT 1""",
                (safra["imovel_id"],)
            )
            row_prod = cur.fetchone()
            produtor_id = row_prod[0] if row_prod else None
            if produtor_id:
                cur.execute("""
                    INSERT INTO lancamentos
                      (produtor_id, safra_id, valor, data, origem)
                    VALUES (%s, %s, %s, %s, 'agricultura')
                    RETURNING id
                """, (
                    produtor_id, safra_id,
                    valor if data.destino == 'venda' else 0,
                    data.data_colheita
                ))
                row = cur.fetchone()
                lancamento_id = row[0] if row else None

    # Inserir registro de producao
    cur.execute("""
        INSERT INTO producao_agricola (
          safra_id, data_colheita, quantidade_kg,
          umidade_percentual, qualidade, preco_venda_kg,
          destino, nota_fiscal_id, lancamento_id, observacoes
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING *
    """, (
        safra_id, data.data_colheita, data.quantidade_kg,
        data.umidade_percentual, data.qualidade, data.preco_venda_kg,
        data.destino, data.nota_fiscal_id, lancamento_id, data.observacoes
    ))
    producao = row_to_dict(cur, cur.fetchone())

    # Atualizar data_colheita_real na safra
    cur.execute(
        "UPDATE safras SET data_colheita_real = %s WHERE id = %s AND data_colheita_real IS NULL",
        (data.data_colheita, safra_id)
    )

    # Transicionar status se ainda em andamento
    if safra["status"] == "em_andamento":
        cur.execute(
            "UPDATE safras SET status = 'colhida' WHERE id = %s",
            (safra_id,)
        )

    conn.commit()
    return {**producao, "lancamento_id": lancamento_id}


@router.get("/safras/{safra_id}/producao")
def listar_producao(safra_id: int, conn=Depends(get_db)):
    """Historico de registros de colheita da safra."""
    get_safra_or_404(safra_id, conn)
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM producao_agricola WHERE safra_id = %s ORDER BY data_colheita DESC",
        (safra_id,)
    )
    return rows_to_list(cur, cur.fetchall())


# ─────────────────────────────────────────────
# DRE por Safra
# ─────────────────────────────────────────────

@router.get("/safras/{safra_id}/dre")
def dre_safra(safra_id: int, conn=Depends(get_db)):
    """
    DRE completo da safra:
    receita, custo, margem, produtividade kg/ha,
    desvio vs estimativa, breakdown de custos por tipo de lancamento.
    """
    safra = get_safra_or_404(safra_id, conn)
    cur = conn.cursor()

    # Metricas principais via view
    cur.execute("SELECT * FROM vw_dre_safra WHERE safra_id = %s", (safra_id,))
    dre = row_to_dict(cur, cur.fetchone())

    # Breakdown de custos por tipo
    cur.execute("""
        SELECT
          sc.nome          AS tipo,
          COUNT(*)         AS qtd,
          SUM(ABS(l.valor)) AS total
        FROM lancamentos l
        LEFT JOIN subcontas sc ON sc.id = l.subconta_id
        WHERE l.safra_id = %s AND l.valor < 0
        GROUP BY sc.nome
        ORDER BY total DESC
    """, (safra_id,))
    breakdown = rows_to_list(cur, cur.fetchall())

    receita = float(dre.get("receita_total") or 0)
    custo   = float(dre.get("custo_total")   or 0)
    area    = float(safra["area_ha"])

    return {
        "safra_id":                  safra_id,
        "cultura":                   safra["cultura"],
        "ano_safra":                 safra["ano_safra"],
        "area_ha":                   area,
        "status":                    safra["status"],
        "tipo_gestao":               safra["tipo_gestao"],
        "estimativa_producao_kg":    safra.get("estimativa_producao_kg"),
        "custo_estimado":            safra.get("custo_estimado"),
        "producao_total_kg":         float(dre.get("producao_total_kg") or 0),
        "receita_total":             receita,
        "custo_total":               custo,
        "margem_bruta":              round(receita - custo, 2),
        "margem_percentual":         round((receita - custo) / receita * 100, 2) if receita > 0 else None,
        "receita_por_ha":            round(receita / area, 2) if area > 0 else None,
        "custo_por_ha":              round(custo / area, 2) if area > 0 else None,
        "produtividade_kg_ha":       float(dre.get("produtividade_kg_ha") or 0),
        "desvio_producao_percentual": float(dre["desvio_producao_percentual"]) if dre.get("desvio_producao_percentual") else None,
        "breakdown_custos":          breakdown,
    }


# ─────────────────────────────────────────────
# Lancamentos da Safra
# ─────────────────────────────────────────────

@router.get("/safras/{safra_id}/lancamentos")
def listar_lancamentos_safra(safra_id: int, conn=Depends(get_db)):
    """Todos os lancamentos financeiros vinculados a safra."""
    get_safra_or_404(safra_id, conn)
    cur = conn.cursor()
    cur.execute("""
        SELECT *
        FROM lancamentos
        WHERE safra_id = %s
        ORDER BY data DESC
    """, (safra_id,))
    return rows_to_list(cur, cur.fetchall())


# ─────────────────────────────────────────────
# Visao geral por imovel (card "Safra Atual")
# ─────────────────────────────────────────────

@router.get("/imoveis/{imovel_id}/safras/resumo")
def resumo_safras_imovel(imovel_id: int, conn=Depends(get_db)):
    """
    Retorna safras ativas do imovel para exibicao no card
    'Safra Atual' dentro da tela do Imovel.
    """
    get_imovel_or_404(imovel_id, conn)
    cur = conn.cursor()
    cur.execute("""
        SELECT
          s.id, s.cultura, s.ano_safra, s.area_ha, s.status,
          COALESCE(d.producao_total_kg, 0) AS producao_total_kg,
          COALESCE(d.receita_total, 0)     AS receita_total,
          COALESCE(d.custo_total, 0)       AS custo_total,
          COALESCE(d.receita_total,0)
            - COALESCE(d.custo_total,0)    AS margem_bruta
        FROM safras s
        LEFT JOIN vw_dre_safra d ON d.safra_id = s.id
        WHERE s.imovel_id = %s
          AND s.status IN ('planejada', 'em_andamento', 'colhida')
        ORDER BY s.ano_safra DESC, s.cultura
    """, (imovel_id,))
    return rows_to_list(cur, cur.fetchall())
