"""
Simulador de Regime Tributário — RuralCaixa
Regimes: PF Diferenciado, PF Lucro Real, PJ MEI, PJ Simples (Anexos I-V),
         PJ Lucro Presumido, PJ Lucro Real completo (IRPJ+CSLL+PIS/COFINS+JCP)
Base legal: LC 123/2006, Lei 9.430/1996, Lei 9.718/1998, RIR/2018, LC 214/2024
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os, psycopg2, psycopg2.extras, json
from datetime import date

router = APIRouter(prefix="/simulador-regime", tags=["Simulador de Regime"])
DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    return conn

# ─────────────────────────────────────────────────────────────────────────────
# TABELAS SIMPLES NACIONAL 2024 (LC 123/2006)
# ─────────────────────────────────────────────────────────────────────────────
# Cada faixa: (limite_acumulado, aliq_nominal, parcela_a_deduzir)
SIMPLES_ANEXO_I = [   # Comércio
    (180_000,   0.04,    0),
    (360_000,   0.073,   5_940),
    (720_000,   0.095,   13_860),
    (1_800_000, 0.107,   22_500),
    (3_600_000, 0.143,   87_300),
    (4_800_000, 0.19,    378_000),
]
SIMPLES_ANEXO_II = [  # Indústria
    (180_000,   0.045,   0),
    (360_000,   0.078,   5_940),
    (720_000,   0.10,    13_860),
    (1_800_000, 0.112,   22_500),
    (3_600_000, 0.147,   85_500),
    (4_800_000, 0.30,    720_000),
]
SIMPLES_ANEXO_III = [  # Serviços Fator R ≥ 28%
    (180_000,   0.06,    0),
    (360_000,   0.112,   9_360),
    (720_000,   0.135,   17_640),
    (1_800_000, 0.16,    35_640),
    (3_600_000, 0.21,    125_640),
    (4_800_000, 0.33,    648_000),
]
SIMPLES_ANEXO_IV = [  # Construção / Serviços sem Fator R
    (180_000,   0.045,   0),
    (360_000,   0.09,    8_100),
    (720_000,   0.102,   12_420),
    (1_800_000, 0.14,    39_780),
    (3_600_000, 0.22,    183_780),
    (4_800_000, 0.33,    828_000),
]
SIMPLES_ANEXO_V = [   # Serviços Fator R < 28%
    (180_000,   0.155,   0),
    (360_000,   0.18,    4_500),
    (720_000,   0.195,   9_900),
    (1_800_000, 0.205,   17_100),
    (3_600_000, 0.23,    62_100),
    (4_800_000, 0.305,   540_000),
]

LIMITE_SIMPLES = 4_800_000.0
LIMITE_MEI     = 81_000.0

# ─────────────────────────────────────────────────────────────────────────────
# ALÍQUOTAS LUCRO PRESUMIDO (Lei 9.430/1996 + Lei 9.718/1998)
# ─────────────────────────────────────────────────────────────────────────────
# Base de presunção IRPJ por atividade
PRESUNCAO_IRPJ = {
    "comercio":       0.08,   # 8%
    "industria":      0.08,   # 8%
    "in_natura":      0.08,   # 8% (venda de produção rural)
    "servico":        0.32,   # 32%
    "servico_simples": 0.16,  # 16% (serviços até R$ 120k/ano)
    "misto":          0.08,
    "industrializado": 0.08,
}
# Base de presunção CSLL por atividade
PRESUNCAO_CSLL = {
    "comercio":       0.12,
    "industria":      0.12,
    "in_natura":      0.12,
    "servico":        0.32,
    "servico_simples": 0.32,
    "misto":          0.12,
    "industrializado": 0.12,
}
# PIS/COFINS cumulativo (Lucro Presumido)
PIS_CUMULATIVO   = 0.0065  # 0,65%
COFINS_CUMULATIVO = 0.03   # 3,00%

# ─────────────────────────────────────────────────────────────────────────────
# ALÍQUOTAS LUCRO REAL PJ (Lei 9.430/1996)
# ─────────────────────────────────────────────────────────────────────────────
IRPJ_ALIQ        = 0.15    # 15%
IRPJ_ADICIONAL   = 0.10    # 10% sobre lucro > R$ 240k/ano (R$ 20k/mês)
IRPJ_ADICIONAL_LIMITE = 240_000.0
CSLL_ALIQ        = 0.09    # 9%
PIS_NCUMULATIVO  = 0.0165  # 1,65%
COFINS_NCUMULATIVO = 0.076  # 7,60%

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def aliquota_simples(faturamento_12m: float, tabela: list) -> float:
    """Calcula alíquota efetiva do Simples Nacional."""
    if faturamento_12m <= 0:
        return 0.0
    for limite, aliq_nominal, parcela_deduzir in tabela:
        if faturamento_12m <= limite:
            return max(((faturamento_12m * aliq_nominal) - parcela_deduzir) / faturamento_12m, 0.0)
    return 0.33  # acima do limite — tributação pelo regime geral

def irpf_anual(base: float) -> float:
    """Tabela progressiva IRPF 2024 (Lei 14.848/2024) — valores anuais."""
    if base <= 26_400:    return 0.0
    if base <= 33_919.8:  return (base * 0.075) - 1_980.0
    if base <= 45_012.6:  return (base * 0.15)  - 4_513.48
    if base <= 55_976.16: return (base * 0.225) - 7_939.67
    return (base * 0.275) - 10_738.99

def calcular_lucro_presumido(faturamento_12m: float, tipo_producao: str) -> dict:
    """
    Calcula carga tributária anual no Lucro Presumido.
    Retorna breakdown completo: IRPJ, adicional IRPJ, CSLL, PIS, COFINS.
    """
    pct_irpj = PRESUNCAO_IRPJ.get(tipo_producao, 0.08)
    pct_csll = PRESUNCAO_CSLL.get(tipo_producao, 0.12)

    base_irpj = faturamento_12m * pct_irpj
    base_csll  = faturamento_12m * pct_csll

    irpj       = base_irpj * IRPJ_ALIQ
    adicional  = max(base_irpj - IRPJ_ADICIONAL_LIMITE, 0) * IRPJ_ADICIONAL
    csll       = base_csll * CSLL_ALIQ
    pis        = faturamento_12m * PIS_CUMULATIVO
    cofins     = faturamento_12m * COFINS_CUMULATIVO

    total = irpj + adicional + csll + pis + cofins
    aliq_efetiva = (total / faturamento_12m * 100) if faturamento_12m > 0 else 0

    return {
        "total": round(total, 2),
        "irpj": round(irpj, 2),
        "irpj_adicional": round(adicional, 2),
        "csll": round(csll, 2),
        "pis": round(pis, 2),
        "cofins": round(cofins, 2),
        "base_irpj": round(base_irpj, 2),
        "base_csll": round(base_csll, 2),
        "pct_presuncao_irpj": pct_irpj * 100,
        "pct_presuncao_csll": pct_csll * 100,
        "aliq_efetiva_pct": round(aliq_efetiva, 2),
    }

def calcular_lucro_real_pj(faturamento_12m: float, despesas_12m: float,
                            creditos_pis_cofins: float = 0.0,
                            jcp: float = 0.0) -> dict:
    """
    Calcula carga tributária anual no Lucro Real PJ.
    Inclui PIS/COFINS não-cumulativo, adicional IRPJ e JCP.
    """
    lucro_antes_jcp = max(faturamento_12m - despesas_12m, 0)
    lucro_tributavel = max(lucro_antes_jcp - jcp, 0)  # JCP deduz base IRPJ+CSLL

    irpj      = lucro_tributavel * IRPJ_ALIQ
    adicional = max(lucro_tributavel - IRPJ_ADICIONAL_LIMITE, 0) * IRPJ_ADICIONAL
    csll      = lucro_tributavel * CSLL_ALIQ

    # PIS/COFINS não-cumulativo: incide sobre receita, com crédito sobre insumos
    pis_bruto   = faturamento_12m * PIS_NCUMULATIVO
    cofins_bruto = faturamento_12m * COFINS_NCUMULATIVO
    pis_liquido   = max(pis_bruto - creditos_pis_cofins * PIS_NCUMULATIVO / (PIS_NCUMULATIVO + COFINS_NCUMULATIVO), 0)
    cofins_liquido = max(cofins_bruto - creditos_pis_cofins * COFINS_NCUMULATIVO / (PIS_NCUMULATIVO + COFINS_NCUMULATIVO), 0)

    total = irpj + adicional + csll + pis_liquido + cofins_liquido
    aliq_efetiva = (total / faturamento_12m * 100) if faturamento_12m > 0 else 0

    return {
        "total": round(total, 2),
        "irpj": round(irpj, 2),
        "irpj_adicional": round(adicional, 2),
        "csll": round(csll, 2),
        "pis": round(pis_liquido, 2),
        "cofins": round(cofins_liquido, 2),
        "jcp_deduzido": round(jcp, 2),
        "lucro_tributavel": round(lucro_tributavel, 2),
        "aliq_efetiva_pct": round(aliq_efetiva, 2),
    }

def calcular_tributos(
    faturamento_12m: float,
    folha_12m: float,
    despesas_12m: float,
    tipo_producao: str,
    creditos_pis_cofins: float = 0.0,
    jcp: float = 0.0,
) -> dict:
    """
    Calcula o imposto estimado para TODOS os regimes tributários.
    Retorna dicionário com valores anuais estimados e breakdown detalhado.
    """
    resultado = {}
    alertas = []

    # ── 1. PF — Regime Diferenciado (LC 214/2024) ──────────────────────────
    LIMITE_ISENCAO_PF = 3_600_000.0
    desconto_cbs_ibs = {
        "in_natura": 1.0, "industrializado": 0.6,
        "servico": 0.0, "misto": 0.8, "comercio": 0.3,
        "industria": 0.6,
    }
    desconto = desconto_cbs_ibs.get(tipo_producao, 1.0)
    ALIQ_CBS_IBS_PLENA = 0.265
    if faturamento_12m <= LIMITE_ISENCAO_PF:
        resultado["pf_diferenciado"] = 0.0
    else:
        excedente = faturamento_12m - LIMITE_ISENCAO_PF
        resultado["pf_diferenciado"] = round(excedente * ALIQ_CBS_IBS_PLENA * (1 - desconto), 2)

    # ── 2. PF — Lucro Real (IRPF) ──────────────────────────────────────────
    lucro_pf = max(faturamento_12m - despesas_12m, 0)
    resultado["pf_lucro_real"] = round(irpf_anual(lucro_pf), 2)

    # ── 3. MEI ──────────────────────────────────────────────────────────────
    if faturamento_12m <= LIMITE_MEI:
        # DAS fixo: INSS R$ 70,60 + ISS R$ 5 + ICMS R$ 1 = ~R$ 76,60/mês (2024)
        resultado["pj_mei"] = round(76.60 * 12, 2)
    else:
        resultado["pj_mei"] = None  # fora do limite MEI

    # ── 4. PJ — Simples Nacional Anexo I (Comércio) ─────────────────────────
    resultado["pj_simples_i"] = round(faturamento_12m * aliquota_simples(faturamento_12m, SIMPLES_ANEXO_I), 2)

    # ── 5. PJ — Simples Nacional Anexo II (Indústria) ───────────────────────
    resultado["pj_simples_ii"] = round(faturamento_12m * aliquota_simples(faturamento_12m, SIMPLES_ANEXO_II), 2)

    # ── 6. PJ — Simples Nacional Anexo III/V (Serviços — Fator R) ───────────
    fator_r = (folha_12m / faturamento_12m * 100) if faturamento_12m > 0 else 0
    resultado["pj_simples_iii"] = round(faturamento_12m * aliquota_simples(faturamento_12m, SIMPLES_ANEXO_III), 2)
    resultado["pj_simples_iv"]  = round(faturamento_12m * aliquota_simples(faturamento_12m, SIMPLES_ANEXO_IV), 2)
    resultado["pj_simples_v"]   = round(faturamento_12m * aliquota_simples(faturamento_12m, SIMPLES_ANEXO_V), 2)

    # ── 7. PJ — Lucro Presumido ─────────────────────────────────────────────
    lp = calcular_lucro_presumido(faturamento_12m, tipo_producao)
    resultado["pj_lucro_presumido"] = lp["total"]
    resultado["_detalhe_lucro_presumido"] = lp

    # ── 8. PJ — Lucro Real PJ completo ──────────────────────────────────────
    lr = calcular_lucro_real_pj(faturamento_12m, despesas_12m, creditos_pis_cofins, jcp)
    resultado["pj_lucro_real"] = lr["total"]
    resultado["_detalhe_lucro_real_pj"] = lr

    # ── Fator R ─────────────────────────────────────────────────────────────
    resultado["fator_r_pct"] = round(fator_r, 2)

    # ── Recomendação ────────────────────────────────────────────────────────
    opcoes_base = {
        "PF — Regime Diferenciado": resultado["pf_diferenciado"],
        "PF — Lucro Real":          resultado["pf_lucro_real"],
        "PJ — Simples Anexo I":     resultado["pj_simples_i"],
        "PJ — Simples Anexo II":    resultado["pj_simples_ii"],
        "PJ — Simples Anexo III":   resultado["pj_simples_iii"],
        "PJ — Simples Anexo IV":    resultado["pj_simples_iv"],
        "PJ — Simples Anexo V":     resultado["pj_simples_v"],
        "PJ — Lucro Presumido":     resultado["pj_lucro_presumido"],
        "PJ — Lucro Real":          resultado["pj_lucro_real"],
    }
    if resultado["pj_mei"] is not None:
        opcoes_base["PJ — MEI"] = resultado["pj_mei"]

    # Filtra apenas regimes aplicáveis (Simples só até R$ 4,8M)
    opcoes = {k: v for k, v in opcoes_base.items()
              if v is not None and not (k.startswith("PJ — Simples") and faturamento_12m > LIMITE_SIMPLES)}

    melhor = min(opcoes, key=lambda k: opcoes[k])
    pior   = max(opcoes, key=lambda k: opcoes[k])
    resultado["regime_recomendado"] = melhor
    resultado["economia_anual"]     = round(opcoes[pior] - opcoes[melhor], 2)
    resultado["ranking_regimes"]    = sorted(
        [{"regime": k, "carga_anual": v} for k, v in opcoes.items()],
        key=lambda x: x["carga_anual"]
    )

    # ── Alertas dinâmicos ───────────────────────────────────────────────────
    if faturamento_12m > LIMITE_ISENCAO_PF:
        alertas.append({"nivel": "amarelo", "mensagem":
            f"Faturamento R$ {faturamento_12m:,.0f} ultrapassou R$ 3,6M. PF perdeu a isenção CBS/IBS. Compare com PJ."})
    elif faturamento_12m > LIMITE_ISENCAO_PF * 0.9:
        alertas.append({"nivel": "amarelo", "mensagem":
            f"Faturamento em {faturamento_12m/LIMITE_ISENCAO_PF*100:.1f}% do limite de isenção PF (R$ 3,6M). Monitore."})

    if faturamento_12m > LIMITE_SIMPLES:
        alertas.append({"nivel": "vermelho", "mensagem":
            "Faturamento acima de R$ 4,8M. Empresa excluída do Simples Nacional. Opções: Lucro Presumido ou Lucro Real."})

    if tipo_producao in ("servico",) and fator_r < 28:
        alertas.append({"nivel": "vermelho", "mensagem":
            f"Fator R em {fator_r:.1f}% (< 28%). Alíquota Simples vai para Anexo V. Considere aumentar pró-labore."})
    elif tipo_producao in ("servico",) and fator_r < 30:
        alertas.append({"nivel": "laranja", "mensagem":
            f"Fator R em {fator_r:.1f}% — próximo do limite de 28%. Se cair, alíquota sobe para Anexo V."})

    margem = (max(faturamento_12m - despesas_12m, 0) / faturamento_12m * 100) if faturamento_12m > 0 else 0
    if margem < 10 and faturamento_12m > 0:
        alertas.append({"nivel": "amarelo", "mensagem":
            f"Margem líquida estimada em {margem:.1f}%. Lucro Real PJ pode ser mais vantajoso que Lucro Presumido."})
    elif margem > 30:
        alertas.append({"nivel": "azul", "mensagem":
            f"Margem líquida em {margem:.1f}%. Lucro Presumido tende a ser mais vantajoso que Lucro Real nessa faixa."})

    if lp["irpj_adicional"] > 0:
        alertas.append({"nivel": "laranja", "mensagem":
            f"Adicional de IRPJ de 10% incide: R$ {lp['irpj_adicional']:,.0f}/ano (base presumida > R$ 240k). Considere distribuição de lucros."})

    diff_top2 = sorted(opcoes.values())[1] - sorted(opcoes.values())[0]
    if sorted(opcoes.values())[0] > 0 and diff_top2 / sorted(opcoes.values())[0] < 0.05:
        alertas.append({"nivel": "azul", "mensagem":
            "Empate técnico entre os dois melhores regimes (< 5%). Avalie: sucessão, acesso a crédito, obrigações acessórias."})

    resultado["alertas"] = alertas
    return resultado


# ─────────────────────────────────────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────────────────────────────────────
class PerfilCreate(BaseModel):
    imovel_id: int
    nome: Optional[str] = None
    tipo_pessoa: str = "PF"
    tipo_atividade: str = "in_natura"
    regime_atual: str = "pf_diferenciado"
    anexo_simples: Optional[str] = "II"

class LancamentoCreate(BaseModel):
    imovel_id: int
    competencia: str  # "YYYY-MM"
    faturamento: float = 0
    despesas_operacionais: float = 0
    folha_pagamento: float = 0
    prolabore: float = 0
    creditos_pis_cofins: float = 0
    jcp: float = 0
    tipo_producao: str = "in_natura"
    observacoes: Optional[str] = None

class SimulacaoAvulsa(BaseModel):
    faturamento_12m: float
    folha_12m: float = 0
    despesas_12m: float = 0
    creditos_pis_cofins: float = 0
    jcp: float = 0
    tipo_producao: str = "in_natura"


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/simulacao")
def simulacao_avulsa(dados: SimulacaoAvulsa):
    """Simulação rápida sem salvar no banco — retorna todos os regimes."""
    return calcular_tributos(
        dados.faturamento_12m, dados.folha_12m, dados.despesas_12m,
        dados.tipo_producao, dados.creditos_pis_cofins, dados.jcp
    )


@router.post("/simulacao/lucro-presumido")
def simulacao_lucro_presumido(dados: SimulacaoAvulsa):
    """Simulação detalhada Lucro Presumido — breakdown por tributo."""
    lp = calcular_lucro_presumido(dados.faturamento_12m, dados.tipo_producao)
    # Trimestral
    lp["irpj_trimestral"]     = round(lp["irpj"] / 4, 2)
    lp["adicional_trimestral"] = round(lp["irpj_adicional"] / 4, 2)
    lp["csll_trimestral"]     = round(lp["csll"] / 4, 2)
    lp["pis_mensal"]          = round(lp["pis"] / 12, 2)
    lp["cofins_mensal"]       = round(lp["cofins"] / 12, 2)
    lp["faturamento_12m"]     = dados.faturamento_12m
    return lp


@router.post("/simulacao/lucro-real-pj")
def simulacao_lucro_real_pj(dados: SimulacaoAvulsa):
    """Simulação detalhada Lucro Real PJ — breakdown por tributo com PIS/COFINS não-cumulativo."""
    lr = calcular_lucro_real_pj(
        dados.faturamento_12m, dados.despesas_12m,
        dados.creditos_pis_cofins, dados.jcp
    )
    lr["irpj_trimestral"]     = round(lr["irpj"] / 4, 2)
    lr["adicional_trimestral"] = round(lr["irpj_adicional"] / 4, 2)
    lr["csll_trimestral"]     = round(lr["csll"] / 4, 2)
    lr["pis_mensal"]          = round(lr["pis"] / 12, 2)
    lr["cofins_mensal"]       = round(lr["cofins"] / 12, 2)
    lr["faturamento_12m"]     = dados.faturamento_12m
    lr["despesas_12m"]        = dados.despesas_12m
    lr["margem_pct"]          = round((lr["lucro_tributavel"] / dados.faturamento_12m * 100) if dados.faturamento_12m > 0 else 0, 2)
    return lr


@router.get("/tabelas-simples")
def tabelas_simples():
    """Retorna todas as tabelas do Simples Nacional 2024."""
    def fmt_tabela(tabela, nome):
        return {"nome": nome, "faixas": [
            {"limite": lim, "aliq_nominal_pct": round(aliq * 100, 2), "parcela_deduzir": ded}
            for lim, aliq, ded in tabela
        ]}
    return {
        "anexo_i":   fmt_tabela(SIMPLES_ANEXO_I,   "Anexo I — Comércio"),
        "anexo_ii":  fmt_tabela(SIMPLES_ANEXO_II,  "Anexo II — Indústria"),
        "anexo_iii": fmt_tabela(SIMPLES_ANEXO_III, "Anexo III — Serviços (Fator R ≥ 28%)"),
        "anexo_iv":  fmt_tabela(SIMPLES_ANEXO_IV,  "Anexo IV — Construção / Serviços sem Fator R"),
        "anexo_v":   fmt_tabela(SIMPLES_ANEXO_V,   "Anexo V — Serviços (Fator R < 28%)"),
        "limite_simples": LIMITE_SIMPLES,
        "limite_mei": LIMITE_MEI,
    }


@router.get("/aliquotas-referencia")
def aliquotas_referencia():
    """Retorna alíquotas de referência de todos os regimes."""
    return {
        "lucro_presumido": {
            "irpj": f"{IRPJ_ALIQ*100:.0f}%",
            "irpj_adicional": f"{IRPJ_ADICIONAL*100:.0f}% sobre lucro presumido > R$ 240k/ano",
            "csll": f"{CSLL_ALIQ*100:.0f}%",
            "pis": f"{PIS_CUMULATIVO*100:.2f}% (cumulativo)",
            "cofins": f"{COFINS_CUMULATIVO*100:.0f}% (cumulativo)",
            "presuncao_irpj": PRESUNCAO_IRPJ,
            "presuncao_csll": PRESUNCAO_CSLL,
        },
        "lucro_real_pj": {
            "irpj": f"{IRPJ_ALIQ*100:.0f}%",
            "irpj_adicional": f"{IRPJ_ADICIONAL*100:.0f}% sobre lucro > R$ 240k/ano",
            "csll": f"{CSLL_ALIQ*100:.0f}%",
            "pis": f"{PIS_NCUMULATIVO*100:.2f}% (não-cumulativo)",
            "cofins": f"{COFINS_NCUMULATIVO*100:.1f}% (não-cumulativo)",
            "nota": "Créditos de PIS/COFINS sobre insumos deduzem o débito",
        },
        "mei": {
            "das_mensal": "R$ 76,60/mês (INSS + ISS + ICMS — 2024)",
            "limite_anual": f"R$ {LIMITE_MEI:,.0f}",
        },
        "base_legal": {
            "simples": "LC 123/2006 — Tabelas 2024",
            "lucro_presumido": "Lei 9.430/1996 + Lei 9.718/1998",
            "lucro_real": "Lei 9.430/1996 + Lei 10.637/2002 + Lei 10.833/2003",
            "mei": "LC 128/2008 + Resolução CGSN 140/2018",
        }
    }


@router.post("/perfil")
def criar_ou_atualizar_perfil(perfil: PerfilCreate):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO sim_perfil (imovel_id, nome, tipo_pessoa, tipo_atividade, regime_atual, anexo_simples)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (imovel_id) DO UPDATE SET
                  nome=EXCLUDED.nome, tipo_pessoa=EXCLUDED.tipo_pessoa,
                  tipo_atividade=EXCLUDED.tipo_atividade, regime_atual=EXCLUDED.regime_atual,
                  anexo_simples=EXCLUDED.anexo_simples, atualizado_em=NOW()
                RETURNING *
            """, (perfil.imovel_id, perfil.nome, perfil.tipo_pessoa,
                  perfil.tipo_atividade, perfil.regime_atual, perfil.anexo_simples))
            row = cur.fetchone()
            conn.commit()
            return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/perfil/{imovel_id}")
