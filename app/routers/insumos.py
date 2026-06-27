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
from pydantic import BaseModel, validator
import httpx

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

    @validator("tipo")
    def tipo_valido(cls, v):
        tipos = ("compra","producao_propria","doacao","ajuste_positivo","uso","venda","perda","ajuste_negativo")
        if v not in tipos:
            raise ValueError(f"tipo deve ser um de: {list(tipos)}")
        return v

class PedidoCreate(BaseModel):
    insumo_id: int
    fornecedor_id: Optional[int] = None
    quantidade: float
    preco_estimado: Optional[float] = None
    data_entrega_desejada: Optional[date] = None
    observacao: Optional[str] = None
    modo_geracao: str = "manual"


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
            END AS status_estoque
        FROM insumos i
        LEFT JOIN fornecedores f ON f.id = i.fornecedor_id
        WHERE {" AND ".join(where)}
        ORDER BY i.categoria, i.nome
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return {"data": cur.fetchall()}

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
            cur.execute("""
                INSERT INTO insumos (fazenda_id, nome, descricao, categoria, unidade, origem,
                    estoque_atual, estoque_minimo, estoque_ideal, preco_estimado,
                    fornecedor_id, reposicao_modo, lead_time_dias)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (fazenda_id, body.nome, body.descricao, body.categoria, body.unidade,
                  body.origem, body.estoque_atual, body.estoque_minimo, body.estoque_ideal,
                  body.preco_estimado, body.fornecedor_id, body.reposicao_modo, body.lead_time_dias))
            conn.commit()
            insumo = cur.fetchone()
            # Se estoque_atual > 0, registra movimentação inicial
            if body.estoque_atual > 0:
                cur.execute("""
                    INSERT INTO movimentacoes_insumo
                        (insumo_id, fazenda_id, tipo, quantidade, custo_unitario, observacao, data_movim)
                    VALUES (%s,%s,'ajuste_positivo',%s,%s,'Estoque inicial',%s)
                """, (insumo["id"], fazenda_id, body.estoque_atual, body.preco_estimado, date.today()))
                conn.commit()
            return {"data": insumo}

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
            # Busca últimas movimentações
            cur.execute("""
                SELECT * FROM movimentacoes_insumo
                WHERE insumo_id=%s ORDER BY criado_em DESC LIMIT 20
            """, (iid,))
            row["movimentacoes"] = cur.fetchall()
            return {"data": row}

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
            # Verifica insumo
            cur.execute("SELECT * FROM insumos WHERE id=%s AND fazenda_id=%s", (iid, fazenda_id))
            insumo = cur.fetchone()
            if not insumo: raise HTTPException(404, "Insumo não encontrado")

            custo_total = None
            if body.custo_unitario:
                custo_total = body.custo_unitario * body.quantidade

            cur.execute("""
                INSERT INTO movimentacoes_insumo
                    (insumo_id, fazenda_id, tipo, quantidade, custo_unitario, custo_total, observacao, data_movim)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (iid, fazenda_id, body.tipo, body.quantidade, body.custo_unitario,
                  custo_total, body.observacao, body.data_movim or date.today()))
            conn.commit()
            movim = cur.fetchone()

            # Verifica alerta de estoque baixo após movimentação de saída
            if body.tipo in ("uso","venda","perda","ajuste_negativo"):
                cur.execute("SELECT * FROM vw_insumos_alerta WHERE id=%s", (iid,))
                alerta = cur.fetchone()
                if alerta and alerta["status_estoque"] in ("critico","baixo"):
                    _verificar_reposicao_automatica(insumo, alerta, fazenda_id, cur, conn)

            return {"data": movim}


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
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT p.*, i.nome AS insumo_nome, i.unidade,"
                " f.nome AS fornecedor_nome, f.whatsapp, f.telegram"
                " FROM pedidos_compra p"
                " JOIN insumos i ON i.id = p.insumo_id"
                " LEFT JOIN fornecedores f ON f.id = p.fornecedor_id"
                " WHERE p.id=%s AND p.fazenda_id=%s",
                (pid, fazenda_id)
            )
            pedido = cur.fetchone()
            if not pedido:
                raise HTTPException(404, "Pedido nao encontrado")

            valor_str = f"R$ {pedido['valor_total_estimado']:.2f}" if pedido.get("valor_total_estimado") else "a confirmar"
            entrega_str = pedido["data_entrega_desejada"].strftime("%d/%m/%Y") if pedido.get("data_entrega_desejada") else "a combinar"

            msg_fornecedor = (
                f"Ola, {pedido.get('fornecedor_nome', 'Fornecedor')}!\n\n"
                f"Pedido de Compra - RuralCaixa\n\n"
                f"Produto: {pedido['insumo_nome']}\n"
                f"Quantidade: {pedido['quantidade']} {pedido['unidade']}\n"
                f"Valor estimado: {valor_str}\n"
                f"Entrega desejada: {entrega_str}\n\n"
                f"Confirma disponibilidade e prazo?"
            )
            msg_grupo = (
                f"Pedido de compra enviado\n\n"
                f"Produto: {pedido['insumo_nome']} - {pedido['quantidade']} {pedido['unidade']}\n"
                f"Valor: {valor_str}\n"
                f"Fornecedor: {pedido.get('fornecedor_nome','?')}\n"
                f"WhatsApp: {pedido.get('whatsapp','nao cadastrado')}\n"
                f"Entrega: {entrega_str}"
            )

            enviado_wpp = False
            enviado_tg  = False

            # WhatsApp direto para o fornecedor
            if pedido.get("whatsapp"):
                try:
                    from app.services.whatsapp_service import enviar_whatsapp
                    numero = pedido["whatsapp"].replace("+","").replace(" ","").replace("-","")
                    result = enviar_whatsapp(numero, msg_fornecedor)
                    enviado_wpp = bool(result)
                    logger.info(f"[Pedido] WhatsApp {numero}: {enviado_wpp}")
                except Exception as e:
                    logger.error(f"[Pedido] WhatsApp error: {e}")

            # Telegram para o fornecedor se tiver
            if pedido.get("telegram") and TELEGRAM_BOT_TOKEN:
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        r = await client.post(
                            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                            json={"chat_id": pedido["telegram"], "text": msg_fornecedor},
                        )
                        if r.status_code == 200:
                            enviado_tg = True
                except Exception as e:
                    logger.error(f"[Pedido] Telegram fornecedor error: {e}")

            # Notifica grupo interno sempre
            if TELEGRAM_BOT_TOKEN:
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        await client.post(
                            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                            json={"chat_id": TELEGRAM_GROUP_ID, "text": msg_grupo},
                        )
                except Exception as e:
                    logger.error(f"[Pedido] Telegram grupo error: {e}")

            cur.execute(
                "UPDATE pedidos_compra SET status='enviado', mensagem_enviada=%s,"
                " data_confirmacao=NOW(), atualizado_em=NOW() WHERE id=%s RETURNING *",
                (msg_fornecedor, pid)
            )
            conn.commit()
            return {"ok": True, "enviado_whatsapp": enviado_wpp, "enviado_telegram": enviado_tg}


