# app/services/auth.py — RuralCaixa MVP
"""
Autenticação JWT por produtor + OTP por contrato.

Fluxo:
  Produtor → api_token fixo (gerado no cadastro)
  Condômino → token_otp temporário (gerado por contrato, já existe em assinaturas)

Uso nos endpoints FastAPI:
  @router.get("/rota", dependencies=[Depends(auth_required)])
  async def rota(produtor: dict = Depends(get_produtor_atual)):
      ...

Uso no bot (mensagem_handler / contrato_handler):
  headers = auth_headers(produtor["api_token"])
  r = await client.get(f"{API_BASE}/endpoint", headers=headers)
"""

import os
import secrets
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

# ── Helpers ───────────────────────────────────────────────────────────

def gerar_api_token() -> str:
    """Gera um token único para um produtor."""
    return "rc_" + secrets.token_urlsafe(32)


def auth_headers(token: str) -> dict:
    """Monta header Authorization para chamadas HTTP do bot."""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


# ── Validação do token ────────────────────────────────────────────────

def _buscar_produtor_por_token(token: str) -> Optional[dict]:
    """Busca produtor pelo api_token. Retorna dict ou None."""
    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, nome, cpf, telefone, api_token "
                    "FROM produtores WHERE api_token = %s LIMIT 1",
                    (token,)
                )
                row = cur.fetchone()
                return dict(row) if row else None
    except Exception as e:
        logger.error(f"[Auth] Erro ao buscar produtor por token: {e}")
        return None


# ── Dependências FastAPI ──────────────────────────────────────────────

async def get_produtor_atual(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> dict:
    """
    Dependência FastAPI: extrai e valida o Bearer token.
    Retorna dict do produtor ou lança 401.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação não fornecido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    produtor = _buscar_produtor_por_token(token)

    if not produtor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return produtor


async def auth_required(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> None:
    """
    Dependência FastAPI simples: só valida, não retorna o produtor.
    Uso: dependencies=[Depends(auth_required)]
    """
    await get_produtor_atual(credentials)


# ── OTP para assinatura de contrato ──────────────────────────────────

def validar_otp_assinatura(contrato_id: str, token_otp: str) -> Optional[dict]:
    """
    Valida OTP de assinatura de contrato.
    Retorna dict da assinatura ou None se inválido/expirado.
    """
    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, contrato_id, papel, socio_id, parceiro_externo_id,
                           status, token_tentativas
                    FROM assinaturas
                    WHERE contrato_id = %s
                      AND token_otp = %s
                      AND token_expira_em > NOW()
                      AND status = 'pendente'
                    LIMIT 1
                """, (contrato_id, token_otp))
                row = cur.fetchone()
                if not row:
                    return None

                # Incrementa tentativas
                cur.execute(
                    "UPDATE assinaturas SET token_tentativas = token_tentativas + 1 "
                    "WHERE id = %s",
                    (row["id"],)
                )
                conn.commit()
                return dict(row)
    except Exception as e:
        logger.error(f"[Auth] Erro ao validar OTP: {e}")
        return None


# ── Geração de token para novos produtores ────────────────────────────

def criar_token_produtor(produtor_id: int) -> Optional[str]:
    """
    Gera e salva api_token para um produtor recém-cadastrado.
    Chamado no endpoint de cadastro.
    """
    token = gerar_api_token()
    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE produtores SET api_token = %s WHERE id = %s",
                    (token, produtor_id)
                )
            conn.commit()
        return token
    except Exception as e:
        logger.error(f"[Auth] Erro ao criar token para produtor {produtor_id}: {e}")
        return None


def buscar_token_produtor(produtor_id: int) -> Optional[str]:
    """Retorna o api_token de um produtor existente."""
    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT api_token FROM produtores WHERE id = %s",
                    (produtor_id,)
                )
                row = cur.fetchone()
                return row["api_token"] if row else None
    except Exception as e:
        logger.error(f"[Auth] Erro ao buscar token: {e}")
        return None