def obter_perfil(imovel_id: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM sim_perfil WHERE imovel_id=%s", (imovel_id,))
            row = cur.fetchone()
            return dict(row) if row else {}
    finally:
        conn.close()


@router.post("/lancamento")
def registrar_lancamento(lanc: LancamentoCreate):
    competencia_date = date(int(lanc.competencia[:4]), int(lanc.competencia[5:7]), 1)
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO sim_lancamentos
                  (imovel_id, competencia, faturamento, despesas_operacionais,
                   folha_pagamento, prolabore, tipo_producao, observacoes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (imovel_id, competencia) DO UPDATE SET
                  faturamento=EXCLUDED.faturamento,
                  despesas_operacionais=EXCLUDED.despesas_operacionais,
                  folha_pagamento=EXCLUDED.folha_pagamento,
                  prolabore=EXCLUDED.prolabore,
                  tipo_producao=EXCLUDED.tipo_producao,
                  observacoes=EXCLUDED.observacoes
                RETURNING *
            """, (lanc.imovel_id, competencia_date, lanc.faturamento,
                  lanc.despesas_operacionais, lanc.folha_pagamento,
                  lanc.prolabore, lanc.tipo_producao, lanc.observacoes))
            row = cur.fetchone()

            cur.execute("""
                SELECT
                  COALESCE(SUM(faturamento),0)           AS fat_12m,
                  COALESCE(SUM(folha_pagamento),0)       AS folha_12m,
                  COALESCE(SUM(despesas_operacionais),0) AS desp_12m,
                  MAX(tipo_producao)                     AS tipo
                FROM sim_lancamentos
                WHERE imovel_id=%s
                  AND competencia > %s - INTERVAL '12 months'
                  AND competencia <= %s
            """, (lanc.imovel_id, competencia_date, competencia_date))
            agg = cur.fetchone()

            tributos = calcular_tributos(
                float(agg["fat_12m"]), float(agg["folha_12m"]),
                float(agg["desp_12m"]), agg["tipo"] or lanc.tipo_producao,
                lanc.creditos_pis_cofins, lanc.jcp,
            )

            cur.execute("""
                INSERT INTO sim_resultados
                  (imovel_id, competencia, faturamento_12m, folha_12m, despesas_12m,
                   fator_r_pct, pf_diferenciado, pf_lucro_real,
                   pj_simples_ii, pj_simples_iii, pj_simples_v, pj_lucro_real,
                   regime_recomendado, economia_anual, alertas)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (imovel_id, competencia) DO UPDATE SET
                  faturamento_12m=EXCLUDED.faturamento_12m,
                  folha_12m=EXCLUDED.folha_12m,
                  despesas_12m=EXCLUDED.despesas_12m,
                  fator_r_pct=EXCLUDED.fator_r_pct,
                  pf_diferenciado=EXCLUDED.pf_diferenciado,
                  pf_lucro_real=EXCLUDED.pf_lucro_real,
                  pj_simples_ii=EXCLUDED.pj_simples_ii,
                  pj_simples_iii=EXCLUDED.pj_simples_iii,
                  pj_simples_v=EXCLUDED.pj_simples_v,
                  pj_lucro_real=EXCLUDED.pj_lucro_real,
                  regime_recomendado=EXCLUDED.regime_recomendado,
                  economia_anual=EXCLUDED.economia_anual,
                  alertas=EXCLUDED.alertas,
                  calculado_em=NOW()
            """, (
                lanc.imovel_id, competencia_date,
                float(agg["fat_12m"]), float(agg["folha_12m"]), float(agg["desp_12m"]),
                tributos["fator_r_pct"],
                tributos["pf_diferenciado"], tributos["pf_lucro_real"],
                tributos["pj_simples_ii"], tributos["pj_simples_iii"],
                tributos["pj_simples_v"], tributos["pj_lucro_real"],
                tributos["regime_recomendado"], tributos["economia_anual"],
                json.dumps(tributos["alertas"], ensure_ascii=False),
            ))
            conn.commit()
            return {**dict(row), "calculo": tributos}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/lancamentos/{imovel_id}")
def listar_lancamentos(imovel_id: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT l.*, r.pf_diferenciado, r.pf_lucro_real, r.pj_simples_ii,
                       r.pj_simples_iii, r.pj_simples_v, r.pj_lucro_real,
                       r.regime_recomendado, r.economia_anual, r.fator_r_pct,
                       r.faturamento_12m, r.alertas
                FROM sim_lancamentos l
                LEFT JOIN sim_resultados r ON r.imovel_id=l.imovel_id AND r.competencia=l.competencia
                WHERE l.imovel_id=%s
                ORDER BY l.competencia DESC
            """, (imovel_id,))
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/dashboard/{imovel_id}")
def dashboard(imovel_id: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM sim_resultados WHERE imovel_id=%s
                ORDER BY competencia DESC LIMIT 1
            """, (imovel_id,))
            ultimo = cur.fetchone()

            cur.execute("""
                SELECT competencia, alertas FROM sim_resultados
                WHERE imovel_id=%s AND alertas != '[]'::jsonb AND alertas IS NOT NULL
                ORDER BY competencia DESC LIMIT 12
            """, (imovel_id,))
            alertas_rows = cur.fetchall()

            cur.execute("""
                SELECT competencia, faturamento_12m, pf_diferenciado, pj_simples_ii,
                       regime_recomendado, economia_anual, fator_r_pct
                FROM sim_resultados WHERE imovel_id=%s
                ORDER BY competencia DESC LIMIT 12
            """, (imovel_id,))
            historico = [dict(r) for r in cur.fetchall()]

            return {
                "ultimo_calculo": dict(ultimo) if ultimo else None,
                "alertas_ativos": [dict(r) for r in alertas_rows],
                "historico": historico,
            }
    finally:
        conn.close()


@router.delete("/lancamento/{imovel_id}/{competencia}")
def deletar_lancamento(imovel_id: int, competencia: str):
    competencia_date = date(int(competencia[:4]), int(competencia[5:7]), 1)
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sim_lancamentos WHERE imovel_id=%s AND competencia=%s",
                        (imovel_id, competencia_date))
            cur.execute("DELETE FROM sim_resultados WHERE imovel_id=%s AND competencia=%s",
                        (imovel_id, competencia_date))
            conn.commit()
            return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()
