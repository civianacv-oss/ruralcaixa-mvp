"""
RuralCaixa — Router DIRPF Atividade Rural (v2 — Lucro Real Completo)
Apuração anual para declaração do IRPF — Ficha Atividade Rural.
Base legal:
  - RIR/2018 arts. 58-71 — atividade rural PF
  - Lei 9.250/1995 art. 18 — Livro Caixa, despesas dedutíveis
  - Lei 9.250/1995 art. 14 — investimentos rurais (dedução integral no ano)
  - IN SRF 162/1998 — tabela de vida útil e depreciação de bens
  - IN RFB 2.178/2024 — DIRPF 2025 (ano-base 2024)
  - Lei 9.430/1996 art. 44 — multas e juros
Alíquotas IRPF 2024 (tabela progressiva anual):
  0%:    até R$ 27.110,40/ano
  7,5%:  R$ 27.110,41 a R$ 33.919,80
  15%:   R$ 33.919,81 a R$ 45.012,60
  22,5%: R$ 45.012,61 a R$ 55.976,16
  27,5%: acima de R$ 55.976,16
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal, List
import os, psycopg2, psycopg2.extras, json
from datetime import date, datetime

router = APIRouter(prefix="/dirpf", tags=["DIRPF"])
DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

# ── Tabela progressiva IRPF 2024 (anual) ──────────────────────────────────────
FAIXAS_IRPF_2024 = [
    (27110.40,  0.000,  0.00),
    (33919.80,  0.075,  2033.28),
    (45012.60,  0.150,  4621.54),
    (55976.16,  0.225,  7991.45),
    (float("inf"), 0.275, 10788.88),
]

# ── Tabela de vida útil (IN SRF 162/1998) ─────────────────────────────────────
VIDA_UTIL_BENS = {
    "trator":               {"anos": 5,  "taxa": 20.0, "label": "Trator"},
    "colheitadeira":        {"anos": 5,  "taxa": 20.0, "label": "Colheitadeira"},
    "implemento_agricola":  {"anos": 5,  "taxa": 20.0, "label": "Implemento Agrícola"},
    "caminhao":             {"anos": 5,  "taxa": 20.0, "label": "Caminhão"},
    "veiculo_leve":         {"anos": 5,  "taxa": 20.0, "label": "Veículo Leve"},
    "silo_armazem":         {"anos": 25, "taxa":  4.0, "label": "Silo / Armazém"},
    "edificacao_rural":     {"anos": 25, "taxa":  4.0, "label": "Edificação Rural"},
    "cerca":                {"anos": 10, "taxa": 10.0, "label": "Cerca"},
    "sistema_irrigacao":    {"anos": 10, "taxa": 10.0, "label": "Sistema de Irrigação"},
    "computador":           {"anos": 5,  "taxa": 20.0, "label": "Computador / Equipamento"},
    "outros":               {"anos": 10, "taxa": 10.0, "label": "Outros Bens"},
}

# ── Categorias de despesas (art. 18 Lei 9.250/1995) ───────────────────────────
CATEGORIAS_DESPESA = {
    "insumos":              "Insumos (sementes, fertilizantes, defensivos)",
    "combustivel":          "Combustível e Lubrificantes",
    "manutencao":           "Manutenção de Máquinas e Benfeitorias",
    "mao_de_obra":          "Mão de Obra (salários, encargos)",
    "arrendamento_pago":    "Arrendamento Pago",
    "funrural_pago":        "FUNRURAL / SENAR Pago",
    "energia":              "Energia Elétrica e Água",
    "transporte":           "Frete e Transporte",
    "seguro":               "Seguro Rural e de Máquinas",
    "assistencia_tecnica":  "Assistência Técnica e Consultoria",
    "investimento_rural":   "Investimentos Rurais (art. 14 Lei 9.250 — dedução integral)",
    "outros":               "Outras Despesas Dedutíveis",
}


def calcular_irpf(base: float) -> dict:
    if base <= 0:
        return {"aliquota_efetiva": 0, "imposto_bruto": 0, "deducao_simplificada": 0}
    for limite, aliq, deducao in FAIXAS_IRPF_2024:
        if base <= limite:
            imposto = base * aliq - deducao
            return {
                "aliquota_efetiva": round(aliq * 100, 2),
                "imposto_bruto": round(max(0, imposto), 2),
                "deducao_simplificada": round(deducao, 2),
            }
    return {"aliquota_efetiva": 27.5, "imposto_bruto": round(base * 0.275 - 10788.88, 2), "deducao_simplificada": 10788.88}


def calcular_depreciacao_bem(bem: dict, ano_base: int) -> dict:
    """Calcula depreciação anual e acumulada de um bem."""
    ano_aquisicao = bem["data_aquisicao"].year if hasattr(bem["data_aquisicao"], "year") else int(str(bem["data_aquisicao"])[:4])
    anos_decorridos = ano_base - ano_aquisicao + 1
    taxa = float(bem["taxa_depreciacao_pct"]) / 100
    valor_aq = float(bem["valor_aquisicao"])
    valor_res = float(bem["valor_residual"])
    base_dep = valor_aq - valor_res

    dep_anual = round(min(base_dep * taxa, base_dep), 2)
    dep_acumulada = round(min(base_dep * taxa * anos_decorridos, base_dep), 2)
    valor_contabil = round(max(valor_res, valor_aq - dep_acumulada), 2)
    pct_depreciado = round(min(100, taxa * anos_decorridos * 100), 2)

    return {
        "dep_anual": dep_anual,
        "dep_acumulada": dep_acumulada,
        "valor_contabil": valor_contabil,
        "pct_depreciado": pct_depreciado,
        "totalmente_depreciado": pct_depreciado >= 100,
    }


# ── MODELOS ───────────────────────────────────────────────────────────────────

class DirpfConfig(BaseModel):
    imovel_id: int
    ano_base: int
    regime: Literal["presumido_20pct", "resultado_real"] = "presumido_20pct"
    dependentes: int = 0
    deducao_inss: float = 0.0
    deducao_previdencia_privada: float = 0.0
    deducao_educacao: float = 0.0
    deducao_saude: float = 0.0
    deducao_pensao_alimenticia: float = 0.0
    irrf_retido_fonte: float = 0.0
    irrf_carne_leao: float = 0.0
    usa_depreciacao: bool = True
    usa_investimentos_rurais: bool = True
    compensar_prejuizo: bool = True
    observacoes: Optional[str] = None

class DespesaRural(BaseModel):
    imovel_id: int
    ano_base: int
    categoria: str
    descricao: str
    valor: float
    data_despesa: Optional[date] = None
    comprovante: Optional[str] = None
    observacoes: Optional[str] = None
    dedutivel_irpf: bool = True
    lancamento_id: Optional[int] = None

class BemDepreciacao(BaseModel):
    imovel_id: int
    descricao: str
    tipo_bem: str
    data_aquisicao: date
    valor_aquisicao: float
    valor_residual: float = 0.0
    vida_util_anos: Optional[int] = None   # se None, usa tabela IN SRF 162/1998
    taxa_depreciacao_pct: Optional[float] = None

class BemBaixa(BaseModel):
    data_baixa: date
    valor_baixa: float = 0.0
    motivo_baixa: str = "alienacao"

class PrejuizoCompensacao(BaseModel):
    imovel_id: int
    ano_base: int
    valor_prejuizo: float
    observacoes: Optional[str] = None


# ── APURAÇÃO PRINCIPAL ────────────────────────────────────────────────────────

@router.get("/apuracao/{imovel_id}/{ano_base}")
def apuracao_dirpf(imovel_id: int, ano_base: int, regime: str = "presumido_20pct"):
    db = get_db()
    cur = db.cursor()

    # 1. Receita do Livro Caixa
    cur.execute("""
        SELECT tipo, SUM(valor) AS total
        FROM livro_caixa_lancamentos
        WHERE imovel_id = %s AND ano_base = %s AND deducao_irpf = true
        GROUP BY tipo
    """, (imovel_id, ano_base))
    livro = {r["tipo"]: float(r["total"]) for r in cur.fetchall()}
    receita_bruta = livro.get("receita", 0)

    # 2. Despesas detalhadas por categoria
    cur.execute("""
        SELECT categoria, SUM(valor) AS total
        FROM dirpf_despesas_rurais
        WHERE imovel_id = %s AND ano_base = %s AND dedutivel_irpf = true
        GROUP BY categoria
    """, (imovel_id, ano_base))
    desp_cat = {r["categoria"]: float(r["total"]) for r in cur.fetchall()}
    total_despesas_categorias = sum(desp_cat.values())

    # 3. Depreciação de bens ativos
    cur.execute("""
        SELECT * FROM dirpf_bens_depreciacao
        WHERE imovel_id = %s AND ativo = TRUE
    """, (imovel_id,))
    bens = cur.fetchall()
    depreciacao_anual = 0.0
    for bem in bens:
        dep = calcular_depreciacao_bem(dict(bem), ano_base)
        depreciacao_anual += dep["dep_anual"]
    depreciacao_anual = round(depreciacao_anual, 2)

    # 4. Prejuízo acumulado disponível para compensação
    cur.execute("""
        SELECT SUM(saldo_compensar) AS saldo_total
        FROM dirpf_prejuizo_rural
        WHERE imovel_id = %s AND saldo_compensar > 0
    """, (imovel_id,))
    prej_row = cur.fetchone()
    prejuizo_acumulado = float(prej_row["saldo_total"] or 0)

    # 5. Acertos de contrato (cross-check)
    cur.execute("""
        SELECT SUM(valor_bruto) AS bruto, SUM(funrural_retido) AS funrural, SUM(senar_retido) AS senar
        FROM contratos_acertos
        WHERE imovel_id = %s AND EXTRACT(YEAR FROM COALESCE(data_pagamento, criado_em)) = %s
    """, (imovel_id, ano_base))
    acertos = cur.fetchone()

    # 6. Configuração salva
    cur.execute("SELECT * FROM dirpf_config WHERE imovel_id = %s AND ano_base = %s", (imovel_id, ano_base))
    config = cur.fetchone()
    db.close()

    # ── Calcular base tributável ──────────────────────────────────────────────
    if regime == "resultado_real":
        # Resultado Real = Receita − Despesas − Depreciação − Investimentos
        total_deducoes_rurais = total_despesas_categorias
        if config and config.get("usa_depreciacao", True):
            total_deducoes_rurais += depreciacao_anual
        resultado_antes_prejuizo = receita_bruta - total_deducoes_rurais

        # Compensação de prejuízo (sem limite de prazo — diferente do IRPJ)
        prejuizo_compensado = 0.0
        if config and config.get("compensar_prejuizo", True) and resultado_antes_prejuizo > 0:
            prejuizo_compensado = min(prejuizo_acumulado, resultado_antes_prejuizo)

        base_tributavel = max(0, resultado_antes_prejuizo - prejuizo_compensado)

        # Se resultado negativo → gera novo prejuízo
        novo_prejuizo = max(0, -resultado_antes_prejuizo)
    else:
        total_deducoes_rurais = 0
        resultado_antes_prejuizo = receita_bruta * 0.20
        prejuizo_compensado = 0.0
        novo_prejuizo = 0.0
        base_tributavel = receita_bruta * 0.20

    # ── Deduções pessoais ─────────────────────────────────────────────────────
    ded_dependentes = (config["dependentes"] if config else 0) * 2275.08
    ded_inss        = float(config["deducao_inss"]) if config else 0
    ded_prev_priv   = float(config["deducao_previdencia_privada"]) if config else 0
    ded_educacao    = min(float(config["deducao_educacao"]) if config else 0, 3561.50)
    ded_saude       = float(config["deducao_saude"]) if config else 0
    ded_pensao      = float(config["deducao_pensao_alimenticia"]) if config else 0
    total_ded_pessoais = ded_dependentes + ded_inss + ded_prev_priv + ded_educacao + ded_saude + ded_pensao

    base_calculo = max(0, base_tributavel - total_ded_pessoais)
    irpf = calcular_irpf(base_calculo)

    irrf_retido = (float(config["irrf_retido_fonte"]) if config else 0) + \
                  (float(config.get("irrf_carne_leao", 0)) if config else 0)
    imposto_a_pagar     = max(0, irpf["imposto_bruto"] - irrf_retido)
    imposto_a_restituir = max(0, irrf_retido - irpf["imposto_bruto"])

    # ── Comparativo de regimes ────────────────────────────────────────────────
    base_presumida = receita_bruta * 0.20
    base_real      = max(0, receita_bruta - total_despesas_categorias - depreciacao_anual - prejuizo_compensado)
    irpf_presumido = calcular_irpf(max(0, base_presumida - total_ded_pessoais))
    irpf_real      = calcular_irpf(max(0, base_real - total_ded_pessoais))
    economia_regime_real = max(0, irpf_presumido["imposto_bruto"] - irpf_real["imposto_bruto"])

    return {
        "ano_base": ano_base,
        "regime": regime,
        # Receitas
        "receita_bruta": receita_bruta,
        "receita_acertos": float(acertos["bruto"] or 0),
        # Despesas por categoria (Resultado Real)
        "despesas_por_categoria": {
            cat: desp_cat.get(cat, 0) for cat in CATEGORIAS_DESPESA
        },
        "total_despesas_categorias": total_despesas_categorias,
        "depreciacao_anual": depreciacao_anual,
        "total_deducoes_rurais": total_deducoes_rurais,
        # Resultado
        "resultado_antes_prejuizo": resultado_antes_prejuizo,
        "prejuizo_acumulado_disponivel": prejuizo_acumulado,
        "prejuizo_compensado_este_ano": prejuizo_compensado,
        "novo_prejuizo_gerado": novo_prejuizo,
        # Base tributável
        "base_tributavel": base_tributavel,
        "base_presumida_20pct": base_presumida,
        # Deduções pessoais
        "total_deducoes_pessoais": total_ded_pessoais,
        "deducoes": {
            "dependentes": ded_dependentes,
            "inss": ded_inss,
            "previdencia_privada": ded_prev_priv,
            "educacao": ded_educacao,
            "saude": ded_saude,
            "pensao_alimenticia": ded_pensao,
        },
        # IRPF
        "base_calculo_irpf": base_calculo,
        "aliquota_efetiva_pct": irpf["aliquota_efetiva"],
        "imposto_bruto": irpf["imposto_bruto"],
        "irrf_retido_total": irrf_retido,
        "imposto_a_pagar": imposto_a_pagar,
        "imposto_a_restituir": imposto_a_restituir,
        # Cross-check acertos
        "acertos_funrural_retido": float(acertos["funrural"] or 0),
        "acertos_senar_retido": float(acertos["senar"] or 0),
        # Comparativo de regimes
        "comparativo": {
            "presumido_base": base_presumida,
            "presumido_irpf": irpf_presumido["imposto_bruto"],
            "real_base": base_real,
            "real_irpf": irpf_real["imposto_bruto"],
            "economia_regime_real": economia_regime_real,
            "recomendacao": "resultado_real" if base_real < base_presumida else "presumido_20pct",
            "recomendacao_texto": (
                f"Resultado Real é mais vantajoso — economia de R$ {economia_regime_real:,.2f} no IRPF"
                if base_real < base_presumida
                else "Presumido 20% é mais vantajoso neste ano"
            ),
        }
    }


# ── CONFIG ────────────────────────────────────────────────────────────────────

@router.post("/config")
def salvar_config(data: DirpfConfig):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO dirpf_config (
            imovel_id, ano_base, regime, dependentes,
            deducao_inss, deducao_previdencia_privada,
            deducao_educacao, deducao_saude, deducao_pensao_alimenticia,
            irrf_retido_fonte, irrf_carne_leao,
            usa_depreciacao, usa_investimentos_rurais, compensar_prejuizo,
            observacoes
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (imovel_id, ano_base) DO UPDATE SET
            regime = EXCLUDED.regime,
            dependentes = EXCLUDED.dependentes,
            deducao_inss = EXCLUDED.deducao_inss,
            deducao_previdencia_privada = EXCLUDED.deducao_previdencia_privada,
            deducao_educacao = EXCLUDED.deducao_educacao,
            deducao_saude = EXCLUDED.deducao_saude,
            deducao_pensao_alimenticia = EXCLUDED.deducao_pensao_alimenticia,
            irrf_retido_fonte = EXCLUDED.irrf_retido_fonte,
            irrf_carne_leao = EXCLUDED.irrf_carne_leao,
            usa_depreciacao = EXCLUDED.usa_depreciacao,
            usa_investimentos_rurais = EXCLUDED.usa_investimentos_rurais,
            compensar_prejuizo = EXCLUDED.compensar_prejuizo,
            observacoes = EXCLUDED.observacoes,
            atualizado_em = NOW()
        RETURNING id
    """, (data.imovel_id, data.ano_base, data.regime, data.dependentes,
          data.deducao_inss, data.deducao_previdencia_privada,
          data.deducao_educacao, data.deducao_saude, data.deducao_pensao_alimenticia,
          data.irrf_retido_fonte, data.irrf_carne_leao,
          data.usa_depreciacao, data.usa_investimentos_rurais, data.compensar_prejuizo,
          data.observacoes))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id}


