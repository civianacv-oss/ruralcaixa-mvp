# =============================================================
# RuralCaixa — Router: Acertos de Contrato de Arrendamento
# Arquivo: app/routers/acertos_contrato.py
# Caso de uso: arrendamento pago em produto (soja, milho, etc.)
# Fiscal: RIR/2018 art. 59 — base 20% atividade rural PF
#         Lei 8.212/1991 art. 25 — FUNRURAL
# =============================================================
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, validator
from typing import Optional, Literal
from decimal import Decimal, ROUND_HALF_UP
import psycopg2
import psycopg2.extras
import os

router = APIRouter(prefix="/acertos-contrato", tags=["Acertos de Contrato"])

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"
)

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ── Schemas ───────────────────────────────────────────────────────────────────

class AcertoCreate(BaseModel):
    imovel_id: int = 1
    contrato_id: Optional[str] = None
    safra: str                              # ex: "25/26"
    arrendatario_nome: str
    arrendatario_cpf_cnpj: Optional[str] = None
    arrendatario_telefone: Optional[str] = None

    produto: Literal["soja", "milho", "cafe", "arroz", "trigo", "algodao", "outro"] = "soja"
    quantidade_sacas: float
    valor_por_saca: float

    pct_desconto_prod: float = 0.0          # ex: 1.63 para -1,63% PROD
    pct_desconto_frete: float = 0.0
    outros_descontos: float = 0.0
    descricao_outros_desc: Optional[str] = None

    # Retenções fiscais (feitas pelo arrendatário)
    funrural_retido: float = 0.0
    senar_retido: float = 0.0
    rat_retido: float = 0.0
    inss_retido: float = 0.0

    pct_base_tributavel: float = 20.0       # 20% padrão art. 59 RIR/2018

    tipo_pagamento: Literal["produto", "dinheiro", "misto"] = "produto"
    produto_ficou_com: Literal["arrendatario", "arrendador", "terceiro"] = "arrendatario"
    nota_fiscal_emitida: bool = False
    numero_nota_fiscal: Optional[str] = None
    data_nota_fiscal: Optional[str] = None
    comprovante_funrural: Optional[str] = None
    data_pagamento: Optional[str] = None
    observacoes: Optional[str] = None

    @validator("quantidade_sacas")
    def sacas_positivas(cls, v):
        if v <= 0:
            raise ValueError("Quantidade de sacas deve ser maior que zero.")
        return v

    @validator("valor_por_saca")
    def valor_positivo(cls, v):
        if v <= 0:
            raise ValueError("Valor por saca deve ser maior que zero.")
        return v

    @validator("pct_desconto_prod", "pct_desconto_frete")
    def pct_valido(cls, v):
        if v < 0 or v > 100:
            raise ValueError("Percentual deve estar entre 0 e 100.")
        return v


class AcertoUpdate(BaseModel):
    status: Optional[Literal["registrado", "conferido", "lancado_livro_caixa", "declarado"]] = None
    nota_fiscal_emitida: Optional[bool] = None
    numero_nota_fiscal: Optional[str] = None
    data_nota_fiscal: Optional[str] = None
    comprovante_funrural: Optional[str] = None
    data_pagamento: Optional[str] = None
    lancamento_id: Optional[int] = None
    observacoes: Optional[str] = None


# ── Helpers de cálculo fiscal ─────────────────────────────────────────────────

