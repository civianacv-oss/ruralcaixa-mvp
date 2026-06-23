"""
Apuração PJ — RuralCaixa
Endpoints para apuração trimestral/anual: Lucro Presumido, Lucro Real PJ, Simples Nacional
Base legal: Lei 9.430/1996, Lei 9.718/1998, LC 123/2006, Lei 10.637/2002, Lei 10.833/2003
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os, psycopg2, psycopg2.extras
from datetime import date, timedelta

router = APIRouter(prefix="/apuracao-pj", tags=["Apuração PJ"])
DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    return conn

# ── Alíquotas ────────────────────────────────────────────────────────────────
IRPJ_ALIQ = 0.15
IRPJ_ADICIONAL = 0.10
IRPJ_ADICIONAL_LIMITE_TRIM = 60_000.0   # R$ 60k/trimestre
CSLL_ALIQ = 0.09
PIS_CUMULATIVO = 0.0065
COFINS_CUMULATIVO = 0.03
PIS_NCUMULATIVO = 0.0165
COFINS_NCUMULATIVO = 0.076

PRESUNCAO_IRPJ = {
    "comercio": 0.08, "industria": 0.08, "in_natura": 0.08,
    "servico": 0.32, "servico_simples": 0.16, "misto": 0.08, "industrializado": 0.08,
}
PRESUNCAO_CSLL = {
    "comercio": 0.12, "industria": 0.12, "in_natura": 0.12,
    "servico": 0.32, "servico_simples": 0.32, "misto": 0.12, "industrializado": 0.12,
}

def vencimento_irpj_trimestre(ano: int, trimestre: int) -> date:
    """IRPJ/CSLL Lucro Presumido vence no último dia útil do mês seguinte ao trimestre."""
    meses = {1: (4, 30), 2: (7, 31), 3: (10, 31), 4: (1, 31)}
    mes, dia = meses[trimestre]
    ano_venc = ano if trimestre < 4 else ano + 1
    return date(ano_venc, mes, dia)

def meses_trimestre(ano: int, trimestre: int):
    inicio_mes = (trimestre - 1) * 3 + 1
    return [date(ano, inicio_mes + i, 1) for i in range(3)]


# ── Models ───────────────────────────────────────────────────────────────────
class ConfigPJCreate(BaseModel):
    imovel_id: int
    ano_base: int
    regime: str = "lucro_presumido"
    tipo_atividade: str = "comercio"
    cnpj: Optional[str] = None
    razao_social: Optional[str] = None
    pct_presuncao_irpj: Optional[float] = None
    pct_presuncao_csll: Optional[float] = None
    usa_jcp: bool = False
    jcp_anual: float = 0
    anexo_simples: str = "II"
    folha_12m: float = 0

class LancamentoMensalCreate(BaseModel):
    imovel_id: int
    competencia: str  # "YYYY-MM"
    receita_bruta: float = 0
    receita_servicos: float = 0
    receita_financeira: float = 0
    outras_receitas: float = 0
    custo_mercadorias: float = 0
    despesas_operacionais: float = 0
    folha_pagamento: float = 0
    prolabore: float = 0
    despesas_financeiras: float = 0
    outras_despesas: float = 0
    creditos_pis_cofins: float = 0
    tipo_producao: str = "comercio"
    observacoes: Optional[str] = None

class CreditoPISCOFINSCreate(BaseModel):
    imovel_id: int
    competencia: str
    tipo_credito: str
    descricao: Optional[str] = None
    valor_base: float
    nf_numero: Optional[str] = None

class PagarApuracaoBody(BaseModel):
    data_pagamento: str
    darf_numero: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/config")
def salvar_config(cfg: ConfigPJCreate):
    """Salva ou atualiza configuração PJ para o ano-base."""
    pct_irpj = cfg.pct_presuncao_irpj or (PRESUNCAO_IRPJ.get(cfg.tipo_atividade, 0.08) * 100)
    pct_csll  = cfg.pct_presuncao_csll or (PRESUNCAO_CSLL.get(cfg.tipo_atividade, 0.12) * 100)
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO pj_config
                  (imovel_id, ano_base, regime, tipo_atividade, cnpj, razao_social,
                   pct_presuncao_irpj, pct_presuncao_csll, usa_jcp, jcp_anual,
                   anexo_simples, folha_12m)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (imovel_id, ano_base) DO UPDATE SET
                  regime=EXCLUDED.regime, tipo_atividade=EXCLUDED.tipo_atividade,
                  cnpj=EXCLUDED.cnpj, razao_social=EXCLUDED.razao_social,
                  pct_presuncao_irpj=EXCLUDED.pct_presuncao_irpj,
                  pct_presuncao_csll=EXCLUDED.pct_presuncao_csll,
                  usa_jcp=EXCLUDED.usa_jcp, jcp_anual=EXCLUDED.jcp_anual,
                  anexo_simples=EXCLUDED.anexo_simples, folha_12m=EXCLUDED.folha_12m,
                  atualizado_em=NOW()
                RETURNING *
            """, (cfg.imovel_id, cfg.ano_base, cfg.regime, cfg.tipo_atividade,
                  cfg.cnpj, cfg.razao_social, pct_irpj, pct_csll,
                  cfg.usa_jcp, cfg.jcp_anual, cfg.anexo_simples, cfg.folha_12m))
            row = cur.fetchone()
            conn.commit()
            return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/config/{imovel_id}/{ano_base}")
