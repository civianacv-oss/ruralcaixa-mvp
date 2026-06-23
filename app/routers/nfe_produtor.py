"""
RuralCaixa — Router NF-e Produtor Rural
Controle e emissão de Nota Fiscal de Produtor Rural.
Base legal:
  - Convênio ICMS 44/1975 — NF de Produtor (modelo 4)
  - Ajuste SINIEF 07/2005 — NF-e modelo 55
  - IN SRF 971/2009 — FUNRURAL na NF
  - Lei Complementar 87/1996 — ICMS operações rurais
  - Decreto 7.212/2010 — IPI (isenção produção rural)
Alíquotas FUNRURAL PF 2024 (IN RFB 2.237/2024):
  - Receita bruta: 1,87% (FUNRURAL 1,76% + RAT 0,11%)
  - SENAR: 0,20%
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal, List
import os, psycopg2, psycopg2.extras
from datetime import date, datetime

router = APIRouter(prefix="/nfe-produtor", tags=["NF-e Produtor"])
DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────────────────

class NFeCreate(BaseModel):
    imovel_id: int
    numero: str
    serie: str = "001"
    data_emissao: date
    data_saida: Optional[date] = None
    # Emitente
    nome_emitente: str
    cpf_cnpj_emitente: str
    ie_emitente: Optional[str] = None
    inscricao_estadual_produtor: Optional[str] = None
    # Destinatário
    nome_destinatario: str
    cpf_cnpj_destinatario: str
    ie_destinatario: Optional[str] = None
    # Produto
    produto: str
    descricao_produto: str
    ncm: Optional[str] = None
    cfop: str = "5101"
    unidade: str = "SC"
    quantidade: float
    valor_unitario: float
    # Valores
    valor_produtos: float
    desconto: float = 0.0
    valor_frete: float = 0.0
    valor_total_nf: float
    # Impostos
    base_calculo_icms: float = 0.0
    aliquota_icms: float = 0.0
    valor_icms: float = 0.0
    icms_diferido: bool = False
    base_calculo_funrural: float = 0.0
    aliquota_funrural: float = 1.87
    valor_funrural: float = 0.0
    aliquota_senar: float = 0.20
    valor_senar: float = 0.0
    # Controle
    chave_acesso: Optional[str] = None
    protocolo_autorizacao: Optional[str] = None
    status: Literal["rascunho","emitida","cancelada","denegada"] = "rascunho"
    # Vinculação
    acerto_contrato_id: Optional[int] = None
    observacoes: Optional[str] = None

class NFeUpdate(BaseModel):
    status: Optional[str] = None
    chave_acesso: Optional[str] = None
    protocolo_autorizacao: Optional[str] = None
    data_saida: Optional[date] = None
    observacoes: Optional[str] = None
    motivo_cancelamento: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{imovel_id}")
def listar_nfes(
    imovel_id: int,
    ano: Optional[int] = None,
    status: Optional[str] = None,
    produto: Optional[str] = None,
):
    db = get_db()
    cur = db.cursor()
    q = "SELECT * FROM nfe_produtor WHERE imovel_id = %s"
    params = [imovel_id]
    if ano:     q += " AND EXTRACT(YEAR FROM data_emissao) = %s"; params.append(ano)
    if status:  q += " AND status = %s"; params.append(status)
    if produto: q += " AND produto ILIKE %s"; params.append(f"%{produto}%")
    q += " ORDER BY data_emissao DESC, numero DESC"
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.get("/{imovel_id}/{id}")
def get_nfe(imovel_id: int, id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM nfe_produtor WHERE id = %s AND imovel_id = %s", (id, imovel_id))
    row = cur.fetchone()
    db.close()
    if not row: raise HTTPException(status_code=404, detail="NF-e não encontrada")
    return dict(row)

@router.post("/")
def criar_nfe(data: NFeCreate):
    db = get_db()
    cur = db.cursor()

    # Verificar número duplicado
    cur.execute("SELECT id FROM nfe_produtor WHERE imovel_id = %s AND numero = %s AND serie = %s",
                (data.imovel_id, data.numero, data.serie))
    if cur.fetchone():
        db.close()
        raise HTTPException(status_code=409, detail=f"NF-e {data.numero}/{data.serie} já existe para este imóvel")

    # Calcular FUNRURAL e SENAR se não informados
    base_funrural = data.base_calculo_funrural or data.valor_produtos
    valor_funrural = data.valor_funrural or round(base_funrural * data.aliquota_funrural / 100, 2)
    valor_senar    = data.valor_senar    or round(base_funrural * data.aliquota_senar / 100, 2)

    cur.execute("""
        INSERT INTO nfe_produtor (
            imovel_id, numero, serie, data_emissao, data_saida,
            nome_emitente, cpf_cnpj_emitente, ie_emitente, inscricao_estadual_produtor,
            nome_destinatario, cpf_cnpj_destinatario, ie_destinatario,
            produto, descricao_produto, ncm, cfop, unidade, quantidade, valor_unitario,
            valor_produtos, desconto, valor_frete, valor_total_nf,
            base_calculo_icms, aliquota_icms, valor_icms, icms_diferido,
            base_calculo_funrural, aliquota_funrural, valor_funrural,
            aliquota_senar, valor_senar,
            chave_acesso, protocolo_autorizacao, status,
            acerto_contrato_id, observacoes
        ) VALUES (
            %s,%s,%s,%s,%s,
            %s,%s,%s,%s,
            %s,%s,%s,
            %s,%s,%s,%s,%s,%s,%s,
            %s,%s,%s,%s,
            %s,%s,%s,%s,
            %s,%s,%s,
            %s,%s,
            %s,%s,%s,
            %s,%s
        ) RETURNING id
    """, (
        data.imovel_id, data.numero, data.serie, data.data_emissao, data.data_saida,
        data.nome_emitente, data.cpf_cnpj_emitente, data.ie_emitente, data.inscricao_estadual_produtor,
        data.nome_destinatario, data.cpf_cnpj_destinatario, data.ie_destinatario,
        data.produto, data.descricao_produto, data.ncm, data.cfop, data.unidade, data.quantidade, data.valor_unitario,
        data.valor_produtos, data.desconto, data.valor_frete, data.valor_total_nf,
        data.base_calculo_icms, data.aliquota_icms, data.valor_icms, data.icms_diferido,
        base_funrural, data.aliquota_funrural, valor_funrural,
        data.aliquota_senar, valor_senar,
        data.chave_acesso, data.protocolo_autorizacao, data.status,
        data.acerto_contrato_id, data.observacoes
    ))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id, "valor_funrural_calculado": valor_funrural, "valor_senar_calculado": valor_senar}

@router.patch("/{id}")
def atualizar_nfe(id: int, data: NFeUpdate):
    db = get_db()
    cur = db.cursor()
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        db.close()
        return {"ok": True}
    updates["atualizado_em"] = datetime.now()
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    cur.execute(f"UPDATE nfe_produtor SET {set_clause} WHERE id = %s",
                list(updates.values()) + [id])
    db.commit()
    db.close()
    return {"ok": True}

@router.delete("/{id}")
def cancelar_nfe(id: int, motivo: str = Query(default="Cancelamento solicitado")):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT status FROM nfe_produtor WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row: raise HTTPException(status_code=404, detail="NF-e não encontrada")
    if row["status"] == "cancelada":
        db.close()
        raise HTTPException(status_code=400, detail="NF-e já está cancelada")
    cur.execute("""
        UPDATE nfe_produtor SET status = 'cancelada', motivo_cancelamento = %s, atualizado_em = NOW()
        WHERE id = %s
    """, (motivo, id))
    db.commit()
    db.close()
    return {"ok": True, "status": "cancelada"}

# ─────────────────────────────────────────────────────────────────────────────
# CALCULADORA
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/calcular")
def calcular_nfe(
    valor_produtos: float,
    aliquota_icms: float = 0.0,
    icms_diferido: bool = False,
    desconto: float = 0.0,
    frete: float = 0.0,
    aliquota_funrural: float = 1.87,
    aliquota_senar: float = 0.20,
):
    base_icms = valor_produtos - desconto
    valor_icms = round(base_icms * aliquota_icms / 100, 2) if not icms_diferido else 0
    valor_funrural = round(valor_produtos * aliquota_funrural / 100, 2)
    valor_senar    = round(valor_produtos * aliquota_senar / 100, 2)
    valor_total    = round(valor_produtos - desconto + frete, 2)
    valor_liquido  = round(valor_total - valor_funrural - valor_senar, 2)
    return {
        "valor_produtos": valor_produtos,
        "desconto": desconto,
        "frete": frete,
        "valor_total_nf": valor_total,
        "base_calculo_icms": base_icms,
        "valor_icms": valor_icms,
        "icms_diferido": icms_diferido,
        "base_calculo_funrural": valor_produtos,
        "valor_funrural": valor_funrural,
        "valor_senar": valor_senar,
        "total_retencoes": round(valor_funrural + valor_senar, 2),
        "valor_liquido_produtor": valor_liquido,
    }

# ─────────────────────────────────────────────────────────────────────────────
# RESUMO FISCAL
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{imovel_id}/resumo/{ano}")
def resumo_fiscal_nfe(imovel_id: int, ano: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT
            COUNT(*) AS total_nfes,
            COUNT(*) FILTER (WHERE status = 'emitida') AS emitidas,
            COUNT(*) FILTER (WHERE status = 'cancelada') AS canceladas,
            SUM(valor_produtos) FILTER (WHERE status = 'emitida') AS total_produtos,
            SUM(valor_total_nf) FILTER (WHERE status = 'emitida') AS total_nf,
            SUM(valor_funrural) FILTER (WHERE status = 'emitida') AS total_funrural,
            SUM(valor_senar) FILTER (WHERE status = 'emitida') AS total_senar,
            SUM(valor_icms) FILTER (WHERE status = 'emitida') AS total_icms
        FROM nfe_produtor
        WHERE imovel_id = %s AND EXTRACT(YEAR FROM data_emissao) = %s
    """, (imovel_id, ano))
    r = dict(cur.fetchone())
    db.close()
    total_prod = float(r.get("total_produtos") or 0)
    return {
        **{k: float(v or 0) if v is not None else 0 for k, v in r.items()},
        "base_irpf_20pct": round(total_prod * 0.20, 2),
    }
