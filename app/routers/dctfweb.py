"""
RuralCaixa — Router DCTFWeb
Gestão de declarações DCTFWeb, PER/DCOMP, créditos e retificações.
Base legal:
  - IN RFB 2.005/2021 — DCTFWeb
  - IN RFB 2.055/2021 — PER/DCOMP
  - Lei 9.430/1996 art. 44 — multas e penalidades
  - Lei 9.784/1999 — processo administrativo
Vigência: competências a partir de 10/2021 (obrigatoriedade DCTFWeb produtor rural)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal, List
import os, psycopg2, psycopg2.extras
from datetime import date, datetime
from decimal import Decimal

router = APIRouter(prefix="/dctfweb", tags=["DCTFWeb"])

DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────────────────

class DCTFWebCreate(BaseModel):
    imovel_id: int
    competencia: str                    # 'YYYY-MM'
    tipo: Literal["original", "retificadora", "cancelamento"] = "original"
    # Valores declarados
    funrural_valor: float = 0.0
    senar_valor: float = 0.0
    inss_servicos_valor: float = 0.0
    # Créditos vinculados
    credito_origem_id: Optional[int] = None
    valor_credito_vinculado: float = 0.0
    # Pagamentos
    valor_pago: float = 0.0
    data_pagamento: Optional[date] = None
    numero_darf: Optional[str] = None
    # Compensações PER/DCOMP
    perdcomp_numero: Optional[str] = None
    valor_compensado: float = 0.0
    # Metadados
    numero_declaracao: Optional[str] = None
    data_transmissao: Optional[date] = None
    observacoes: Optional[str] = None

class DCTFWebUpdate(BaseModel):
    status: Optional[Literal["rascunho","transmitida","retificada","cancelada"]] = None
    numero_declaracao: Optional[str] = None
    data_transmissao: Optional[date] = None
    valor_pago: Optional[float] = None
    data_pagamento: Optional[date] = None
    numero_darf: Optional[str] = None
    perdcomp_numero: Optional[str] = None
    valor_compensado: Optional[float] = None
    credito_origem_id: Optional[int] = None
    valor_credito_vinculado: Optional[float] = None
    observacoes: Optional[str] = None

class CreditoCreate(BaseModel):
    imovel_id: int
    tipo: Literal["pagamento_indevido","pagamento_a_maior","saldo_negativo","outros"] = "pagamento_indevido"
    competencia_origem: str             # competência que gerou o crédito
    valor_original: float
    descricao: str
    numero_perdcomp: Optional[str] = None
    data_reconhecimento: Optional[date] = None

class PerdcompCreate(BaseModel):
    imovel_id: int
    numero: str
    tipo: Literal["restituicao","compensacao"] = "compensacao"
    competencia_debito: str
    credito_origem_id: int
    valor_solicitado: float
    valor_deferido: float = 0.0
    status: Literal["em_analise","deferido","indeferido","cancelado"] = "em_analise"
    data_protocolo: Optional[date] = None
    data_decisao: Optional[date] = None
    observacoes: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# DCTFWeb CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/declaracoes/{imovel_id}")
def listar_declaracoes(
    imovel_id: int,
    competencia: Optional[str] = None,
    status: Optional[str] = None,
    ano: Optional[int] = None
):
    db = get_db()
    cur = db.cursor()
    q = "SELECT * FROM dctfweb_declaracoes WHERE imovel_id = %s"
    params = [imovel_id]
    if competencia:
        q += " AND competencia = %s"; params.append(competencia)
    if status:
        q += " AND status = %s"; params.append(status)
    if ano:
        q += " AND competencia LIKE %s"; params.append(f"{ano}-%")
    q += " ORDER BY competencia ASC, criado_em DESC"
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/declaracoes")
def criar_declaracao(data: DCTFWebCreate):
    db = get_db()
    cur = db.cursor()

    # Verificar se já existe declaração ativa para a competência
    cur.execute("""
        SELECT id, tipo, status FROM dctfweb_declaracoes
        WHERE imovel_id = %s AND competencia = %s AND status NOT IN ('cancelada')
        ORDER BY criado_em DESC LIMIT 1
    """, (data.imovel_id, data.competencia))
    existente = cur.fetchone()

    if existente and data.tipo == "original":
        db.close()
        raise HTTPException(
            status_code=409,
            detail=f"Já existe declaração ativa para {data.competencia} (id={existente['id']}, status={existente['status']}). Use tipo='retificadora' para corrigir."
        )

    total_devido = data.funrural_valor + data.senar_valor + data.inss_servicos_valor
    saldo_a_pagar = max(0, total_devido - data.valor_credito_vinculado - data.valor_pago - data.valor_compensado)

    cur.execute("""
        INSERT INTO dctfweb_declaracoes (
            imovel_id, competencia, tipo,
            funrural_valor, senar_valor, inss_servicos_valor,
            total_devido, credito_origem_id, valor_credito_vinculado,
            valor_pago, data_pagamento, numero_darf,
            perdcomp_numero, valor_compensado,
            saldo_a_pagar, numero_declaracao, data_transmissao, observacoes
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        data.imovel_id, data.competencia, data.tipo,
        data.funrural_valor, data.senar_valor, data.inss_servicos_valor,
        total_devido, data.credito_origem_id, data.valor_credito_vinculado,
        data.valor_pago, data.data_pagamento, data.numero_darf,
        data.perdcomp_numero, data.valor_compensado,
        saldo_a_pagar, data.numero_declaracao, data.data_transmissao, data.observacoes
    ))
    new_id = cur.fetchone()["id"]

    # Se for retificadora, marcar a anterior como retificada
    if data.tipo == "retificadora" and existente:
        cur.execute(
            "UPDATE dctfweb_declaracoes SET status = 'retificada', atualizado_em = NOW() WHERE id = %s",
            (existente["id"],)
        )

    db.commit()
    db.close()
    return {"id": new_id, "total_devido": total_devido, "saldo_a_pagar": saldo_a_pagar}

