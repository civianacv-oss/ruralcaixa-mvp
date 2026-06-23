"""
RuralCaixa — Router EFD-Reinf
Eventos: R-2055 (comercialização produção rural), R-2010 (serviços tomados)
Apuração mensal FUNRURAL e geração de DARF via SICALC
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
import os, psycopg2, psycopg2.extras
from datetime import date, datetime
import calendar

router = APIRouter(prefix="/efdreinf", tags=["EFD-Reinf"])

DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

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

class R2055Create(BaseModel):
    imovel_id: int
    competencia: str          # 'YYYY-MM'
    cnpj_adquirente: str
    nome_adquirente: Optional[str] = None
    data_nota: date
    numero_nota: Optional[str] = None
    tipo_produto: Literal[
        "bovino", "suino", "ovino", "caprino", "aves",
        "leite", "graos", "frutas", "acai", "outros"
    ] = "bovino"
    valor_bruto: float
    aliquota_funrural: float = 0.0187   # 1,87% — IN RFB 2.237/2024
    aliquota_senar: float = 0.0011      # 0,11%
    retencao_pelo_adquirente: bool = True
    observacoes: Optional[str] = None

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
    aliquota_retencao: float = 0.11
    cessao_mao_obra: bool = True
    observacoes: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURAÇÃO (R-1000)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/configuracao/{imovel_id}")
def get_configuracao(imovel_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM reinf_configuracao WHERE imovel_id = %s ORDER BY id DESC LIMIT 1", (imovel_id,))
    row = cur.fetchone()
    db.close()
    return row or {}

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
    rows = cur.fetchall()
    db.close()
    return rows

@router.post("/r2055")
def criar_r2055(data: R2055Create):
    valor_funrural = round(data.valor_bruto * data.aliquota_funrural, 2)
    valor_senar    = round(data.valor_bruto * data.aliquota_senar, 2)
    valor_total    = round(valor_funrural + valor_senar, 2)

    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO reinf_r2055 (
            imovel_id, competencia, cnpj_adquirente, nome_adquirente,
            data_nota, numero_nota, tipo_produto, valor_bruto,
            aliquota_funrural, aliquota_senar,
            valor_funrural, valor_senar, valor_total_retido,
            retencao_pelo_adquirente, observacoes
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        data.imovel_id, data.competencia, data.cnpj_adquirente, data.nome_adquirente,
        data.data_nota, data.numero_nota, data.tipo_produto, data.valor_bruto,
        data.aliquota_funrural, data.aliquota_senar,
        valor_funrural, valor_senar, valor_total,
        data.retencao_pelo_adquirente, data.observacoes
    ))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()

    # Recalcular apuração do mês
    _recalcular_apuracao(data.imovel_id, data.competencia)

    return {"id": new_id, "valor_funrural": valor_funrural, "valor_senar": valor_senar, "valor_total_retido": valor_total}

@router.delete("/r2055/{id}")
def excluir_r2055(id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT imovel_id, competencia FROM reinf_r2055 WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    cur.execute("DELETE FROM reinf_r2055 WHERE id = %s", (id,))
    db.commit()
    db.close()
    _recalcular_apuracao(row["imovel_id"], row["competencia"])
    return {"ok": True}

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
    rows = cur.fetchall()
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
            aliquota_retencao, valor_retido, cessao_mao_obra, observacoes
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        data.imovel_id, data.competencia, data.cnpj_prestador, data.nome_prestador,
        data.data_nota, data.numero_nota, data.tipo_servico, data.valor_bruto,
        data.aliquota_retencao, valor_retido, data.cessao_mao_obra, data.observacoes
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
    cur.execute("SELECT imovel_id, competencia FROM reinf_r2010 WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Registro não encontrado")
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

    # Totais R-2055
    cur.execute("""
        SELECT
            COALESCE(SUM(valor_bruto), 0)          AS receita_bruta,
            COALESCE(SUM(valor_funrural), 0)        AS total_funrural,
            COALESCE(SUM(valor_senar), 0)           AS total_senar,
            COALESCE(SUM(valor_total_retido), 0)    AS total_retido_r2055
        FROM reinf_r2055
        WHERE imovel_id = %s AND competencia = %s
    """, (imovel_id, competencia))
    r2055 = cur.fetchone()

    # Totais R-2010
    cur.execute("""
        SELECT COALESCE(SUM(valor_retido), 0) AS total_inss_servicos
        FROM reinf_r2010
        WHERE imovel_id = %s AND competencia = %s
    """, (imovel_id, competencia))
    r2010 = cur.fetchone()

    total_a_recolher = float(r2055["total_funrural"]) + float(r2055["total_senar"]) + float(r2010["total_inss_servicos"])

    # Calcular vencimento: dia 20 do mês seguinte
    ano, mes = map(int, competencia.split("-"))
    if mes == 12:
        venc = date(ano + 1, 1, 20)
    else:
        venc = date(ano, mes + 1, 20)

    cur.execute("""
        INSERT INTO reinf_apuracao (
            imovel_id, competencia,
            total_receita_bruta, total_funrural, total_senar,
            total_inss_servicos, total_a_recolher, data_vencimento
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (imovel_id, competencia) DO UPDATE SET
            total_receita_bruta = EXCLUDED.total_receita_bruta,
            total_funrural      = EXCLUDED.total_funrural,
            total_senar         = EXCLUDED.total_senar,
            total_inss_servicos = EXCLUDED.total_inss_servicos,
            total_a_recolher    = EXCLUDED.total_a_recolher,
            data_vencimento     = EXCLUDED.data_vencimento,
            atualizado_em       = NOW()
    """, (
        imovel_id, competencia,
        float(r2055["receita_bruta"]), float(r2055["total_funrural"]),
        float(r2055["total_senar"]), float(r2010["total_inss_servicos"]),
        total_a_recolher, venc
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
    rows = cur.fetchall()
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

    # KPIs do ano corrente
    ano = datetime.now().year
    cur.execute("""
        SELECT
            COALESCE(SUM(total_receita_bruta), 0)  AS receita_bruta_ano,
            COALESCE(SUM(total_funrural), 0)        AS funrural_ano,
            COALESCE(SUM(total_senar), 0)           AS senar_ano,
            COALESCE(SUM(total_inss_servicos), 0)   AS inss_servicos_ano,
            COALESCE(SUM(total_a_recolher), 0)      AS total_recolher_ano,
            COUNT(*) FILTER (WHERE status_darf = 'em_aberto') AS em_aberto,
            COUNT(*) FILTER (WHERE status_darf = 'pago')      AS pagos
        FROM reinf_apuracao
        WHERE imovel_id = %s AND competencia LIKE %s
    """, (imovel_id, f"{ano}-%"))
    kpis = cur.fetchone()

    # Competências em aberto (vencidas ou a vencer)
    cur.execute("""
        SELECT competencia, total_a_recolher, data_vencimento, status_darf
        FROM reinf_apuracao
        WHERE imovel_id = %s AND status_darf = 'em_aberto'
        ORDER BY data_vencimento ASC
        LIMIT 6
    """, (imovel_id,))
    pendentes = cur.fetchall()

    # Últimas vendas (R-2055)
    cur.execute("""
        SELECT competencia, tipo_produto, valor_bruto, valor_total_retido, data_nota
        FROM reinf_r2055
        WHERE imovel_id = %s
        ORDER BY data_nota DESC LIMIT 5
    """, (imovel_id,))
    ultimas_vendas = cur.fetchall()

    db.close()
    return {
        "kpis": kpis,
        "pendentes": pendentes,
        "ultimas_vendas": ultimas_vendas
    }

# ─────────────────────────────────────────────────────────────────────────────
# GERAÇÃO DE DARF (integração SICALC)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/darf/{apuracao_id}")
def gerar_darf_info(apuracao_id: int):
    """
    Retorna os dados necessários para preencher o DARF no SICALC da Receita Federal.
    A emissão do DARF numerado é feita pelo SICALC (sicalc.receita.fazenda.gov.br)
    ou via API Integra-Sicalc do SERPRO (requer certificado digital A1/A3).
    """
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM reinf_apuracao WHERE id = %s", (apuracao_id,))
    ap = cur.fetchone()
    db.close()
    if not ap:
        raise HTTPException(status_code=404, detail="Apuração não encontrada")

    # Dados para preenchimento manual no SICALC
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
        "apuracao": dict(ap)
    }

def _descricao_codigo(codigo: str) -> str:
    codigos = {
        "2985": "FUNRURAL — Contribuição Previdenciária do Produtor Rural PF (1,87% + 0,11% SENAR)",
        "2991": "FUNRURAL — Contribuição Previdenciária do Produtor Rural PJ",
        "2089": "INSS — Retenção sobre Serviços Tomados (cessão de mão de obra)",
    }
    return codigos.get(codigo, f"Código {codigo}")