def obter_config(imovel_id: int, ano_base: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM pj_config WHERE imovel_id=%s AND ano_base=%s",
                        (imovel_id, ano_base))
            row = cur.fetchone()
            return dict(row) if row else {}
    finally:
        conn.close()


@router.post("/lancamento")
def registrar_lancamento(lanc: LancamentoMensalCreate):
    """Registra receitas e despesas mensais."""
    comp = date(int(lanc.competencia[:4]), int(lanc.competencia[5:7]), 1)
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO pj_lancamento_mensal
                  (imovel_id, competencia, receita_bruta, receita_servicos, receita_financeira,
                   outras_receitas, custo_mercadorias, despesas_operacionais, folha_pagamento,
                   prolabore, despesas_financeiras, outras_despesas, creditos_pis_cofins,
                   tipo_producao, observacoes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (imovel_id, competencia) DO UPDATE SET
                  receita_bruta=EXCLUDED.receita_bruta,
                  receita_servicos=EXCLUDED.receita_servicos,
                  receita_financeira=EXCLUDED.receita_financeira,
                  outras_receitas=EXCLUDED.outras_receitas,
                  custo_mercadorias=EXCLUDED.custo_mercadorias,
                  despesas_operacionais=EXCLUDED.despesas_operacionais,
                  folha_pagamento=EXCLUDED.folha_pagamento,
                  prolabore=EXCLUDED.prolabore,
                  despesas_financeiras=EXCLUDED.despesas_financeiras,
                  outras_despesas=EXCLUDED.outras_despesas,
                  creditos_pis_cofins=EXCLUDED.creditos_pis_cofins,
                  tipo_producao=EXCLUDED.tipo_producao,
                  observacoes=EXCLUDED.observacoes
                RETURNING *
            """, (lanc.imovel_id, comp, lanc.receita_bruta, lanc.receita_servicos,
                  lanc.receita_financeira, lanc.outras_receitas, lanc.custo_mercadorias,
                  lanc.despesas_operacionais, lanc.folha_pagamento, lanc.prolabore,
                  lanc.despesas_financeiras, lanc.outras_despesas, lanc.creditos_pis_cofins,
                  lanc.tipo_producao, lanc.observacoes))
            row = cur.fetchone()
            conn.commit()
            return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/lancamentos/{imovel_id}/{ano_base}")
def listar_lancamentos(imovel_id: int, ano_base: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM pj_lancamento_mensal
                WHERE imovel_id=%s AND EXTRACT(YEAR FROM competencia)=%s
                ORDER BY competencia
            """, (imovel_id, ano_base))
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/apurar/{imovel_id}/{ano_base}/{trimestre}")
def apurar_trimestre(imovel_id: int, ano_base: int, trimestre: int):
    """Calcula e salva a apuração trimestral de IRPJ+CSLL+PIS+COFINS."""
    if trimestre not in (1, 2, 3, 4):
        raise HTTPException(400, "Trimestre deve ser 1, 2, 3 ou 4")

    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Configuração
            cur.execute("SELECT * FROM pj_config WHERE imovel_id=%s AND ano_base=%s",
                        (imovel_id, ano_base))
            cfg = cur.fetchone()
            regime = cfg["regime"] if cfg else "lucro_presumido"
            tipo_ativ = cfg["tipo_atividade"] if cfg else "comercio"
            pct_irpj = float(cfg["pct_presuncao_irpj"]) / 100 if cfg else PRESUNCAO_IRPJ.get(tipo_ativ, 0.08)
            pct_csll  = float(cfg["pct_presuncao_csll"]) / 100 if cfg else PRESUNCAO_CSLL.get(tipo_ativ, 0.12)
            jcp_trim  = float(cfg["jcp_anual"]) / 4 if cfg and cfg["usa_jcp"] else 0

            # Soma dos meses do trimestre
            meses = meses_trimestre(ano_base, trimestre)
            placeholders = ",".join(["%s"] * len(meses))
            cur.execute(f"""
                SELECT
                  COALESCE(SUM(receita_bruta + receita_servicos + receita_financeira + outras_receitas), 0) AS receita_total,
                  COALESCE(SUM(custo_mercadorias + despesas_operacionais + folha_pagamento + prolabore + despesas_financeiras + outras_despesas), 0) AS despesas_total,
                  COALESCE(SUM(creditos_pis_cofins), 0) AS creditos_pis_cofins,
                  MAX(tipo_producao) AS tipo_producao
                FROM pj_lancamento_mensal
                WHERE imovel_id=%s AND competencia IN ({placeholders})
            """, (imovel_id, *meses))
            agg = cur.fetchone()

            receita = float(agg["receita_total"] or 0)
            despesas = float(agg["despesas_total"] or 0)
            creditos = float(agg["creditos_pis_cofins"] or 0)

            # ── Lucro Presumido ──
            base_irpj = receita * pct_irpj
            base_csll  = receita * pct_csll
            irpj_lp    = base_irpj * IRPJ_ALIQ
            adicional_lp = max(base_irpj - IRPJ_ADICIONAL_LIMITE_TRIM, 0) * IRPJ_ADICIONAL
            csll_lp    = base_csll * CSLL_ALIQ
            pis_lp     = receita * PIS_CUMULATIVO
            cofins_lp  = receita * COFINS_CUMULATIVO

            # ── Lucro Real ──
            lucro_real = max(receita - despesas - jcp_trim, 0)
            irpj_lr    = lucro_real * IRPJ_ALIQ
            adicional_lr = max(lucro_real - IRPJ_ADICIONAL_LIMITE_TRIM, 0) * IRPJ_ADICIONAL
            csll_lr    = lucro_real * CSLL_ALIQ
            pis_lr     = max(receita * PIS_NCUMULATIVO - creditos * PIS_NCUMULATIVO / (PIS_NCUMULATIVO + COFINS_NCUMULATIVO), 0)
            cofins_lr  = max(receita * COFINS_NCUMULATIVO - creditos * COFINS_NCUMULATIVO / (PIS_NCUMULATIVO + COFINS_NCUMULATIVO), 0)

            # Seleciona valores conforme regime
            if regime == "lucro_presumido":
                irpj = irpj_lp; adicional = adicional_lp; csll = csll_lp
                pis = pis_lp; cofins = cofins_lp
            else:
                irpj = irpj_lr; adicional = adicional_lr; csll = csll_lr
                pis = pis_lr; cofins = cofins_lr

            total = irpj + adicional + csll + pis + cofins
            aliq_efetiva = (total / receita * 100) if receita > 0 else 0
            vencimento = vencimento_irpj_trimestre(ano_base, trimestre)

            cur.execute("""
                INSERT INTO pj_apuracao_trimestral
                  (imovel_id, ano_base, trimestre, regime, receita_bruta,
                   base_irpj_presumida, base_csll_presumida,
                   irpj, irpj_adicional, csll,
                   lucro_real, irpj_real, irpj_adicional_real, csll_real,
                   pis_trimestre, cofins_trimestre,
                   total_tributos, aliq_efetiva_pct, data_vencimento)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (imovel_id, ano_base, trimestre, regime) DO UPDATE SET
                  receita_bruta=EXCLUDED.receita_bruta,
                  base_irpj_presumida=EXCLUDED.base_irpj_presumida,
                  base_csll_presumida=EXCLUDED.base_csll_presumida,
                  irpj=EXCLUDED.irpj, irpj_adicional=EXCLUDED.irpj_adicional, csll=EXCLUDED.csll,
                  lucro_real=EXCLUDED.lucro_real, irpj_real=EXCLUDED.irpj_real,
                  irpj_adicional_real=EXCLUDED.irpj_adicional_real, csll_real=EXCLUDED.csll_real,
                  pis_trimestre=EXCLUDED.pis_trimestre, cofins_trimestre=EXCLUDED.cofins_trimestre,
                  total_tributos=EXCLUDED.total_tributos, aliq_efetiva_pct=EXCLUDED.aliq_efetiva_pct,
                  data_vencimento=EXCLUDED.data_vencimento, atualizado_em=NOW()
                RETURNING *
            """, (imovel_id, ano_base, trimestre, regime, receita,
                  base_irpj, base_csll, irpj_lp, adicional_lp, csll_lp,
                  lucro_real, irpj_lr, adicional_lr, csll_lr,
                  pis, cofins, total, aliq_efetiva, vencimento))
            row = cur.fetchone()
            conn.commit()

            return {
                **dict(row),
                "breakdown": {
                    "receita_bruta": round(receita, 2),
                    "regime": regime,
                    "lucro_presumido": {
                        "base_irpj": round(base_irpj, 2), "irpj": round(irpj_lp, 2),
                        "adicional": round(adicional_lp, 2), "base_csll": round(base_csll, 2),
                        "csll": round(csll_lp, 2), "pis": round(pis_lp, 2), "cofins": round(cofins_lp, 2),
                        "total": round(irpj_lp + adicional_lp + csll_lp + pis_lp + cofins_lp, 2),
                    },
                    "lucro_real": {
                        "lucro": round(lucro_real, 2), "irpj": round(irpj_lr, 2),
                        "adicional": round(adicional_lr, 2), "csll": round(csll_lr, 2),
                        "pis": round(pis_lr, 2), "cofins": round(cofins_lr, 2),
                        "total": round(irpj_lr + adicional_lr + csll_lr + pis_lr + cofins_lr, 2),
                    },
                    "vencimento": vencimento.isoformat(),
                }
            }
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/apuracoes/{imovel_id}/{ano_base}")
def listar_apuracoes(imovel_id: int, ano_base: int):
    """Lista todas as apurações trimestrais do ano."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM pj_apuracao_trimestral
                WHERE imovel_id=%s AND ano_base=%s
                ORDER BY trimestre
            """, (imovel_id, ano_base))
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.patch("/apuracoes/{id}/pagar")
def marcar_pago(id: int, body: PagarApuracaoBody):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                UPDATE pj_apuracao_trimestral
                SET status='pago', data_pagamento=%s, darf_numero=%s, atualizado_em=NOW()
                WHERE id=%s RETURNING *
            """, (body.data_pagamento, body.darf_numero, id))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Apuração não encontrada")
            conn.commit()
            return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/resumo-anual/{imovel_id}/{ano_base}")
def resumo_anual(imovel_id: int, ano_base: int):
    """Resumo anual consolidado: todos os trimestres + comparativo de regimes."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT
                  SUM(receita_bruta) AS receita_total,
                  SUM(irpj + irpj_adicional) AS irpj_total,
                  SUM(csll) AS csll_total,
                  SUM(pis_trimestre) AS pis_total,
                  SUM(cofins_trimestre) AS cofins_total,
                  SUM(total_tributos) AS total_tributos,
                  AVG(aliq_efetiva_pct) AS aliq_media,
                  COUNT(*) AS trimestres_apurados,
                  SUM(CASE WHEN status='pago' THEN 1 ELSE 0 END) AS trimestres_pagos
                FROM pj_apuracao_trimestral
                WHERE imovel_id=%s AND ano_base=%s
            """, (imovel_id, ano_base))
            resumo = cur.fetchone()

            cur.execute("""
                SELECT
                  SUM(receita_bruta + receita_servicos + receita_financeira + outras_receitas) AS receita_total,
                  SUM(custo_mercadorias + despesas_operacionais + folha_pagamento + prolabore + despesas_financeiras + outras_despesas) AS despesas_total,
                  SUM(creditos_pis_cofins) AS creditos_total,
                  MAX(tipo_producao) AS tipo_producao
                FROM pj_lancamento_mensal
                WHERE imovel_id=%s AND EXTRACT(YEAR FROM competencia)=%s
            """, (imovel_id, ano_base))
            lanc = cur.fetchone()

            cur.execute("SELECT * FROM pj_config WHERE imovel_id=%s AND ano_base=%s",
                        (imovel_id, ano_base))
            cfg = cur.fetchone()

            return {
                "ano_base": ano_base,
                "resumo_apuracoes": dict(resumo) if resumo else {},
                "lancamentos": dict(lanc) if lanc else {},
                "config": dict(cfg) if cfg else {},
            }
    finally:
        conn.close()


@router.post("/credito-pis-cofins")
def registrar_credito(cred: CreditoPISCOFINSCreate):
    comp = date(int(cred.competencia[:4]), int(cred.competencia[5:7]), 1)
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO pj_credito_pis_cofins
                  (imovel_id, competencia, tipo_credito, descricao, valor_base, nf_numero)
                VALUES (%s,%s,%s,%s,%s,%s) RETURNING *
            """, (cred.imovel_id, comp, cred.tipo_credito, cred.descricao,
                  cred.valor_base, cred.nf_numero))
            row = cur.fetchone()
            conn.commit()
            return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/creditos-pis-cofins/{imovel_id}/{ano_base}")