@router.get("/config/{imovel_id}/{ano_base}")
def get_config(imovel_id: int, ano_base: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM dirpf_config WHERE imovel_id = %s AND ano_base = %s", (imovel_id, ano_base))
    row = cur.fetchone()
    db.close()
    return dict(row) if row else {}


# ── DESPESAS RURAIS ───────────────────────────────────────────────────────────

@router.get("/despesas/{imovel_id}/{ano_base}")
def listar_despesas(imovel_id: int, ano_base: int, categoria: Optional[str] = None):
    db = get_db()
    cur = db.cursor()
    q = "SELECT * FROM dirpf_despesas_rurais WHERE imovel_id = %s AND ano_base = %s"
    params = [imovel_id, ano_base]
    if categoria:
        q += " AND categoria = %s"; params.append(categoria)
    q += " ORDER BY categoria, data_despesa DESC"
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/despesas")
def criar_despesa(data: DespesaRural):
    if data.categoria not in CATEGORIAS_DESPESA:
        raise HTTPException(status_code=400, detail=f"Categoria inválida. Válidas: {list(CATEGORIAS_DESPESA.keys())}")
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO dirpf_despesas_rurais
            (imovel_id, ano_base, categoria, descricao, valor, data_despesa, comprovante, observacoes, dedutivel_irpf, lancamento_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (data.imovel_id, data.ano_base, data.categoria, data.descricao, data.valor,
          data.data_despesa, data.comprovante, data.observacoes, data.dedutivel_irpf, data.lancamento_id))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id}

