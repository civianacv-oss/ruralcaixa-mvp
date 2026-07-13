# deploy: 2026-05-23
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


# -------------------------------------------------------------
# MODELS
# -------------------------------------------------------------

class ParceiroExterno(BaseModel):
    nome: str
    tipo_documento: str   # CPF ou CNPJ
    documento: str
    telefone: Optional[str] = None
    email: Optional[str] = None

class ContratoCreate(BaseModel):
    fazenda_id: int
    tipo: str                          # agricola | pecuaria | agroindustrial | extrativa
    outorgante_socio_id: Optional[int] = None
    outorgante_externo: Optional[ParceiroExterno] = None
    outorgado_socio_id: Optional[int] = None
    outorgado_externo: Optional[ParceiroExterno] = None
    data_inicio: str                   # YYYY-MM-DD
    data_fim: str
    percentual_outorgante: float
    percentual_outorgado: float
    frequencia_pagamento: str = "safra"
    area_parceria_hectares: Optional[float] = None
    clausulas_adicionais: Optional[dict] = {}

    @validator("tipo")
    def tipo_valido(cls, v):
        validos = ["agricola", "pecuaria", "agroindustrial", "extrativa", "condominio", "arrendamento", "comodato", "compra_venda"]
        if v not in validos:
            raise ValueError(f"tipo deve ser um de: {validos}")
        return v

    @validator("percentual_outorgado")
    def percentuais_somam_100(cls, v, values):
        ote = values.get("percentual_outorgante", 0)
        if round(ote + v, 2) != 100.0:
            raise ValueError("percentual_outorgante + percentual_outorgado deve ser 100")
        return v

class AssinarRequest(BaseModel):
    papel: str      # outorgante | outorgado
    otp: str
    geolocalizacao: Optional[dict] = None