def listar_creditos(imovel_id: int, ano_base: int):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM pj_credito_pis_cofins
                WHERE imovel_id=%s AND EXTRACT(YEAR FROM competencia)=%s
                ORDER BY competencia DESC
            """, (imovel_id, ano_base))
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/tipos-credito-pis-cofins")
def tipos_credito():
    """Lista os tipos de crédito de PIS/COFINS não-cumulativo (Lei 10.637/2002 art. 3)."""
    return [
        {"codigo": "insumos",           "descricao": "Insumos utilizados na produção (art. 3° I)"},
        {"codigo": "energia",           "descricao": "Energia elétrica consumida na produção (art. 3° III)"},
        {"codigo": "frete_venda",       "descricao": "Frete na operação de venda (art. 3° IX)"},
        {"codigo": "frete_compra",      "descricao": "Frete na aquisição de insumos (art. 3° IX)"},
        {"codigo": "ativo_imobilizado", "descricao": "Depreciação de ativo imobilizado (art. 3° VI)"},
        {"codigo": "aluguel",           "descricao": "Aluguel de prédios, máquinas e equipamentos (art. 3° IV)"},
        {"codigo": "armazenagem",       "descricao": "Armazenagem de mercadoria (art. 3° IX)"},
        {"codigo": "embalagens",        "descricao": "Embalagens utilizadas na produção (art. 3° I)"},
        {"codigo": "outros",            "descricao": "Outros créditos admitidos em lei"},
    ]
