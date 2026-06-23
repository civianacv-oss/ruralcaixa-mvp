"""
RuralCaixa — app/services/whatsapp_service.py

Camada única de envio de mensagens WhatsApp.
Substitui as funções enviar_whatsapp() duplicadas em cada cron.

Uso:
    from app.services.whatsapp_service import enviar_whatsapp
    ok = enviar_whatsapp("5511999999999", "Olá, produtor!")
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

WAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "")
PHONE_ID   = os.environ.get("WHATSAPP_PHONE_ID", "")
GRAPH      = "https://graph.facebook.com/v23.0"


def enviar_whatsapp(para: str, mensagem: str, timeout: int = 10) -> bool:
    """
    Envia mensagem de texto via WhatsApp Business API (Meta Cloud API).

    Parâmetros
    ----------
    para     : número no formato internacional sem '+' (ex: '5511999999999')
    mensagem : texto da mensagem (suporta *negrito* e _itálico_ do WhatsApp)
    timeout  : timeout em segundos para a requisição HTTP

    Retorna True se enviado com sucesso (HTTP 200), False caso contrário.
    """
    if not WAPP_TOKEN or not PHONE_ID:
        logger.warning("WhatsApp não configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID ausentes).")
        return False

    try:
        r = httpx.post(
            f"{GRAPH}/{PHONE_ID}/messages",
            headers={
                "Authorization": f"Bearer {WAPP_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": para,
                "type": "text",
                "text": {"body": mensagem},
            },
            timeout=timeout,
        )
        if r.status_code == 200:
            return True
        logger.warning("WhatsApp HTTP %d para %s: %s", r.status_code, para, r.text[:200])
        return False
    except Exception as exc:
        logger.error("Erro ao enviar WhatsApp para %s: %s", para, exc)
        return False


async def enviar_whatsapp_async(para: str, mensagem: str, timeout: int = 10) -> bool:
    """Versão assíncrona para uso em contextos async (FastAPI handlers)."""
    if not WAPP_TOKEN or not PHONE_ID:
        logger.warning("WhatsApp não configurado.")
        return False

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{GRAPH}/{PHONE_ID}/messages",
                headers={
                    "Authorization": f"Bearer {WAPP_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": para,
                    "type": "text",
                    "text": {"body": mensagem},
                },
                timeout=timeout,
            )
        if r.status_code == 200:
            return True
        logger.warning("WhatsApp async HTTP %d para %s", r.status_code, para)
        return False
    except Exception as exc:
        logger.error("Erro async WhatsApp para %s: %s", para, exc)
        return False