# -------------------------------------------------------------
# GET /contratos
# Lista contratos com filtros opcionais
# -------------------------------------------------------------
@router.get("/")
def listar_contratos(
    fazenda_id: Optional[int] = None,
    status: Optional[str] = None,
    tipo: Optional[str] = None
):
    conn = get_db()
    try:
        cur = conn.cursor()
        wheres = []
        params = []

        if fazenda_id:
            wheres.append("fazenda_id = %s")
            params.append(fazenda_id)
        if status:
            wheres.append("status = %s")
            params.append(status)
        if tipo:
            wheres.append("tipo = %s")
            params.append(tipo)

        sql = "SELECT * FROM vw_contratos_resumo"
        if wheres:
            sql += " WHERE " + " AND ".join(wheres)
        sql += " ORDER BY criado_em DESC"

        cur.execute(sql, params)
        rows = cur.fetchall()
        return {"data": [dict(r) for r in rows], "total": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# -------------------------------------------------------------
# GET /contratos/{id}
# Detalhe + assinaturas
# -------------------------------------------------------------
# Rotas estáticas que devem ser tratadas ANTES do parâmetro dinâmico {contrato_id}
# (ex: /contratos/acerto — rota do frontend Next.js)
_STATIC_PATHS = {"acerto", "novo", "resumo", "relatorio"}

@router.get("/{contrato_id}")
def detalhe_contrato(contrato_id: str):
    # Evitar que caminhos estáticos do frontend sejam interpretados como UUID
    if contrato_id in _STATIC_PATHS:
        raise HTTPException(status_code=404, detail="Rota de frontend — não é um contrato.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vw_contratos_resumo WHERE id = %s", (contrato_id,))
        contrato = cur.fetchone()
        if not contrato:
            raise HTTPException(status_code=404, detail="Contrato não encontrado")

        cur.execute("""
            SELECT a.id, a.papel, a.status, a.assinado_em, a.visualizado_em,
                   a.ip_assinatura, a.geolocalizacao,
                   s.nome  AS socio_nome,
                   pe.nome AS parceiro_nome
            FROM assinaturas a
            LEFT JOIN produtores s              ON s.id  = a.socio_id
            LEFT JOIN parceiros_externos pe ON pe.id = a.parceiro_externo_id
            WHERE a.contrato_id = %s
            ORDER BY a.criado_em
        """, (contrato_id,))
        assinaturas = [dict(r) for r in cur.fetchall()]

        return {**dict(contrato), "assinaturas": assinaturas}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# -------------------------------------------------------------
# POST /contratos
# Cria novo contrato (status: rascunho)
# -------------------------------------------------------------
@router.post("/", status_code=201)
def criar_contrato(body: ContratoCreate, request: Request):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Resolver parceiro externo outorgante
        outorgante_externo_id = None
        if body.outorgante_externo:
            cur.execute("""
                INSERT INTO parceiros_externos (nome, tipo_documento, documento, telefone, email)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (tipo_documento, documento)
                DO UPDATE SET nome = EXCLUDED.nome
                RETURNING id
            """, (
                body.outorgante_externo.nome,
                body.outorgante_externo.tipo_documento,
                body.outorgante_externo.documento,
                body.outorgante_externo.telefone,
                body.outorgante_externo.email,
            ))
            outorgante_externo_id = cur.fetchone()["id"]

        # Resolver parceiro externo outorgado
        outorgado_externo_id = None
        if body.outorgado_externo:
            cur.execute("""
                INSERT INTO parceiros_externos (nome, tipo_documento, documento, telefone, email)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (tipo_documento, documento)
                DO UPDATE SET nome = EXCLUDED.nome
                RETURNING id
            """, (
                body.outorgado_externo.nome,
                body.outorgado_externo.tipo_documento,
                body.outorgado_externo.documento,
                body.outorgado_externo.telefone,
                body.outorgado_externo.email,
            ))
            outorgado_externo_id = cur.fetchone()["id"]

        # Inserir contrato
        cur.execute("""
            INSERT INTO contratos (
                fazenda_id, tipo, status,
                outorgante_socio_id, outorgante_externo_id,
                outorgado_socio_id,  outorgado_externo_id,
                data_inicio, data_fim,
                percentual_outorgante, percentual_outorgado,
                frequencia_pagamento, area_parceria_hectares,
                clausulas_adicionais
            ) VALUES (%s,%s,'rascunho',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (
            body.fazenda_id, body.tipo,
            body.outorgante_socio_id, outorgante_externo_id,
            body.outorgado_socio_id,  outorgado_externo_id,
            body.data_inicio, body.data_fim,
            body.percentual_outorgante, body.percentual_outorgado,
            body.frequencia_pagamento, body.area_parceria_hectares,
            json.dumps(body.clausulas_adicionais or {}),
        ))
        contrato = dict(cur.fetchone())

        log_auditoria(cur, contrato["id"], "contrato_criado",
                      f"Contrato {body.tipo} criado", str(request.client.host))

        conn.commit()
        return {"data": contrato}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# -------------------------------------------------------------
# POST /contratos/{id}/enviar
# Envia para assinatura — gera OTP e notifica via WhatsApp
# -------------------------------------------------------------
@router.post("/{contrato_id}/enviar")
def enviar_para_assinatura(contrato_id: str, request: Request):
    if contrato_id in _STATIC_PATHS:
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
                
            # Enviar WhatsApp se tiver telefone
            if parte.get("telefone"):
                _enviar_whatsapp_otp(parte["telefone"], parte["nome"], otp, link)

            log_auditoria(cur, contrato_id, "link_assinatura_enviado",
                         f"Link enviado para {parte['nome']} ({parte['papel']})",
                         str(request.client.host))

            partes_notificadas.append({
                "papel": parte["papel"],
                "nome": parte["nome"],
                "assinatura_id": str(assinatura_id),
                "whatsapp_enviado": bool(parte.get("telefone")),
                "telefone_mascarado": _mascarar_telefone(parte.get("telefone", ""))
            })

        conn.commit()
        return {"message": "Contrato enviado para assinatura",
                "partes_notificadas": partes_notificadas}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# -------------------------------------------------------------
# POST /contratos/{id}/assinar
# Valida OTP e registra assinatura
# -------------------------------------------------------------
@router.post("/{contrato_id}/assinar")
def assinar_contrato(contrato_id: str, body: AssinarRequest, request: Request):
    if contrato_id in _STATIC_PATHS:
        raise HTTPException(status_code=404, detail="Rota de frontend — não é um contrato.")
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT * FROM assinaturas
            WHERE contrato_id = %s AND papel = %s AND status IN ('pendente','visualizado')
        """, (contrato_id, body.papel))
        assinatura = cur.fetchone()

        if not assinatura:
            raise HTTPException(status_code=404,
                detail="Assinatura não encontrada ou já concluída")

        # OTP expirado
        if datetime.now() > assinatura["token_expira_em"].replace(tzinfo=None):
            log_auditoria(cur, contrato_id, "otp_expirado", ip=str(request.client.host))
            conn.commit()
            raise HTTPException(status_code=400, detail="OTP expirado. Solicite novo envio.")

        # Muitas tentativas
        if assinatura["token_tentativas"] >= 5:
            raise HTTPException(status_code=429, detail="Muitas tentativas. Solicite novo OTP.")

        # Validar OTP
        otp_valido = hash_otp(body.otp) == assinatura["token_otp"]

        if not otp_valido:
            cur.execute("""
                UPDATE assinaturas SET token_tentativas = token_tentativas + 1 WHERE id = %s
            """, (assinatura["id"],))
            log_auditoria(cur, contrato_id, "otp_falhou", ip=str(request.client.host))
            conn.commit()
            raise HTTPException(status_code=400, detail="OTP inválido")

        # Registrar assinatura
        cur.execute("""
            UPDATE assinaturas SET
                status = 'assinado',
                assinado_em = NOW(),
                ip_assinatura = %s,
                user_agent = %s,
                geolocalizacao = %s,
                token_otp = NULL,
                token_tentativas = token_tentativas + 1
            WHERE id = %s
        """, (
            str(request.client.host),
            request.headers.get("user-agent", ""),
            json.dumps(body.geolocalizacao or {}),
            assinatura["id"],
        ))

        log_auditoria(cur, contrato_id, "contrato_assinado",
                     f"Assinatura de {body.papel} registrada",
                     str(request.client.host),
                     {"geolocalizacao": body.geolocalizacao})

        # Verificar se todos assinaram → ativar contrato
        cur.execute("""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN status = 'assinado' THEN 1 ELSE 0 END) AS assinadas
            FROM assinaturas WHERE contrato_id = %s
        """, (contrato_id,))
        counts = cur.fetchone()

        if counts["total"] > 0 and counts["total"] == counts["assinadas"]:
            cur.execute("""
                UPDATE contratos SET status = 'ativo', atualizado_em = NOW()
                WHERE id = %s AND status = 'aguardando_assinaturas'
            """, (contrato_id,))
            log_auditoria(cur, contrato_id, "contrato_ativado",
                         "Todas as partes assinaram. Contrato ativado.")

        conn.commit()
        return {"message": "Assinatura registrada com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# -------------------------------------------------------------
# GET /contratos/{id}/auditoria
# -------------------------------------------------------------
@router.get("/{contrato_id}/auditoria")
def auditoria_contrato(contrato_id: str):
    if contrato_id in _STATIC_PATHS:
        raise HTTPException(status_code=404, detail="Rota de frontend — não é um contrato.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, evento, descricao, ip, metadata, criado_em
            FROM auditoria_contratos
            WHERE contrato_id = %s
            ORDER BY criado_em ASC
        """, (contrato_id,))
        rows = [dict(r) for r in cur.fetchall()]
        return {"data": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# -------------------------------------------------------------
# DELETE /contratos/{id}  — só rascunho
# -------------------------------------------------------------
@router.delete("/{contrato_id}")
def deletar_contrato(contrato_id: str):
    if contrato_id in _STATIC_PATHS:
        raise HTTPException(status_code=404, detail="Rota de frontend — não é um contrato.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT status FROM contratos WHERE id = %s", (contrato_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Não encontrado")
        if row["status"] != "rascunho":
            raise HTTPException(status_code=400,
                detail="Apenas rascunhos podem ser excluídos")
        cur.execute("DELETE FROM contratos WHERE id = %s", (contrato_id,))
        conn.commit()
        return {"message": "Contrato excluído"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()




# -------------------------------------------------------------
# POST /contratos/{id}/condominos
# Adiciona condômino a um contrato do tipo condominio
# -------------------------------------------------------------
class CondomininoAdd(BaseModel):
    produtor_id: Optional[int] = None
    parceiro_externo: Optional[ParceiroExterno] = None
    percentual_cota: float
    data_entrada: Optional[str] = None

@router.post("/{contrato_id}/condominos", status_code=201)
def adicionar_condomino(contrato_id: str, body: CondomininoAdd, request: Request):
    if contrato_id in _STATIC_PATHS:
        raise HTTPException(status_code=404, detail="Rota de frontend — não é um contrato.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT tipo, status FROM contratos WHERE id = %s", (contrato_id,))
        c = cur.fetchone()
        if not c:
            raise HTTPException(404, "Contrato nao encontrado")
        if c["tipo"] != "condominio":
            raise HTTPException(400, "Este contrato nao e do tipo condominio")

        parceiro_id = None
        if body.parceiro_externo:
            cur.execute("""
                INSERT INTO parceiros_externos (nome, tipo_documento, documento, telefone, email)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (tipo_documento, documento) DO UPDATE SET nome = EXCLUDED.nome
                RETURNING id
            """, (body.parceiro_externo.nome, body.parceiro_externo.tipo_documento,
                  body.parceiro_externo.documento, body.parceiro_externo.telefone,
                  body.parceiro_externo.email))
            parceiro_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO contrato_condominos
                (contrato_id, produtor_id, parceiro_id, percentual_cota, data_entrada, ativo)
            VALUES (%s,%s,%s,%s,%s,TRUE)
            RETURNING id
        """, (contrato_id, body.produtor_id, parceiro_id,
              body.percentual_cota, body.data_entrada or None))
        row = cur.fetchone()

        log_auditoria(cur, contrato_id, "condomino_adicionado",
                      f"Condomino adicionado: perc={body.percentual_cota}",
                      str(request.client.host))
        conn.commit()
        return {"id": str(row["id"])}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# -------------------------------------------------------------
# GET /contratos/{id}/condominos
# -------------------------------------------------------------
@router.get("/{contrato_id}/condominos")
def listar_condominos(contrato_id: str):
    if contrato_id in _STATIC_PATHS:
        raise HTTPException(status_code=404, detail="Rota de frontend — não é um contrato.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT cc.id, cc.percentual_cota, cc.data_entrada, cc.ativo,
                   p.nome  AS produtor_nome,  p.cpf  AS produtor_cpf,
                   pe.nome AS parceiro_nome, pe.documento AS parceiro_doc
            FROM contrato_condominos cc
            LEFT JOIN produtores p       ON p.id  = cc.produtor_id
            LEFT JOIN parceiros_externos pe ON pe.id = cc.parceiro_id
            WHERE cc.contrato_id = %s AND cc.ativo = TRUE
            ORDER BY cc.criado_em
        """, (contrato_id,))
        rows = [dict(r) for r in cur.fetchall()]
        total_perc = sum(float(r["percentual_cota"] or 0) for r in rows)
        return {"condominos": rows, "total_percentual": round(total_perc, 2)}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()

# -------------------------------------------------------------
# HELPERS INTERNOS
# -------------------------------------------------------------

def _resolver_partes(cur, contrato):
    partes = []

    if contrato["outorgante_socio_id"]:
        cur.execute("SELECT id, nome, telefone FROM produtores WHERE id = %s",
                    (contrato["outorgante_socio_id"],))
        s = cur.fetchone()
        if s:
            partes.append({"papel": "outorgante", "socio_id": s["id"],
                           "nome": s["nome"], "telefone": s.get("telefone")})
    elif contrato["outorgante_externo_id"]:
        cur.execute("SELECT id, nome, telefone FROM parceiros_externos WHERE id = %s",
                    (contrato["outorgante_externo_id"],))
        pe = cur.fetchone()
        if pe:
            partes.append({"papel": "outorgante", "parceiro_externo_id": pe["id"],
                           "nome": pe["nome"], "telefone": pe.get("telefone")})

    if contrato["outorgado_socio_id"]:
        cur.execute("SELECT id, nome, telefone FROM produtores WHERE id = %s",
                    (contrato["outorgado_socio_id"],))
        s = cur.fetchone()
        if s:
            partes.append({"papel": "outorgado", "socio_id": s["id"],
                           "nome": s["nome"], "telefone": s.get("telefone")})
    elif contrato["outorgado_externo_id"]:
        cur.execute("SELECT id, nome, telefone FROM parceiros_externos WHERE id = %s",
                    (contrato["outorgado_externo_id"],))
        pe = cur.fetchone()
        if pe:
            partes.append({"papel": "outorgado", "parceiro_externo_id": pe["id"],
                           "nome": pe["nome"], "telefone": pe.get("telefone")})

    return partes


def _enviar_whatsapp_otp(telefone: str, nome: str, otp: str, link: str):
    import os, requests
    phone_id = os.getenv("WHATSAPP_PHONE_ID", "1154361321082939")
    token    = os.getenv("WHATSAPP_TOKEN", "")
    if not token:
        print(f"[WARN] WHATSAPP_TOKEN não configurado. OTP para {nome}: {otp}")
        return None
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
        print(f"[WhatsApp] Status: {r.status_code} Resposta: {r.text}")
        return r.json().get("messages", [{}])[0].get("id")
    except Exception as e:
        print(f"[WARN] Erro WhatsApp para {telefone}: {e}")
        return None