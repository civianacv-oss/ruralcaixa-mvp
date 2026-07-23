"""
condominio_router.py — RuralCaixa MVP
======================================
Módulo de Condomínio Rural com lógica baseada em ÁREA (ha).

Lógica de negócio:
  • O contrato de condomínio registra a ÁREA TOTAL do imóvel.
  • Cada condômino informa sua ÁREA em hectares.
  • O percentual de participação é calculado automaticamente:
      percentual = (area_ha_condomino / area_total_ha) × 100
  • A soma das áreas não pode exceder a área total do imóvel.
  • Cada condômino assina individualmente via OTP.

Como integrar ao main.py:
  from app.routers.condominio import router as condominio_router
  app.include_router(condominio_router)
"""

import json
import hashlib
import random
from typing import Optional, List
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, validator, model_validator, ConfigDict, Field

router = APIRouter(prefix="/condominio", tags=["Condomínio Rural"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_db():
    import psycopg2
    import psycopg2.extras
    import os
    return psycopg2.connect(
        os.getenv("DATABASE_URL"),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )

def gerar_otp() -> str:
    return str(random.randint(100000, 999999))

def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

def log_auditoria(cur, contrato_id, evento, descricao="", ip=None):
    cur.execute(
        """INSERT INTO auditoria_contratos (contrato_id, evento, descricao, ip)
           VALUES (%s, %s, %s, %s)""",
        (contrato_id, evento, descricao, ip),
    )


# ── Modelos Pydantic ──────────────────────────────────────────────────────────

class ParceiroExterno(BaseModel):
    nome: str
    tipo_documento: str   # CPF | CNPJ
    documento: str
    telefone: Optional[str] = None
    email: Optional[str] = None


class CondominoCreate(BaseModel):
    """Um condômino com sua área em hectares."""
    socio_id: Optional[int] = None
    parceiro_externo: Optional[ParceiroExterno] = None
    area_ha: float = Field(..., gt=0, description="Área do condômino em hectares (deve ser > 0)")
    papel: str = Field("condomino", pattern="^(administrador|condomino|inventariante)$")

    @model_validator(mode="after")
    def validar_identificacao(self):
        if self.socio_id is None and self.parceiro_externo is None:
            raise ValueError(
                "Cada condômino deve ter socio_id (produtor cadastrado) "
                "OU parceiro_externo preenchido."
            )
        return self


class CondominioCriar(BaseModel):
    """Payload para criar um contrato de condomínio com seus condôminos."""
    model_config = ConfigDict(populate_by_name=True)

    # Aceita fazenda_id ou imovel_id
    fazenda_id: Optional[int] = None
    imovel_id: Optional[int] = None

    area_total_ha: float = Field(
        ..., gt=0,
        description="Área total do imóvel em hectares. "
                    "A soma das áreas dos condôminos não pode exceder este valor."
    )
    data_inicio: str   # YYYY-MM-DD
    data_fim: str
    frequencia_pagamento: str = "safra"
    clausulas_adicionais: Optional[dict] = {}

    condominos: List[CondominoCreate] = Field(
        ..., min_length=2,
        description="Lista de condôminos. Mínimo 2 participantes."
    )

    @model_validator(mode="after")
    def validar_fazenda(self):
        if not self.fazenda_id and not self.imovel_id:
            raise ValueError("fazenda_id ou imovel_id é obrigatório.")
        if not self.fazenda_id:
            self.fazenda_id = self.imovel_id
        return self

    @model_validator(mode="after")
    def validar_soma_areas(self):
        soma = sum(c.area_ha for c in self.condominos)
        if soma > self.area_total_ha + 0.01:
            raise ValueError(
                f"A soma das áreas dos condôminos ({soma:.4f} ha) excede "
                f"a área total do imóvel ({self.area_total_ha:.4f} ha). "
                f"Diferença: {soma - self.area_total_ha:.4f} ha."
            )
        return self

    @validator("data_inicio", "data_fim")
    def normalizar_data(cls, v):
        import re
        if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            return v
        m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", v)
        if m:
            d, mo, y = m.groups()
            return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
        raise ValueError(f"Data inválida: '{v}'. Use YYYY-MM-DD ou DD/MM/YYYY.")


class CondominoAdicionar(BaseModel):
    """Adiciona um condômino a um contrato de condomínio existente."""
    socio_id: Optional[int] = None
    parceiro_externo: Optional[ParceiroExterno] = None
    area_ha: float = Field(..., gt=0)
    papel: str = "condomino"

    @model_validator(mode="after")
    def validar_identificacao(self):
        if self.socio_id is None and self.parceiro_externo is None:
            raise ValueError("socio_id ou parceiro_externo é obrigatório.")
        return self


class CondominoAtualizar(BaseModel):
    """Atualiza a área ou papel de um condômino existente."""
    area_ha: Optional[float] = Field(None, gt=0)
    papel: Optional[str] = Field(None, pattern="^(administrador|condomino|inventariante)$")


class AssinarRequest(BaseModel):
    otp: str
    geolocalizacao: Optional[dict] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
def criar_condominio(body: CondominioCriar, request: Request):
    """
    Cria um contrato de condomínio com todos os condôminos de uma vez.
    Valida que a soma das áreas não excede a área total do imóvel.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Inserir contrato principal (tipo = condominio)
        cur.execute("""
            INSERT INTO contratos (
                fazenda_id, tipo, status,
                data_inicio, data_fim,
                area_parceria_hectares,
                frequencia_pagamento,
                clausulas_adicionais,
                percentual_outorgante,
                percentual_outorgado
            ) VALUES (%s, 'condominio', 'rascunho', %s, %s, %s, %s, %s, NULL, NULL)
            RETURNING *
        """, (
            body.fazenda_id,
            body.data_inicio, body.data_fim,
            body.area_total_ha,
            body.frequencia_pagamento,
            json.dumps(body.clausulas_adicionais or {}),
        ))
        contrato = dict(cur.fetchone())
        contrato_id = contrato["id"]

        # Inserir cada condômino
        condominos_inseridos = []
        for c in body.condominos:
            parceiro_externo_id = None

            # Resolver parceiro externo se necessário
            if c.parceiro_externo:
                cur.execute("""
                    INSERT INTO parceiros_externos
                        (nome, tipo_documento, documento, telefone, email)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (tipo_documento, documento)
                    DO UPDATE SET nome = EXCLUDED.nome
                    RETURNING id
                """, (
                    c.parceiro_externo.nome,
                    c.parceiro_externo.tipo_documento,
                    c.parceiro_externo.documento,
                    c.parceiro_externo.telefone,
                    c.parceiro_externo.email,
                ))
                parceiro_externo_id = cur.fetchone()["id"]

            cur.execute("""
                INSERT INTO condominio_condominos
                    (contrato_id, socio_id, parceiro_externo_id, area_ha, papel)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
            """, (
                contrato_id,
                c.socio_id,
                parceiro_externo_id,
                c.area_ha,
                c.papel,
            ))
            condominos_inseridos.append(dict(cur.fetchone()))

        log_auditoria(
            cur, contrato_id, "condominio_criado",
            f"Condomínio criado com {len(condominos_inseridos)} condôminos, "
            f"área total {body.area_total_ha:.4f} ha",
            str(request.client.host),
        )

        conn.commit()

        # Calcular percentuais para retorno
        for cond in condominos_inseridos:
            cond["percentual_participacao"] = round(
                (float(cond["area_ha"]) / float(body.area_total_ha)) * 100, 4
            ) if body.area_total_ha > 0 else None

        return {
            "data": {
                **contrato,
                "condominos": condominos_inseridos,
                "area_total_ha": body.area_total_ha,
                "area_alocada_ha": sum(c.area_ha for c in body.condominos),
                "area_disponivel_ha": body.area_total_ha - sum(c.area_ha for c in body.condominos),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        err = str(e)
        if "excede a área total" in err or "excede" in err.lower():
            raise HTTPException(status_code=422, detail=err)
        if "foreign key" in err.lower() or "violates" in err.lower():
            raise HTTPException(
                status_code=422,
                detail=f"fazenda_id {body.fazenda_id} não encontrado. "
                       f"Cadastre a propriedade antes de criar o contrato."
            )
        raise HTTPException(status_code=500, detail=err)
    finally:
        conn.close()


@router.get("/{contrato_id}")
def detalhe_condominio(contrato_id: int):
    """Retorna o contrato de condomínio com todos os condôminos e percentuais calculados."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM vw_condominio_participacoes WHERE contrato_id = %s",
            (contrato_id,)
        )
        rows = cur.fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="Condomínio não encontrado.")

        # Montar resposta agrupada
        primeiro = dict(rows[0])
        return {
            "contrato_id": contrato_id,
            "fazenda_id": primeiro["fazenda_id"],
            "status": primeiro["status"],
            "data_inicio": primeiro["data_inicio"],
            "data_fim": primeiro["data_fim"],
            "area_total_ha": primeiro["area_total_ha"],
            "area_disponivel_ha": primeiro["area_disponivel_ha"],
            "condominos": [
                {
                    "id": dict(r)["condomino_id"],
                    "nome": dict(r)["nome_condomino"],
                    "documento": dict(r)["documento_condomino"],
                    "telefone": dict(r)["telefone_condomino"],
                    "area_ha": dict(r)["area_ha"],
                    "percentual_participacao": dict(r)["percentual_participacao"],
                    "papel": dict(r)["papel"],
                    "assinatura_status": dict(r)["assinatura_status"],
                    "assinado_em": dict(r)["assinado_em"],
                }
                for r in rows
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{contrato_id}/condominos", status_code=201)
def adicionar_condomino(contrato_id: int, body: CondominoAdicionar, request: Request):
    """
    Adiciona um condômino a um contrato de condomínio existente.
    Valida que a nova área não excede a área disponível.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Verificar área disponível
        cur.execute(
            "SELECT fn_area_disponivel_ha(%s) AS disponivel, area_parceria_hectares AS total "
            "FROM contratos WHERE id = %s",
            (contrato_id, contrato_id)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Contrato não encontrado.")

        disponivel = float(row["disponivel"] or 0)
        total = float(row["total"] or 0)

        if body.area_ha > disponivel + 0.01:
            raise HTTPException(
                status_code=422,
                detail=f"Área solicitada ({body.area_ha:.4f} ha) excede a área disponível "
                       f"({disponivel:.4f} ha de {total:.4f} ha total). "
                       f"Reduza a área ou ajuste os demais condôminos."
            )

        # Resolver parceiro externo
        parceiro_externo_id = None
        if body.parceiro_externo:
            cur.execute("""
                INSERT INTO parceiros_externos
                    (nome, tipo_documento, documento, telefone, email)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (tipo_documento, documento)
                DO UPDATE SET nome = EXCLUDED.nome
                RETURNING id
            """, (
                body.parceiro_externo.nome,
                body.parceiro_externo.tipo_documento,
                body.parceiro_externo.documento,
                body.parceiro_externo.telefone,
                body.parceiro_externo.email,
            ))
            parceiro_externo_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO condominio_condominos
                (contrato_id, socio_id, parceiro_externo_id, area_ha, papel)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (contrato_id, body.socio_id, parceiro_externo_id, body.area_ha, body.papel))
        novo = dict(cur.fetchone())

        log_auditoria(
            cur, contrato_id, "condomino_adicionado",
            f"Condômino adicionado: {body.area_ha:.4f} ha",
            str(request.client.host),
        )
        conn.commit()

        novo["percentual_participacao"] = round(
            (body.area_ha / total) * 100, 4
        ) if total > 0 else None

        return {"data": novo}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.patch("/{contrato_id}/condominos/{condomino_id}")
def atualizar_condomino(contrato_id: int, condomino_id: int, body: CondominoAtualizar, request: Request):
    """Atualiza a área ou papel de um condômino."""
    conn = get_db()
    try:
        cur = conn.cursor()

        if body.area_ha is not None:
            # Verificar se a nova área cabe no imóvel
            cur.execute("""
                SELECT
                    fn_area_disponivel_ha(%s) + cc.area_ha AS disponivel_com_atual,
                    c.area_parceria_hectares AS total
                FROM condominio_condominos cc
                JOIN contratos c ON c.id = cc.contrato_id
                WHERE cc.id = %s AND cc.contrato_id = %s
            """, (contrato_id, condomino_id, contrato_id))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Condômino não encontrado.")

            disponivel = float(row["disponivel_com_atual"] or 0)
            total = float(row["total"] or 0)

            if body.area_ha > disponivel + 0.01:
                raise HTTPException(
                    status_code=422,
                    detail=f"Nova área ({body.area_ha:.4f} ha) excede o disponível "
                           f"({disponivel:.4f} ha de {total:.4f} ha total)."
                )

        updates = []
        params = []
        if body.area_ha is not None:
            updates.append("area_ha = %s")
            params.append(body.area_ha)
        if body.papel is not None:
            updates.append("papel = %s")
            params.append(body.papel)

        if not updates:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar.")

        updates.append("atualizado_em = NOW()")
        params.extend([condomino_id, contrato_id])

        cur.execute(
            f"UPDATE condominio_condominos SET {', '.join(updates)} "
            f"WHERE id = %s AND contrato_id = %s RETURNING *",
            params
        )
        atualizado = cur.fetchone()
        if not atualizado:
            raise HTTPException(status_code=404, detail="Condômino não encontrado.")

        log_auditoria(cur, contrato_id, "condomino_atualizado",
                      f"Condômino {condomino_id} atualizado", str(request.client.host))
        conn.commit()
        return {"data": dict(atualizado)}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{contrato_id}/condominos/{condomino_id}", status_code=204)
def remover_condomino(contrato_id: int, condomino_id: int, request: Request):
    """Remove um condômino do contrato. Mínimo de 2 condôminos deve ser mantido."""
    conn = get_db()
    try:
        cur = conn.cursor()

        # Verificar mínimo de condôminos
        cur.execute(
            "SELECT COUNT(*) AS total FROM condominio_condominos WHERE contrato_id = %s",
            (contrato_id,)
        )
        total = cur.fetchone()["total"]
        if total <= 2:
            raise HTTPException(
                status_code=422,
                detail="Um condomínio deve ter no mínimo 2 condôminos. "
                       "Encerre o contrato em vez de remover o condômino."
            )

        cur.execute(
            "DELETE FROM condominio_condominos WHERE id = %s AND contrato_id = %s RETURNING id",
            (condomino_id, contrato_id)
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Condômino não encontrado.")

        log_auditoria(cur, contrato_id, "condomino_removido",
                      f"Condômino {condomino_id} removido", str(request.client.host))
        conn.commit()

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{contrato_id}/condominos/{condomino_id}/enviar-assinatura")
def enviar_assinatura(contrato_id: int, condomino_id: int, request: Request):
    """Gera OTP e envia notificação de assinatura para o condômino."""
    conn = get_db()
    try:
        cur = conn.cursor()
        otp = gerar_otp()
        expira = datetime.utcnow() + timedelta(hours=48)

        cur.execute("""
            UPDATE condominio_condominos
            SET otp_hash = %s, otp_expira_em = %s, assinatura_status = 'pendente'
            WHERE id = %s AND contrato_id = %s
            RETURNING *
        """, (hash_otp(otp), expira, condomino_id, contrato_id))
        cond = cur.fetchone()
        if not cond:
            raise HTTPException(status_code=404, detail="Condômino não encontrado.")

        log_auditoria(cur, contrato_id, "otp_gerado_condomino",
                      f"OTP gerado para condômino {condomino_id}", str(request.client.host))
        conn.commit()

        # TODO: integrar com WhatsApp/Telegram para envio do OTP
        import os as _os
        response = {
            "message": "OTP gerado. Integre com WhatsApp/Telegram para envio.",
            "expira_em": expira.isoformat(),
        }
        if _os.getenv("DEBUG") == "true":
            response["otp_debug"] = otp
        return response

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{contrato_id}/condominos/{condomino_id}/assinar")
def assinar_condominio(contrato_id: int, condomino_id: int, body: AssinarRequest, request: Request):
    """Registra a assinatura de um condômino via OTP."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT otp_hash, otp_expira_em, assinatura_status
            FROM condominio_condominos
            WHERE id = %s AND contrato_id = %s
        """, (condomino_id, contrato_id))
        cond = cur.fetchone()
        if not cond:
            raise HTTPException(status_code=404, detail="Condômino não encontrado.")

        if cond["assinatura_status"] == "assinado":
            raise HTTPException(status_code=409, detail="Condômino já assinou este contrato.")

        if not cond["otp_hash"]:
            raise HTTPException(status_code=400, detail="OTP não gerado. Solicite o envio primeiro.")

        if datetime.utcnow() > cond["otp_expira_em"]:
            raise HTTPException(status_code=410, detail="OTP expirado. Solicite um novo envio.")

        if hash_otp(body.otp) != cond["otp_hash"]:
            raise HTTPException(status_code=401, detail="OTP inválido.")

        cur.execute("""
            UPDATE condominio_condominos
            SET assinatura_status = 'assinado',
                assinado_em = NOW(),
                otp_hash = NULL,
                otp_expira_em = NULL
            WHERE id = %s AND contrato_id = %s
            RETURNING *
        """, (condomino_id, contrato_id))
        atualizado = dict(cur.fetchone())

        # Verificar se todos assinaram → atualizar status do contrato
        cur.execute("""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN assinatura_status = 'assinado' THEN 1 ELSE 0 END) AS assinados
            FROM condominio_condominos
            WHERE contrato_id = %s
        """, (contrato_id,))
        counts = cur.fetchone()
        if counts["total"] == counts["assinados"]:
            cur.execute(
                "UPDATE contratos SET status = 'ativo' WHERE id = %s",
                (contrato_id,)
            )
            log_auditoria(cur, contrato_id, "contrato_ativado",
                          "Todos os condôminos assinaram", str(request.client.host))

        log_auditoria(cur, contrato_id, "condomino_assinou",
                      f"Condômino {condomino_id} assinou", str(request.client.host))
        conn.commit()

        return {
            "message": "Assinatura registrada com sucesso.",
            "condomino": atualizado,
            "todos_assinaram": counts["total"] == counts["assinados"],
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/{contrato_id}/resumo-areas")
def resumo_areas(contrato_id: int):
    """Retorna o resumo de áreas alocadas e disponíveis no condomínio."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                c.area_parceria_hectares                    AS area_total_ha,
                fn_area_alocada_ha(%s)                      AS area_alocada_ha,
                fn_area_disponivel_ha(%s)                   AS area_disponivel_ha,
                ROUND(fn_area_alocada_ha(%s)
                    / NULLIF(c.area_parceria_hectares, 0) * 100, 2) AS pct_alocado,
                COUNT(cc.id)                                AS total_condominos
            FROM contratos c
            LEFT JOIN condominio_condominos cc ON cc.contrato_id = c.id
            WHERE c.id = %s
            GROUP BY c.area_parceria_hectares
        """, (contrato_id, contrato_id, contrato_id, contrato_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Contrato não encontrado.")
        return {"data": dict(row)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
