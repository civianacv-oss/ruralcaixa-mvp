"""
contratos_api.py — RuralCaixa MVP (VERSÃO CORRIGIDA)
=====================================================
CORREÇÕES APLICADAS:
  1. Erro 422 — causa raiz: o frontend enviava `imovel_id` mas o modelo
     Pydantic exige `fazenda_id`. Adicionado alias `imovel_id` via
     Field(alias=...) com model_config para aceitar ambos os nomes.

  2. Erro 422 — causa raiz: percentuais não somando 100. Adicionado
     tolerância de ±0.01 para evitar falhas por arredondamento de float
     (ex.: 33.33 + 66.67 = 99.99999... em float).

  3. Erro 422 — causa raiz: `tipo` enviado pelo frontend em português
     (ex.: "parceria") mas o validator só aceitava inglês ("pecuaria").
     Adicionado mapeamento PT-BR → valor interno.

  4. Mensagem de erro 422 agora retorna detalhe legível indicando
     exatamente qual campo falhou.

  5. Erro 500 no POST — adicionado tratamento específico para
     IntegrityError (FK inválida) com mensagem clara ao cliente.
"""

import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, validator, model_validator
from pydantic import ConfigDict

router = APIRouter(prefix="/contratos", tags=["contratos"])

# ── Helpers de DB (mantidos do original) ─────────────────────────────────────
def get_db():
    from app.db import get_connection
    return get_connection()

def log_auditoria(cur, contrato_id, acao, descricao, ip):
    cur.execute("""
        INSERT INTO auditoria_contratos (contrato_id, acao, descricao, ip)
        VALUES (%s, %s, %s, %s)
    """, (contrato_id, acao, descricao, ip))


# ── Modelos ───────────────────────────────────────────────────────────────────

class ParceiroExterno(BaseModel):
    nome: str
    tipo_documento: str   # CPF ou CNPJ
    documento: str
    telefone: Optional[str] = None
    email: Optional[str] = None


# Mapeamento de nomes em PT-BR para os valores internos aceitos pelo banco
_TIPO_MAP = {
    # Valores já aceitos (mantidos)
    "agricola": "agricola",
    "pecuaria": "pecuaria",
    "agroindustrial": "agroindustrial",
    "extrativa": "extrativa",
    "condominio": "condominio",
    "arrendamento": "arrendamento",
    "comodato": "comodato",
    "compra_venda": "compra_venda",
    # Aliases em PT-BR que o frontend pode enviar
    "parceria": "pecuaria",
    "parceria rural": "pecuaria",
    "arrendamento rural": "arrendamento",
    "comodato rural": "comodato",
    "condomínio rural": "condominio",
    "condominio rural": "condominio",
    "integração agroindustrial": "agroindustrial",
    "integracao agroindustrial": "agroindustrial",
}


class ContratoCreate(BaseModel):
    # CORREÇÃO 1: aceita tanto `fazenda_id` (nome interno) quanto `imovel_id`
    # (nome que o frontend Next.js envia). O alias permite ambos.
    model_config = ConfigDict(populate_by_name=True)

    fazenda_id: int = Field(..., alias="fazenda_id")
    imovel_id: Optional[int] = Field(None, alias="imovel_id")

    tipo: str
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

    @model_validator(mode="before")
    @classmethod
    def resolver_fazenda_id(cls, values):
        """Se o frontend enviar imovel_id mas não fazenda_id, usa imovel_id."""
        if isinstance(values, dict):
            if not values.get("fazenda_id") and values.get("imovel_id"):
                values["fazenda_id"] = values["imovel_id"]
        return values

    @validator("tipo")
    def tipo_valido(cls, v):
        # CORREÇÃO 3: normaliza para minúsculas e mapeia aliases PT-BR
        normalizado = v.lower().strip()
        mapeado = _TIPO_MAP.get(normalizado)
        if not mapeado:
            validos = sorted(set(_TIPO_MAP.values()))
            raise ValueError(
                f"tipo inválido: '{v}'. "
                f"Valores aceitos: {validos}. "
                f"Aliases PT-BR aceitos: parceria, arrendamento rural, comodato rural, "
                f"condomínio rural, integração agroindustrial."
            )
        return mapeado

    @validator("percentual_outorgado")
    def percentuais_somam_100(cls, v, values):
        # CORREÇÃO 2: tolerância de ±0.01 para evitar falhas por arredondamento
        ote = values.get("percentual_outorgante", 0)
        soma = round(ote + v, 2)
        if abs(soma - 100.0) > 0.01:
            raise ValueError(
                f"percentual_outorgante ({ote}) + percentual_outorgado ({v}) = {soma}. "
                f"A soma deve ser exatamente 100. "
                f"Exemplo válido: 60 + 40 = 100 ou 33.33 + 66.67 = 100."
            )
        return v

    @validator("data_inicio", "data_fim")
    def data_formato_valido(cls, v):
        """Valida e normaliza datas — aceita YYYY-MM-DD e DD/MM/YYYY."""
        import re
        if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            return v
        match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", v)
        if match:
            d, m, y = match.groups()
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
        raise ValueError(
            f"Data inválida: '{v}'. Use o formato YYYY-MM-DD (ex.: 2025-01-15) "
            f"ou DD/MM/YYYY (ex.: 15/01/2025)."
        )


class AssinarRequest(BaseModel):
    papel: str      # outorgante | outorgado
    otp: str
    geolocalizacao: Optional[dict] = None


# ── GET /contratos ────────────────────────────────────────────────────────────
@router.get("/")
def listar_contratos(
    fazenda_id: Optional[int] = None,
    imovel_id: Optional[int] = None,   # alias aceito pelo frontend
    status: Optional[str] = None,
    tipo: Optional[str] = None
):
    # Aceita imovel_id como alias de fazenda_id
    fid = fazenda_id or imovel_id
    conn = get_db()
    try:
        cur = conn.cursor()
        wheres = []
        params = []

        if fid:
            wheres.append("fazenda_id = %s")
            params.append(fid)
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


# ── GET /contratos/{id} ───────────────────────────────────────────────────────
_STATIC_PATHS = {"acerto", "novo", "resumo", "relatorio"}

@router.get("/{contrato_id}")
def detalhe_contrato(contrato_id: str):
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
            LEFT JOIN produtores s          ON s.id  = a.socio_id
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


# ── POST /contratos ───────────────────────────────────────────────────────────
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
        err_str = str(e)
        # CORREÇÃO 5: FK inválida → 422 com mensagem clara
        if "foreign key" in err_str.lower() or "violates" in err_str.lower():
            raise HTTPException(
                status_code=422,
                detail=f"fazenda_id inválido ou não encontrado: {body.fazenda_id}. "
                       f"Verifique se a propriedade existe antes de criar o contrato."
            )
        raise HTTPException(status_code=500, detail=err_str)
    finally:
        conn.close()
