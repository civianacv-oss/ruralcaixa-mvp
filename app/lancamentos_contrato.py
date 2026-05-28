# =============================================================
# RURALCAIXA — API de Lançamentos com Aprovação
# Arquivo: lancamentos_contrato.py
# =============================================================
# Adicionar no main_api.py:
#   from lancamentos_contrato import router as lanc_router
#   app.include_router(lanc_router)
# =============================================================

import json
import os
from datetime import datetime, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/contratos", tags=["Lançamentos e Aprovação"])

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def log_auditoria(cur, contrato_id, evento, descricao="", ip=None):
    cur.execute(
        "INSERT INTO auditoria_contratos (contrato_id, evento, descricao, ip) VALUES (%s,%s,%s,%s)",
        (contrato_id, evento, descricao, ip)
    )


# ------------------------------------------------------------------
# MODELS
# ------------------------------------------------------------------

class ConfigContratoBody(BaseModel):
    quorum_tipo: str = "maioria"           # maioria|unanimidade|qualquer_um|numero_fixo
    quorum_numero: Optional[int] = None
    prazo_aprovacao_h: int = 24
    empate_resultado: str = "aprovado"     # aprovado|rejeitado
    expiracao_resultado: str = "aprovado"
    permissoes_papel: Optional[dict] = None

class PapelBody(BaseModel):
    produtor_id: Optional[int] = None
    parceiro_id: Optional[str] = None
    papel: str = "parceiro"               # gestor|parceiro|investidor

class LancamentoBody(BaseModel):
    tipo: str                              # receita|despesa|aporte|retirada
    descricao: str
    valor: float
    data_lancamento: Optional[str] = None
    subconta_id: Optional[int] = None
    observacao: Optional[str] = None
    # Quem está lançando
    produtor_id: Optional[int] = None
    parceiro_id: Optional[str] = None

class VotoBody(BaseModel):
    voto: str                              # aprovar|rejeitar
    justificativa: Optional[str] = None
    # Quem está votando
    produtor_id: Optional[int] = None
    parceiro_id: Optional[str] = None


# ------------------------------------------------------------------
# POST /contratos/{id}/config
# Define as regras de votação do condomínio
# ------------------------------------------------------------------
@router.post("/{contrato_id}/config")
def configurar_contrato(contrato_id: str, body: ConfigContratoBody):
    conn = get_db()
    try:
        cur = conn.cursor()

        permissoes = body.permissoes_papel or {
            "gestor":     ["receita", "despesa", "aporte"],
            "parceiro":   ["despesa"],
            "investidor": []
        }

        cur.execute("""
            INSERT INTO contrato_config (
                contrato_id, quorum_tipo, quorum_numero,
                prazo_aprovacao_h, empate_resultado, expiracao_resultado,
                permissoes_papel
            ) VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (contrato_id) DO UPDATE SET
                quorum_tipo        = EXCLUDED.quorum_tipo,
                quorum_numero      = EXCLUDED.quorum_numero,
                prazo_aprovacao_h  = EXCLUDED.prazo_aprovacao_h,
                empate_resultado   = EXCLUDED.empate_resultado,
                expiracao_resultado= EXCLUDED.expiracao_resultado,
                permissoes_papel   = EXCLUDED.permissoes_papel,
                atualizado_em      = NOW()
            RETURNING *
        """, (
            contrato_id, body.quorum_tipo, body.quorum_numero,
            body.prazo_aprovacao_h, body.empate_resultado,
            body.expiracao_resultado, json.dumps(permissoes)
        ))
        config = dict(cur.fetchone())
        conn.commit()
        return {"data": config}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ------------------------------------------------------------------