@router.get("/declaracoes/{imovel_id}/{id}")
def get_declaracao(imovel_id: int, id: int):
    if str(id) in {"creditos", "perdcomp", "painel", "resumo"}:
        raise HTTPException(status_code=404, detail="Not found")
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM dctfweb_declaracoes WHERE id = %s AND imovel_id = %s", (id, imovel_id))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Declaração não encontrada")

    # Buscar PER/DCOMPs vinculados ao mesmo crédito
    perdcomps = []
    if row["credito_origem_id"]:
        cur.execute("""
            SELECT p.*, d.competencia AS comp_debito
            FROM dctfweb_perdcomp p
            LEFT JOIN dctfweb_declaracoes d ON d.id = p.declaracao_id
            WHERE p.credito_origem_id = %s
            ORDER BY p.data_protocolo DESC
        """, (row["credito_origem_id"],))
        perdcomps = [dict(r) for r in cur.fetchall()]

    db.close()
    return {"declaracao": dict(row), "perdcomps_mesmo_credito": perdcomps}

@router.patch("/declaracoes/{id}")
def atualizar_declaracao(id: int, data: DCTFWebUpdate):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM dctfweb_declaracoes WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Declaração não encontrada")

    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        db.close()
        return {"ok": True, "message": "Nenhuma alteração"}

    # Recalcular saldo se valores mudaram
    funrural = float(row["funrural_valor"])
    senar    = float(row["senar_valor"])
    inss     = float(row["inss_servicos_valor"])
    total    = funrural + senar + inss
    cred     = float(updates.get("valor_credito_vinculado", row["valor_credito_vinculado"] or 0))
    pago     = float(updates.get("valor_pago", row["valor_pago"] or 0))
    comp     = float(updates.get("valor_compensado", row["valor_compensado"] or 0))
    saldo    = max(0, total - cred - pago - comp)
    updates["saldo_a_pagar"] = saldo
    updates["atualizado_em"] = datetime.now()

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    cur.execute(f"UPDATE dctfweb_declaracoes SET {set_clause} WHERE id = %s",
                list(updates.values()) + [id])
    db.commit()
    db.close()
    return {"ok": True, "saldo_a_pagar": saldo}

