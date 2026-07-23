"""
telegram_router.py — RuralCaixa MVP (CORRIGIDO)
Alertas via Telegram: grupo + individual por produtor

Correções aplicadas:
- Conexão usando SQLAlchemy engine compartilhado (pool)
- Rate limiting básico no envio de mensagens
- Sem fallback hardcoded para tokens
- Tratamento de erros robusto
"""

import os
import time
import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import engine
from sqlalchemy import text

router = APIRouter(prefix="/telegram", tags=["Telegram"])

logger = logging.getLogger(__name__)

# ─── Configuração ────────────────────────────────────────────────────────────

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_GROUP_CHAT_ID = os.getenv("TELEGRAM_GROUP_CHAT_ID", "")

if not TELEGRAM_BOT_TOKEN:
    logger.warning("TELEGRAM_BOT_TOKEN não configurado — alertas do Telegram desativados")

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else ""

# Rate limiting simples (30 mensagens/segundo é o limite da API)
_last_send_time = 0
_MIN_INTERVAL = 0.035  # ~28 msg/s para segurança


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AlertaAgua(BaseModel):
    piscicultura_id: int
    oxigenio: Optional[float] = None
    ph: Optional[float] = None
    temperatura: Optional[float] = None
    transparencia: Optional[float] = None
    observacao: Optional[str] = None


class AlertaMortalidade(BaseModel):
    piscicultura_id: int
    quantidade: int = Field(..., gt=0)
    sintomas: Optional[str] = None
    data_ocorrencia: Optional[str] = None   # "YYYY-MM-DD"


class AlertaGenerico(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=200)
    mensagem: str = Field(..., min_length=1, max_length=2000)
    piscicultura_id: Optional[int] = None   # None = só grupo
    nivel: str = Field("info", pattern=r"^(info|aviso|critico)$")


class MensagemDireta(BaseModel):
    telegram_chat_id: str
    mensagem: str = Field(..., min_length=1, max_length=2000)


# ─── Funções core de envio ────────────────────────────────────────────────────

async def _send_telegram(chat_id: str, text: str, parse_mode: str = "HTML") -> dict:
    """Envia mensagem para qualquer chat_id via Bot API com rate limiting."""
    global _last_send_time

    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN não configurado")
    if not chat_id:
        raise HTTPException(500, "chat_id inválido ou vazio")

    # Rate limiting
    elapsed = time.time() - _last_send_time
    if elapsed < _MIN_INTERVAL:
        await __import__('asyncio').sleep(_MIN_INTERVAL - elapsed)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{TELEGRAM_API}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode},
            )
        data = resp.json()
        _last_send_time = time.time()

        if not data.get("ok"):
            logger.error(f"Telegram API error: {data.get('description')}")
            raise HTTPException(502, f"Telegram API error: {data.get('description')}")
        return data
    except httpx.TimeoutException:
        logger.error("Timeout ao enviar mensagem para Telegram")
        raise HTTPException(504, "Timeout ao enviar mensagem")


def _get_piscicultura_info(piscicultura_id: int) -> dict:
    """Retorna nome do viveiro e telegram_chat_id do produtor responsável."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT
                p.nome        AS nome_viveiro,
                p.especie,
                u.nome        AS nome_produtor,
                u.telegram_chat_id
            FROM piscicultura p
            JOIN produtores u ON u.id = p.produtor_id
            WHERE p.id = :pid
        """), {"pid": piscicultura_id}).fetchone()

        return dict(row._mapping) if row else {}


def _nivel_emoji(nivel: str) -> str:
    return {"info": "ℹ️", "aviso": "⚠️", "critico": "🚨"}.get(nivel, "📢")


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/alerta/agua")
async def alerta_qualidade_agua(body: AlertaAgua):
    """
    Dispara alerta de qualidade da água.
    - Envia para o grupo SEMPRE.
    - Se produtor tiver telegram_chat_id, envia mensagem individual também.
    """
    info = _get_piscicultura_info(body.piscicultura_id)
    nome_viveiro = info.get("nome_viveiro", f"Viveiro #{body.piscicultura_id}")
    especie = info.get("especie", "Peixe")

    # Detecta parâmetros críticos automaticamente
    alertas = []
    if body.oxigenio is not None and body.oxigenio < 3.0:
        alertas.append(f"🔴 O₂ dissolvido: <b>{body.oxigenio} mg/L</b> (mín: 3,0)")
    if body.ph is not None and not (6.5 <= body.ph <= 8.5):
        alertas.append(f"🔴 pH: <b>{body.ph}</b> (ideal: 6,5–8,5)")
    if body.temperatura is not None and not (22 <= body.temperatura <= 34):
        alertas.append(f"🟡 Temperatura: <b>{body.temperatura}°C</b> (ideal: 22–34°C)")
    if body.transparencia is not None and not (30 <= body.transparencia <= 70):
        alertas.append(f"🟡 Transparência: <b>{body.transparencia} cm</b> (ideal: 30–70 cm)")

    nivel = "critico" if any("🔴" in a for a in alertas) else "aviso" if alertas else "info"
    emoji = _nivel_emoji(nivel)

    linhas_parametros = "\n".join(alertas) if alertas else "✅ Todos os parâmetros dentro do normal"

    texto_grupo = (
        f"{emoji} <b>ALERTA QUALIDADE DA ÁGUA</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"🐟 <b>{nome_viveiro}</b> ({especie})\n"
        f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M')}\n\n"
        f"{linhas_parametros}"
        + (f"\n\n📝 <i>{body.observacao}</i>" if body.observacao else "")
    )

    resultados = {}

    # Envia para o grupo
    if TELEGRAM_GROUP_CHAT_ID:
        resultados["grupo"] = await _send_telegram(TELEGRAM_GROUP_CHAT_ID, texto_grupo)

    # Envia individual para o produtor (mensagem mais detalhada)
    telegram_chat_id = info.get("telegram_chat_id")
    if telegram_chat_id:
        texto_individual = (
            f"{emoji} Olá, <b>{info.get('nome_produtor', 'Produtor')}</b>!\n\n"
            f"Alerta detectado em <b>{nome_viveiro}</b>:\n\n"
            f"{linhas_parametros}"
            + (f"\n\n📝 {body.observacao}" if body.observacao else "")
            + "\n\n<i>Acesse o RuralCaixa para registrar as correções.</i>"
        )
        resultados["individual"] = await _send_telegram(telegram_chat_id, texto_individual)

    return {
        "status": "enviado",
        "nivel": nivel,
        "destinatarios": list(resultados.keys()),
        "alertas_detectados": len(alertas),
    }