# POST /contratos/{id}/papeis
# Define o papel de cada condômino (gestor, parceiro, investidor)
# ------------------------------------------------------------------
@router.post("/{contrato_id}/papeis")
def definir_papel(contrato_id: str, body: PapelBody):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO contrato_papeis (contrato_id, produtor_id, parceiro_id, papel)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (contrato_id, produtor_id) DO UPDATE SET papel = EXCLUDED.papel
            RETURNING *
        """, (contrato_id, body.produtor_id, body.parceiro_id, body.papel))
        papel = dict(cur.fetchone())
        conn.commit()
        return {"data": papel}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ------------------------------------------------------------------
# GET /contratos/{id}/lancamentos
# Lista lançamentos do contrato com status de votação
# ------------------------------------------------------------------
@router.get("/{contrato_id}/lancamentos")
def listar_lancamentos(
    contrato_id: str,
    status: Optional[str] = None,
    tipo: Optional[str] = None
):
    conn = get_db()
    try:
        cur = conn.cursor()
        wheres = ["contrato_id = %s"]
        params = [contrato_id]
        if status:
            wheres.append("status = %s"); params.append(status)
        if tipo:
            wheres.append("tipo = %s"); params.append(tipo)

        cur.execute(
            f"SELECT * FROM vw_lancamentos_votacao WHERE {' AND '.join(wheres)} ORDER BY criado_em DESC",
            params
        )
        rows = [dict(r) for r in cur.fetchall()]
        return {"data": rows, "total": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ------------------------------------------------------------------
# POST /contratos/{id}/lancamentos
# Cria novo lançamento — inicia votação automaticamente
# ------------------------------------------------------------------
@router.post("/{contrato_id}/lancamentos", status_code=201)
def criar_lancamento(contrato_id: str, body: LancamentoBody, request: Request):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Buscar config do contrato
        cur.execute("SELECT * FROM contrato_config WHERE contrato_id = %s", (contrato_id,))
        config = cur.fetchone()
        if not config:
            raise HTTPException(status_code=400,
                detail="Contrato sem configuração. Configure as regras primeiro via POST /config")

        # Verificar permissão do autor
        autor_id = body.produtor_id or body.parceiro_id
        _verificar_permissao(cur, contrato_id, body.produtor_id, body.parceiro_id,
                             body.tipo, config["permissoes_papel"])

        # Contar votantes (todos os condôminos exceto o autor)
        cur.execute("""
            SELECT COUNT(*) AS total FROM contrato_papeis
            WHERE contrato_id = %s
              AND (produtor_id != %s OR %s IS NULL)
              AND (parceiro_id::TEXT != %s OR %s IS NULL)
        """, (contrato_id,
              body.produtor_id, body.produtor_id,
              str(body.parceiro_id or ""), body.parceiro_id))
        total_votantes = cur.fetchone()["total"]

        # Prazo de aprovação
        expira_em = datetime.now() + timedelta(hours=config["prazo_aprovacao_h"])
        data_lanc = body.data_lancamento or datetime.now().strftime("%Y-%m-%d")

        # Criar lançamento
        cur.execute("""
            INSERT INTO contrato_lancamentos2 (
                contrato_id, produtor_id, parceiro_id,
                tipo, descricao, valor, data_lancamento,
                subconta_id, status, total_votantes, expira_em, observacao
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'em_votacao',%s,%s,%s)
            RETURNING *
        """, (
            contrato_id, body.produtor_id, body.parceiro_id,
            body.tipo, body.descricao, body.valor, data_lanc,
            body.subconta_id, total_votantes, expira_em, body.observacao
        ))
        lancamento = dict(cur.fetchone())

        # Notificar todos os outros condôminos via WhatsApp
        cur.execute("""
            SELECT cp.produtor_id, cp.parceiro_id, cp.papel,
                   p.nome AS p_nome,  p.telefone  AS p_tel,
                   pe.nome AS pe_nome, pe.telefone AS pe_tel
            FROM contrato_papeis cp
            LEFT JOIN produtores p          ON p.id  = cp.produtor_id
            LEFT JOIN parceiros_externos pe ON pe.id = cp.parceiro_id
            WHERE cp.contrato_id = %s
              AND (cp.produtor_id != %s OR %s IS NULL)
              AND (cp.parceiro_id::TEXT != %s OR %s IS NULL)
        """, (contrato_id,
              body.produtor_id, body.produtor_id,
              str(body.parceiro_id or ""), body.parceiro_id))

        notificados = 0
        for cond in cur.fetchall():
            nome = cond["p_nome"] or cond["pe_nome"] or "Condômino"
            tel  = cond["p_tel"]  or cond["pe_tel"]
            if tel:
                _enviar_whatsapp_votacao(
                    telefone=tel,
                    nome_destinatario=nome,
                    lancamento_id=str(lancamento["id"]),
                    contrato_id=contrato_id,
                    tipo=body.tipo,
                    descricao=body.descricao,
                    valor=body.valor,
                    prazo_h=config["prazo_aprovacao_h"],
                )
                notificados += 1

        log_auditoria(cur, contrato_id, "lancamento_criado",
                     f"{body.tipo} R${body.valor:.2f} — {body.descricao}",
                     str(request.client.host))

        conn.commit()
        return {
            "data": lancamento,
            "votantes": total_votantes,
            "notificados": notificados,
            "expira_em": expira_em.isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ------------------------------------------------------------------
# POST /contratos/{id}/lancamentos/{lanc_id}/votar
# Registra o voto de um condômino
# ------------------------------------------------------------------
@router.post("/{contrato_id}/lancamentos/{lancamento_id}/votar")
def votar(contrato_id: str, lancamento_id: str, body: VotoBody, request: Request):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Buscar lançamento
        cur.execute(
            "SELECT * FROM contrato_lancamentos2 WHERE id = %s AND contrato_id = %s",
            (lancamento_id, contrato_id)
        )
        lanc = cur.fetchone()
        if not lanc:
            raise HTTPException(status_code=404, detail="Lançamento não encontrado")
        if lanc["status"] != "em_votacao":
            raise HTTPException(status_code=400,
                detail=f"Lançamento não está em votação (status: {lanc['status']})")
        if datetime.now() > lanc["expira_em"].replace(tzinfo=None):
            # Expirou — processar automaticamente
            _processar_expiracao(cur, lanc)
            conn.commit()
            raise HTTPException(status_code=400, detail="Prazo de votação expirado — lançamento processado automaticamente")

        # Registrar voto
        try:
            cur.execute("""
                INSERT INTO contrato_votos
                    (lancamento_id, contrato_id, produtor_id, parceiro_id, voto, justificativa)
                VALUES (%s,%s,%s,%s,%s,%s)
            """, (lancamento_id, contrato_id,
                  body.produtor_id, body.parceiro_id,
                  body.voto, body.justificativa))
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            raise HTTPException(status_code=400, detail="Você já votou neste lançamento")

        # Atualizar contadores
        if body.voto == "aprovar":
            cur.execute("""
                UPDATE contrato_lancamentos2
                SET votos_aprovacao = votos_aprovacao + 1, atualizado_em = NOW()
                WHERE id = %s RETURNING *
            """, (lancamento_id,))
        else:
            cur.execute("""
                UPDATE contrato_lancamentos2
                SET votos_rejeicao = votos_rejeicao + 1, atualizado_em = NOW()
                WHERE id = %s RETURNING *
            """, (lancamento_id,))
        lanc_atualizado = cur.fetchone()

        # Buscar config
        cur.execute("SELECT * FROM contrato_config WHERE contrato_id = %s", (contrato_id,))
        config = cur.fetchone()

        # Verificar se quórum foi atingido
        resultado = _verificar_quorum(lanc_atualizado, config)

        if resultado:
            _efetivar_lancamento(cur, lanc_atualizado, resultado, config)

        log_auditoria(cur, contrato_id, f"voto_{body.voto}",
                     f"Voto '{body.voto}' no lançamento {lancamento_id[:8]}",
                     str(request.client.host))

        conn.commit()

        return {
            "message": f"Voto '{body.voto}' registrado",
            "votos_aprovacao": lanc_atualizado["votos_aprovacao"],
            "votos_rejeicao": lanc_atualizado["votos_rejeicao"],
            "total_votantes": lanc_atualizado["total_votantes"],
            "resultado": resultado,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ------------------------------------------------------------------
# GET /contratos/{id}/cotas
# Retorna as cotas atuais de cada condômino (dinâmicas)
# ------------------------------------------------------------------
@router.get("/{contrato_id}/cotas")
def cotas_atuais(contrato_id: str):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM vw_cotas_dinamicas WHERE contrato_id = %s ORDER BY percentual_cota DESC",
            (contrato_id,)
        )
        cotas = [dict(r) for r in cur.fetchall()]

        # Se não há aportes, buscar percentuais estáticos do contrato
        if not cotas:
            cur.execute("SELECT * FROM vw_contratos_resumo WHERE id = %s", (contrato_id,))
            c = cur.fetchone()
            if c:
                cotas = [
                    {"participante_nome": c["outorgante_nome"],
                     "saldo_atual": None, "percentual_cota": float(c["percentual_outorgante"])},
                    {"participante_nome": c["outorgado_nome"],
                     "saldo_atual": None, "percentual_cota": float(c["percentual_outorgado"])},
                ]

        return {"data": cotas, "tipo": "dinamico" if cotas and cotas[0].get("saldo_atual") else "estatico"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ------------------------------------------------------------------
# WORKER — processar lançamentos expirados
# Chamar via: POST /contratos/processar-expirados
# Agendar no Railway como cron job: */30 * * * *
# ------------------------------------------------------------------
@router.post("/processar-expirados")
def processar_expirados():
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT cl.*, cc.expiracao_resultado, cc.empate_resultado
            FROM contrato_lancamentos2 cl
            JOIN contrato_config cc ON cc.contrato_id = cl.contrato_id
            WHERE cl.status = 'em_votacao'
              AND cl.expira_em < NOW()
        """)
        expirados = cur.fetchall()
        processados = []

        for lanc in expirados:
            resultado = _processar_expiracao(cur, lanc)
            processados.append({
                "lancamento_id": str(lanc["id"]),
                "resultado": resultado
            })

        conn.commit()
        try:
            from app.services.ovino_cron import processar_alertas_ovinos
            resultado_ovino = processar_alertas_ovinos(dias_antecedencia=1)
        except Exception as oe:
            resultado_ovino = {"erro": str(oe)}
        return {"processados": len(processados), "detalhes": processados, "ovino_alertas": resultado_ovino}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------

