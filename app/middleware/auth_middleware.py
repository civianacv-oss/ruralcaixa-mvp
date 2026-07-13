# app/middleware/auth_middleware.py - RuralCaixa MVP
"""
Middleware global de autenticacao.
Rotas publicas (sem token): webhooks, assinatura, health, contratos.
Todas as demais exigem Bearer token valido.
"""
from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
import logging

logger = logging.getLogger(__name__)

ROTAS_PUBLICAS = {
    "/",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/produtores",
    "/imoveis/buscar",
    "/auth/solicitar",
    "/auth/verificar",
}

PREFIXOS_PUBLICOS = (
    "/telegram/",
    "/whatsapp/",
    "/assinar/",
    "/contratos",
    "/contratos-rurais",
    "/static/",
)

CORS_HEADERS_BASE = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Accept-Language, Authorization, Content-Language, Content-Type",
    "Access-Control-Max-Age": "86400",
}


def cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin", "*")
    return {"Access-Control-Allow-Origin": origin, **CORS_HEADERS_BASE}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Rotas publicas - passa direto
        if path in ROTAS_PUBLICAS:
            return await call_next(request)

        if any(path.startswith(p) for p in PREFIXOS_PUBLICOS):
            return await call_next(request)

        # Preflight CORS - responde 200 com headers CORS
        if request.method == "OPTIONS":
            return Response(status_code=200, headers=cors_headers(request))

        # Verifica Bearer token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Token de autenticacao nao fornecido.",
                    "detail": "Use o header: Authorization: Bearer {seu_token}",
                },
                headers={"WWW-Authenticate": "Bearer", **cors_headers(request)},
            )

        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            return JSONResponse(
                status_code=401,
                content={"error": "Token vazio."},
                headers={"WWW-Authenticate": "Bearer", **cors_headers(request)},
            )

        produtor = _validar_token(token)
        if not produtor:
            return JSONResponse(
                status_code=401,
                content={"error": "Token invalido ou expirado."},
                headers={"WWW-Authenticate": "Bearer", **cors_headers(request)},
            )

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
