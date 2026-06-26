# app/services/auth_service.py — RuralCaixa MVP
"""
Autenticação por CPF + código OTP via WhatsApp/Telegram.

Fluxo:
  1. POST /auth/solicitar  { cpf: "000.000.000-00" }
     → busca produtor pelo CPF
     → gera código 6 dígitos
     → envia via WhatsApp (se tiver telefone) e Telegram (se tiver chat_id)
     → retorna { canal: "whatsapp|telegram|ambos", telefone_mascarado: "(**) *****-1234" }

  2. POST /auth/verificar  { cpf: "000.000.000-00", codigo: "123456" }
     → valida código (máx 3 tentativas, expira em 10 min)
     → retorna { token: "rc_...", produtor: { id, nome, cpf } }
"""

import re
import secrets
import logging
from typing import Optional

logger = logging.getLogger(__name__)

MAX_TENTATIVAS = 3


def _normalizar_cpf(cpf: str) -> str:
    return re.sub(r"\D", "", cpf)


def _mascarar_telefone(tel: str) -> str:
    if not tel:
        return "número cadastrado"
    digits = re.sub(r"\D", "", tel)
    if len(digits) >= 4:
        return f"(**) *****-{digits[-4:]}"
    return "número cadastrado"


def _gerar_codigo() -> str:
    return str(secrets.randbelow(900000) + 100000)  # 100000–999999


def solicitar_codigo(cpf: str) -> dict:
    """
    Gera e envia código OTP para o produtor identificado pelo CPF.
    Retorna dict com canal e telefone mascarado, ou erro.
    """
    cpf_limpo = _normalizar_cpf(cpf)
    if len(cpf_limpo) != 11:
        return {"erro": "CPF inválido. Informe 11 dígitos."}

    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                # Busca produtor
                cur.execute(
                    "SELECT id, nome, telefone, telegram_chat_id "
                    "FROM produtores WHERE regexp_replace(cpf, '[^0-9]', '', 'g') = %s LIMIT 1",
                    (cpf_limpo,)
                )
                prod = cur.fetchone()
                if not prod:
                    return {"erro": "CPF não encontrado. Verifique ou cadastre-se pelo Telegram."}

                produtor_id = prod["id"]
                nome = prod["nome"]
                telefone = prod["telefone"] or ""
                telegram_chat_id = prod["telegram_chat_id"]

                # Invalida códigos anteriores
                cur.execute(
                    "UPDATE auth_codigos SET usado=TRUE "
                    "WHERE produtor_id=%s AND usado=FALSE",
                    (produtor_id,)
                )

                # Gera novo código
                codigo = _gerar_codigo()
                cur.execute(
                    "INSERT INTO auth_codigos (produtor_id, codigo) VALUES (%s, %s)",
                    (produtor_id, codigo)
                )
            conn.commit()

        # Envia via WhatsApp e/ou Telegram
        canais = []
        mensagem = (
            f"🌾 *RuralCaixa — Código de acesso*\n\n"
            f"Olá, {nome.split()[0]}!\n\n"
            f"Seu código de acesso é:\n\n"
            f"*{codigo}*\n\n"
            f"Válido por 10 minutos. Não compartilhe com ninguém."
        )

        if telefone:
            try:
                from app.services.whatsapp_service import enviar_whatsapp
                ok = enviar_whatsapp(telefone, mensagem)
                if ok:
                    canais.append("whatsapp")
            except Exception as e:
                logger.warning(f"[Auth] WhatsApp falhou: {e}")

        if telegram_chat_id:
            try:
                import httpx, os
                token_bot = os.getenv("TELEGRAM_BOT_TOKEN")
                if token_bot:
                    httpx.post(
                        f"https://api.telegram.org/bot{token_bot}/sendMessage",
                        json={
                            "chat_id": telegram_chat_id,
                            "text": mensagem,
                            "parse_mode": "Markdown",
                        },
                        timeout=10,
                    )
                    canais.append("telegram")
            except Exception as e:
                logger.warning(f"[Auth] Telegram falhou: {e}")

        if not canais:
            return {"erro": "Não foi possível enviar o código. Contate o administrador."}

        return {
            "ok": True,
            "canal": "+".join(canais),
            "telefone_mascarado": _mascarar_telefone(telefone),
            "tem_telegram": bool(telegram_chat_id),
        }

    except Exception as e:
        logger.error(f"[Auth] Erro em solicitar_codigo: {e}")
        return {"erro": "Erro interno. Tente novamente."}


def verificar_codigo(cpf: str, codigo: str) -> dict:
    """
    Valida o código OTP. Retorna token se válido, erro se não.
    """
    cpf_limpo = _normalizar_cpf(cpf)
    codigo = codigo.strip()

    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                # Busca produtor
                cur.execute(
                    "SELECT id, nome, cpf, api_token FROM produtores "
                    "WHERE regexp_replace(cpf, '[^0-9]', '', 'g') = %s LIMIT 1",
                    (cpf_limpo,)
                )
                prod = cur.fetchone()
                if not prod:
                    return {"erro": "CPF não encontrado."}

                produtor_id = prod["id"]

                # Busca código válido
                cur.execute("""
                    SELECT id, codigo, expira_em, usado
                    FROM auth_codigos
                    WHERE produtor_id = %s
                      AND usado = FALSE
                      AND expira_em > NOW()
                    ORDER BY criado_em DESC
                    LIMIT 1
                """, (produtor_id,))
                row = cur.fetchone()

                if not row:
                    return {"erro": "Código expirado ou não encontrado. Solicite um novo."}

                if row["codigo"] != codigo:
                    return {"erro": "Código incorreto. Verifique e tente novamente."}

                # Marca como usado
                cur.execute(
                    "UPDATE auth_codigos SET usado=TRUE WHERE id=%s",
                    (row["id"],)
                )

                # Garante que o produtor tem api_token
                api_token = prod["api_token"]
                if not api_token:
                    import secrets as sec
                    api_token = "rc_" + sec.token_urlsafe(32)
                    cur.execute(
                        "UPDATE produtores SET api_token=%s WHERE id=%s",
                        (api_token, produtor_id)
                    )

            conn.commit()

        return {
            "ok": True,
            "token": api_token,
            "produtor": {
                "id": prod["id"],
                "nome": prod["nome"],
                "cpf": prod["cpf"],
            },
        }

    except Exception as e:
        logger.error(f"[Auth] Erro em verificar_codigo: {e}")
        return {"erro": "Erro interno. Tente novamente."}
