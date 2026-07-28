"""
app/routers/whatsapp_bot_router.py — RuralCaixa MVP

Fase 4 da unificacao WhatsApp/Telegram. Espelha telegram_bot_router.py:
recebe o payload da Meta, normaliza pra MsgIn, e delega TUDO pro handler
compartilhado (mensagem_handler.processar_mensagem). Nao reimplementa
nenhuma logica de negocio aqui -- so parsing do formato Meta e envio de
resposta via Graph API.

Isso substitui a funcao processar() antiga em app/main.py (linhas ~1253-
1834), que reimplementava toda a logica de negocio separadamente do
Telegram (inclusive audio, que tinha um pipeline de classificacao
proprio em app/services/audio_handler.py, divergente do usado pelo
Telegram).

Rollout seguro: este router fica registrado num path NOVO
(/wapp/inbound-v2) enquanto nao for validado ponta a ponta. Só depois de
confirmar equivalencia total (texto, audio, imagem, cadastro, recibo,
ovino/caprino por palavra-chave, escolha de insumo ambiguo) o
/wapp/inbound antigo deve ser trocado pra apontar pra ca -- ver
comentario no final deste arquivo.
"""

import os
import logging
import httpx
from fastapi import APIRouter, Request, BackgroundTasks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wapp", tags=["WhatsApp Bot v2"])

WAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")
GRAPH = "https://graph.facebook.com/v23.0"


async def _send(to: str, body: str):
    if not WAPP_TOKEN or not PHONE_ID:
        logger.warning("WHATSAPP_TOKEN/WHATSAPP_PHONE_ID não configurados — mensagem não enviada")
        return
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{GRAPH}/{PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {WAPP_TOKEN}", "Content-Type": "application/json"},
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to,
                "type": "text",
                "text": {"body": body},
            },
        )


async def _baixar_midia(media_id: str) -> tuple:
    """Baixa mídia da Meta e retorna (bytes, mime_type). Mesma lógica já
    usada pra imagem/documento em drive_handler.baixar_midia_whatsapp,
    reaproveitada aqui pra áudio também (endpoint da Meta é o mesmo pra
    qualquer tipo de mídia)."""
    from app.services.drive_handler import baixar_midia_whatsapp
    return await baixar_midia_whatsapp(media_id, WAPP_TOKEN)


async def _processar_payload(payload: dict):
    from app.services.mensagem_handler import MsgIn, processar_mensagem

    try:
        value = payload["entry"][0]["changes"][0]["value"]
        msgs = value.get("messages", [])
        if not msgs:
            return
        msg = msgs[0]
        numero = msg["from"]
        tipo_meta = msg["type"]
    except (KeyError, IndexError) as e:
        logger.error(f"Payload da Meta em formato inesperado: {e}")
        return

    tipo = "text"
    texto = ""
    midia_bytes = b""
    mime_type = ""

    if tipo_meta == "text":
        texto = msg["text"]["body"].strip()
        tipo = "text"

    elif tipo_meta == "audio":
        media_id = msg["audio"]["id"]
        await _send(numero, "🎙️ Áudio recebido! Transcrevendo...")
        midia_bytes, mime_type = await _baixar_midia(media_id)
        tipo = "audio"

    elif tipo_meta == "image":
        media_id = msg["image"]["id"]
        await _send(numero, "📷 Imagem recebida! Analisando...")
        midia_bytes, mime_type = await _baixar_midia(media_id)
        tipo = "image"

    elif tipo_meta == "document":
        media_id = msg["document"]["id"]
        await _send(numero, "📄 Documento recebido! Processando...")
        midia_bytes, mime_type = await _baixar_midia(media_id)
        tipo = "document"

    else:
        await _send(numero, "Envie texto, áudio ou foto de documento.")
        return

    entrada = MsgIn(
        canal="whatsapp",
        numero=numero,
        tipo=tipo,
        texto=texto,
        midia_bytes=midia_bytes,
        mime_type=mime_type,
    )

    try:
        resposta = await processar_mensagem(entrada)
        if resposta:
            await _send(numero, resposta)
    except Exception as e:
        logger.error(f"Erro processar_mensagem whatsapp: {e}", exc_info=True)
        await _send(numero, "Erro interno. Tente novamente.")


@router.get("/inbound-v2")
async def verify_webhook_v2(request: Request):
    """Verificação do webhook (handshake da Meta) -- mesmo esquema do
    endpoint antigo em main.py, precisa responder o hub.challenge."""
    params = request.query_params
    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "")
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == verify_token:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(params.get("hub.challenge", ""))
    from fastapi import HTTPException
    raise HTTPException(403, "Verify token inválido")


@router.post("/inbound-v2")
async def wapp_inbound_v2(request: Request, background: BackgroundTasks):
    payload = await request.json()
    background.add_task(_processar_payload, payload)
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────
# PROXIMO PASSO (nao feito automaticamente por este arquivo):
# depois de validar esse endpoint ponta a ponta com mensagens reais
# (texto, audio, imagem, cadastro, recibo, ovino/caprino por palavra-
# chave, escolha de insumo ambiguo), trocar em app/main.py:
#
#   @app.post("/wapp/inbound")
#   async def wapp_inbound(request: Request, background: BackgroundTasks):
#       payload = await request.json()
#       background.add_task(processar, payload)   # <- antigo
#
# por:
#
#   @app.post("/wapp/inbound")
#   async def wapp_inbound(request: Request, background: BackgroundTasks):
#       from app.routers.whatsapp_bot_router import _processar_payload
#       payload = await request.json()
#       background.add_task(_processar_payload, payload)   # <- novo
#
# Só ai remover a funcao processar() antiga (linhas ~1253-1834 do
# main.py) e o app/services/audio_handler.py (fica orfao).
# ─────────────────────────────────────────────────────────────────────
