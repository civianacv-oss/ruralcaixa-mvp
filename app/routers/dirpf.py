"""
RuralCaixa — Router DIRPF Atividade Rural
Apuração anual para declaração do IRPF — Ficha Atividade Rural.
Base legal:
  - RIR/2018 arts. 58-71 — atividade rural PF
  - Lei 9.250/1995 art. 18 — Livro Caixa
  - IN RFB 2.178/2024 — DIRPF 2025 (ano-base 2024)
  - Lei 9.430/1996 art. 44 — multas
Alíquotas IRPF 2024 (tabela progressiva):
  0%: até R$ 2.259,20/mês (R$ 27.110,40/ano)
  7,5%: R$ 2.259,21 a R$ 2.826,65/mês
  15%: R$ 2.826,66 a R$ 3.751,05/mês
  22,5%: R$ 3.751,06 a R$ 4.664,68/mês
  27,5%: acima de R$ 4.664,68/mês
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal
import os, psycopg2, psycopg2.extras
from datetime import date, datetime

router = APIRouter(prefix="/dirpf", tags=["DIRPF"])
DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

# Tabela progressiva IRPF 2024 (anual)
FAIXAS_IRPF_2024 = [
    (27110.40,  0.000, 0.00),
    (33919.80,  0.075, 2033.28),
    (45012.60,  0.150, 4621.54),
    (55976.16,  0.225, 7991.45),
    (float("inf"), 0.275, 10788.88),
]

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


class DirpfConfig(BaseModel):
    imovel_id: int
    ano_base: int
    regime: Literal["presumido_20pct", "resultado_real"] = "presumido_20pct"
    # Deduções adicionais
    dependentes: int = 0                 # R$ 2.275,08/dependente/ano (2024)
    deducao_inss: float = 0.0
    deducao_previdencia_privada: float = 0.0
    deducao_educacao: float = 0.0        # limite R$ 3.561,50/ano
    deducao_saude: float = 0.0           # sem limite
    deducao_pensao_alimenticia: float = 0.0
    # IRRF já retido
    irrf_retido_fonte: float = 0.0
    irrf_carnê_leão: float = 0.0
    # Observações
    observacoes: Optional[str] = None


@router.get("/apuracao/{imovel_id}/{ano_base}")
def apuracao_dirpf(imovel_id: int, ano_base: int, regime: str = "presumido_20pct"):
    db = get_db()
    cur = db.cursor()

    # 1. Dados do Livro Caixa
    cur.execute("""
        SELECT tipo, SUM(valor) AS total
        FROM livro_caixa_lancamentos
        WHERE imovel_id = %s AND ano_base = %s AND deducao_irpf = true
        GROUP BY tipo
    """, (imovel_id, ano_base))
    livro = {r["tipo"]: float(r["total"]) for r in cur.fetchall()}
    receita_bruta = livro.get("receita", 0)
    despesas_reais = livro.get("despesa", 0)

    # 2. Acertos de contrato (cross-check)
    cur.execute("""
        SELECT SUM(valor_bruto) AS bruto, SUM(base_tributavel_irpf) AS base,
               SUM(funrural_retido) AS funrural, SUM(senar_retido) AS senar
        FROM contratos_acertos
        WHERE imovel_id = %s AND EXTRACT(YEAR FROM COALESCE(data_acerto, criado_em)) = %s
    """, (imovel_id, ano_base))
    acertos = cur.fetchone()

    # 3. Configuração salva
    cur.execute("""
        SELECT * FROM dirpf_config WHERE imovel_id = %s AND ano_base = %s
    """, (imovel_id, ano_base))
    config = cur.fetchone()

    db.close()

    # Calcular base tributável
    if regime == "resultado_real":
        base_tributavel = max(0, receita_bruta - despesas_reais)
    else:
        base_tributavel = receita_bruta * 0.20

    # Deduções pessoais
    ded_dependentes = (config["dependentes"] if config else 0) * 2275.08
    ded_inss        = float(config["deducao_inss"]) if config else 0
    ded_prev_priv   = float(config["deducao_previdencia_privada"]) if config else 0
    ded_educacao    = min(float(config["deducao_educacao"]) if config else 0, 3561.50)
    ded_saude       = float(config["deducao_saude"]) if config else 0
    ded_pensao      = float(config["deducao_pensao_alimenticia"]) if config else 0

    total_deducoes = ded_dependentes + ded_inss + ded_prev_priv + ded_educacao + ded_saude + ded_pensao
    base_calculo = max(0, base_tributavel - total_deducoes)

    irpf = calcular_irpf(base_calculo)
    irrf_retido = (float(config["irrf_retido_fonte"]) if config else 0) + (float(config["irrf_carnê_leão"]) if config else 0)

    imposto_a_pagar = max(0, irpf["imposto_bruto"] - irrf_retido)
    imposto_a_restituir = max(0, irrf_retido - irpf["imposto_bruto"])

    return {
        "ano_base": ano_base,
        "regime": regime,
        # Livro Caixa
        "receita_bruta": receita_bruta,
        "despesas_reais": despesas_reais,
        "resultado_real": receita_bruta - despesas_reais,
        "base_presumida_20pct": receita_bruta * 0.20,
        # Base tributável
        "base_tributavel": base_tributavel,
        "total_deducoes_pessoais": total_deducoes,
        "base_calculo_irpf": base_calculo,
        # IRPF
        "aliquota_efetiva_pct": irpf["aliquota_efetiva"],
        "imposto_bruto": irpf["imposto_bruto"],
        "irrf_retido_total": irrf_retido,
        "imposto_a_pagar": imposto_a_pagar,
        "imposto_a_restituir": imposto_a_restituir,
        # Cross-check acertos
        "acertos_valor_bruto": float(acertos["bruto"] or 0),
        "acertos_funrural_retido": float(acertos["funrural"] or 0),
        "acertos_senar_retido": float(acertos["senar"] or 0),
        # Deduções detalhadas
        "deducoes": {
            "dependentes": ded_dependentes,
            "inss": ded_inss,
            "previdencia_privada": ded_prev_priv,
            "educacao": ded_educacao,
            "saude": ded_saude,
            "pensao_alimenticia": ded_pensao,
        },
        # Comparativo de regimes
        "comparativo": {
            "presumido_base": receita_bruta * 0.20,
            "real_base": max(0, receita_bruta - despesas_reais),
            "economia_regime_real": max(0, (receita_bruta * 0.20) - max(0, receita_bruta - despesas_reais)),
            "recomendacao": "resultado_real" if (receita_bruta - despesas_reais) < (receita_bruta * 0.20) else "presumido_20pct",
        }
    }


@router.post("/config")
def salvar_config(data: DirpfConfig):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        INSERT INTO dirpf_config (
            imovel_id, ano_base, regime, dependentes,
            deducao_inss, deducao_previdencia_privada,
            deducao_educacao, deducao_saude, deducao_pensao_alimenticia,
            irrf_retido_fonte, irrf_carnê_leão, observacoes
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (imovel_id, ano_base) DO UPDATE SET
            regime = EXCLUDED.regime,
            dependentes = EXCLUDED.dependentes,
            deducao_inss = EXCLUDED.deducao_inss,
            deducao_previdencia_privada = EXCLUDED.deducao_previdencia_privada,
            deducao_educacao = EXCLUDED.deducao_educacao,
            deducao_saude = EXCLUDED.deducao_saude,
            deducao_pensao_alimenticia = EXCLUDED.deducao_pensao_alimenticia,
            irrf_retido_fonte = EXCLUDED.irrf_retido_fonte,
            "irrf_carnê_leão" = EXCLUDED."irrf_carnê_leão",
            observacoes = EXCLUDED.observacoes,
            atualizado_em = NOW()
        RETURNING id
    """, (data.imovel_id, data.ano_base, data.regime, data.dependentes,
          data.deducao_inss, data.deducao_previdencia_privada,
          data.deducao_educacao, data.deducao_saude, data.deducao_pensao_alimenticia,
          data.irrf_retido_fonte, data.irrf_carnê_leão, data.observacoes))
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
