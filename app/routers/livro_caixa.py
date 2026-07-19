"""
RuralCaixa — Router Livro Caixa Rural
Escrituração do Livro Caixa da Atividade Rural (DIRPF — Ficha Atividade Rural).
Base legal:
  - Lei 9.250/1995 art. 18 — Livro Caixa obrigatório para produtor rural PF
  - IN SRF 83/2001 — escrituração simplificada
  - RIR/2018 art. 59 — base presumida 20% ou resultado real
  - IN RFB 2.178/2024 — DIRPF 2025 (ano-base 2024)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal, List
import os, psycopg2, psycopg2.extras
from datetime import date, datetime

router = APIRouter(prefix="/livro-caixa", tags=["Livro Caixa"])
DB_URL = os.getenv("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

# ─────────────────────────────────────────────────────────────────────────────
# MODELOS
# ─────────────────────────────────────────────────────────────────────────────

class LancamentoCreate(BaseModel):
    imovel_id: int
    ano_base: int
    data_lancamento: date
    tipo: Literal["receita","despesa"]
    categoria: str                      # ex: "venda_producao","arrendamento","funrural","insumos","mao_de_obra"
    descricao: str
    valor: float
    # Origem automática
    origem: Literal["manual","acerto_contrato","nfe","esocial","importacao"] = "manual"
    origem_id: Optional[int] = None     # ID do registro de origem (ex: contratos_acertos.id)
    # Campos fiscais
    deducao_irpf: bool = True           # se entra como dedução na DIRPF
    natureza_fiscal: Optional[str] = None  # ex: "receita_bruta","despesa_custeio","investimento"
    documento: Optional[str] = None    # NF, recibo, etc.
    observacoes: Optional[str] = None

class LancamentoUpdate(BaseModel):
    descricao: Optional[str] = None
    valor: Optional[float] = None
    categoria: Optional[str] = None
    documento: Optional[str] = None
    deducao_irpf: Optional[bool] = None
    observacoes: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# CRUD LANÇAMENTOS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{imovel_id}")
def listar_lancamentos(
    imovel_id: int,
    ano_base: int = Query(default=datetime.now().year),
    tipo: Optional[str] = None,
    categoria: Optional[str] = None,
    origem: Optional[str] = None,
):
    db = get_db()
    cur = db.cursor()
    q = "SELECT * FROM livro_caixa_lancamentos WHERE imovel_id = %s AND ano_base = %s"
    params = [imovel_id, ano_base]
    if tipo:      q += " AND tipo = %s";      params.append(tipo)
    if categoria: q += " AND categoria = %s"; params.append(categoria)
    if origem:    q += " AND origem = %s";    params.append(origem)
    q += " ORDER BY data_lancamento ASC, criado_em ASC"
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()
    return rows

@router.post("/")
def criar_lancamento(data: LancamentoCreate):
    db = get_db()
    cur = db.cursor()

    # Verificar duplicata de origem
    if data.origem_id and data.origem != "manual":
        cur.execute("""
            SELECT id FROM livro_caixa_lancamentos
            WHERE imovel_id = %s AND origem = %s AND origem_id = %s AND tipo = %s
        """, (data.imovel_id, data.origem, data.origem_id, data.tipo))
        if cur.fetchone():
            db.close()
            raise HTTPException(status_code=409, detail=f"Lançamento de origem {data.origem}#{data.origem_id} já existe no Livro Caixa.")

    cur.execute("""
        INSERT INTO livro_caixa_lancamentos
            (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
             valor, origem, origem_id, deducao_irpf, natureza_fiscal, documento, observacoes)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (data.imovel_id, data.ano_base, data.data_lancamento, data.tipo,
          data.categoria, data.descricao, data.valor, data.origem, data.origem_id,
          data.deducao_irpf, data.natureza_fiscal, data.documento, data.observacoes))
    new_id = cur.fetchone()["id"]
    db.commit()
    db.close()
    return {"id": new_id}

