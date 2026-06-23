"""
RuralCaixa — Router EFD-Reinf (v2)
Eventos: R-2055 (comercialização produção rural), R-2010 (serviços tomados)
Apuração mensal FUNRURAL, geração de XML, integração com Acertos de Contrato
Base legal:
  - IN RFB 2.237/2024 — alíquotas FUNRURAL 1,87% + SENAR 0,11%
  - Lei 8.212/1991 art. 25 — contribuição previdenciária produtor rural
  - LC 214/2024 — Reforma Tributária (CBS/IBS, vigência 2027+)
  - NT EFD-Reinf 2024/001 — schema XML v2.01.01
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, Literal, List
import os, psycopg2, psycopg2.extras
from datetime import date, datetime
import calendar, hashlib, xml.etree.ElementTree as ET

router = APIRouter(prefix="/efdreinf", tags=["EFD-Reinf"])

DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

# ─────────────────────────────────────────────────────────────────────────────
# ALÍQUOTAS VIGENTES (IN RFB 2.237/2024)
# ─────────────────────────────────────────────────────────────────────────────
ALIQUOTA_FUNRURAL_PF  = 0.0187   # 1,87% — produtor rural PF
ALIQUOTA_FUNRURAL_PJ  = 0.0200   # 2,00% — produtor rural PJ
ALIQUOTA_SENAR        = 0.0011   # 0,11%
ALIQUOTA_INSS_SERVICO = 0.1100   # 11,00% — cessão de mão de obra

# Reforma Tributária — LC 214/2024 (estimativas — regulamentação pendente)
ALIQUOTA_CBS_ESTIMADA = 0.0865   # 8,65% CBS (substitui PIS/COFINS)
ALIQUOTA_IBS_ESTIMADA = 0.0265   # 2,65% IBS (substitui ICMS/ISS)

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────────────────

class ConfiguracaoCreate(BaseModel):
    imovel_id: int
    cpf_cnpj: str
    caepf: Optional[str] = None
    tipo_contribuinte: Literal["produtor_rural_pf", "produtor_rural_pj", "simples_nacional"] = "produtor_rural_pf"
    regime_tributario: Literal["lucro_real", "lucro_presumido", "simples_nacional"] = "lucro_presumido"
    tem_empregados: bool = False

class ConfiguracaoAvancadaCreate(BaseModel):
    imovel_id: int
    ambiente: Literal["producao", "homologacao"] = "producao"
    versao_schema: str = "2.01.01"
    cnpj_transmissor: Optional[str] = None
    nome_transmissor: Optional[str] = None
    aderiu_reforma: bool = False
    data_adesao_reforma: Optional[date] = None
    aliquota_cbs_padrao: float = ALIQUOTA_CBS_ESTIMADA
    aliquota_ibs_padrao: float = ALIQUOTA_IBS_ESTIMADA

class R2055Create(BaseModel):
    imovel_id: int
    competencia: str                    # 'YYYY-MM'
    cnpj_adquirente: str
    nome_adquirente: Optional[str] = None
    data_nota: date
    numero_nota: Optional[str] = None
    tipo_produto: Literal[
        "bovino", "suino", "ovino", "caprino", "aves",
        "leite", "graos", "frutas", "acai", "outros"
    ] = "bovino"
    valor_bruto: float
    aliquota_funrural: float = ALIQUOTA_FUNRURAL_PF
    aliquota_senar: float = ALIQUOTA_SENAR
    retencao_pelo_adquirente: bool = True
    observacoes: Optional[str] = None
    # Campos de integração
    acerto_id: Optional[int] = None
    origem: Literal["manual", "acerto_contrato", "importacao"] = "manual"
    cpf_cnpj_produtor: Optional[str] = None
    caepf: Optional[str] = None
    # Reforma Tributária (LC 214/2024)
    regime_fiscal: Literal["atual", "reforma_tributaria", "transicao"] = "atual"
    aliquota_cbs: float = 0.0
    aliquota_ibs: float = 0.0

class R2010Create(BaseModel):
    imovel_id: int
    competencia: str
    cnpj_prestador: str
    nome_prestador: Optional[str] = None
    data_nota: date
    numero_nota: Optional[str] = None
    tipo_servico: Literal[
        "colheita", "tratorista", "construcao",
        "transporte", "irrigacao", "outros"
    ] = "outros"
    valor_bruto: float
    aliquota_retencao: float = ALIQUOTA_INSS_SERVICO
    cessao_mao_obra: bool = True
    observacoes: Optional[str] = None
    cpf_cnpj_produtor: Optional[str] = None
    caepf: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO (R-1000)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/configuracao/{imovel_id}")
def get_configuracao(imovel_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM reinf_configuracao WHERE imovel_id = %s ORDER BY id DESC LIMIT 1", (imovel_id,))
    row = cur.fetchone()
    cur.execute("SELECT * FROM reinf_configuracao_avancada WHERE imovel_id = %s", (imovel_id,))
    avancada = cur.fetchone()
    db.close()
    return {"basica": dict(row) if row else {}, "avancada": dict(avancada) if avancada else {}}

@router.post("/configuracao")
def salvar_configuracao(data: ConfiguracaoCreate):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO reinf_configuracao (imovel_id, cpf_cnpj, caepf, tipo_contribuinte, regime_tributario, tem_empregados)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        RETURNING id
    """, (data.imovel_id, data.cpf_cnpj, data.caepf, data.tipo_contribuinte,
          data.regime_tributario, data.tem_empregados))
    row = cur.fetchone()
    db.commit()
    db.close()
    return {"id": row["id"] if row else None, "ok": True}

