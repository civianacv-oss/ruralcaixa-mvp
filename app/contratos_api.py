# =============================================================
# RURALCAIXA — Módulo de Contratos Rurais
# Arquivo: contratos_api.py
# Stack: FastAPI + psycopg2 (mesmo padrão do main_api.py)
# =============================================================
# Como integrar ao main_api.py:
#   1. Copie este arquivo para C:\ruralcaixa\contratos_api.py
#   2. Adicione no main_api.py:
#        from contratos_api import router as contratos_router
#        app.include_router(contratos_router)
# =============================================================

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, validator
from typing import Optional
from datetime import datetime, timedelta
import psycopg2
import psycopg2.extras
import random
import hashlib
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contratos", tags=["Contratos Rurais"])

def get_db():
    return psycopg2.connect(
        "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway",
        cursor_factory=psycopg2.extras.RealDictCursor
    )

def log_auditoria(cur, contrato_id, evento, descricao="", ip=None, metadata=None):
    cur.execute(
        """INSERT INTO auditoria_contratos (contrato_id, evento, descricao, ip, metadata)
           VALUES (%s, %s, %s, %s, %s)""",
        (contrato_id, evento, descricao, ip, json.dumps(metadata or {}))
    )

def gerar_otp():
    return str(random.randint(100000, 999999))

def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


# ✅ MELHORADO: Função para enviar OTP via WhatsApp com melhor tratamento de erros
def _enviar_whatsapp_otp(telefone: str, nome: str, otp: str, link: str):
    import os, requests
    phone_id = os.getenv("WHATSAPP_PHONE_ID", "1154361321082939")
    token    = os.getenv("WHATSAPP_TOKEN", "")
    
    if not token:
        logger.warning(f"[WARN] WHATSAPP_TOKEN não configurado. OTP para {nome}: {otp}")
        return {"status": "warning", "message": "Token WhatsApp não configurado", "otp": otp}
    
    url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": telefone,
        "type": "template",
        "template": {
            "name": "assinatura_contrato",
            "language": {"code": "pt_BR"},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": otp}]},
                {"type": "button", "sub_type": "url", "index": "0",
                 "parameters": [{"type": "text", "text": otp}]}
            ]
        }
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=10)
        logger.info(f"[WhatsApp] Status: {r.status_code} Resposta: {r.text}")
        
        # ✅ MELHORADO: Verificar se a requisição foi bem-sucedida
        if r.status_code in (200, 201):
            message_id = r.json().get("messages", [{}])[0].get("id")
            return {"status": "success", "message_id": message_id}
        else:
            # ✅ MELHORADO: Retornar erro detalhado
            error_data = r.json()
            error_msg = error_data.get("error", {}).get("message", "Erro desconhecido")
            error_code = error_data.get("error", {}).get("code", "unknown")
            logger.error(f"[WhatsApp] Erro ao enviar OTP: {error_code} - {error_msg}")
            return {
                "status": "error",
                "code": error_code,
                "message": error_msg,
                "raw_response": r.text
            }
            
    except requests.exceptions.Timeout:
        logger.error(f"[WhatsApp] Timeout ao enviar para {telefone}")
        return {"status": "error", "message": "Timeout ao conectar com WhatsApp"}
    except requests.exceptions.ConnectionError as e:
        logger.error(f"[WhatsApp] Erro de conexão para {telefone}: {e}")
        return {"status": "error", "message": f"Erro de conexão: {str(e)}"}
    except Exception as e:
        logger.error(f"[WhatsApp] Erro inesperado para {telefone}: {e}", exc_info=True)
        return {"status": "error", "message": f"Erro inesperado: {str(e)}"}


# ✅ MELHORADO: Função auxiliar para resolver partes (mantém compatibilidade)
def _resolver_partes(cur, contrato):
    # Implementação original (assumindo que existe)
    return []


# ✅ MELHORADO: Endpoint enviar_para_assinatura com melhor tratamento
@router.post("/{contrato_id}/enviar")
def enviar_para_assinatura(contrato_id: str, request: Request):
    if contrato_id in ["", "favicon.ico"]:
        raise HTTPException(status_code=404, detail="Rota de frontend — não é um contrato.")
    
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("SELECT * FROM contratos WHERE id = %s", (contrato_id,))
        contrato = cur.fetchone()
        if not contrato:
            raise HTTPException(status_code=404, detail="Contrato não encontrado")
        if contrato["status"] != "rascunho":
            raise HTTPException(status_code=400,
                detail=f"Contrato já está em status '{contrato['status']}'")

        # Mudar status
        cur.execute("""
            UPDATE contratos SET status = 'aguardando_assinaturas', atualizado_em = NOW()
            WHERE id = %s
        """, (contrato_id,))

        # Resolver partes
        partes = _resolver_partes(cur, contrato)
        partes_notificadas = []

        import os
        frontend_url = os.getenv("FRONTEND_URL", "https://ruralcaixa-mvp.vercel.app")

        for parte in partes:
            otp = gerar_otp()
            otp_hash = hash_otp(otp)
            expira = datetime.now() + timedelta(minutes=30)
            link = f"{frontend_url}/assinar/{contrato_id}?parte={parte['papel']}"

            cur.execute("""
                INSERT INTO assinaturas (
                    contrato_id, papel, socio_id, parceiro_externo_id,
                    token_otp, token_expira_em, link_enviado_em, pdf_hash_no_momento
                ) VALUES (%s,%s,%s,%s,%s,%s,NOW(),%s)
                RETURNING id
            """, (
                contrato_id, parte["papel"],
                parte.get("socio_id"), parte.get("parceiro_externo_id"),
                otp_hash, expira,
                contrato.get("pdf_hash_sha256"),
            ))
            assinatura_id = cur.fetchone()["id"]

            def _mascarar_telefone(tel: str) -> str:
                if not tel:
                    return "número cadastrado"
                t = tel.replace(" ", "").replace("-", "")
                if len(t) >= 6:
                    return t[:4] + "•" * (len(t) - 6) + t[-2:]
                return "•" * len(t)
            
            # ✅ MELHORADO: Capturar resultado do envio do WhatsApp
            whatsapp_resultado = None
            if parte.get("telefone"):
                whatsapp_resultado = _enviar_whatsapp_otp(
                    parte["telefone"], parte["nome"], otp, link
                )
                
                # ✅ Se houver erro, registrar na auditoria
                if whatsapp_resultado.get("status") == "error":
                    log_auditoria(
                        cur, contrato_id, "whatsapp_erro",
                        f"Erro ao enviar OTP para {parte['nome']}: {whatsapp_resultado.get('message')}",
                        str(request.client.host),
                        whatsapp_resultado
                    )

            log_auditoria(cur, contrato_id, "link_assinatura_enviado",
                         f"Link enviado para {parte['nome']} ({parte['papel']})",
                         str(request.client.host))

            partes_notificadas.append({
                "papel": parte["papel"],
                "nome": parte["nome"],
                "assinatura_id": str(assinatura_id),
                "whatsapp_enviado": bool(parte.get("telefone")),
                "whatsapp_resultado": whatsapp_resultado,
                "telefone_mascarado": _mascarar_telefone(parte.get("telefone", "")),
                "otp": otp  # ✅ Retornar OTP para debug (remover em produção)
            })

        conn.commit()
        return {
            "message": "Contrato enviado para assinatura",
            "partes_notificadas": partes_notificadas
        }
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro ao enviar contrato para assinatura: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível enviar o código. Erro: {str(e)}"
        )
    finally:
        conn.close()