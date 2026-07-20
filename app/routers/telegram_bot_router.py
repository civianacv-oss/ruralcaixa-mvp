"""
app/routers/telegram_bot_router.py — RuralCaixa MVP

Webhook Telegram completo — espelho do WhatsApp.
Recebe updates do Telegram, normaliza para MsgIn e
delega ao handler compartilhado (mensagem_handler.py).

Configuração no Telegram:
    POST https://api.telegram.org/bot{TOKEN}/setWebhook
    url=https://ruralcaixa-mvp-production.up.railway.app/telegram/webhook
"""

import os
import logging
import httpx
from fastapi import APIRouter, Request, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["Telegram Bot"])

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


# ── Envio de mensagem ─────────────────────────────────────────────────

async def _send(chat_id: str, text: str) -> None:
    """Envia mensagem de texto para chat_id."""
    if not BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{TELEGRAM_API}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
    except Exception as e:
        logger.error("Telegram send error: %s", e)


async def _download_file(file_id: str) -> bytes:
    """Baixa arquivo do Telegram pelo file_id."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{TELEGRAM_API}/getFile?file_id={file_id}")
        path = r.json()["result"]["file_path"]
        r2 = await client.get(
            f"https://api.telegram.org/file/bot{BOT_TOKEN}/{path}"
        )
        return r2.content


# ── Webhook ───────────────────────────────────────────────────────────

@router.post("/webhook")
async def telegram_webhook(request: Request):
    """
    Recebe updates do Telegram Bot API.
    Suporta: text, voice, audio, photo, document.
    """
    from app.services.mensagem_handler import MsgIn, processar_mensagem

    try:
        update = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return {"ok": True}

    chat_id = str(msg["chat"]["id"])
    # LOG TEMPORARIO -- so pra identificar chat_id de novos usuarios pelos
    # logs do Railway (ex: vincular o Ubiratan). Remover depois de usado.
    _chat = msg.get("chat", {})
    _nome_log = f"{_chat.get('first_name','')} {_chat.get('last_name','')}".strip()
    logger.info(f"[TELEGRAM_CHAT_ID_DEBUG] chat_id={chat_id} nome='{_nome_log}' username='{_chat.get('username','')}'")
    msg_type = "text"
    texto = ""
    midia_bytes = b""
    mime_type = ""
    nome_arquivo = ""

    # ── Texto ──
    if "text" in msg:
        texto = msg["text"]
        msg_type = "text"

    # ── Voz / áudio ──
    elif "voice" in msg or "audio" in msg:
        media = msg.get("voice") or msg.get("audio")
        file_id = media["file_id"]
        await _send(chat_id, "🎙️ Áudio recebido! Transcrevendo...")
        midia_bytes = await _download_file(file_id)
        mime_type = media.get("mime_type", "audio/ogg")
        msg_type = "audio"

    # ── Foto ──
    elif "photo" in msg:
        # Pega a maior resolução
        photo = msg["photo"][-1]
        file_id = photo["file_id"]
        await _send(chat_id, "📷 Imagem recebida! Analisando...")
        midia_bytes = await _download_file(file_id)
        mime_type = "image/jpeg"
        msg_type = "image"

    # ── Documento ──
    elif "document" in msg:
        doc = msg["document"]
        file_id = doc["file_id"]
        nome_arquivo = doc.get("file_name", "documento")
        await _send(chat_id, "📄 Documento recebido! Processando...")
        midia_bytes = await _download_file(file_id)
        mime_type = doc.get("mime_type", "application/pdf")
        msg_type = "document"

    else:
        await _send(chat_id, "Envie texto, áudio, foto ou documento.")
        return {"ok": True}

    # Normaliza e processa
    entrada = MsgIn(
        canal="telegram",
        numero=chat_id,
        tipo=msg_type,
        texto=texto,
        midia_bytes=midia_bytes,
        mime_type=mime_type,
        nome_arquivo=nome_arquivo,
    )

    try:
        resposta = await processar_mensagem(entrada)
        if resposta:
            await _send(chat_id, resposta)
    except Exception as e:
        logger.error("Erro processar_mensagem telegram: %s", e, exc_info=True)
        await _send(chat_id, "Erro interno. Tente novamente.")

    return {"ok": True}


# ── Setup do webhook ──────────────────────────────────────────────────

@router.post("/webhook/setup")
async def setup_webhook(base_url: str = None):
    """
    Registra o webhook no Telegram.
    Chamar uma vez após deploy: POST /telegram/webhook/setup
    """
    if not BOT_TOKEN:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN não configurado")

    url = base_url or os.getenv(
        "RAILWAY_PUBLIC_DOMAIN",
        "https://ruralcaixa-mvp-production.up.railway.app"
    )
    webhook_url = f"{url}/telegram/webhook"

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{TELEGRAM_API}/setWebhook",
            json={"url": webhook_url, "allowed_updates": ["message", "edited_message"]},
        )
    data = r.json()
    if not data.get("ok"):
        raise HTTPException(502, f"Telegram error: {data.get('description')}")
    return {"status": "webhook configurado", "url": webhook_url, "telegram": data}


@router.get("/webhook/info")
async def webhook_info():
    """Retorna info do webhook atual."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{TELEGRAM_API}/getWebhookInfo")
    return r.json()