def _verificar_permissao(cur, contrato_id, produtor_id, parceiro_id, tipo, permissoes_json):
    """Verifica se o autor tem permissão para lançar o tipo informado."""
    if isinstance(permissoes_json, str):
        permissoes = json.loads(permissoes_json)
    else:
        permissoes = permissoes_json

    cur.execute("""
        SELECT papel FROM contrato_papeis
        WHERE contrato_id = %s
          AND (produtor_id = %s OR parceiro_id::TEXT = %s)
    """, (contrato_id, produtor_id, str(parceiro_id or "")))
    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=403,
            detail="Participante não encontrado neste contrato")

    papel = row["papel"]
    tipos_permitidos = permissoes.get(papel, [])
    if tipo not in tipos_permitidos:
        raise HTTPException(status_code=403,
            detail=f"Papel '{papel}' não tem permissão para lançar '{tipo}'")


def _verificar_quorum(lanc, config) -> Optional[str]:
    """
    Verifica se o quórum foi atingido após um novo voto.
    Retorna 'aprovado', 'rejeitado', ou None (aguardando mais votos).
    """
    aprovacao = lanc["votos_aprovacao"]
    rejeicao  = lanc["votos_rejeicao"]
    total     = lanc["total_votantes"]
    tipo_q    = config["quorum_tipo"]
    num_q     = config["quorum_numero"]
    empate    = config["empate_resultado"]

    votos_dados = aprovacao + rejeicao

    if tipo_q == "qualquer_um":
        if aprovacao >= 1: return "aprovado"
        if rejeicao  >= 1: return "rejeitado"

    elif tipo_q == "unanimidade":
        if aprovacao == total: return "aprovado"
        if rejeicao  >= 1:    return "rejeitado"

    elif tipo_q == "numero_fixo" and num_q:
        if aprovacao >= num_q: return "aprovado"
        if rejeicao  >= num_q: return "rejeitado"

    else:  # maioria
        maioria = (total // 2) + 1
        if aprovacao >= maioria: return "aprovado"
        if rejeicao  >= maioria: return "rejeitado"
        # Empate — todos votaram
        if votos_dados == total and aprovacao == rejeicao:
            return empate

    return None  # aguardando


def _efetivar_lancamento(cur, lanc, resultado: str, config, motivo: str = "quorum"):
    """Efetiva o lançamento após aprovação/rejeição."""
    cur.execute("""
        UPDATE contrato_lancamentos2
        SET status = %s, aprovado_em = NOW(), aprovado_motivo = %s, atualizado_em = NOW()
        WHERE id = %s
    """, (resultado, motivo, lanc["id"]))

    if resultado == "aprovado" and lanc["tipo"] in ("aporte", "retirada"):
        cur.execute("""
            UPDATE contrato_lancamentos2
            SET recalculo_cotas = TRUE WHERE id = %s
        """, (lanc["id"],))

    log_auditoria(cur, str(lanc["contrato_id"]), f"lancamento_{resultado}",
                 f"R${lanc['valor']:.2f} — {lanc['descricao']} ({motivo})")


def _processar_expiracao(cur, lanc) -> str:
    resultado = lanc.get("expiracao_resultado", "aprovado")
    aprovacao = lanc["votos_aprovacao"]
    rejeicao  = lanc["votos_rejeicao"]

    # Empate na expiração
    if aprovacao == rejeicao and (aprovacao + rejeicao) > 0:
        resultado = lanc.get("empate_resultado", "aprovado")
        motivo = "empate"
    else:
        motivo = "expiracao"

    _efetivar_lancamento(cur, lanc, resultado, lanc, motivo)
    return resultado


def _enviar_whatsapp_votacao(telefone, nome_destinatario, lancamento_id,
                              contrato_id, tipo, descricao, valor, prazo_h):
    phone_id = os.getenv("WHATSAPP_PHONE_ID", "1064255903445839")
    token    = os.getenv("WHATSAPP_TOKEN", "")
    frontend = os.getenv("FRONTEND_URL", "https://ruralcaixa-mvp.vercel.app")

    if not token:
        print(f"[WARN] WhatsApp não configurado. Votação para {nome_destinatario}")
        return

    link_voto = f"{frontend}/votar/{lancamento_id}"
    url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": telefone,
        "type": "template",
        "template": {
            "name": "aprovacao_lancamento",
            "language": {"code": "pt_BR"},
            "components": [{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": nome_destinatario},
                    {"type": "text", "text": tipo},
                    {"type": "text", "text": descricao},
                    {"type": "text", "text": f"R$ {valor:,.2f}"},
                    {"type": "text", "text": str(prazo_h)},
                    {"type": "text", "text": link_voto},
                ]
            }]
        }
    }
    try:
        requests.post(url,
                      json=payload,
                      headers={"Authorization": f"Bearer {token}",
                               "Content-Type": "application/json"},
                      timeout=10)
    except Exception as e:
        print(f"[WARN] Erro WhatsApp: {e}")