def calcular_acerto(dados: AcertoCreate) -> dict:
    """
    Calcula todos os valores derivados de um acerto de contrato.
    Retorna dict com os valores calculados para exibição e gravação.
    """
    q = Decimal(str(dados.quantidade_sacas))
    vps = Decimal(str(dados.valor_por_saca))
    bruto = (q * vps).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    desc_prod = (bruto * Decimal(str(dados.pct_desconto_prod)) / 100).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)
    desc_frete = (bruto * Decimal(str(dados.pct_desconto_frete)) / 100).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)
    outros = Decimal(str(dados.outros_descontos))

    liquido = (bruto - desc_prod - desc_frete - outros).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)

    base_irpf = (bruto * Decimal(str(dados.pct_base_tributavel)) / 100).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Cálculo sugerido de FUNRURAL (PF: 2,5% sobre bruto)
    funrural_sugerido = (bruto * Decimal("2.5") / 100).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)
    senar_sugerido = (bruto * Decimal("0.2") / 100).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP)

    return {
        "valor_bruto": float(bruto),
        "valor_desconto_prod": float(desc_prod),
        "valor_desconto_frete": float(desc_frete),
        "outros_descontos": float(outros),
        "valor_liquido": float(liquido),
        "base_tributavel_irpf": float(base_irpf),
        "funrural_sugerido_pf": float(funrural_sugerido),
        "senar_sugerido": float(senar_sugerido),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/preview-calculo")
def preview_calculo(
    quantidade_sacas: float,
    valor_por_saca: float,
    pct_desconto_prod: float = 0.0,
    pct_desconto_frete: float = 0.0,
    outros_descontos: float = 0.0,
    pct_base_tributavel: float = 20.0,
):
    """
    Calcula os valores de um acerto sem gravar no banco.
    Usado para preview em tempo real no frontend.
    """
    try:
        dummy = AcertoCreate(
            safra="preview",
            arrendatario_nome="preview",
            produto="soja",
            quantidade_sacas=quantidade_sacas,
            valor_por_saca=valor_por_saca,
            pct_desconto_prod=pct_desconto_prod,
            pct_desconto_frete=pct_desconto_frete,
            outros_descontos=outros_descontos,
            pct_base_tributavel=pct_base_tributavel,
        )
        return {"ok": True, "calculo": calcular_acerto(dummy)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/")
def criar_acerto(body: AcertoCreate):
    """Registra um novo acerto de contrato de arrendamento."""
    calc = calcular_acerto(body)
    conn = get_db()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO contratos_acertos (
                        imovel_id, contrato_id, safra,
                        arrendatario_nome, arrendatario_cpf_cnpj, arrendatario_telefone,
                        produto, quantidade_sacas, valor_por_saca,
                        pct_desconto_prod, pct_desconto_frete,
                        outros_descontos, descricao_outros_desc,
                        funrural_retido, senar_retido, rat_retido, inss_retido,
                        pct_base_tributavel,
                        tipo_pagamento, produto_ficou_com,
                        nota_fiscal_emitida, numero_nota_fiscal, data_nota_fiscal,
                        comprovante_funrural, data_pagamento, observacoes
                    ) VALUES (
                        %(imovel_id)s, %(contrato_id)s, %(safra)s,
                        %(arrendatario_nome)s, %(arrendatario_cpf_cnpj)s, %(arrendatario_telefone)s,
                        %(produto)s, %(quantidade_sacas)s, %(valor_por_saca)s,
                        %(pct_desconto_prod)s, %(pct_desconto_frete)s,
                        %(outros_descontos)s, %(descricao_outros_desc)s,
                        %(funrural_retido)s, %(senar_retido)s, %(rat_retido)s, %(inss_retido)s,
                        %(pct_base_tributavel)s,
                        %(tipo_pagamento)s, %(produto_ficou_com)s,
                        %(nota_fiscal_emitida)s, %(numero_nota_fiscal)s, %(data_nota_fiscal)s,
                        %(comprovante_funrural)s, %(data_pagamento)s, %(observacoes)s
                    ) RETURNING id, criado_em
                """, {
                    **body.dict(),
                    "data_nota_fiscal": body.data_nota_fiscal or None,
                    "data_pagamento": body.data_pagamento or None,
                })
                row = cur.fetchone()
        return {
            "ok": True,
            "id": row["id"],
            "criado_em": str(row["criado_em"]),
            "calculo": calc,
            "alertas": _gerar_alertas(body, calc),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/")
def listar_acertos(imovel_id: int = 1, safra: Optional[str] = None):
    """Lista todos os acertos de contrato do imóvel, com cálculos."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            params = [imovel_id]
            where = "WHERE imovel_id = %s"
            if safra:
                where += " AND safra = %s"
                params.append(safra)
            cur.execute(f"""
                SELECT
                    id, imovel_id, contrato_id, safra,
                    arrendatario_nome, arrendatario_cpf_cnpj, arrendatario_telefone,
                    produto, quantidade_sacas, valor_por_saca,
                    valor_bruto, pct_desconto_prod, valor_desconto_prod,
                    pct_desconto_frete, valor_desconto_frete,
                    outros_descontos, valor_liquido,
                    funrural_retido, senar_retido, rat_retido, inss_retido,
                    pct_base_tributavel, base_tributavel_irpf,
                    tipo_pagamento, produto_ficou_com,
                    nota_fiscal_emitida, numero_nota_fiscal, data_nota_fiscal,
                    comprovante_funrural, data_pagamento,
                    status, lancamento_id, observacoes,
                    criado_em, atualizado_em
                FROM contratos_acertos {where}
                ORDER BY criado_em DESC
            """, params)
            rows = cur.fetchall()
        return {"ok": True, "total": len(rows), "data": [dict(r) for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/{acerto_id}")
def obter_acerto(acerto_id: int):
    """Retorna um acerto específico com alertas fiscais."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM contratos_acertos WHERE id = %s", (acerto_id,))
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Acerto não encontrado.")
        d = dict(row)
        # Gerar alertas com base nos dados gravados
        alertas = []
        if not d.get("nota_fiscal_emitida"):
            alertas.append({
                "tipo": "aviso",
                "mensagem": "NF de Produtor Rural não emitida. Recomendável para escrituração correta na DIRPF.",
            })
        if not d.get("comprovante_funrural") and (d.get("funrural_retido") or 0) > 0:
            alertas.append({
                "tipo": "aviso",
                "mensagem": "FUNRURAL retido registrado, mas comprovante de retenção não informado.",
            })
        if d.get("status") == "registrado":
            alertas.append({
                "tipo": "info",
                "mensagem": "Acerto registrado. Próximo passo: lançar no Livro Caixa Rural.",
            })
        d["alertas"] = alertas
        return {"ok": True, "data": d}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.patch("/{acerto_id}")
def atualizar_acerto(acerto_id: int, body: AcertoUpdate):
    """Atualiza status, NF, comprovante FUNRURAL ou lançamento do acerto."""
    campos = {k: v for k, v in body.dict().items() if v is not None}
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar.")
    conn = get_db()
    try:
        with conn:
            with conn.cursor() as cur:
                sets = ", ".join(f"{k} = %({k})s" for k in campos)
                campos["id"] = acerto_id
                cur.execute(
                    f"UPDATE contratos_acertos SET {sets} WHERE id = %(id)s RETURNING id",
                    campos
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Acerto não encontrado.")
        return {"ok": True, "id": acerto_id, "atualizado": list(campos.keys())}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{acerto_id}")
def deletar_acerto(acerto_id: int):
    """Remove um acerto (apenas status 'registrado')."""
    conn = get_db()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM contratos_acertos WHERE id = %s", (acerto_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Acerto não encontrado.")
                if row["status"] != "registrado":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Não é possível excluir acerto com status '{row['status']}'."
                    )
                cur.execute("DELETE FROM contratos_acertos WHERE id = %s", (acerto_id,))
        return {"ok": True, "id": acerto_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/resumo-safra/{safra}")
def resumo_safra(safra: str, imovel_id: int = 1):
    """
    Resumo fiscal da safra para DIRPF:
    - Total de receita bruta de arrendamentos
    - Total de FUNRURAL/SENAR retidos (despesas dedutíveis)
    - Base tributável total (20%)
    """
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) AS total_acertos,
                    SUM(quantidade_sacas) AS total_sacas,
                    SUM(valor_bruto) AS receita_bruta_total,
                    SUM(valor_desconto_prod + valor_desconto_frete + outros_descontos) AS total_descontos,
                    SUM(valor_liquido) AS receita_liquida_total,
                    SUM(funrural_retido) AS funrural_total_retido,
                    SUM(senar_retido) AS senar_total_retido,
                    SUM(base_tributavel_irpf) AS base_tributavel_total,
                    COUNT(CASE WHEN nota_fiscal_emitida THEN 1 END) AS acertos_com_nf,
                    COUNT(CASE WHEN comprovante_funrural IS NOT NULL THEN 1 END) AS acertos_com_comprovante
                FROM contratos_acertos
                WHERE imovel_id = %s AND safra = %s
            """, (imovel_id, safra))
            row = dict(cur.fetchone())

        # Alertas do resumo
        alertas = []
        sem_nf = (row.get("total_acertos") or 0) - (row.get("acertos_com_nf") or 0)
        sem_comp = (row.get("total_acertos") or 0) - (row.get("acertos_com_comprovante") or 0)
        if sem_nf > 0:
            alertas.append(f"⚠️ {sem_nf} acerto(s) sem NF de Produtor emitida.")
        if sem_comp > 0:
            alertas.append(f"⚠️ {sem_comp} acerto(s) sem comprovante de retenção FUNRURAL.")

        return {
            "ok": True,
            "safra": safra,
            "resumo": row,
            "alertas": alertas,
            "nota_fiscal": (
                "Receita bruta de arrendamento entra na DIRPF como Atividade Rural. "
                "Base tributável = 20% da receita bruta (art. 59 RIR/2018). "
                "FUNRURAL e SENAR retidos são despesas dedutíveis no Livro Caixa Rural."
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── Helpers internos ──────────────────────────────────────────────────────────

def _gerar_alertas(body: AcertoCreate, calc: dict) -> list:
    alertas = []

    # FUNRURAL: verificar se foi retido
    funrural_esperado = calc["funrural_sugerido_pf"]
    if body.funrural_retido == 0:
        alertas.append({
            "tipo": "atencao",
            "mensagem": (
                f"FUNRURAL não informado. Valor esperado para PF: "
                f"R$ {funrural_esperado:,.2f} (2,5% sobre R$ {calc['valor_bruto']:,.2f})."
            ),
        })
    elif abs(body.funrural_retido - funrural_esperado) > 1.0:
        alertas.append({
            "tipo": "aviso",
            "mensagem": (
                f"FUNRURAL informado (R$ {body.funrural_retido:,.2f}) difere do esperado "
                f"para PF (R$ {funrural_esperado:,.2f}). Verifique se o arrendatário é PJ "
                f"(alíquota 1,7%) ou se há isenção aplicável."
            ),
        })

    # NF
    if not body.nota_fiscal_emitida:
        alertas.append({
            "tipo": "aviso",
            "mensagem": (
                "NF de Produtor Rural não emitida. Recomendável para escrituração "
                "na DIRPF e para o arrendatário deduzir o custo."
            ),
        })

    # Base tributável
    alertas.append({
        "tipo": "info",
        "mensagem": (
            f"Base tributável IRPF: R$ {calc['base_tributavel_irpf']:,.2f} "
            f"({body.pct_base_tributavel}% de R$ {calc['valor_bruto']:,.2f}). "
            "Lançar no Livro Caixa Rural como receita de arrendamento."
        ),
    })

    return alertas
