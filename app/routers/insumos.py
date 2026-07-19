# app/routers/insumos.py — RuralCaixa MVP
"""
Módulo de Gestão de Insumos — Fase 1
Endpoints:
  GET/POST   /insumos/
  GET/PUT    /insumos/{id}
  GET/POST   /fornecedores/
  GET/PUT    /fornecedores/{id}
  POST       /insumos/{id}/movimentar
  GET        /insumos/alertas
  POST       /pedidos-compra/
  GET/PUT    /pedidos-compra/{id}
  POST       /pedidos-compra/{id}/enviar
"""

import os
import logging
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, validator, Field
import httpx

from app.services.whatsapp_service import enviar_whatsapp_async
from app.services.estoque_insumos import (
    aplicar_movimentacao_insumo, custos_por_origem, TIPOS_VALIDOS,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Insumos"])

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_GROUP_ID  = os.getenv("TELEGRAM_GROUP_CHAT_ID", "-5457537054")


def get_db():
    from app.db import get_db as _get_db
    return _get_db()


def _auth(request: Request) -> int:
    """Retorna fazenda_id do produtor autenticado."""
    return 1  # MVP: fazenda_id fixo


# ── Schemas ───────────────────────────────────────────────────────────

class FornecedorCreate(BaseModel):
    nome: str
    cnpj_cpf: Optional[str] = None
    whatsapp: Optional[str] = None
    telegram: Optional[str] = None
    email: Optional[str] = None
    endereco: Optional[str] = None
    prazo_entrega_dias: int = 7
    forma_pagamento: str = "a_vista"
    observacoes: Optional[str] = None

class InsumoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    categoria: str = "outros"
    unidade: str = "unidade"
    origem: str = "comprado"
    estoque_minimo: float = 0
    estoque_ideal: float = 0
    estoque_atual: float = 0
    preco_estimado: Optional[float] = None
    fornecedor_id: Optional[int] = None
    reposicao_modo: str = "manual"
    lead_time_dias: int = 7

    @validator("origem")
    def origem_valida(cls, v):
        if v not in ("comprado", "proprio", "doacao"):
            raise ValueError("origem deve ser comprado, proprio ou doacao")
        return v

    @validator("reposicao_modo")
    def modo_valido(cls, v):
        if v not in ("automatico", "manual"):
            raise ValueError("reposicao_modo deve ser automatico ou manual")
        return v

class MovimentacaoCreate(BaseModel):
    tipo: str
    quantidade: float
    custo_unitario: Optional[float] = None
    observacao: Optional[str] = None
    data_movim: Optional[date] = None
    # Origem/apropriação de custo — opcional; default é lançamento manual pela tela de Insumos.
    # Módulos de produção (piscicultura, acai, bovino, ...) preenchem estes campos ao
    # chamar aplicar_movimentacao_insumo() diretamente; este endpoint cobre o uso manual.
    origem_modulo: str = "manual"
    origem_tipo: Optional[str] = None
    origem_id: Optional[int] = None
    origem_descricao: Optional[str] = None

    @validator("tipo")
    def tipo_valido(cls, v):
        if v not in TIPOS_VALIDOS:
            raise ValueError(f"tipo deve ser um de: {sorted(TIPOS_VALIDOS)}")
        return v

class PedidoCreate(BaseModel):
    insumo_id: int
    fornecedor_id: Optional[int] = None
    quantidade: float
    preco_estimado: Optional[float] = None
    data_entrega_desejada: Optional[date] = None
    observacao: Optional[str] = None
    modo_geracao: str = "manual"

class SolicitarCotacaoBody(BaseModel):
    fornecedor_ids: list[int] = Field(..., min_length=1, description="IDs dos fornecedores que vão receber a cotação")
    quantidade: float = Field(..., gt=0)
    observacao: Optional[str] = None
    data_entrega_desejada: Optional[date] = None


# ── FORNECEDORES ──────────────────────────────────────────────────────

@router.get("/fornecedores/")
def listar_fornecedores(request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT f.*, COUNT(p.id) AS total_pedidos
                FROM fornecedores f
                LEFT JOIN pedidos_compra p ON p.fornecedor_id = f.id
                WHERE f.fazenda_id = %s AND f.ativo = TRUE
                GROUP BY f.id
                ORDER BY f.nome
            """, (fazenda_id,))
            return {"data": cur.fetchall()}

@router.post("/fornecedores/", status_code=201)
def criar_fornecedor(body: FornecedorCreate, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO fornecedores (fazenda_id, nome, cnpj_cpf, whatsapp, telegram, email,
                    endereco, prazo_entrega_dias, forma_pagamento, observacoes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (fazenda_id, body.nome, body.cnpj_cpf, body.whatsapp, body.telegram,
                  body.email, body.endereco, body.prazo_entrega_dias, body.forma_pagamento, body.observacoes))
            conn.commit()
            return {"data": cur.fetchone()}

@router.get("/fornecedores/{fid}")
def obter_fornecedor(fid: int, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM fornecedores WHERE id=%s AND fazenda_id=%s", (fid, fazenda_id))
            row = cur.fetchone()
            if not row: raise HTTPException(404, "Fornecedor não encontrado")
            return {"data": row}

@router.put("/fornecedores/{fid}")
def atualizar_fornecedor(fid: int, body: FornecedorCreate, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE fornecedores SET nome=%s, cnpj_cpf=%s, whatsapp=%s, telegram=%s,
                    email=%s, endereco=%s, prazo_entrega_dias=%s, forma_pagamento=%s,
                    observacoes=%s, atualizado_em=NOW()
                WHERE id=%s AND fazenda_id=%s RETURNING *
            """, (body.nome, body.cnpj_cpf, body.whatsapp, body.telegram, body.email,
                  body.endereco, body.prazo_entrega_dias, body.forma_pagamento,
                  body.observacoes, fid, fazenda_id))
            conn.commit()
            row = cur.fetchone()
            if not row: raise HTTPException(404, "Fornecedor não encontrado")
            return {"data": row}

@router.delete("/fornecedores/{fid}")
def desativar_fornecedor(fid: int, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE fornecedores SET ativo=FALSE WHERE id=%s AND fazenda_id=%s", (fid, fazenda_id))
            conn.commit()
            return {"ok": True}


# ── INSUMOS ───────────────────────────────────────────────────────────

@router.get("/insumos/")
def listar_insumos(request: Request, categoria: Optional[str] = None, origem: Optional[str] = None):
    fazenda_id = _auth(request)
    where = ["i.fazenda_id = %s", "i.ativo = TRUE"]
    params: list = [fazenda_id]
    if categoria: where.append("i.categoria = %s"); params.append(categoria)
    if origem:    where.append("i.origem = %s");    params.append(origem)
    sql = f"""
        SELECT i.*, f.nome AS fornecedor_nome, f.whatsapp AS fornecedor_whatsapp,
            CASE
                WHEN i.estoque_atual <= 0 THEN 'critico'
                WHEN i.estoque_atual <= i.estoque_minimo THEN 'baixo'
                WHEN i.estoque_atual <= i.estoque_minimo * 1.5 THEN 'atencao'
                ELSE 'ok'
            END AS status_estoque,
            COALESCE(mov.entradas_mes, 0) AS entradas_mes,
            COALESCE(mov.saidas_mes, 0) AS saidas_mes,
            i.estoque_atual - COALESCE(mov.entradas_mes, 0) + COALESCE(mov.saidas_mes, 0) AS estoque_inicial_mes
        FROM insumos i
        LEFT JOIN fornecedores f ON f.id = i.fornecedor_id
        LEFT JOIN (
            SELECT
                insumo_id,
                SUM(CASE WHEN tipo IN ('compra','producao_propria','doacao','ajuste_positivo') THEN quantidade ELSE 0 END) AS entradas_mes,
                SUM(CASE WHEN tipo IN ('uso','venda','perda','ajuste_negativo') THEN quantidade ELSE 0 END) AS saidas_mes
            FROM movimentacoes_insumo
            WHERE TO_CHAR(data_movim, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            GROUP BY insumo_id
        ) mov ON mov.insumo_id = i.id
        WHERE {" AND ".join(where)}
        ORDER BY i.categoria, i.nome
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return {"data": cur.fetchall()}

@router.get("/insumos/resumo-movimentacoes")
def resumo_movimentacoes(request: Request, mes: Optional[str] = None):
    """Resumo do período (mês) pra exibir no topo da tela: total comprado
    (entradas tipo compra) e total consumido (saídas tipo uso), em R$,
    somando todos os insumos da fazenda. `mes` no formato YYYY-MM; se
    omitido, usa o mês corrente."""
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            filtro_mes = "TO_CHAR(m.data_movim, 'YYYY-MM') = %s" if mes else \
                         "TO_CHAR(m.data_movim, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')"
            params = [fazenda_id] + ([mes] if mes else [])
            cur.execute(f"""
                SELECT
                    COALESCE(SUM(CASE WHEN m.tipo = 'compra' THEN m.custo_total ELSE 0 END), 0) AS compras_mes,
                    COALESCE(SUM(CASE WHEN m.tipo = 'uso' THEN m.custo_total ELSE 0 END), 0) AS consumo_mes,
                    COUNT(DISTINCT CASE WHEN m.tipo = 'compra' THEN m.id END) AS qtd_compras,
                    COUNT(DISTINCT CASE WHEN m.tipo = 'uso' THEN m.id END) AS qtd_usos
                FROM movimentacoes_insumo m
                WHERE m.fazenda_id = %s AND {filtro_mes}
            """, params)
            resumo = cur.fetchone()
            return {
                "compras_mes": float(resumo["compras_mes"] or 0),
                "consumo_mes": float(resumo["consumo_mes"] or 0),
                "qtd_compras": resumo["qtd_compras"] or 0,
                "qtd_usos": resumo["qtd_usos"] or 0,
            }


@router.get("/insumos/alertas")
def alertas_estoque(request: Request):
    """Retorna insumos com estoque baixo ou crítico."""
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM vw_insumos_alerta
                WHERE fazenda_id = %s AND status_estoque IN ('critico','baixo','atencao')
                ORDER BY
                    CASE status_estoque WHEN 'critico' THEN 1 WHEN 'baixo' THEN 2 ELSE 3 END,
                    nome
            """, (fazenda_id,))
            alertas = cur.fetchall()
            return {"data": alertas, "total": len(alertas)}

@router.post("/insumos/", status_code=201)
def criar_insumo(body: InsumoCreate, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            # ── PROTEÇÃO ANTI-DUPLICATA: verificar se já existe insumo com mesmo nome ──
            nome_normalizado = body.nome.strip().lower()
            cur.execute("""
                SELECT id, nome, estoque_atual FROM insumos
                WHERE fazenda_id = %s AND ativo = TRUE
                  AND LOWER(TRIM(nome)) = %s
                LIMIT 1
            """, (fazenda_id, nome_normalizado))
            existente = cur.fetchone()
            if existente:
                # Retorna o insumo existente sem criar duplicata (409 Conflict seria ideal,
                # mas retornamos 200 com o existente para não quebrar fluxos de importação)
                raise HTTPException(
                    status_code=409,
                    detail=f"Insumo '{body.nome}' já existe (id={existente['id']}). Use PUT /insumos/{existente['id']} para atualizar."
                )

            cur.execute("""
                INSERT INTO insumos (fazenda_id, nome, descricao, categoria, unidade, origem,
                    estoque_atual, estoque_minimo, estoque_ideal, preco_estimado, custo_medio,
                    fornecedor_id, reposicao_modo, lead_time_dias)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (fazenda_id, body.nome.strip(), body.descricao, body.categoria, body.unidade,
                  body.origem, 0, body.estoque_minimo, body.estoque_ideal,
                  body.preco_estimado, body.preco_estimado,
                  body.fornecedor_id, body.reposicao_modo, body.lead_time_dias))
            conn.commit()
            insumo = cur.fetchone()
            # Se estoque_atual > 0, registra movimentação inicial via engine (fixa PMP inicial)
            if body.estoque_atual > 0:
                aplicar_movimentacao_insumo(
                    cur, fazenda_id=fazenda_id, insumo_id=insumo["id"],
                    tipo="ajuste_positivo", quantidade=body.estoque_atual,
                    custo_unitario=body.preco_estimado,
                    origem_modulo="manual", observacao="Estoque inicial",
                )
                conn.commit()
                cur.execute("SELECT * FROM insumos WHERE id=%s", (insumo["id"],))
                insumo = cur.fetchone()
            return {"data": insumo}

# ── ROTAS ESTÁTICAS PRIMEIRO (evitar conflito com /insumos/{iid}) ──────────────────────
@router.get("/insumos/duplicados")
def listar_duplicados(request: Request):
    """Lista grupos de insumos com nomes duplicados (case-insensitive) para facilitar limpeza."""
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT LOWER(TRIM(nome)) AS nome_norm, COUNT(*) AS total,
                       array_agg(id ORDER BY criado_em ASC) AS ids,
                       array_agg(nome ORDER BY criado_em ASC) AS nomes,
                       array_agg(estoque_atual ORDER BY criado_em ASC) AS estoques,
                       array_agg(criado_em ORDER BY criado_em ASC) AS datas
                FROM insumos
                WHERE fazenda_id = %s AND ativo = TRUE
                GROUP BY LOWER(TRIM(nome))
                HAVING COUNT(*) > 1
                ORDER BY nome_norm
            """, (fazenda_id,))
            grupos = cur.fetchall()
            return {"data": grupos, "total_grupos": len(grupos)}


@router.post("/insumos/limpar-duplicados")
def limpar_duplicados(request: Request):
    """Remove automaticamente duplicatas mantendo o insumo mais antigo de cada grupo.
    Insumos duplicados com estoque > 0 são mesclados antes da exclusão."""
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT LOWER(TRIM(nome)) AS nome_norm,
                       array_agg(id ORDER BY criado_em ASC) AS ids
                FROM insumos
                WHERE fazenda_id = %s AND ativo = TRUE
                GROUP BY LOWER(TRIM(nome))
                HAVING COUNT(*) > 1
            """, (fazenda_id,))
            grupos = cur.fetchall()

            removidos = 0
            for grupo in grupos:
                ids = grupo["ids"]
                id_manter = ids[0]
                ids_remover = ids[1:]

                cur.execute("""
                    SELECT COALESCE(SUM(estoque_atual), 0) AS total_estoque
                    FROM insumos WHERE id = ANY(%s) AND ativo = TRUE
                """, (ids_remover,))
                estoque_extra = cur.fetchone()["total_estoque"]

                if estoque_extra > 0:
                    cur.execute("""
                        UPDATE insumos SET estoque_atual = estoque_atual + %s, atualizado_em=NOW()
                        WHERE id = %s
                    """, (estoque_extra, id_manter))
                    cur.execute("""
                        INSERT INTO movimentacoes_insumo
                            (insumo_id, fazenda_id, tipo, quantidade, observacao, data_movim)
                        VALUES (%s, %s, 'ajuste_positivo', %s, 'Mescla de duplicatas', %s)
                    """, (id_manter, fazenda_id, estoque_extra, date.today()))

                cur.execute("""
                    UPDATE insumos SET ativo=FALSE, atualizado_em=NOW()
                    WHERE id = ANY(%s)
                """, (ids_remover,))
                removidos += len(ids_remover)

            conn.commit()
            return {"ok": True, "removidos": removidos, "grupos_processados": len(grupos)}


# ── ROTAS DINÂMICAS (com parâmetro {iid}) ───────────────────────────────────────────
@router.get("/insumos/{iid}")
def obter_insumo(iid: int, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT i.*, f.nome AS fornecedor_nome, f.whatsapp AS fornecedor_whatsapp
                FROM insumos i LEFT JOIN fornecedores f ON f.id = i.fornecedor_id
                WHERE i.id=%s AND i.fazenda_id=%s
            """, (iid, fazenda_id))
            row = cur.fetchone()
            if not row: raise HTTPException(404, "Insumo não encontrado")
            cur.execute("""
                SELECT * FROM movimentacoes_insumo
                WHERE insumo_id=%s ORDER BY criado_em DESC LIMIT 20
            """, (iid,))
            row["movimentacoes"] = cur.fetchall()

            # Estoque inicial do mês / entradas / saídas do mês — calculado a
            # partir de TODAS as movimentações do mês (não só as 20 últimas
            # acima, que são só pra exibição do histórico recente).
            cur.execute("""
                SELECT
                    COALESCE(SUM(CASE WHEN tipo IN ('compra','producao_propria','doacao','ajuste_positivo')
                                       THEN quantidade ELSE 0 END), 0) AS entradas_mes,
                    COALESCE(SUM(CASE WHEN tipo IN ('uso','venda','perda','ajuste_negativo')
                                       THEN quantidade ELSE 0 END), 0) AS saidas_mes
                FROM movimentacoes_insumo
                WHERE insumo_id = %s
                  AND TO_CHAR(data_movim, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            """, (iid,))
            mov_mes = cur.fetchone()
            entradas_mes = float(mov_mes["entradas_mes"] or 0)
            saidas_mes = float(mov_mes["saidas_mes"] or 0)
            estoque_atual = float(row["estoque_atual"] or 0)
            row["entradas_mes"] = entradas_mes
            row["saidas_mes"] = saidas_mes
            # Estoque inicial do mês = estoque atual desfazendo o que entrou/saiu neste mês
            row["estoque_inicial_mes"] = estoque_atual - entradas_mes + saidas_mes

            return {"data": row}

@router.delete("/insumos/{iid}")
def excluir_insumo(iid: int, request: Request):
    """Desativa (soft delete) um insumo. Insumos com movimentações não são apagados fisicamente."""
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM insumos WHERE id=%s AND fazenda_id=%s AND ativo=TRUE", (iid, fazenda_id))
            if not cur.fetchone():
                raise HTTPException(404, "Insumo não encontrado")
            cur.execute("UPDATE insumos SET ativo=FALSE, atualizado_em=NOW() WHERE id=%s AND fazenda_id=%s", (iid, fazenda_id))
            conn.commit()
            return {"ok": True, "id": iid}


@router.put("/insumos/{iid}")
def atualizar_insumo(iid: int, body: InsumoCreate, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE insumos SET nome=%s, descricao=%s, categoria=%s, unidade=%s, origem=%s,
                    estoque_minimo=%s, estoque_ideal=%s, preco_estimado=%s,
                    fornecedor_id=%s, reposicao_modo=%s, lead_time_dias=%s, atualizado_em=NOW()
                WHERE id=%s AND fazenda_id=%s RETURNING *
            """, (body.nome, body.descricao, body.categoria, body.unidade, body.origem,
                  body.estoque_minimo, body.estoque_ideal, body.preco_estimado,
                  body.fornecedor_id, body.reposicao_modo, body.lead_time_dias, iid, fazenda_id))
            conn.commit()
            row = cur.fetchone()
            if not row: raise HTTPException(404, "Insumo não encontrado")
            return {"data": row}


# ── MOVIMENTAÇÕES ─────────────────────────────────────────────────────

@router.post("/insumos/{iid}/movimentar", status_code=201)
def movimentar_insumo(iid: int, body: MovimentacaoCreate, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            resultado = aplicar_movimentacao_insumo(
                cur, fazenda_id=fazenda_id, insumo_id=iid, tipo=body.tipo,
                quantidade=body.quantidade, custo_unitario=body.custo_unitario,
                origem_modulo=body.origem_modulo, origem_tipo=body.origem_tipo,
                origem_id=body.origem_id, origem_descricao=body.origem_descricao,
                observacao=body.observacao, data_movim=body.data_movim,
            )
            conn.commit()
            movim = resultado["movimentacao"]

            # Verifica alerta de estoque baixo após movimentação de saída
            if body.tipo in ("uso", "venda", "perda", "ajuste_negativo"):
                cur.execute("SELECT * FROM vw_insumos_alerta WHERE id=%s", (iid,))
                alerta = cur.fetchone()
                if alerta and alerta["status_estoque"] in ("critico", "baixo"):
                    cur.execute("SELECT * FROM insumos WHERE id=%s AND fazenda_id=%s", (iid, fazenda_id))
                    insumo = cur.fetchone()
                    _verificar_reposicao_automatica(insumo, alerta, fazenda_id, cur, conn)

            return {
                "data": movim,
                "novo_estoque": resultado["novo_estoque"],
                "novo_custo_medio": resultado["novo_custo_medio"],
            }


@router.get("/insumos/custos-por-origem")
def obter_custos_por_origem(origem_modulo: str, origem_id: int, request: Request):
    """Soma o custo de insumos consumidos por uma atividade específica
    (ex.: origem_modulo=piscicultura&origem_id=7 para um ciclo)."""
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            return custos_por_origem(cur, fazenda_id, origem_modulo, origem_id)


# ── PEDIDOS DE COMPRA ─────────────────────────────────────────────────

@router.get("/pedidos-compra/")
def listar_pedidos(request: Request, status: Optional[str] = None):
    fazenda_id = _auth(request)
    where = ["p.fazenda_id=%s"]
    params: list = [fazenda_id]
    if status: where.append("p.status=%s"); params.append(status)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT p.*, i.nome AS insumo_nome, i.unidade,
                    f.nome AS fornecedor_nome, f.whatsapp AS fornecedor_whatsapp
                FROM pedidos_compra p
                JOIN insumos i ON i.id = p.insumo_id
                LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
                WHERE {" AND ".join(where)}
                ORDER BY p.criado_em DESC
            """, params)
            return {"data": cur.fetchall()}

@router.post("/pedidos-compra/", status_code=201)
def criar_pedido(body: PedidoCreate, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM insumos WHERE id=%s AND fazenda_id=%s", (body.insumo_id, fazenda_id))
            insumo = cur.fetchone()
            if not insumo: raise HTTPException(404, "Insumo não encontrado")

            # Usa fornecedor padrão do insumo se não especificado
            fornecedor_id = body.fornecedor_id or insumo.get("fornecedor_id")
            preco = body.preco_estimado or insumo.get("preco_estimado")
            valor_total = preco * body.quantidade if preco else None
            data_entrega = body.data_entrega_desejada or (date.today() + timedelta(days=insumo.get("lead_time_dias", 7)))

            cur.execute("""
                INSERT INTO pedidos_compra
                    (fazenda_id, insumo_id, fornecedor_id, quantidade, preco_estimado,
                     valor_total_estimado, data_entrega_desejada, observacao, modo_geracao)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (fazenda_id, body.insumo_id, fornecedor_id, body.quantidade, preco,
                  valor_total, data_entrega, body.observacao, body.modo_geracao))
            conn.commit()
            return {"data": cur.fetchone()}

@router.put("/pedidos-compra/{pid}/aprovar")
def aprovar_pedido(pid: int, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE pedidos_compra SET status='aprovado', atualizado_em=NOW()
                WHERE id=%s AND fazenda_id=%s AND status='pendente'
                RETURNING *
            """, (pid, fazenda_id))
            conn.commit()
            row = cur.fetchone()
            if not row: raise HTTPException(404, "Pedido não encontrado ou já processado")
            return {"data": row}

@router.post("/pedidos-compra/{pid}/enviar")
async def enviar_pedido(pid: int, request: Request):
    """Envia pedido de compra por WhatsApp/Telegram para o fornecedor."""
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.*, i.nome AS insumo_nome, i.unidade,
                    f.nome AS fornecedor_nome, f.whatsapp, f.telegram
                FROM pedidos_compra p
                JOIN insumos i ON i.id = p.insumo_id
                LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
                WHERE p.id=%s AND p.fazenda_id=%s
            """, (pid, fazenda_id))
            pedido = cur.fetchone()
            if not pedido: raise HTTPException(404, "Pedido não encontrado")

            # Monta mensagem
            valor_str = f"R$ {pedido['valor_total_estimado']:.2f}" if pedido.get("valor_total_estimado") else "a confirmar"
            entrega_str = pedido["data_entrega_desejada"].strftime("%d/%m/%Y") if pedido.get("data_entrega_desejada") else "a combinar"

            msg = (
                f"🌾 *Pedido de Compra — RuralCaixa*\n\n"
                f"Olá, {pedido.get('fornecedor_nome', 'Fornecedor')}!\n\n"
                f"📦 Produto: {pedido['insumo_nome']}\n"
                f"📊 Quantidade: {pedido['quantidade']} {pedido['unidade']}\n"
                f"💰 Valor estimado: {valor_str}\n"
                f"📅 Entrega desejada: {entrega_str}\n\n"
                f"Confirma disponibilidade e prazo?"
            )

            enviado = False

            # Tenta Telegram primeiro
            if pedido.get("telegram") and TELEGRAM_BOT_TOKEN:
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        r = await client.post(
                            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                            json={"chat_id": pedido["telegram"], "text": msg, "parse_mode": "Markdown"},
                        )
                        if r.status_code == 200:
                            enviado = True
                except Exception as e:
                    logger.error(f"Telegram envio pedido: {e}")

            # Fallback: notifica o grupo interno com o pedido
            if not enviado and TELEGRAM_BOT_TOKEN:
                try:
                    msg_grupo = f"📋 *Pedido de compra gerado*\n{msg}\n\nFornecedor: {pedido.get('fornecedor_nome','?')}\nWhatsApp: {pedido.get('whatsapp','?')}"
                    async with httpx.AsyncClient(timeout=10) as client:
                        await client.post(
                            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                            json={"chat_id": TELEGRAM_GROUP_ID, "text": msg_grupo, "parse_mode": "Markdown"},
                        )
                    enviado = True
                except Exception as e:
                    logger.error(f"Telegram grupo pedido: {e}")

            # Atualiza status do pedido
            cur.execute("""
                UPDATE pedidos_compra
                SET status='enviado', mensagem_enviada=%s, data_confirmacao=NOW(), atualizado_em=NOW()
                WHERE id=%s RETURNING *
            """, (msg, pid))
            conn.commit()

            return {"ok": True, "enviado_telegram": enviado, "mensagem": msg}


# ── FUNÇÃO INTERNA: reposição automática ─────────────────────────────

@router.post("/insumos/{iid}/solicitar-cotacao")
async def solicitar_cotacao(iid: int, body: SolicitarCotacaoBody, request: Request):
    """
    Dispara uma solicitação de cotação de preço para N fornecedores de
    uma vez. Cria um pedido_compra (modo_geracao='cotacao') por
    fornecedor e tenta enviar a mensagem por WhatsApp (real, via
    whatsapp_service) e, na falta de WhatsApp, por Telegram.

    Diferente de /pedidos-compra/{pid}/enviar (que confirma um pedido
    já fechado), esta mensagem pede PREÇO — não confirma compra.
    """
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM insumos WHERE id=%s AND fazenda_id=%s",
                (iid, fazenda_id)
            )
            insumo = cur.fetchone()
            if not insumo:
                raise HTTPException(404, "Insumo não encontrado")

            data_entrega = body.data_entrega_desejada or (
                date.today() + timedelta(days=insumo.get("lead_time_dias") or 7)
            )

            resultados = []

            for fornecedor_id in body.fornecedor_ids:
                cur.execute(
                    "SELECT * FROM fornecedores WHERE id=%s AND fazenda_id=%s AND ativo=true",
                    (fornecedor_id, fazenda_id)
                )
                fornecedor = cur.fetchone()
                if not fornecedor:
                    resultados.append({
                        "fornecedor_id": fornecedor_id,
                        "nome": None,
                        "sucesso": False,
                        "canal": None,
                        "motivo": "Fornecedor não encontrado ou inativo",
                    })
                    continue

                # Cria o pedido de compra vinculado (modo_geracao='cotacao')
                cur.execute("""
                    INSERT INTO pedidos_compra
                        (fazenda_id, insumo_id, fornecedor_id, quantidade,
                         data_entrega_desejada, observacao, modo_geracao, status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'cotacao', 'aguardando_resposta')
                    RETURNING id
                """, (
                    fazenda_id, iid, fornecedor_id, body.quantidade,
                    data_entrega, body.observacao,
                ))
                pedido_id = cur.fetchone()["id"]

                entrega_str = data_entrega.strftime("%d/%m/%Y")
                msg = (
                    f"🌾 *Solicitação de Cotação — RuralCaixa*\n\n"
                    f"Olá, {fornecedor.get('nome', 'Fornecedor')}!\n\n"
                    f"Gostaríamos de uma cotação de preço para:\n"
                    f"📦 Produto: {insumo['nome']}\n"
                    f"📊 Quantidade: {body.quantidade} {insumo['unidade']}\n"
                    f"📅 Entrega desejada: {entrega_str}\n\n"
                    f"Poderia nos informar o valor e prazo de entrega?"
                )

                canal_usado = None
                sucesso = False

                # 1) Tenta WhatsApp de verdade primeiro
                if fornecedor.get("whatsapp"):
                    try:
                        sucesso = await enviar_whatsapp_async(fornecedor["whatsapp"], msg)
                        if sucesso:
                            canal_usado = "whatsapp"
                    except Exception as e:
                        logger.error(f"WhatsApp cotacao fornecedor {fornecedor_id}: {e}")

                # 2) Fallback: Telegram, se WhatsApp não configurado/falhou
                if not sucesso and fornecedor.get("telegram") and TELEGRAM_BOT_TOKEN:
                    try:
                        async with httpx.AsyncClient(timeout=10) as client:
                            r = await client.post(
                                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                                json={"chat_id": fornecedor["telegram"], "text": msg, "parse_mode": "Markdown"},
                            )
                            if r.status_code == 200:
                                sucesso = True
                                canal_usado = "telegram"
                    except Exception as e:
                        logger.error(f"Telegram cotacao fornecedor {fornecedor_id}: {e}")

                # Atualiza o pedido com o resultado do envio
                cur.execute("""
                    UPDATE pedidos_compra
                    SET mensagem_enviada=%s,
                        status=%s,
                        atualizado_em=NOW()
                    WHERE id=%s
                """, (
                    msg,
                    "enviado" if sucesso else "falha_envio",
                    pedido_id,
                ))

                resultados.append({
                    "fornecedor_id": fornecedor_id,
                    "nome": fornecedor.get("nome"),
                    "pedido_id": pedido_id,
                    "sucesso": sucesso,
                    "canal": canal_usado,
                    "motivo": None if sucesso else "Sem WhatsApp/Telegram configurado ou falha no envio",
                })

            conn.commit()

            enviados = sum(1 for r in resultados if r["sucesso"])
            return {
                "ok": True,
                "total_solicitados": len(body.fornecedor_ids),
                "enviados_com_sucesso": enviados,
                "resultados": resultados,
            }

def _verificar_reposicao_automatica(insumo: dict, alerta: dict, fazenda_id: int, cur, conn):
    """Verifica se deve gerar pedido automático de reposição."""
    if insumo.get("origem") != "comprado":
        return  # Não gera pedido para insumos próprios
    if insumo.get("reposicao_modo") != "automatico":
        return  # Modo manual: só notifica

    qtd_repor = alerta.get("quantidade_repor", 0)
    if qtd_repor <= 0:
        return

    # Verifica se já existe pedido pendente/aprovado para este insumo
    cur.execute("""
        SELECT id FROM pedidos_compra
        WHERE insumo_id=%s AND status IN ('pendente','aprovado','enviado')
        LIMIT 1
    """, (insumo["id"],))
    if cur.fetchone():
        return  # Já tem pedido em andamento

    # Gera pedido automático
    preco = insumo.get("preco_estimado")
    valor_total = preco * qtd_repor if preco else None
    data_entrega = date.today() + timedelta(days=insumo.get("lead_time_dias", 7))

    cur.execute("""
        INSERT INTO pedidos_compra
            (fazenda_id, insumo_id, fornecedor_id, quantidade, preco_estimado,
             valor_total_estimado, data_entrega_desejada, modo_geracao, status)
        VALUES (%s,%s,%s,%s,%s,%s,%s,'automatico','aprovado')
        RETURNING id
    """, (fazenda_id, insumo["id"], insumo.get("fornecedor_id"), qtd_repor,
          preco, valor_total, data_entrega))
    conn.commit()
    logger.info(f"[Insumos] Pedido automático gerado para insumo {insumo['id']}: {qtd_repor} {insumo.get('unidade')}")
from typing import List
from datetime import datetime


class CotacaoCreate(BaseModel):
    insumo_id: Optional[int] = None
    descricao_produto: str
    quantidade: float
    unidade: str = "unidade"
    observacoes: Optional[str] = None
    fornecedor_ids: List[int]
    data_limite_resposta: Optional[date] = None


class CotacaoResposta(BaseModel):
    preco_unitario: float
    prazo_entrega_dias: Optional[int] = None
    observacao_resposta: Optional[str] = None


class CotacaoFechar(BaseModel):
    fornecedor_vencedor_id: int
    criar_pedido_compra: bool = False


def _montar_mensagem_cotacao(produto: str, quantidade: float, unidade: str,
                              observacoes: Optional[str], limite: Optional[date]) -> str:
    limite_str = limite.strftime("%d/%m/%Y") if limite else "sem prazo definido"
    obs_str = f"\n📝 Obs: {observacoes}" if observacoes else ""
    return (
        f"🌾 *Solicitação de Cotação — RuralCaixa*\n\n"
        f"Olá! Poderia nos passar uma cotação de preço para:\n\n"
        f"📦 Produto: {produto}\n"
        f"📊 Quantidade: {quantidade} {unidade}{obs_str}\n"
        f"📅 Responder até: {limite_str}\n\n"
        f"Por favor, responda com o valor unitário e prazo de entrega. Obrigado!"
    )


async def _enviar_cotacao_fornecedor(fornecedor: dict, mensagem: str) -> tuple[bool, str]:
    """Retorna (enviado, canal). Tenta WhatsApp real primeiro, depois Telegram."""
    if fornecedor.get("whatsapp"):
        try:
            from app.services.whatsapp_service import enviar_whatsapp_async
            if await enviar_whatsapp_async(fornecedor["whatsapp"], mensagem):
                return True, "whatsapp"
        except Exception as e:
            logger.error(f"WhatsApp cotação fornecedor {fornecedor.get('id')}: {e}")

    if fornecedor.get("telegram") and TELEGRAM_BOT_TOKEN:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": fornecedor["telegram"], "text": mensagem, "parse_mode": "Markdown"},
                )
                if r.status_code == 200:
                    return True, "telegram"
        except Exception as e:
            logger.error(f"Telegram envio cotação: {e}")

    # Fallback final: avisa o grupo interno (mesmo padrão do pedidos_compra)
    if TELEGRAM_BOT_TOKEN:
        try:
            msg_grupo = f"📋 *Cotação solicitada — sem WhatsApp/Telegram do fornecedor*\nFornecedor: {fornecedor.get('nome','?')}\nWhatsApp: {fornecedor.get('whatsapp','?')}\n\n{mensagem}"
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": TELEGRAM_GROUP_ID, "text": msg_grupo, "parse_mode": "Markdown"},
                )
        except Exception as e:
            logger.error(f"Telegram grupo cotação: {e}")

    return False, "nao_enviado"

@router.post("/cotacoes/")
async def criar_cotacao(body: CotacaoCreate, request: Request):
    fazenda_id = _auth(request)
    if not body.fornecedor_ids:
        raise HTTPException(400, "Selecione ao menos um fornecedor")

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO cotacoes_insumo
                    (fazenda_id, insumo_id, descricao_produto, quantidade, unidade,
                     observacoes, data_limite_resposta)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (fazenda_id, body.insumo_id, body.descricao_produto, body.quantidade,
                  body.unidade, body.observacoes, body.data_limite_resposta))
            cotacao = cur.fetchone()

            mensagem = _montar_mensagem_cotacao(
                body.descricao_produto, body.quantidade, body.unidade,
                body.observacoes, body.data_limite_resposta,
            )

            fornecedores_status = []
            for fid in body.fornecedor_ids:
                cur.execute("SELECT * FROM fornecedores WHERE id=%s AND fazenda_id=%s", (fid, fazenda_id))
                fornecedor = cur.fetchone()
                if not fornecedor:
                    continue

                enviado, canal = await _enviar_cotacao_fornecedor(fornecedor, mensagem)

                cur.execute("""
                    INSERT INTO cotacao_fornecedores
                        (cotacao_id, fornecedor_id, enviado_em, mensagem_enviada, enviado_via)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING *
                """, (cotacao["id"], fid, datetime.now() if enviado else None, mensagem, canal))
                cf = cur.fetchone()
                fornecedores_status.append({
                    "fornecedor_id": fid,
                    "fornecedor_nome": fornecedor["nome"],
                    "enviado": enviado,
                    "canal": canal,
                })

            conn.commit()
            return {"cotacao": cotacao, "fornecedores": fornecedores_status}


@router.get("/cotacoes/")
def listar_cotacoes(request: Request, status: Optional[str] = None):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            q = """
                SELECT c.*,
                    COUNT(cf.id) AS total_fornecedores,
                    COUNT(cf.respondido_em) AS total_respondidos,
                    MIN(cf.preco_unitario) FILTER (WHERE cf.preco_unitario IS NOT NULL) AS menor_preco
                FROM cotacoes_insumo c
                LEFT JOIN cotacao_fornecedores cf ON cf.cotacao_id = c.id
                WHERE c.fazenda_id = %s
            """
            params = [fazenda_id]
            if status:
                q += " AND c.status = %s"
                params.append(status)
            q += " GROUP BY c.id ORDER BY c.criado_em DESC"
            cur.execute(q, params)
            return cur.fetchall()


@router.get("/cotacoes/{cid}")
def obter_cotacao(cid: int, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cotacoes_insumo WHERE id=%s AND fazenda_id=%s", (cid, fazenda_id))
            cotacao = cur.fetchone()
            if not cotacao:
                raise HTTPException(404, "Cotação não encontrada")

            cur.execute("""
                SELECT cf.*, f.nome AS fornecedor_nome, f.whatsapp, f.telegram
                FROM cotacao_fornecedores cf
                JOIN fornecedores f ON f.id = cf.fornecedor_id
                WHERE cf.cotacao_id = %s
                ORDER BY cf.preco_unitario ASC NULLS LAST
            """, (cid,))
            fornecedores = cur.fetchall()

            return {"cotacao": cotacao, "fornecedores": fornecedores}


@router.put("/cotacoes/{cid}/fornecedores/{fid}")
def registrar_resposta(cid: int, fid: int, body: CotacaoResposta, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cotacoes_insumo WHERE id=%s AND fazenda_id=%s", (cid, fazenda_id))
            if not cur.fetchone():
                raise HTTPException(404, "Cotação não encontrada")

            cur.execute("""
                UPDATE cotacao_fornecedores
                SET preco_unitario=%s, prazo_entrega_dias=%s, observacao_resposta=%s, respondido_em=NOW()
                WHERE cotacao_id=%s AND fornecedor_id=%s
                RETURNING *
            """, (body.preco_unitario, body.prazo_entrega_dias, body.observacao_resposta, cid, fid))
            resposta = cur.fetchone()
            if not resposta:
                raise HTTPException(404, "Fornecedor não faz parte dessa cotação")

            # Atualiza status geral da cotação
            cur.execute("""
                SELECT COUNT(*) AS total, COUNT(respondido_em) AS respondidos
                FROM cotacao_fornecedores WHERE cotacao_id=%s
            """, (cid,))
            contagem = cur.fetchone()
            novo_status = (
                "respondida_completa" if contagem["respondidos"] == contagem["total"]
                else "respondida_parcial"
            )
            cur.execute("""
                UPDATE cotacoes_insumo SET status=%s, atualizado_em=NOW() WHERE id=%s
            """, (novo_status, cid))

            conn.commit()
            return {"ok": True, "resposta": resposta, "status_cotacao": novo_status}


@router.post("/cotacoes/{cid}/fechar")
def fechar_cotacao(cid: int, body: CotacaoFechar, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cotacoes_insumo WHERE id=%s AND fazenda_id=%s", (cid, fazenda_id))
            cotacao = cur.fetchone()
            if not cotacao:
                raise HTTPException(404, "Cotação não encontrada")

            cur.execute("""
                SELECT * FROM cotacao_fornecedores WHERE cotacao_id=%s AND fornecedor_id=%s
            """, (cid, body.fornecedor_vencedor_id))
            vencedor = cur.fetchone()
            if not vencedor:
                raise HTTPException(404, "Esse fornecedor não faz parte dessa cotação")

            pedido_id = None
            if body.criar_pedido_compra:
                if not cotacao.get("insumo_id"):
                    raise HTTPException(400, "Essa cotação não está vinculada a um insumo do catálogo — não é possível gerar pedido de compra automaticamente.")
                valor_total = float(vencedor["preco_unitario"] or 0) * float(cotacao["quantidade"])
                cur.execute("""
                    INSERT INTO pedidos_compra
                        (fazenda_id, insumo_id, fornecedor_id, quantidade, preco_estimado,
                         valor_total_estimado, status, modo_geracao)
                    VALUES (%s, %s, %s, %s, %s, %s, 'pendente', 'cotacao')
                    RETURNING id
                """, (fazenda_id, cotacao["insumo_id"], body.fornecedor_vencedor_id,
                      cotacao["quantidade"], vencedor["preco_unitario"], valor_total))
                pedido_id = cur.fetchone()["id"]

            cur.execute("""
                UPDATE cotacoes_insumo
                SET status='fechada', fornecedor_vencedor_id=%s, pedido_compra_id=%s, atualizado_em=NOW()
                WHERE id=%s
            """, (body.fornecedor_vencedor_id, pedido_id, cid))

            conn.commit()
            return {"ok": True, "fornecedor_vencedor_id": body.fornecedor_vencedor_id, "pedido_compra_id": pedido_id}


@router.post("/cotacoes/{cid}/cancelar")
def cancelar_cotacao(cid: int, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE cotacoes_insumo SET status='cancelada', atualizado_em=NOW()
                WHERE id=%s AND fazenda_id=%s
                RETURNING id
            """, (cid, fazenda_id))
            if not cur.fetchone():
                raise HTTPException(404, "Cotação não encontrada")
            conn.commit()
            return {"ok": True}