@router.post("/configuracao-avancada")
def salvar_configuracao_avancada(data: ConfiguracaoAvancadaCreate):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO reinf_configuracao_avancada
            (imovel_id, ambiente, versao_schema, cnpj_transmissor, nome_transmissor,
             aderiu_reforma, data_adesao_reforma, aliquota_cbs_padrao, aliquota_ibs_padrao)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (imovel_id) DO UPDATE SET
            ambiente             = EXCLUDED.ambiente,
            versao_schema        = EXCLUDED.versao_schema,
            cnpj_transmissor     = EXCLUDED.cnpj_transmissor,
            nome_transmissor     = EXCLUDED.nome_transmissor,
            aderiu_reforma       = EXCLUDED.aderiu_reforma,
            data_adesao_reforma  = EXCLUDED.data_adesao_reforma,
            aliquota_cbs_padrao  = EXCLUDED.aliquota_cbs_padrao,
            aliquota_ibs_padrao  = EXCLUDED.aliquota_ibs_padrao,
            atualizado_em        = NOW()
        RETURNING id
    """, (data.imovel_id, data.ambiente, data.versao_schema,
          data.cnpj_transmissor, data.nome_transmissor,
          data.aderiu_reforma, data.data_adesao_reforma,
          data.aliquota_cbs_padrao, data.aliquota_ibs_padrao))
    row = cur.fetchone()
    db.commit()
    db.close()
    return {"id": row["id"] if row else None, "ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# R-2055: Comercialização da Produção Rural
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/r2055/{imovel_id}")
def listar_r2055(imovel_id: int, competencia: Optional[str] = None):
    db = get_db()
    cur = db.cursor()
    if competencia:
        cur.execute("""
            SELECT * FROM reinf_r2055
            WHERE imovel_id = %s AND competencia = %s
            ORDER BY data_nota DESC
        """, (imovel_id, competencia))
    else:
        cur.execute("""
            SELECT * FROM reinf_r2055
            WHERE imovel_id = %s
            ORDER BY competencia DESC, data_nota DESC
        """, (imovel_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/r2055")
def criar_r2055(data: R2055Create):
    valor_funrural = round(data.valor_bruto * data.aliquota_funrural, 2)
    valor_senar    = round(data.valor_bruto * data.aliquota_senar, 2)
    valor_total    = round(valor_funrural + valor_senar, 2)
    valor_cbs      = round(data.valor_bruto * data.aliquota_cbs, 2) if data.regime_fiscal != "atual" else 0.0
    valor_ibs      = round(data.valor_bruto * data.aliquota_ibs, 2) if data.regime_fiscal != "atual" else 0.0

    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO reinf_r2055 (
            imovel_id, competencia, cnpj_adquirente, nome_adquirente,
            data_nota, numero_nota, tipo_produto, valor_bruto,
            aliquota_funrural, aliquota_senar,
            valor_funrural, valor_senar, valor_total_retido,
            retencao_pelo_adquirente, observacoes,
            acerto_id, origem, cpf_cnpj_produtor, caepf,
            regime_fiscal, aliquota_cbs, valor_cbs, aliquota_ibs, valor_ibs
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        data.imovel_id, data.competencia, data.cnpj_adquirente, data.nome_adquirente,
        data.data_nota, data.numero_nota, data.tipo_produto, data.valor_bruto,
        data.aliquota_funrural, data.aliquota_senar,
        valor_funrural, valor_senar, valor_total,
        data.retencao_pelo_adquirente, data.observacoes,
        data.acerto_id, data.origem, data.cpf_cnpj_produtor, data.caepf,
        data.regime_fiscal, data.aliquota_cbs, valor_cbs, data.aliquota_ibs, valor_ibs
    ))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    _recalcular_apuracao(data.imovel_id, data.competencia)
    return {
        "id": new_id,
        "valor_funrural": valor_funrural,
        "valor_senar": valor_senar,
        "valor_total_retido": valor_total,
        "valor_cbs": valor_cbs,
        "valor_ibs": valor_ibs,
    }

@router.delete("/r2055/{id}")
def excluir_r2055(id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT imovel_id, competencia, status FROM reinf_r2055 WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    if row["status"] == "transmitido":
        db.close()
        raise HTTPException(status_code=400, detail="Evento já transmitido. Use retificação.")
    cur.execute("DELETE FROM reinf_r2055 WHERE id = %s", (id,))
    db.commit()
    db.close()
    _recalcular_apuracao(row["imovel_id"], row["competencia"])
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# INTEGRAÇÃO: Gerar R-2055 automaticamente a partir de um Acerto de Contrato
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/r2055/from-acerto/{acerto_id}")
def gerar_r2055_from_acerto(acerto_id: int):
    """
    Gera automaticamente um evento R-2055 a partir de um acerto de contrato
    de arrendamento pago em produto (soja, milho, etc.).
    O arrendatário é o adquirente que reteve o FUNRURAL.
    """
    db = get_db()
    cur = db.cursor()

    # Buscar acerto
    cur.execute("""
        SELECT a.*, i.nome AS imovel_nome
        FROM contratos_acertos a
        LEFT JOIN imoveis i ON i.id = a.imovel_id
        WHERE a.id = %s
    """, (acerto_id,))
    acerto = cur.fetchone()
    if not acerto:
        db.close()
        raise HTTPException(status_code=404, detail="Acerto não encontrado")

    # Verificar se já existe R-2055 para este acerto
    cur.execute("SELECT id FROM reinf_r2055 WHERE acerto_id = %s", (acerto_id,))
    existente = cur.fetchone()
    if existente:
        db.close()
        raise HTTPException(status_code=409, detail=f"R-2055 já gerado para este acerto (id={existente['id']})")

    # Mapear produto do acerto para tipo_produto do R-2055
    PRODUTO_MAP = {
        "soja": "graos", "milho": "graos", "cafe": "outros",
        "arroz": "graos", "trigo": "graos", "algodao": "outros", "outro": "outros"
    }
    tipo_produto = PRODUTO_MAP.get(acerto["produto"], "outros")

    # Determinar competência pela data de pagamento ou safra
    if acerto["data_pagamento"]:
        dp = str(acerto["data_pagamento"])
        competencia = dp[:7]  # 'YYYY-MM'
    else:
        # Inferir pelo ano da safra (ex: "25/26" → 2025)
        safra = acerto["safra"]
        ano_base = 2000 + int(safra.split("/")[0]) if "/" in safra else datetime.now().year
        competencia = f"{ano_base}-03"  # março é o mês típico de acerto de soja

    # Calcular alíquotas
    valor_bruto = float(acerto["valor_bruto"])
    aliq_funrural = ALIQUOTA_FUNRURAL_PF
    aliq_senar    = ALIQUOTA_SENAR
    valor_funrural = round(valor_bruto * aliq_funrural, 2)
    valor_senar    = round(valor_bruto * aliq_senar, 2)
    valor_total    = round(valor_funrural + valor_senar, 2)

    # CNPJ do adquirente: usar CPF/CNPJ do arrendatário se disponível
    cnpj_adquirente = acerto["arrendatario_cpf_cnpj"] or "00.000.000/0001-00"

    cur.execute("""
        INSERT INTO reinf_r2055 (
            imovel_id, competencia, cnpj_adquirente, nome_adquirente,
            data_nota, numero_nota, tipo_produto, valor_bruto,
            aliquota_funrural, aliquota_senar,
            valor_funrural, valor_senar, valor_total_retido,
            retencao_pelo_adquirente, observacoes,
            acerto_id, origem
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        acerto["imovel_id"], competencia,
        cnpj_adquirente, acerto["arrendatario_nome"],
        acerto["data_pagamento"] or date.today(),
        acerto["numero_nota_fiscal"],
        tipo_produto, valor_bruto,
        aliq_funrural, aliq_senar,
        valor_funrural, valor_senar, valor_total,
        True,  # retencao_pelo_adquirente = arrendatário reteve
        f"Gerado automaticamente do Acerto de Contrato #{acerto_id} — Safra {acerto['safra']}",
        acerto_id, "acerto_contrato"
    ))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    _recalcular_apuracao(acerto["imovel_id"], competencia)

    return {
        "id": new_id,
        "competencia": competencia,
        "valor_bruto": valor_bruto,
        "valor_funrural": valor_funrural,
        "valor_senar": valor_senar,
        "valor_total_retido": valor_total,
        "origem": "acerto_contrato",
        "acerto_id": acerto_id,
        "mensagem": f"R-2055 gerado automaticamente para a safra {acerto['safra']}. Verifique o CNPJ do adquirente.",
    }

