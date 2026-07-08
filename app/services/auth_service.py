# app/services/auth_service.py - RuralCaixa MVP
"""
Servico de autenticacao por CPF + codigo OTP (One-Time Password).

Fluxo:
  1. solicitar_codigo(cpf) - localiza produtor, gera codigo de 6 digitos,
     salva em auth_codigos, envia via Telegram (ou WhatsApp como fallback).
  2. verificar_codigo(cpf, codigo) - valida codigo, marca como usado,
     retorna o api_token do produtor para uso nas proximas requisicoes.
"""
import os
import random
import secrets
import logging
from datetime import datetime, timedelta

import httpx

from app.db import get_db

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")

CODIGO_VALIDADE_MINUTOS = 10


def _limpar_cpf(cpf: str) -> str:
    return (cpf or "").replace(".", "").replace("-", "").replace(" ", "")


def _gerar_codigo() -> str:
    return f"{random.randint(0, 999999):06d}"


def _enviar_telegram(chat_id: str, texto: str) -> bool:
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("[auth_service] TELEGRAM_BOT_TOKEN nao configurado.")
        return False
    try:
        resp = httpx.post(
            f"{TELEGRAM_API}/sendMessage",
            json={"chat_id": chat_id, "text": texto, "parse_mode": "HTML"},
            timeout=10,
        )
        data = resp.json()
        if not data.get("ok"):
            logger.error(f"[auth_service] Telegram falhou: {data}")
            return False
        return True
    except Exception as e:
        logger.error(f"[auth_service] Erro ao enviar Telegram: {e}")
        return False


def _enviar_whatsapp_texto(telefone: str, texto: str) -> bool:
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        logger.warning("[auth_service] WHATSAPP_TOKEN/PHONE_ID nao configurado.")
        return False
    try:
        url = f"https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_ID}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": telefone,
            "type": "text",
            "text": {"body": texto},
        }
        headers = {
            "Authorization": f"Bearer {WHATSAPP_TOKEN}",
            "Content-Type": "application/json",
        }
        resp = httpx.post(url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"[auth_service] Erro ao enviar WhatsApp: {e}")
        return False


def solicitar_codigo(cpf: str) -> dict:
    """Localiza o produtor pelo CPF, gera um codigo OTP e envia via Telegram
    (ou WhatsApp como fallback)."""
    cpf_limpo = _limpar_cpf(cpf)
    if not cpf_limpo:
        return {"erro": "CPF invalido."}

    produtor = None
    codigo = _gerar_codigo()

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, nome, telegram_chat_id, telefone "
                    "FROM produtores WHERE cpf = %s LIMIT 1",
                    (cpf_limpo,),
                )
                produtor = cur.fetchone()

                if not produtor:
                    return {"erro": "CPF nao encontrado."}

                expira_em = datetime.utcnow() + timedelta(minutes=CODIGO_VALIDADE_MINUTOS)

                cur.execute(
                    "INSERT INTO auth_codigos (produtor_id, codigo, expira_em, usado) "
                    "VALUES (%s, %s, %s, FALSE)",
                    (produtor["id"], codigo, expira_em),
                )
                conn.commit()
    except Exception as e:
        logger.error(f"[auth_service] Erro ao gerar codigo: {e}")
        return {"erro": "Erro interno ao gerar codigo. Tente novamente."}

    texto = (
        f"RuralCaixa - Codigo de acesso\n\n"
        f"Seu codigo: {codigo}\n"
        f"Valido por {CODIGO_VALIDADE_MINUTOS} minutos."
    )

    canal_usado = None

    telegram_chat_id = produtor.get("telegram_chat_id")
    if telegram_chat_id:
        if _enviar_telegram(telegram_chat_id, texto):
            canal_usado = "telegram"

    if not canal_usado and produtor.get("telefone"):
        if _enviar_whatsapp_texto(produtor["telefone"], texto):
            canal_usado = "whatsapp"

    if not canal_usado:
        logger.error(f"[auth_service] Falha ao enviar codigo para produtor {produtor['id']}")
        return {"erro": "Nao foi possivel enviar o codigo. Verifique Telegram/WhatsApp cadastrados."}

    return {"status": "enviado", "canal": canal_usado}


def verificar_codigo(cpf: str, codigo: str) -> dict:
    """Valida o codigo OTP e retorna o api_token do produtor em caso de sucesso."""
    cpf_limpo = _limpar_cpf(cpf)
    if not cpf_limpo or not codigo:
        return {"erro": "CPF e codigo sao obrigatorios."}

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, nome, api_token FROM produtores WHERE cpf = %s LIMIT 1",
                    (cpf_limpo,),
                )
                produtor = cur.fetchone()

                if not produtor:
                    return {"erro": "CPF nao encontrado."}

                cur.execute(
                    "SELECT id, expira_em, usado FROM auth_codigos "
                    "WHERE produtor_id = %s AND codigo = %s "
                    "ORDER BY criado_em DESC LIMIT 1",
                    (produtor["id"], codigo),
                )
                registro = cur.fetchone()

                if not registro:
                    return {"erro": "Codigo invalido."}

                if registro["usado"]:
                    return {"erro": "Codigo ja utilizado. Solicite um novo."}

                if registro["expira_em"] < datetime.utcnow():
                    return {"erro": "Codigo expirado. Solicite um novo."}

                cur.execute(
                    "UPDATE auth_codigos SET usado = TRUE WHERE id = %s",
                    (registro["id"],),
                )

                api_token = produtor.get("api_token")
                if not api_token:
                    api_token = f"rc_{secrets.token_urlsafe(32)}"
                    cur.execute(
                        "UPDATE produtores SET api_token = %s WHERE id = %s",
                        (api_token, produtor["id"]),
                    )
                conn.commit()
    except Exception as e:
        logger.error(f"[auth_service] Erro ao verificar codigo: {e}")
        return {"erro": "Erro interno ao verificar codigo. Tente novamente."}

    return {
        "status": "autenticado",
        "token": api_token,
        "produtor_id": produtor["id"],
        "nome": produtor["nome"],
    }
