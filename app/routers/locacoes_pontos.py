"""
RuralCaixa — routers/locacoes_pontos.py
Módulo de Locação de Maquinário e Ponto Comercial Informal.

Regra de classificação fiscal:
  - Locação DE_TERCEIRO (produtor alugou máquina de alguém para usar na
    própria produção) -> RURAL -> lançada automaticamente no Livro Caixa
    (livro_caixa_lancamentos) como despesa dedutível.
  - Locação PARA_TERCEIRO (produtor é dono e alugou para outra pessoa)
    -> COMERCIAL -> fica só neste módulo, fora do LCDPR.
  - Pontos comerciais e seus movimentos -> sempre COMERCIAL.

Adicione em app/main.py:
    from app.routers.locacoes_pontos import router as locacoes_pontos_router
    if locacoes_pontos_router: app.include_router(locacoes_pontos_router)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import date, datetime
import os
import psycopg2
import psycopg2.extras
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/compravenda", tags=["Locacoes e Pontos Comerciais"])

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ─────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────

class LocacaoCreate(BaseModel):
    imovel_id: int
    maquina: str
    tipo: str  # trator, colheitadeira, pulverizador, arado, grade, semeadeira, caminhao, outro
    modelo: Optional[str] = None
    ano_fabricacao: Optional[int] = None
    valor_compra: Optional[float] = None
    diaria_valor: float = 0
    hora_valor: float = 0
    locador: str
    locatario: str
    direcao: Literal["DE_TERCEIRO", "PARA_TERCEIRO"]
    data_locacao_inicio: date = Field(default_factory=date.today)
    data_locacao_fim: Optional[date] = None
    horas_trabalhadas: Optional[float] = None
    valor_total_locacao: Optional[float] = None
    observacoes: Optional[str] = None


class PontoComercialCreate(BaseModel):
    imovel_id: int
    nome: str
    tipo: str  # fisico, online, informal, feira, atacado, varejo
    endereco: Optional[str] = None
    telefone: Optional[str] = None
    whatsapp: Optional[str] = None
    responsavel: Optional[str] = None
    data_abertura: Optional[date] = None
    observacoes: Optional[str] = None


class MovimentoPontoCreate(BaseModel):
    ponto_id: int
    tipo: Literal["entrada", "saida"]
    produto_nome: Optional[str] = None
    quantidade: Optional[float] = None
    valor_unitario: Optional[float] = None
    valor_total: float
    cliente_fornecedor: Optional[str] = None
    forma_pagamento: str
    status_pagamento: str = "pago"
    data_movimento: date = Field(default_factory=date.today)
    observacoes: Optional[str] = None
    nota_fiscal: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# LOCAÇÕES DE MÁQUINAS
# ─────────────────────────────────────────────────────────────

@router.post("/locacoes", status_code=201)
def registrar_locacao(dados: LocacaoCreate):
    """
    Cria a locação. Se direcao=DE_TERCEIRO (despesa rural), lança
    automaticamente no Livro Caixa (livro_caixa_lancamentos) — mesmo
    padrão usado em /livro-caixa/from-acerto para acertos de contrato.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        valor_total = dados.valor_total_locacao
        if valor_total is None and dados.horas_trabalhadas and dados.hora_valor:
            valor_total = dados.horas_trabalhadas * dados.hora_valor

        cur.execute("""
            INSERT INTO locacoes_maquinas
                (imovel_id, maquina, tipo, modelo, ano_fabricacao, valor_compra,
                 diaria_valor, hora_valor, locador, locatario, direcao,
                 data_locacao_inicio, data_locacao_fim, horas_trabalhadas,
                 valor_total_locacao, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id, classificacao
        """, (dados.imovel_id, dados.maquina, dados.tipo, dados.modelo, dados.ano_fabricacao,
              dados.valor_compra, dados.diaria_valor, dados.hora_valor, dados.locador,
              dados.locatario, dados.direcao, dados.data_locacao_inicio, dados.data_locacao_fim,
              dados.horas_trabalhadas, valor_total, dados.observacoes))
        row = cur.fetchone()
        locacao_id = row["id"]
        classificacao = row["classificacao"]

        lancamento_id = None
        if classificacao == "RURAL" and valor_total:
            # Evita duplicar se o registro já tiver sido lançado antes
            cur.execute("""
                SELECT id FROM livro_caixa_lancamentos
                WHERE imovel_id = %s AND origem = 'locacao_maquina' AND origem_id = %s
            """, (dados.imovel_id, locacao_id))
            existente = cur.fetchone()
            if existente:
                lancamento_id = existente["id"]
            else:
                cur.execute("""
                    INSERT INTO livro_caixa_lancamentos
                        (imovel_id, ano_base, data_lancamento, tipo, categoria, descricao,
                         valor, origem, origem_id, deducao_irpf, natureza_fiscal, observacoes)
                    VALUES (%s,%s,%s,'despesa','locacao_maquinario',%s,%s,'locacao_maquina',%s,true,'despesa_custeio',%s)
                    RETURNING id
                """, (dados.imovel_id, dados.data_locacao_inicio.year, dados.data_locacao_inicio,
                      f"Locação de {dados.maquina} — {dados.locador}", valor_total, locacao_id,
                      dados.observacoes))
                lancamento_id = cur.fetchone()["id"]

            cur.execute("UPDATE locacoes_maquinas SET lancamento_lcdpr_id = %s WHERE id = %s",
                        (lancamento_id, locacao_id))

        conn.commit()
        return {
            "id": locacao_id,
            "classificacao": classificacao,
            "lancamento_lcdpr_id": lancamento_id,
            "valor_total_locacao": valor_total,
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/locacoes")
def listar_locacoes(
    imovel_id: int = Query(...),
    classificacao: Optional[Literal["RURAL", "COMERCIAL"]] = Query(None),
    status: Optional[str] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        filtros = ["imovel_id = %s"]
        params: list = [imovel_id]
        if classificacao:
            filtros.append("classificacao = %s"); params.append(classificacao)
        if status:
            filtros.append("status = %s"); params.append(status)
        cur.execute(f"""
            SELECT * FROM locacoes_maquinas
            WHERE {' AND '.join(filtros)}
            ORDER BY data_locacao_inicio DESC
        """, params)
        return cur.fetchall()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# PONTOS COMERCIAIS
# ─────────────────────────────────────────────────────────────

@router.post("/pontos-comerciais", status_code=201)
def criar_ponto_comercial(dados: PontoComercialCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO pontos_comerciais
                (imovel_id, nome, tipo, endereco, telefone, whatsapp, responsavel,
                 data_abertura, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (dados.imovel_id, dados.nome, dados.tipo, dados.endereco, dados.telefone,
              dados.whatsapp, dados.responsavel, dados.data_abertura, dados.observacoes))
        pid = cur.fetchone()["id"]
        conn.commit()
        return {"id": pid, "classificacao": "COMERCIAL"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/pontos-comerciais")
def listar_pontos_comerciais(imovel_id: int = Query(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM pontos_comerciais WHERE imovel_id = %s ORDER BY nome", (imovel_id,))
        return cur.fetchall()
    finally:
        conn.close()


@router.post("/pontos-comerciais/movimentos", status_code=201)
def registrar_movimento_ponto(dados: MovimentoPontoCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO movimentos_ponto
                (ponto_id, tipo, produto_nome, quantidade, valor_unitario, valor_total,
                 cliente_fornecedor, forma_pagamento, status_pagamento, data_movimento,
                 observacoes, nota_fiscal)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (dados.ponto_id, dados.tipo, dados.produto_nome, dados.quantidade,
              dados.valor_unitario, dados.valor_total, dados.cliente_fornecedor,
              dados.forma_pagamento, dados.status_pagamento, dados.data_movimento,
              dados.observacoes, dados.nota_fiscal))
        mid = cur.fetchone()["id"]
        conn.commit()
        return {"id": mid, "classificacao": "COMERCIAL"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/pontos-comerciais/{ponto_id}/movimentos")
def listar_movimentos_ponto(ponto_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM movimentos_ponto WHERE ponto_id = %s ORDER BY data_movimento DESC
        """, (ponto_id,))
        return cur.fetchall()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# RESUMO RURAL x COMERCIAL — visão consolidada, sem misturar contas
# ─────────────────────────────────────────────────────────────

@router.get("/resumo-classificacao/{imovel_id}")
def resumo_classificacao(imovel_id: int, ano: Optional[int] = Query(None)):
    """Retorna o total RURAL (dedutível no LCDPR) x COMERCIAL (gestão separada)."""
    ano_filtro = ano or datetime.now().year
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT classificacao, SUM(valor_total_locacao) AS total
            FROM locacoes_maquinas
            WHERE imovel_id = %s AND EXTRACT(YEAR FROM data_locacao_inicio) = %s
            GROUP BY classificacao
        """, (imovel_id, ano_filtro))
        locacoes = {r["classificacao"]: float(r["total"] or 0) for r in cur.fetchall()}

        cur.execute("""
            SELECT COALESCE(SUM(mp.valor_total), 0) AS total
            FROM movimentos_ponto mp
            JOIN pontos_comerciais p ON p.id = mp.ponto_id
            WHERE p.imovel_id = %s AND EXTRACT(YEAR FROM mp.data_movimento) = %s
        """, (imovel_id, ano_filtro))
        pontos_total = float(cur.fetchone()["total"])

        cur.execute("""
            SELECT classificacao, COALESCE(SUM(valor_total), 0) AS total
            FROM cv_vendas WHERE imovel_id = %s AND EXTRACT(YEAR FROM data_venda) = %s
            GROUP BY classificacao
        """, (imovel_id, ano_filtro))
        cv_vendas = {r["classificacao"]: float(r["total"]) for r in cur.fetchall()}

        return {
            "ano": ano_filtro,
            "rural_lcdpr": {
                "locacao_maquinario_despesa": locacoes.get("RURAL", 0),
            },
            "comercial_fora_lcdpr": {
                "locacao_maquinario_receita": locacoes.get("COMERCIAL", 0),
                "ponto_comercial_movimentado": pontos_total,
                "compra_venda_animais_producao": cv_vendas.get("COMERCIAL", 0),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