@router.post("/pedidos-compra/{pid}/confirmar")
async def confirmar_pedido(pid: int, request: Request):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE pedidos_compra SET status='confirmado', atualizado_em=NOW()"
                " WHERE id=%s AND fazenda_id=%s RETURNING *",
                (pid, fazenda_id)
            )
            conn.commit()
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Pedido nao encontrado")
            return {"data": row}


@router.post("/pedidos-compra/{pid}/receber")
async def receber_pedido(pid: int, request: Request, quantidade_recebida: Optional[float] = None):
    fazenda_id = _auth(request)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT p.*, i.preco_estimado FROM pedidos_compra p"
                " JOIN insumos i ON i.id = p.insumo_id"
                " WHERE p.id=%s AND p.fazenda_id=%s",
                (pid, fazenda_id)
            )
            pedido = cur.fetchone()
            if not pedido:
                raise HTTPException(404, "Pedido nao encontrado")
            qtd = quantidade_recebida or pedido["quantidade"]
            cur.execute(
                "INSERT INTO movimentacoes_insumo"
                " (insumo_id, fazenda_id, tipo, quantidade, custo_unitario, observacao, data_movim, pedido_compra_id)"
                " VALUES (%s, %s, 'compra', %s, %s, %s, CURRENT_DATE, %s)",
                (pedido["insumo_id"], fazenda_id, qtd, pedido.get("preco_estimado"),
                 f"Recebimento pedido #{pid}", pid)
            )
            cur.execute(
                "UPDATE pedidos_compra SET status='entregue', data_entrega_real=CURRENT_DATE,"
                " atualizado_em=NOW() WHERE id=%s RETURNING *",
                (pid,)
            )
            conn.commit()
            return {"ok": True, "quantidade_recebida": qtd}



# ── FUNÇÃO INTERNA: reposição automática ─────────────────────────────

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