@router.post("/from-acerto/{acerto_id}")
def lancar_acerto_no_livro(acerto_id: int):
    """Lança automaticamente um acerto de contrato no Livro Caixa (receita + deduções)."""
    db = get_db()
    cur = db.cursor()

    cur.execute("SELECT * FROM contratos_acertos WHERE id = %s", (acerto_id,))
    acerto = cur.fetchone()
    if not acerto:
        db.close()
        raise HTTPException(status_code=404, detail="Acerto não encontrado")

    ano_base = int(acerto["safra"].split("/")[0]) if "/" in str(acerto["safra"]) else datetime.now().year
    data_ref = acerto["data_acerto"] or date.today()
    lancamentos_criados = []

    # 1. Receita bruta
    cur.execute("""
        SELECT id FROM livro_caixa_lancamentos
        WHERE origem = 'acerto_contrato' AND origem_id = %s AND tipo = 'receita'
    """, (acerto_id,))
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO livro_caixa_lancamentos
                (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
                 valor, origem, origem_id, deducao_irpf, natureza_fiscal, documento)
            VALUES (%s,%s,%s,'receita','venda_producao',%s,%s,'acerto_contrato',%s,true,'receita_bruta',%s)
            RETURNING id
        """, (acerto["imovel_id"], ano_base, data_ref,
              f"Receita bruta — {acerto['produto'].upper()} safra {acerto['safra']} ({acerto['qtd_sacas']} sc × R$ {acerto['valor_por_saca']})",
              float(acerto["valor_bruto"]), acerto_id, acerto.get("numero_nf")))
        lancamentos_criados.append({"tipo":"receita", "id": cur.fetchone()["id"], "valor": float(acerto["valor_bruto"])})

    # 2. Desconto PROD (despesa dedutível)
    if float(acerto.get("valor_desconto_prod", 0)) > 0:
        cur.execute("""
            SELECT id FROM livro_caixa_lancamentos
            WHERE origem = 'acerto_contrato' AND origem_id = %s AND categoria = 'desconto_prod'
        """, (acerto_id,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO livro_caixa_lancamentos
                    (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
                     valor, origem, origem_id, deducao_irpf, natureza_fiscal)
                VALUES (%s,%s,%s,'despesa','desconto_prod','Desconto PROD — comercialização',%s,'acerto_contrato',%s,true,'despesa_custeio')
                RETURNING id
            """, (acerto["imovel_id"], ano_base, data_ref, float(acerto["valor_desconto_prod"]), acerto_id))
            lancamentos_criados.append({"tipo":"despesa_prod", "id": cur.fetchone()["id"], "valor": float(acerto["valor_desconto_prod"])})

    # 3. FUNRURAL retido (despesa dedutível)
    if float(acerto.get("funrural_retido", 0)) > 0:
        cur.execute("""
            SELECT id FROM livro_caixa_lancamentos
            WHERE origem = 'acerto_contrato' AND origem_id = %s AND categoria = 'funrural'
        """, (acerto_id,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO livro_caixa_lancamentos
                    (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
                     valor, origem, origem_id, deducao_irpf, natureza_fiscal)
                VALUES (%s,%s,%s,'despesa','funrural','FUNRURAL retido pelo adquirente',%s,'acerto_contrato',%s,true,'despesa_custeio')
                RETURNING id
            """, (acerto["imovel_id"], ano_base, data_ref, float(acerto["funrural_retido"]), acerto_id))
            lancamentos_criados.append({"tipo":"despesa_funrural", "id": cur.fetchone()["id"], "valor": float(acerto["funrural_retido"])})

    # 4. SENAR retido (despesa dedutível)
    if float(acerto.get("senar_retido", 0)) > 0:
        cur.execute("""
            SELECT id FROM livro_caixa_lancamentos
            WHERE origem = 'acerto_contrato' AND origem_id = %s AND categoria = 'senar'
        """, (acerto_id,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO livro_caixa_lancamentos
                    (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
                     valor, origem, origem_id, deducao_irpf, natureza_fiscal)
                VALUES (%s,%s,%s,'despesa','senar','SENAR retido pelo adquirente',%s,'acerto_contrato',%s,true,'despesa_custeio')
                RETURNING id
            """, (acerto["imovel_id"], ano_base, data_ref, float(acerto["senar_retido"]), acerto_id))
            lancamentos_criados.append({"tipo":"despesa_senar", "id": cur.fetchone()["id"], "valor": float(acerto["senar_retido"])})

    # Atualizar status do acerto
    cur.execute("""
        UPDATE contratos_acertos SET status = 'lancado_livro_caixa', atualizado_em = NOW()
        WHERE id = %s AND status IN ('registrado','conferido')
    """, (acerto_id,))

    db.commit()
    db.close()
    return {
        "ok": True,
        "lancamentos_criados": lancamentos_criados,
        "total_lancamentos": len(lancamentos_criados),
        "receita_bruta": float(acerto["valor_bruto"]),
        "total_despesas": sum(l["valor"] for l in lancamentos_criados if "despesa" in l["tipo"]),
    }

@router.patch("/{id}")
def atualizar_lancamento(id: int, data: LancamentoUpdate):
    db = get_db()
    cur = db.cursor()
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        db.close()
        return {"ok": True}
    updates["atualizado_em"] = datetime.now()
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    cur.execute(f"UPDATE livro_caixa_lancamentos SET {set_clause} WHERE id = %s",
                list(updates.values()) + [id])
    db.commit()
    db.close()
    return {"ok": True}

@router.delete("/{id}")
def excluir_lancamento(id: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT origem FROM livro_caixa_lancamentos WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    cur.execute("DELETE FROM livro_caixa_lancamentos WHERE id = %s", (id,))
    db.commit()
    db.close()
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────
# APURAÇÃO ANUAL
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{imovel_id}/apuracao/{ano_base}")
def apuracao_anual(imovel_id: int, ano_base: int):
    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT tipo, categoria, SUM(valor) AS total
        FROM livro_caixa_lancamentos
        WHERE imovel_id = %s AND ano_base = %s AND deducao_irpf = true
        GROUP BY tipo, categoria
        ORDER BY tipo DESC, total DESC
    """, (imovel_id, ano_base))
    por_categoria = [dict(r) for r in cur.fetchall()]

    receita_bruta = sum(float(r["total"]) for r in por_categoria if r["tipo"] == "receita")
    despesas      = sum(float(r["total"]) for r in por_categoria if r["tipo"] == "despesa")
    resultado_real = receita_bruta - despesas
    base_presumida = receita_bruta * 0.20  # art. 59 RIR/2018

    # Mês a mês
    cur.execute("""
        SELECT EXTRACT(MONTH FROM data_lancamento)::int AS mes,
               tipo, SUM(valor) AS total
        FROM livro_caixa_lancamentos
        WHERE imovel_id = %s AND ano_base = %s
        GROUP BY mes, tipo
        ORDER BY mes ASC
    """, (imovel_id, ano_base))
    mensal_raw = cur.fetchall()
    mensal = {}
    for r in mensal_raw:
        m = r["mes"]
        if m not in mensal: mensal[m] = {"receita":0, "despesa":0}
        mensal[m][r["tipo"]] = float(r["total"])

    db.close()
    return {
        "ano_base": ano_base,
        "receita_bruta": receita_bruta,
        "despesas_dedutiveis": despesas,
        "resultado_real": resultado_real,
        "base_presumida_20pct": base_presumida,
        "por_categoria": por_categoria,
        "mensal": [{"mes": m, **v} for m, v in sorted(mensal.items())],
        "recomendacao_regime": "resultado_real" if resultado_real < base_presumida else "base_presumida",
        "economia_regime_real": max(0, base_presumida - resultado_real),
    }

# ─────────────────────────────────────────────────────────────────────────────
# FECHAMENTO MENSAL (consolidação por cima, sem duplicar os lançamentos)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{imovel_id}/fechar/{ano_base}/{mes}")
def fechar_mes(imovel_id: int, ano_base: int, mes: int):
    if not (1 <= mes <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido (use 1-12)")

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        SELECT tipo, categoria, SUM(valor) AS total
        FROM livro_caixa_lancamentos
        WHERE imovel_id = %s
          AND ano_base = %s
          AND EXTRACT(MONTH FROM data_lancamento) = %s
        GROUP BY tipo, categoria
    """, (imovel_id, ano_base, mes))
    consolidado = cur.fetchall()

    if not consolidado:
        db.close()
        return {"ok": True, "linhas": 0, "aviso": "Nenhum lançamento encontrado nesse período."}

    cur.execute("""
        DELETE FROM livro_caixa_fechamentos
        WHERE imovel_id = %s AND ano_base = %s AND mes = %s
    """, (imovel_id, ano_base, mes))

    for linha in consolidado:
        cur.execute("""
            INSERT INTO livro_caixa_fechamentos
                (imovel_id, ano_base, mes, tipo, categoria, total)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (imovel_id, ano_base, mes, linha["tipo"], linha["categoria"], float(linha["total"])))

    db.commit()
    db.close()
    return {"ok": True, "linhas": len(consolidado)}


@router.get("/{imovel_id}/fechamento/{ano_base}/{mes}")
def obter_fechamento(imovel_id: int, ano_base: int, mes: int):
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        SELECT tipo, categoria, total, fechado_em
        FROM livro_caixa_fechamentos
        WHERE imovel_id = %s AND ano_base = %s AND mes = %s
        ORDER BY tipo DESC, total DESC
    """, (imovel_id, ano_base, mes))
    linhas = [dict(r) for r in cur.fetchall()]
    db.close()

    if not linhas:
        return {"fechado": False, "linhas": []}

    receitas = sum(float(l["total"]) for l in linhas if l["tipo"] == "receita")
    despesas = sum(float(l["total"]) for l in linhas if l["tipo"] == "despesa")

    return {
        "fechado": True,
        "fechado_em": linhas[0]["fechado_em"].isoformat(),
        "receitas": receitas,
        "despesas": despesas,
        "saldo": receitas - despesas,
        "linhas": linhas,
    }


@router.delete("/{imovel_id}/fechamento/{ano_base}/{mes}")
def reabrir_mes(imovel_id: int, ano_base: int, mes: int):
    """
    Reabre um mês fechado — apaga o snapshot de livro_caixa_fechamentos
    pra permitir retificação. Os lançamentos brutos (livro_caixa_lancamentos)
    NÃO são afetados; só o resumo consolidado é removido, e um novo
    "Fechar Mês" pode ser feito depois de corrigir os lançamentos.
    """
    db = get_db()
    cur = db.cursor()
    cur.execute("""
        DELETE FROM livro_caixa_fechamentos
        WHERE imovel_id = %s AND ano_base = %s AND mes = %s
    """, (imovel_id, ano_base, mes))
    linhas_removidas = cur.rowcount
    db.commit()
    db.close()

    if linhas_removidas == 0:
        raise HTTPException(status_code=404, detail="Esse período não está fechado.")

    return {"ok": True, "linhas_removidas": linhas_removidas}