@router.delete("/despesas/{id}")
def excluir_despesa(id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM dirpf_despesas_rurais WHERE id = %s", (id,))
    db.commit()
    db.close()
    return {"ok": True}

@router.get("/categorias-despesa")
def listar_categorias():
    return [{"id": k, "label": v} for k, v in CATEGORIAS_DESPESA.items()]


# ── DEPRECIAÇÃO DE BENS ───────────────────────────────────────────────────────

@router.get("/bens/{imovel_id}")
def listar_bens(imovel_id: int, ano_base: int = Query(default=datetime.now().year)):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM dirpf_bens_depreciacao WHERE imovel_id = %s ORDER BY data_aquisicao", (imovel_id,))
    bens = []
    for row in cur.fetchall():
        bem = dict(row)
        dep = calcular_depreciacao_bem(bem, ano_base)
        bem.update(dep)
        bens.append(bem)
    db.close()
    return bens

@router.post("/bens")
def criar_bem(data: BemDepreciacao):
    # Buscar vida útil da tabela se não informado
    tabela = VIDA_UTIL_BENS.get(data.tipo_bem, VIDA_UTIL_BENS["outros"])
    vida_util = data.vida_util_anos or tabela["anos"]
    taxa = data.taxa_depreciacao_pct or tabela["taxa"]

    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO dirpf_bens_depreciacao
            (imovel_id, descricao, tipo_bem, data_aquisicao, valor_aquisicao, vida_util_anos, taxa_depreciacao_pct, valor_residual)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (data.imovel_id, data.descricao, data.tipo_bem, data.data_aquisicao,
          data.valor_aquisicao, vida_util, taxa, data.valor_residual))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id, "vida_util_anos": vida_util, "taxa_depreciacao_pct": taxa}