@router.delete("/declaracoes/{id}")
def cancelar_declaracao(id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT status FROM dctfweb_declaracoes WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Declaração não encontrada")
    if row["status"] == "transmitida":
        db.close()
        raise HTTPException(status_code=400, detail="Declaração transmitida não pode ser excluída. Use cancelamento via e-CAC.")
    cur.execute("UPDATE dctfweb_declaracoes SET status = 'cancelada', atualizado_em = NOW() WHERE id = %s", (id,))
    db.commit()
    db.close()
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# CRÉDITOS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/creditos/{imovel_id}")
def listar_creditos(imovel_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT c.*,
            COALESCE(SUM(p.valor_deferido) FILTER (WHERE p.status = 'deferido'), 0) AS total_utilizado,
            c.valor_original - COALESCE(SUM(p.valor_deferido) FILTER (WHERE p.status = 'deferido'), 0) AS saldo_disponivel
        FROM dctfweb_creditos c
        LEFT JOIN dctfweb_perdcomp p ON p.credito_origem_id = c.id
        WHERE c.imovel_id = %s
        GROUP BY c.id
        ORDER BY c.competencia_origem DESC
    """, (imovel_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/creditos")
def criar_credito(data: CreditoCreate):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO dctfweb_creditos
            (imovel_id, tipo, competencia_origem, valor_original, descricao,
             numero_perdcomp, data_reconhecimento)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (data.imovel_id, data.tipo, data.competencia_origem, data.valor_original,
          data.descricao, data.numero_perdcomp, data.data_reconhecimento))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id}

# ─────────────────────────────────────────────────────────────────────────────
# PER/DCOMP
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/perdcomp/{imovel_id}")
def listar_perdcomp(imovel_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT p.*, c.descricao AS credito_descricao, c.valor_original AS credito_valor_original,
               c.competencia_origem
        FROM dctfweb_perdcomp p
        LEFT JOIN dctfweb_creditos c ON c.id = p.credito_origem_id
        WHERE p.imovel_id = %s
        ORDER BY p.data_protocolo DESC
    """, (imovel_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/perdcomp")
def criar_perdcomp(data: PerdcompCreate):
    db = get_db()
    cur = db.cursor()

    # Verificar saldo disponível do crédito
    cur.execute("""
        SELECT c.valor_original,
               COALESCE(SUM(p.valor_deferido) FILTER (WHERE p.status = 'deferido'), 0) AS utilizado
        FROM dctfweb_creditos c
        LEFT JOIN dctfweb_perdcomp p ON p.credito_origem_id = c.id
        WHERE c.id = %s
        GROUP BY c.id
    """, (data.credito_origem_id,))
    cred = cur.fetchone()
    if not cred:
        db.close()
        raise HTTPException(status_code=404, detail="Crédito de origem não encontrado")

    saldo = float(cred["valor_original"]) - float(cred["utilizado"])
    if data.valor_solicitado > saldo + 0.01:
        db.close()
        raise HTTPException(
            status_code=400,
            detail=f"Valor solicitado ({data.valor_solicitado:.2f}) excede saldo disponível do crédito ({saldo:.2f})"
        )

    cur.execute("""
        INSERT INTO dctfweb_perdcomp
            (imovel_id, numero, tipo, competencia_debito, credito_origem_id,
             valor_solicitado, valor_deferido, status, data_protocolo, data_decisao, observacoes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (data.imovel_id, data.numero, data.tipo, data.competencia_debito,
          data.credito_origem_id, data.valor_solicitado, data.valor_deferido,
          data.status, data.data_protocolo, data.data_decisao, data.observacoes))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id, "saldo_credito_apos": saldo - data.valor_deferido}

@router.patch("/perdcomp/{id}/status")
def atualizar_status_perdcomp(id: int, status: str, valor_deferido: Optional[float] = None, data_decisao: Optional[date] = None):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        UPDATE dctfweb_perdcomp
        SET status = %s,
            valor_deferido = COALESCE(%s, valor_deferido),
            data_decisao = COALESCE(%s, data_decisao),
            atualizado_em = NOW()
        WHERE id = %s
        RETURNING credito_origem_id, valor_deferido
    """, (status, valor_deferido, data_decisao, id))
    row = cur.fetchone()
    db.commit()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="PER/DCOMP não encontrado")
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# PAINEL GUIA DCTFWeb (ordenado por competência ASC, a partir de 10/2021)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/painel/{imovel_id}")
def painel_dctfweb(
    imovel_id: int,
    competencia_inicio: str = Query("2021-10", description="Início do período (YYYY-MM)"),
    competencia_fim: Optional[str] = None,
):
    db = get_db()
    cur = db.cursor()

    fim = competencia_fim or datetime.now().strftime("%Y-%m")

    # Declarações no período
    cur.execute("""
        SELECT d.*,
            c.descricao AS credito_descricao,
            c.valor_original AS credito_valor_original
        FROM dctfweb_declaracoes d
        LEFT JOIN dctfweb_creditos c ON c.id = d.credito_origem_id
        WHERE d.imovel_id = %s
          AND d.competencia >= %s AND d.competencia <= %s
        ORDER BY d.competencia ASC, d.criado_em DESC
    """, (imovel_id, competencia_inicio, fim))
    declaracoes = [dict(r) for r in cur.fetchall()]

    # Apurações EFD-Reinf no mesmo período
    cur.execute("""
        SELECT competencia, total_a_recolher, status_darf, data_vencimento,
               total_funrural, total_senar, total_inss_servicos,
               dctfweb_numero, dctfweb_status
        FROM reinf_apuracao
        WHERE imovel_id = %s
          AND competencia >= %s AND competencia <= %s
        ORDER BY competencia ASC
    """, (imovel_id, competencia_inicio, fim))
    apuracoes = {r["competencia"]: dict(r) for r in cur.fetchall()}

    # PER/DCOMPs no período
    cur.execute("""
        SELECT p.*, c.descricao AS credito_descricao, c.competencia_origem
        FROM dctfweb_perdcomp p
        LEFT JOIN dctfweb_creditos c ON c.id = p.credito_origem_id
        WHERE p.imovel_id = %s
          AND p.competencia_debito >= %s AND p.competencia_debito <= %s
        ORDER BY p.competencia_debito ASC
    """, (imovel_id, competencia_inicio, fim))
    perdcomps_raw = cur.fetchall()

    # Créditos disponíveis
    cur.execute("""
        SELECT c.*,
            COALESCE(SUM(p.valor_deferido) FILTER (WHERE p.status = 'deferido'), 0) AS utilizado,
            c.valor_original - COALESCE(SUM(p.valor_deferido) FILTER (WHERE p.status = 'deferido'), 0) AS saldo
        FROM dctfweb_creditos c
        LEFT JOIN dctfweb_perdcomp p ON p.credito_origem_id = c.id
        WHERE c.imovel_id = %s
        GROUP BY c.id
        HAVING c.valor_original - COALESCE(SUM(p.valor_deferido) FILTER (WHERE p.status = 'deferido'), 0) > 0
    """, (imovel_id,))
    creditos_disponiveis = [dict(r) for r in cur.fetchall()]

    db.close()

    # Montar painel por competência
    competencias_set = set()
    for d in declaracoes: competencias_set.add(d["competencia"])
    for c in apuracoes: competencias_set.add(c)
    for p in perdcomps_raw: competencias_set.add(p["competencia_debito"])

    painel = []
    for comp in sorted(competencias_set):
        decls_comp = [d for d in declaracoes if d["competencia"] == comp]
        decl_ativa = next((d for d in decls_comp if d["status"] not in ("cancelada","retificada")), None)
        apuracao = apuracoes.get(comp)
        perdcomps_comp = [dict(p) for p in perdcomps_raw if p["competencia_debito"] == comp]

        # Ação sugerida
        acao = _sugerir_acao(decl_ativa, apuracao)

        painel.append({
            "competencia": comp,
            "declaracao_ativa": decl_ativa,
            "historico_declaracoes": decls_comp,
            "apuracao_reinf": apuracao,
            "perdcomps": perdcomps_comp,
            "acao_sugerida": acao,
        })

    # KPIs resumo
    total_devido  = sum(float(d.get("total_devido", 0)) for d in declaracoes if d["status"] != "cancelada")
    total_pago    = sum(float(d.get("valor_pago", 0)) for d in declaracoes if d["status"] != "cancelada")
    total_comp    = sum(float(d.get("valor_compensado", 0)) for d in declaracoes if d["status"] != "cancelada")
    total_saldo   = sum(float(d.get("saldo_a_pagar", 0)) for d in declaracoes if d["status"] not in ("cancelada","retificada"))
    pendentes     = sum(1 for d in declaracoes if d["status"] == "rascunho")

    return {
        "painel": painel,
        "kpis": {
            "total_devido": total_devido,
            "total_pago": total_pago,
            "total_compensado": total_comp,
            "saldo_em_aberto": total_saldo,
            "declaracoes_pendentes_transmissao": pendentes,
            "creditos_disponiveis": len(creditos_disponiveis),
            "saldo_creditos": sum(float(c["saldo"]) for c in creditos_disponiveis),
        },
        "creditos_disponiveis": creditos_disponiveis,
        "periodo": {"inicio": competencia_inicio, "fim": fim},
    }

def _sugerir_acao(decl, apuracao) -> dict:
    """Sugere a próxima ação para a competência conforme o estado atual."""
    if not apuracao and not decl:
        return {"codigo": "sem_movimento", "label": "Sem movimento", "cor": "gray"}

    if not decl and apuracao:
        if float(apuracao.get("total_a_recolher", 0)) > 0:
            return {"codigo": "criar_dctfweb", "label": "Criar DCTFWeb", "cor": "orange",
                    "detalhe": f"EFD-Reinf apurou {apuracao['total_a_recolher']:.2f}. Criar declaração."}
        return {"codigo": "verificar", "label": "Verificar", "cor": "blue"}

    if decl:
        if decl["status"] == "rascunho":
            return {"codigo": "transmitir", "label": "Transmitir DCTFWeb", "cor": "orange",
                    "detalhe": "Declaração em rascunho. Transmita via e-CAC."}
        if float(decl.get("saldo_a_pagar", 0)) > 0.01:
            return {"codigo": "pagar_darf", "label": "Pagar DARF", "cor": "red",
                    "detalhe": f"Saldo em aberto: R$ {decl['saldo_a_pagar']:.2f}"}
        if decl["status"] == "transmitida" and float(decl.get("saldo_a_pagar", 0)) <= 0:
            return {"codigo": "concluida", "label": "Concluída", "cor": "green"}

    return {"codigo": "ok", "label": "OK", "cor": "green"}

# ─────────────────────────────────────────────────────────────────────────────
# RESUMO CRÉDITO (rastreamento por número de crédito de origem)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/creditos/{imovel_id}/{credito_id}/rastreamento")
def rastrear_credito(imovel_id: int, credito_id: int):
    if str(credito_id) in {"painel", "resumo", "perdcomp"}:
        raise HTTPException(status_code=404, detail="Not found")
    db = get_db()
    cur = db.cursor()

    cur.execute("SELECT * FROM dctfweb_creditos WHERE id = %s AND imovel_id = %s", (credito_id, imovel_id))
    credito = cur.fetchone()
    if not credito:
        db.close()
        raise HTTPException(status_code=404, detail="Crédito não encontrado")

    cur.execute("""
        SELECT p.*,
               d.competencia AS dctfweb_competencia,
               d.numero_declaracao AS dctfweb_numero,
               d.status AS dctfweb_status
        FROM dctfweb_perdcomp p
        LEFT JOIN dctfweb_declaracoes d ON d.perdcomp_numero = p.numero
        WHERE p.credito_origem_id = %s
        ORDER BY p.data_protocolo ASC
    """, (credito_id,))
    utilizacoes = [dict(r) for r in cur.fetchall()]

    total_utilizado  = sum(float(u["valor_deferido"]) for u in utilizacoes if u["status"] == "deferido")
    total_solicitado = sum(float(u["valor_solicitado"]) for u in utilizacoes)
    saldo_disponivel = float(credito["valor_original"]) - total_utilizado

    db.close()
    return {
        "credito": dict(credito),
        "utilizacoes": utilizacoes,
        "resumo": {
            "valor_original": float(credito["valor_original"]),
            "total_solicitado": total_solicitado,
            "total_utilizado_deferido": total_utilizado,
            "saldo_disponivel": saldo_disponivel,
            "saldo_restituir_compensar": saldo_disponivel,
        }
    }
