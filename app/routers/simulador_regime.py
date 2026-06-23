"""
Simulador de Regime Tributário — Reforma Tributária (LC 214/2024)
Regras para Produtor Rural PF e PJ (Simples Nacional)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os, psycopg2, psycopg2.extras
from datetime import date, datetime
from decimal import Decimal

router = APIRouter(prefix="/simulador-regime", tags=["Simulador de Regime"])

DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    return conn

# ── Tabelas do Simples Nacional (2024) ──────────────────────────────────────
# Anexo II — Indústria / Produção Industrializada
SIMPLES_ANEXO_II = [
    (180000,   0.06,    0),
    (360000,   0.112,   9360),
    (720000,   0.135,   17640),
    (1800000,  0.16,    35640),
    (3600000,  0.21,    125640),
    (4800000,  0.33,    648000),
]
# Anexo III — Serviços (Fator R ≥ 28%)
SIMPLES_ANEXO_III = [
    (180000,   0.06,    0),
    (360000,   0.112,   9360),
    (720000,   0.135,   17640),
    (1800000,  0.16,    35640),
    (3600000,  0.21,    125640),
    (4800000,  0.33,    648000),
]
# Anexo V — Serviços (Fator R < 28%)
SIMPLES_ANEXO_V = [
    (180000,   0.155,   0),
    (360000,   0.18,    4500),
    (720000,   0.195,   9900),
    (1800000,  0.205,   17100),
    (3600000,  0.23,    62100),
    (4800000,  0.305,   540000),
]

def aliquota_simples(faturamento_12m: float, tabela) -> float:
    """Calcula alíquota efetiva do Simples Nacional."""
    if faturamento_12m <= 0:
        return 0.0
    for limite, aliq_nominal, parcela_deduzir in tabela:
        if faturamento_12m <= limite:
            aliq_efetiva = ((faturamento_12m * aliq_nominal) - parcela_deduzir) / faturamento_12m
            return max(aliq_efetiva, 0.0)
    # Acima do limite do Simples — tributação pelo regime geral
    return 0.33

def calcular_tributos(
    faturamento_12m: float,
    folha_12m: float,
    despesas_12m: float,
    tipo_producao: str
) -> dict:
    """
    Calcula o imposto estimado para cada regime tributário.
    Retorna dicionário com valores anuais estimados.
    """
    resultado = {}
    alertas = []

    # ── 1. PF — Regime Diferenciado (LC 214/2024) ──────────────────────────
    LIMITE_ISENCAO_PF = 3_600_000.0
    # Desconto por tipo de produto
    desconto_cbs_ibs = {
        "in_natura": 1.0,      # 100% de desconto (isenção total)
        "industrializado": 0.6, # 60% de desconto
        "servico": 0.0,         # sem desconto
        "misto": 0.8,           # estimativa
    }
    desconto = desconto_cbs_ibs.get(tipo_producao, 1.0)
    ALIQ_CBS_IBS_PLENA = 0.265  # alíquota padrão CBS+IBS (estimativa LC 214/2024)

    if faturamento_12m <= LIMITE_ISENCAO_PF:
        resultado["pf_diferenciado"] = 0.0
    else:
        excedente = faturamento_12m - LIMITE_ISENCAO_PF
        resultado["pf_diferenciado"] = round(excedente * ALIQ_CBS_IBS_PLENA * (1 - desconto), 2)

    # ── 2. PF — Lucro Real (IRPF + contribuições) ──────────────────────────
    lucro_estimado = max(faturamento_12m - despesas_12m, 0)
    # Tabela IRPF progressiva 2024 (anual)
    def irpf_anual(base: float) -> float:
        if base <= 26_400:   return 0.0
        if base <= 33_919.8: return (base * 0.075) - 1_980.0
        if base <= 45_012.6: return (base * 0.15)  - 4_513.48
        if base <= 55_976.16:return (base * 0.225) - 7_939.67
        return (base * 0.275) - 10_738.99
    resultado["pf_lucro_real"] = round(irpf_anual(lucro_estimado), 2)

    # ── 3. PJ — Simples Nacional Anexo II (Indústria) ──────────────────────
    aliq_ii = aliquota_simples(faturamento_12m, SIMPLES_ANEXO_II)
    resultado["pj_simples_ii"] = round(faturamento_12m * aliq_ii, 2)

    # ── 4. PJ — Simples Nacional Anexo III/V (Serviços — Fator R) ──────────
    fator_r = (folha_12m / faturamento_12m * 100) if faturamento_12m > 0 else 0
    if fator_r >= 28:
        aliq_iii = aliquota_simples(faturamento_12m, SIMPLES_ANEXO_III)
        resultado["pj_simples_iii"] = round(faturamento_12m * aliq_iii, 2)
        resultado["pj_simples_v"]   = round(faturamento_12m * aliquota_simples(faturamento_12m, SIMPLES_ANEXO_V), 2)
    else:
        aliq_v = aliquota_simples(faturamento_12m, SIMPLES_ANEXO_V)
        resultado["pj_simples_v"]   = round(faturamento_12m * aliq_v, 2)
        resultado["pj_simples_iii"] = round(faturamento_12m * aliquota_simples(faturamento_12m, SIMPLES_ANEXO_III), 2)

    # ── 5. PJ — Lucro Real ──────────────────────────────────────────────────
    lucro_pj = max(faturamento_12m - despesas_12m, 0)
    resultado["pj_lucro_real"] = round(lucro_pj * 0.34, 2)  # IRPJ 15% + CSLL 9% + adicional 10%

    # ── Fator R ─────────────────────────────────────────────────────────────
    resultado["fator_r_pct"] = round(fator_r, 2)

    # ── Recomendação ────────────────────────────────────────────────────────
    opcoes = {
        "PF — Regime Diferenciado": resultado["pf_diferenciado"],
        "PF — Lucro Real":          resultado["pf_lucro_real"],
        "PJ — Simples Anexo II":    resultado["pj_simples_ii"],
        "PJ — Simples Anexo III":   resultado["pj_simples_iii"],
        "PJ — Simples Anexo V":     resultado["pj_simples_v"],
        "PJ — Lucro Real":          resultado["pj_lucro_real"],
    }
    melhor = min(opcoes, key=lambda k: opcoes[k])
    pior   = max(opcoes, key=lambda k: opcoes[k])
    resultado["regime_recomendado"] = melhor
    resultado["economia_anual"]     = round(opcoes[pior] - opcoes[melhor], 2)

    # ── Alertas dinâmicos ───────────────────────────────────────────────────
    if faturamento_12m > LIMITE_ISENCAO_PF:
        alertas.append({
            "nivel": "amarelo",
            "mensagem": f"Faturamento de R$ {faturamento_12m:,.2f} ultrapassou R$ 3,6M. PF perdeu a isenção CBS/IBS. Compare com PJ Simples Nacional."
        })
    elif faturamento_12m > LIMITE_ISENCAO_PF * 0.9:
        alertas.append({
            "nivel": "amarelo",
            "mensagem": f"Faturamento está em {faturamento_12m/LIMITE_ISENCAO_PF*100:.1f}% do limite de isenção PF (R$ 3,6M). Monitore de perto."
        })

    if tipo_producao == "servico" and fator_r < 28:
        alertas.append({
            "nivel": "vermelho",
            "mensagem": f"Fator R está em {fator_r:.1f}% (abaixo de 28%). Alíquota no Simples vai para o Anexo V (até 33%). Considere aumentar pró-labore."
        })
    elif tipo_producao == "servico" and fator_r < 30:
        alertas.append({
            "nivel": "laranja",
            "mensagem": f"Fator R em {fator_r:.1f}% — próximo do limite de 28%. Se cair, alíquota sobe para Anexo V."
        })

    if despesas_12m > faturamento_12m * 0.30 and faturamento_12m > 0:
        alertas.append({
            "nivel": "amarelo",
            "mensagem": f"Despesas dedutíveis representam {despesas_12m/faturamento_12m*100:.1f}% do faturamento. PF no Lucro Real pode ser mais vantajoso."
        })

    diff_melhor_segundo = sorted(opcoes.values())[1] - sorted(opcoes.values())[0]
    if sorted(opcoes.values())[0] > 0 and diff_melhor_segundo / sorted(opcoes.values())[0] < 0.05:
        alertas.append({
            "nivel": "azul",
            "mensagem": "Empate técnico entre os dois melhores regimes (diferença < 5%). Avalie outros fatores: sucessão, acesso a crédito, obrigações acessórias."
        })

    resultado["alertas"] = alertas
    return resultado


# ── Models ──────────────────────────────────────────────────────────────────
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
    tipo_producao: str = "in_natura"
    observacoes: Optional[str] = None

class SimulacaoAvulsa(BaseModel):
    faturamento_12m: float
    folha_12m: float = 0
    despesas_12m: float = 0
    tipo_producao: str = "in_natura"


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/simulacao")
def simulacao_avulsa(dados: SimulacaoAvulsa):
    """Simulação rápida sem salvar no banco."""
    resultado = calcular_tributos(
        dados.faturamento_12m,
        dados.folha_12m,
        dados.despesas_12m,
        dados.tipo_producao
    )
    return resultado


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
            if not row:
                return {}
            return dict(row)
    finally:
        conn.close()


@router.post("/lancamento")
def registrar_lancamento(lanc: LancamentoCreate):
    competencia_date = date(int(lanc.competencia[:4]), int(lanc.competencia[5:7]), 1)
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Upsert lançamento
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

            # Calcula janela 12 meses
            cur.execute("""
                SELECT
                  COALESCE(SUM(faturamento),0)            AS fat_12m,
                  COALESCE(SUM(folha_pagamento),0)        AS folha_12m,
                  COALESCE(SUM(despesas_operacionais),0)  AS desp_12m,
                  MAX(tipo_producao)                      AS tipo
                FROM sim_lancamentos
                WHERE imovel_id=%s
                  AND competencia > %s - INTERVAL '12 months'
                  AND competencia <= %s
            """, (lanc.imovel_id, competencia_date, competencia_date))
            agg = cur.fetchone()

            tributos = calcular_tributos(
                float(agg["fat_12m"]),
                float(agg["folha_12m"]),
                float(agg["desp_12m"]),
                agg["tipo"] or lanc.tipo_producao
            )

            import json
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
                json.dumps(tributos["alertas"])
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
            # Último resultado calculado
            cur.execute("""
                SELECT * FROM sim_resultados
                WHERE imovel_id=%s
                ORDER BY competencia DESC LIMIT 1
            """, (imovel_id,))
            ultimo = cur.fetchone()

            # Alertas ativos (todos os meses com alertas não vazios)
            cur.execute("""
                SELECT competencia, alertas FROM sim_resultados
                WHERE imovel_id=%s AND alertas != '[]'::jsonb AND alertas IS NOT NULL
                ORDER BY competencia DESC LIMIT 12
            """, (imovel_id,))
            alertas_rows = cur.fetchall()

            # Histórico 12 meses
            cur.execute("""
                SELECT competencia, faturamento_12m, pf_diferenciado, pj_simples_ii,
                       regime_recomendado, economia_anual, fator_r_pct
                FROM sim_resultados
                WHERE imovel_id=%s
                ORDER BY competencia DESC LIMIT 12
            """, (imovel_id,))
            historico = [dict(r) for r in cur.fetchall()]

            return {
                "ultimo_calculo": dict(ultimo) if ultimo else None,
                "alertas_ativos": [dict(r) for r in alertas_rows],
                "historico": historico
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