# ─────────────────────────────────────────────────────────────────────────────
# R-2010: Retenção de INSS em serviços tomados
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/r2010/{imovel_id}")
def listar_r2010(imovel_id: int, competencia: Optional[str] = None):
    db = get_db()
    cur = db.cursor()
    if competencia:
        cur.execute("""
            SELECT * FROM reinf_r2010
            WHERE imovel_id = %s AND competencia = %s
            ORDER BY data_nota DESC
        """, (imovel_id, competencia))
    else:
        cur.execute("""
            SELECT * FROM reinf_r2010
            WHERE imovel_id = %s
            ORDER BY competencia DESC, data_nota DESC
        """, (imovel_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/r2010")
def criar_r2010(data: R2010Create):
    valor_retido = round(data.valor_bruto * data.aliquota_retencao, 2)
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO reinf_r2010 (
            imovel_id, competencia, cnpj_prestador, nome_prestador,
            data_nota, numero_nota, tipo_servico, valor_bruto,
            aliquota_retencao, valor_retido, cessao_mao_obra, observacoes,
            cpf_cnpj_produtor, caepf
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        data.imovel_id, data.competencia, data.cnpj_prestador, data.nome_prestador,
        data.data_nota, data.numero_nota, data.tipo_servico, data.valor_bruto,
        data.aliquota_retencao, valor_retido, data.cessao_mao_obra, data.observacoes,
        data.cpf_cnpj_produtor, data.caepf
    ))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    _recalcular_apuracao(data.imovel_id, data.competencia)
    return {"id": new_id, "valor_retido": valor_retido}

@router.delete("/r2010/{id}")
def excluir_r2010(id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT imovel_id, competencia, status FROM reinf_r2010 WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    if row["status"] == "transmitido":
        db.close()
        raise HTTPException(status_code=400, detail="Evento já transmitido. Use retificação.")
    cur.execute("DELETE FROM reinf_r2010 WHERE id = %s", (id,))
    db.commit()
    db.close()
    _recalcular_apuracao(row["imovel_id"], row["competencia"])
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# APURAÇÃO MENSAL
# ─────────────────────────────────────────────────────────────────────────────

def _recalcular_apuracao(imovel_id: int, competencia: str):
    """Recalcula a apuração mensal após qualquer alteração nos eventos."""
    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT
            COALESCE(SUM(valor_bruto), 0)          AS receita_bruta,
            COALESCE(SUM(valor_funrural), 0)        AS total_funrural,
            COALESCE(SUM(valor_senar), 0)           AS total_senar,
            COALESCE(SUM(valor_total_retido), 0)    AS total_retido_r2055,
            COALESCE(SUM(valor_cbs), 0)             AS total_cbs,
            COALESCE(SUM(valor_ibs), 0)             AS total_ibs
        FROM reinf_r2055
        WHERE imovel_id = %s AND competencia = %s
    """, (imovel_id, competencia))
    r2055 = cur.fetchone()

    cur.execute("""
        SELECT COALESCE(SUM(valor_retido), 0) AS total_inss_servicos
        FROM reinf_r2010
        WHERE imovel_id = %s AND competencia = %s
    """, (imovel_id, competencia))
    r2010 = cur.fetchone()

    total_a_recolher = float(r2055["total_funrural"]) + float(r2055["total_senar"]) + float(r2010["total_inss_servicos"])

    # Vencimento: dia 20 do mês seguinte (se cair em fim de semana, próximo dia útil)
    ano, mes = map(int, competencia.split("-"))
    if mes == 12:
        venc = date(ano + 1, 1, 20)
    else:
        venc = date(ano, mes + 1, 20)

    cur.execute("""
        INSERT INTO reinf_apuracao (
            imovel_id, competencia,
            total_receita_bruta, total_funrural, total_senar,
            total_inss_servicos, total_a_recolher, data_vencimento,
            total_cbs, total_ibs
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (imovel_id, competencia) DO UPDATE SET
            total_receita_bruta = EXCLUDED.total_receita_bruta,
            total_funrural      = EXCLUDED.total_funrural,
            total_senar         = EXCLUDED.total_senar,
            total_inss_servicos = EXCLUDED.total_inss_servicos,
            total_a_recolher    = EXCLUDED.total_a_recolher,
            data_vencimento     = EXCLUDED.data_vencimento,
            total_cbs           = EXCLUDED.total_cbs,
            total_ibs           = EXCLUDED.total_ibs,
            atualizado_em       = NOW()
    """, (
        imovel_id, competencia,
        float(r2055["receita_bruta"]), float(r2055["total_funrural"]),
        float(r2055["total_senar"]), float(r2010["total_inss_servicos"]),
        total_a_recolher, venc,
        float(r2055["total_cbs"]), float(r2055["total_ibs"])
    ))
    db.commit()
    db.close()

@router.get("/apuracao/{imovel_id}")
def listar_apuracao(imovel_id: int, ano: Optional[int] = None):
    db = get_db()
    cur = db.cursor()
    if ano:
        cur.execute("""
            SELECT * FROM reinf_apuracao
            WHERE imovel_id = %s AND competencia LIKE %s
            ORDER BY competencia DESC
        """, (imovel_id, f"{ano}-%"))
    else:
        cur.execute("""
            SELECT * FROM reinf_apuracao
            WHERE imovel_id = %s
            ORDER BY competencia DESC
        """, (imovel_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.patch("/apuracao/{id}/pago")
def marcar_pago(id: int, data_pagamento: date, valor_pago: float):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        UPDATE reinf_apuracao
        SET status_darf = 'pago', data_pagamento = %s, valor_pago = %s, atualizado_em = NOW()
        WHERE id = %s
        RETURNING id
    """, (data_pagamento, valor_pago, id))
    row = cur.fetchone()
    db.commit()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="Apuração não encontrada")
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/{imovel_id}")
def dashboard(imovel_id: int):
    db = get_db()
    cur = db.cursor()

    ano = datetime.now().year
    cur.execute("""
        SELECT
            COALESCE(SUM(total_receita_bruta), 0)  AS receita_bruta_ano,
            COALESCE(SUM(total_funrural), 0)        AS funrural_ano,
            COALESCE(SUM(total_senar), 0)           AS senar_ano,
            COALESCE(SUM(total_inss_servicos), 0)   AS inss_servicos_ano,
            COALESCE(SUM(total_a_recolher), 0)      AS total_recolher_ano,
            COALESCE(SUM(total_cbs), 0)             AS cbs_ano,
            COALESCE(SUM(total_ibs), 0)             AS ibs_ano,
            COUNT(*) FILTER (WHERE status_darf = 'em_aberto') AS em_aberto,
            COUNT(*) FILTER (WHERE status_darf = 'pago')      AS pagos
        FROM reinf_apuracao
        WHERE imovel_id = %s AND competencia LIKE %s
    """, (imovel_id, f"{ano}-%"))
    kpis = dict(cur.fetchone())

    cur.execute("""
        SELECT competencia, total_a_recolher, data_vencimento, status_darf, id
        FROM reinf_apuracao
        WHERE imovel_id = %s AND status_darf = 'em_aberto'
        ORDER BY data_vencimento ASC
        LIMIT 6
    """, (imovel_id,))
    pendentes = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT competencia, tipo_produto, valor_bruto, valor_total_retido,
               data_nota, origem, acerto_id
        FROM reinf_r2055
        WHERE imovel_id = %s
        ORDER BY data_nota DESC LIMIT 8
    """, (imovel_id,))
    ultimas_vendas = [dict(r) for r in cur.fetchall()]

    # Acertos pendentes de integração (sem R-2055 gerado)
    cur.execute("""
        SELECT ca.id, ca.safra, ca.arrendatario_nome,
               ca.valor_bruto, ca.data_pagamento, ca.produto
        FROM contratos_acertos ca
        WHERE ca.imovel_id = %s
          AND ca.status IN ('registrado', 'conferido')
          AND NOT EXISTS (
              SELECT 1 FROM reinf_r2055 r
              WHERE r.acerto_id = ca.id
          )
        ORDER BY ca.criado_em DESC
        LIMIT 5
    """, (imovel_id,))
    acertos_pendentes = [dict(r) for r in cur.fetchall()]

    db.close()
    return {
        "kpis": kpis,
        "pendentes": pendentes,
        "ultimas_vendas": ultimas_vendas,
        "acertos_sem_r2055": acertos_pendentes,
        "aliquotas_vigentes": {
            "funrural_pf": ALIQUOTA_FUNRURAL_PF,
            "funrural_pj": ALIQUOTA_FUNRURAL_PJ,
            "senar": ALIQUOTA_SENAR,
            "inss_servicos": ALIQUOTA_INSS_SERVICO,
            "base_legal": "IN RFB 2.237/2024",
            "reforma_tributaria": {
                "cbs_estimada": ALIQUOTA_CBS_ESTIMADA,
                "ibs_estimada": ALIQUOTA_IBS_ESTIMADA,
                "vigencia": "01/01/2027",
                "base_legal": "LC 214/2024",
                "status": "estimativa — regulamentação pendente"
            }
        }
    }

# ─────────────────────────────────────────────────────────────────────────────
# GERAÇÃO DE XML (schema EFD-Reinf v2.01.01)
# ─────────────────────────────────────────────────────────────────────────────

def _gerar_xml_r2055(eventos: list, configuracao: dict, competencia: str) -> str:
    """
    Gera XML do lote R-2055 conforme schema EFD-Reinf v2.01.01.
    NT 2024/001 — Ato Declaratório Executivo COFIS nº 28/2021.
    """
    ns = "http://www.esocial.gov.br/schema/reinf/evtComProd/v2_01_01"
    root = ET.Element("Reinf", xmlns=ns)
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")

    for ev in eventos:
        evt = ET.SubElement(root, "evtComProd")
        evt.set("id", f"ID{ev.get('id', 0):015d}")

        ideEvento = ET.SubElement(evt, "ideEvento")
        ET.SubElement(ideEvento, "indRetif").text = "1"  # 1=original, 2=retificação
        ET.SubElement(ideEvento, "nrRec").text = ev.get("protocolo_transmissao") or ""
        ET.SubElement(ideEvento, "perApur").text = competencia

        ideContrib = ET.SubElement(evt, "ideContrib")
        ET.SubElement(ideContrib, "tpInsc").text = "1"  # 1=CPF
        ET.SubElement(ideContrib, "nrInsc").text = (
            configuracao.get("cpf_cnpj", "").replace(".", "").replace("-", "").replace("/", "")
        )

        infoComProd = ET.SubElement(evt, "infoComProd")
        ideAdquirente = ET.SubElement(infoComProd, "ideAdquirente")
        ET.SubElement(ideAdquirente, "cnpjAdquirente").text = (
            str(ev.get("cnpj_adquirente", "")).replace(".", "").replace("/", "").replace("-", "")
        )
        if ev.get("nome_adquirente"):
            ET.SubElement(ideAdquirente, "nmAdquirente").text = str(ev["nome_adquirente"])

        detComProd = ET.SubElement(infoComProd, "detComProd")
        ET.SubElement(detComProd, "dtOper").text = str(ev.get("data_nota", ""))
        ET.SubElement(detComProd, "vlrBruto").text = f"{float(ev.get('valor_bruto', 0)):.2f}"
        ET.SubElement(detComProd, "vlrCPSeg").text = f"{float(ev.get('valor_funrural', 0)):.2f}"
        ET.SubElement(detComProd, "vlrSenar").text = f"{float(ev.get('valor_senar', 0)):.2f}"

    xml_str = ET.tostring(root, encoding="unicode", xml_declaration=False)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{xml_str}'

@router.get("/xml/{imovel_id}/{competencia}")
def gerar_xml_lote(imovel_id: int, competencia: str, tipo: str = Query("r2055")):
    """
    Gera o XML do lote EFD-Reinf para a competência informada.
    Salva o lote na tabela reinf_xml_lotes e retorna o XML para download.
    """
    db = get_db()
    cur = db.cursor()

    # Buscar configuração
    cur.execute("SELECT * FROM reinf_configuracao WHERE imovel_id = %s ORDER BY id DESC LIMIT 1", (imovel_id,))
    config = cur.fetchone()
    if not config:
        db.close()
        raise HTTPException(status_code=400, detail="Configure o contribuinte antes de gerar o XML.")

    if tipo == "r2055":
        cur.execute("""
            SELECT * FROM reinf_r2055
            WHERE imovel_id = %s AND competencia = %s
            ORDER BY data_nota ASC
        """, (imovel_id, competencia))
        eventos = [dict(r) for r in cur.fetchall()]
        if not eventos:
            db.close()
            raise HTTPException(status_code=404, detail=f"Nenhum evento R-2055 para {competencia}.")

        xml_content = _gerar_xml_r2055(eventos, dict(config), competencia)
        tipo_evento = "R-2055"
        valor_total = sum(float(e.get("valor_bruto", 0)) for e in eventos)
    else:
        db.close()
        raise HTTPException(status_code=400, detail="Tipo de evento não suportado. Use 'r2055'.")

    # Hash para integridade
    hash_sha = hashlib.sha256(xml_content.encode()).hexdigest()

    # Salvar lote
    cur.execute("""
        INSERT INTO reinf_xml_lotes
            (imovel_id, competencia, tipo_evento, xml_conteudo, hash_sha256, qtd_eventos, valor_total)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (imovel_id, competencia, tipo_evento, xml_content, hash_sha, len(eventos), valor_total))
    lote_id = cur.fetchone()["id"]
    db.commit()
    db.close()

    # Retornar XML como download
    filename = f"reinf_{tipo_evento.replace('-', '')}_{competencia}_{imovel_id}.xml"
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/xml-lotes/{imovel_id}")
def listar_xml_lotes(imovel_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT id, competencia, tipo_evento, hash_sha256, qtd_eventos,
               valor_total, status, protocolo, data_geracao, data_transmissao
        FROM reinf_xml_lotes
        WHERE imovel_id = %s
        ORDER BY data_geracao DESC
    """, (imovel_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

# ─────────────────────────────────────────────────────────────────────────────
# DARF (integração SICALC)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/darf/{apuracao_id}")
def gerar_darf_info(apuracao_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM reinf_apuracao WHERE id = %s", (apuracao_id,))
    ap = cur.fetchone()
    db.close()
    if not ap:
        raise HTTPException(status_code=404, detail="Apuração não encontrada")

    return {
        "instrucoes": "Acesse sicalc.receita.fazenda.gov.br > Preenchimento Rápido e informe os dados abaixo",
        "codigo_receita": ap["codigo_receita_darf"],
        "descricao_codigo": _descricao_codigo(ap["codigo_receita_darf"]),
        "periodo_apuracao": ap["competencia"],
        "data_vencimento": str(ap["data_vencimento"]) if ap["data_vencimento"] else None,
        "valor_principal": float(ap["total_a_recolher"]),
        "cpf_cnpj_contribuinte": "(preencher com CPF/CNPJ do produtor)",
        "link_sicalc": (
            f"https://sicalc.receita.fazenda.gov.br/sicalc/rapido/contribuinte"
            f"?codigo={ap['codigo_receita_darf']}"
            f"&periodo_apuracao={ap['competencia']}"
        ),
        "observacao": (
            "O DARF numerado (com código de barras) só pode ser emitido pelo próprio "
            "contribuinte no SICALC ou via API Integra-Sicalc do SERPRO com certificado digital. "
            "O RuralCaixa fornece todos os dados calculados para facilitar o preenchimento."
        ),
        "reforma_tributaria": {
            "aviso": "A partir de 01/01/2027 (LC 214/2024), o FUNRURAL será substituído gradualmente pela CBS/IBS.",
            "cbs_estimada": f"{ALIQUOTA_CBS_ESTIMADA*100:.2f}%",
            "ibs_estimada": f"{ALIQUOTA_IBS_ESTIMADA*100:.2f}%",
            "status": "Estimativa — aguardar regulamentação do Comitê Gestor do IBS."
        },
        "apuracao": dict(ap)
    }

# ─────────────────────────────────────────────────────────────────────────────
# ALÍQUOTAS E INFORMAÇÕES LEGAIS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/aliquotas")
def get_aliquotas():
    """Retorna as alíquotas vigentes e informações sobre a Reforma Tributária."""
    return {
        "vigentes": {
            "funrural_pf": {
                "aliquota": ALIQUOTA_FUNRURAL_PF,
                "percentual": f"{ALIQUOTA_FUNRURAL_PF*100:.2f}%",
                "base_legal": "IN RFB 2.237/2024 | Lei 8.212/1991 art. 25",
                "contribuinte": "Produtor Rural Pessoa Física",
                "base_calculo": "Receita bruta da comercialização da produção rural",
            },
            "funrural_pj": {
                "aliquota": ALIQUOTA_FUNRURAL_PJ,
                "percentual": f"{ALIQUOTA_FUNRURAL_PJ*100:.2f}%",
                "base_legal": "IN RFB 2.237/2024 | Lei 8.212/1991 art. 25",
                "contribuinte": "Produtor Rural Pessoa Jurídica",
            },
            "senar": {
                "aliquota": ALIQUOTA_SENAR,
                "percentual": f"{ALIQUOTA_SENAR*100:.2f}%",
                "base_legal": "Lei 8.315/1991 | Decreto 566/1992",
                "destino": "Serviço Nacional de Aprendizagem Rural",
            },
            "inss_servicos": {
                "aliquota": ALIQUOTA_INSS_SERVICO,
                "percentual": f"{ALIQUOTA_INSS_SERVICO*100:.2f}%",
                "base_legal": "Lei 9.711/1998 | IN RFB 971/2009",
                "aplicacao": "Cessão de mão de obra (colheita, tratorista, etc.)",
            },
        },
        "reforma_tributaria_lc214_2024": {
            "vigencia": "01/01/2027 (período de transição 2027-2033)",
            "cbs": {
                "aliquota_estimada": ALIQUOTA_CBS_ESTIMADA,
                "percentual": f"{ALIQUOTA_CBS_ESTIMADA*100:.2f}%",
                "descricao": "Contribuição sobre Bens e Serviços — substitui PIS/COFINS",
                "status": "Estimativa — regulamentação pendente",
            },
            "ibs": {
                "aliquota_estimada": ALIQUOTA_IBS_ESTIMADA,
                "percentual": f"{ALIQUOTA_IBS_ESTIMADA*100:.2f}%",
                "descricao": "Imposto sobre Bens e Serviços — substitui ICMS/ISS",
                "status": "Estimativa — regulamentação pendente pelo Comitê Gestor",
            },
            "funrural_pos_reforma": {
                "status": "Em discussão — pode ser mantido, reduzido ou extinto",
                "recomendacao": "Aguardar regulamentação específica para o setor rural",
            },
        },
        "prazos": {
            "entrega_efdreinf": "Até o dia 15 do mês seguinte à competência",
            "pagamento_darf": "Até o dia 20 do mês seguinte à competência",
            "multa_atraso_entrega": "R$ 200,00/mês (pessoa física) — art. 44 Lei 9.430/1996",
            "multa_atraso_pagamento": "0,33%/dia + SELIC + 20% (art. 61 Lei 9.430/1996)",
        },
    }

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _descricao_codigo(codigo: str) -> str:
    codigos = {
        "2985": "FUNRURAL — Contribuição Previdenciária do Produtor Rural PF (1,87% + 0,11% SENAR)",
        "2991": "FUNRURAL — Contribuição Previdenciária do Produtor Rural PJ (2,00% + 0,11% SENAR)",
        "2089": "INSS — Retenção sobre Serviços Tomados (cessão de mão de obra — 11%)",
        "1381": "IRRF — Retenção na Fonte sobre Rendimentos do Trabalho Assalariado",
    }
    return codigos.get(codigo, f"Código {codigo}")
