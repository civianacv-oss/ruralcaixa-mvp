# app/middleware/auth_middleware.py — RuralCaixa MVP
"""
Middleware global de autenticação.
Rotas públicas (sem token): webhooks, assinatura, health.
Todas as demais exigem Bearer token válido.
"""

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import logging

logger = logging.getLogger(__name__)

# Rotas que NÃO exigem autenticação
ROTAS_PUBLICAS = {
    "/feedback",
    "/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}

PREFIXOS_PUBLICOS = (
    "/telegram/",       # webhook do Telegram
    "/whatsapp/",       # webhook do WhatsApp
    "/assinar/",        # página de assinatura (OTP próprio)
    "/contratos/assinar/",  # endpoint de assinatura via OTP
    "/auth/",           # endpoints de autenticação
    "/static/",
)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Rotas públicas — passa direto
        if path in ROTAS_PUBLICAS:
            return await call_next(request)

        if any(path.startswith(p) for p in PREFIXOS_PUBLICOS):
            return await call_next(request)

        # Verifica Bearer token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Token de autenticação não fornecido.",
                    "detail": "Use o header: Authorization: Bearer {seu_token}",
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return JSONResponse(
                status_code=401,
                content={"error": "Token vazio."},
            )

        # Valida token no banco
        produtor = _validar_token(token)
        if not produtor:
            return JSONResponse(
                status_code=401,
                content={"error": "Token inválido ou expirado."},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Injeta produtor no request state para uso nos endpoints
        request.state.produtor = produtor
        request.state.produtor_id = produtor["id"]

        return await call_next(request)


def _validar_token(token: str):
    """Valida api_token no banco. Retorna dict ou None."""
    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, nome, cpf, telefone FROM produtores "
                    "WHERE api_token = %s LIMIT 1",
                    (token,)
                )
                row = cur.fetchone()
                return dict(row) if row else None
    except Exception as e:
        logger.error(f"[AuthMiddleware] Erro: {e}")
        return None