@router.post("/alerta/mortalidade")
async def alerta_mortalidade(body: AlertaMortalidade):
    """
    Alerta de mortalidade — sempre crítico se > 2%/dia.
    Envia para grupo + produtor individual.
    """
    info = _get_piscicultura_info(body.piscicultura_id)
    nome_viveiro = info.get("nome_viveiro", f"Viveiro #{body.piscicultura_id}")
    data_str = body.data_ocorrencia or datetime.now().strftime("%d/%m/%Y")

    texto = (
        f"🚨 <b>MORTALIDADE REGISTRADA</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"🐟 <b>{nome_viveiro}</b>\n"
        f"📅 Data: {data_str}\n"
        f"💀 Quantidade: <b>{body.quantidade} peixes</b>\n"
        + (f"🔬 Sintomas: {body.sintomas}\n" if body.sintomas else "")
        + f"\n⚠️ <i>Verifique O₂, pH e temperatura imediatamente.</i>\n"
        f"📋 Registre no fichário sanitário do RuralCaixa."
    )

    resultados = {}

    if TELEGRAM_GROUP_CHAT_ID:
        resultados["grupo"] = await _send_telegram(TELEGRAM_GROUP_CHAT_ID, texto)

    telegram_chat_id = info.get("telegram_chat_id")
    if telegram_chat_id:
        resultados["individual"] = await _send_telegram(telegram_chat_id, texto)

    return {"status": "enviado", "destinatarios": list(resultados.keys())}


@router.post("/alerta/generico")
async def alerta_generico(body: AlertaGenerico):
    """
    Alerta livre — pode ser financeiro, sanitário, vencimento de contrato, etc.
    Se piscicultura_id informado, envia também para o produtor individual.
    """
    emoji = _nivel_emoji(body.nivel)

    texto = (
        f"{emoji} <b>{body.titulo}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n"
        f"{body.mensagem}\n\n"
        f"<i>🕐 {datetime.now().strftime('%d/%m/%Y %H:%M')}</i>"
    )

    resultados = {}

    if TELEGRAM_GROUP_CHAT_ID:
        resultados["grupo"] = await _send_telegram(TELEGRAM_GROUP_CHAT_ID, texto)

    if body.piscicultura_id:
        info = _get_piscicultura_info(body.piscicultura_id)
        telegram_chat_id = info.get("telegram_chat_id")
        if telegram_chat_id:
            resultados["individual"] = await _send_telegram(telegram_chat_id, texto)

    return {"status": "enviado", "destinatarios": list(resultados.keys())}


@router.post("/mensagem-direta")
async def mensagem_direta(body: MensagemDireta):
    """Envia mensagem direta para um chat_id específico (uso interno/debug)."""
    resultado = await _send_telegram(body.telegram_chat_id, body.mensagem)
    return {"status": "enviado", "message_id": resultado["result"]["message_id"]}


@router.get("/status")
async def status_bot():
    """Verifica se o bot está ativo e retorna informações dele."""
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN não configurado")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{TELEGRAM_API}/getMe")
    data = resp.json()

    if not data.get("ok"):
        raise HTTPException(502, f"Bot inativo: {data.get('description')}")

    bot = data["result"]
    return {
        "status": "ativo",
        "bot_username": f"@{bot['username']}",
        "bot_name": bot["first_name"],
        "grupo_configurado": bool(TELEGRAM_GROUP_CHAT_ID),
    }


@router.get("/chat-id")
async def descobrir_chat_id():
    """
    Retorna as últimas atualizações do bot — use para descobrir
    o Chat ID de um grupo ou usuário que mandou /start.
    """
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN não configurado")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{TELEGRAM_API}/getUpdates")
    data = resp.json()

    if not data.get("ok"):
        raise HTTPException(502, data.get("description"))

    chats = []
    for upd in data.get("result", []):
        msg = upd.get("message") or upd.get("my_chat_member", {})
        chat = msg.get("chat", {})
        if chat:
            chats.append({
                "chat_id": chat.get("id"),
                "tipo": chat.get("type"),
                "nome": chat.get("title") or f"{chat.get('first_name','')} {chat.get('last_name','')}".strip(),
                "username": chat.get("username"),
            })

    # Remove duplicatas por chat_id
    vistos = set()
    unicos = []
    for c in chats:
        if c["chat_id"] not in vistos:
            vistos.add(c["chat_id"])
            unicos.append(c)

    return {"chats_encontrados": unicos}
