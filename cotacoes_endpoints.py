"""
ADICIONAR ao final de app/routers/insumos.py (mesmo arquivo, mesmo router
já existente — reaproveita get_db, _auth, TELEGRAM_BOT_TOKEN, logger).

Endpoints:
  POST   /cotacoes/                          — solicitar cotação a 1+ fornecedores
  GET    /cotacoes/                          — listar cotações
  GET    /cotacoes/{cid}                     — detalhe com respostas dos fornecedores
  PUT    /cotacoes/{cid}/fornecedores/{fid}  — registrar resposta de um fornecedor
  POST   /cotacoes/{cid}/fechar              — escolher vencedor (e opcionalmente gerar pedido de compra)
  POST   /cotacoes/{cid}/cancelar            — cancelar (soft, mantém histórico)
"""

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
    """Retorna (enviado, canal)."""
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

    # Fallback: avisa o grupo interno (mesmo padrão do pedidos_compra)
    if TELEGRAM_BOT_TOKEN:
        try:
            msg_grupo = f"📋 *Cotação solicitada*\nFornecedor: {fornecedor.get('nome','?')}\nWhatsApp: {fornecedor.get('whatsapp','?')}\n\n{mensagem}"
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": TELEGRAM_GROUP_ID, "text": msg_grupo, "parse_mode": "Markdown"},
                )
            return True, "nao_enviado"  # não chegou no fornecedor, só no grupo interno
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