@router.patch("/bens/{id}/baixa")
def baixar_bem(id: int, data: BemBaixa):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        UPDATE dirpf_bens_depreciacao
        SET ativo = FALSE, data_baixa = %s, valor_baixa = %s, motivo_baixa = %s, atualizado_em = NOW()
        WHERE id = %s
    """, (data.data_baixa, data.valor_baixa, data.motivo_baixa, id))
    db.commit()
    db.close()
    return {"ok": True}

@router.delete("/bens/{id}")
def excluir_bem(id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM dirpf_bens_depreciacao WHERE id = %s", (id,))
    db.commit()
    db.close()
    return {"ok": True}

@router.get("/tabela-depreciacao")
def tabela_depreciacao():
    return [{"tipo": k, **v} for k, v in VIDA_UTIL_BENS.items()]


# ── PREJUÍZO RURAL ────────────────────────────────────────────────────────────

@router.get("/prejuizo/{imovel_id}")
def listar_prejuizos(imovel_id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT * FROM dirpf_prejuizo_rural
        WHERE imovel_id = %s ORDER BY ano_base
    """, (imovel_id,))
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/prejuizo")
def registrar_prejuizo(data: PrejuizoCompensacao):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO dirpf_prejuizo_rural (imovel_id, ano_base, valor_prejuizo, observacoes)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (imovel_id, ano_base) DO UPDATE SET
            valor_prejuizo = EXCLUDED.valor_prejuizo,
            observacoes = EXCLUDED.observacoes,
            atualizado_em = NOW()
        RETURNING id
    """, (data.imovel_id, data.ano_base, data.valor_prejuizo, data.observacoes))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id}

@router.post("/prejuizo/{id}/compensar")
def compensar_prejuizo(id: int, valor: float = Query(...), ano_compensacao: int = Query(...)):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM dirpf_prejuizo_rural WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close(); raise HTTPException(status_code=404, detail="Prejuízo não encontrado")
    if valor > float(row["saldo_compensar"]):
        db.close(); raise HTTPException(status_code=400, detail=f"Valor excede saldo disponível ({row['saldo_compensar']})")

    historico = row["historico_compensacoes"] or []
    if isinstance(historico, str):
        historico = json.loads(historico)
    historico.append({"ano": ano_compensacao, "valor": valor, "data": datetime.now().isoformat()})

    cur.execute("""
        UPDATE dirpf_prejuizo_rural
        SET valor_compensado = valor_compensado + %s,
            historico_compensacoes = %s,
            atualizado_em = NOW()
        WHERE id = %s
    """, (valor, json.dumps(historico), id))
    db.commit()
    db.close()
    return {"ok": True, "valor_compensado": valor}
