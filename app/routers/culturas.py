"""
RuralCaixa — routers/culturas.py
Módulo Gestão de Culturas: catálogo colaborativo, sugestões de produtores,
protocolos de cultivo e casos de sucesso.

Modelo de dados: é uma base de conhecimento COMPARTILHADA entre produtores
(como o fórum), não um cadastro privado por imóvel — imovel_id é usado para
identificar o produtor autor, não para segregar a visibilidade dos dados.

Adicione em app/main.py:
    from app.routers.culturas import router as culturas_router
    if culturas_router: app.include_router(culturas_router)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import date, datetime
import psycopg2
import psycopg2.extras
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/culturas", tags=["Culturas"])

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _produtor_do_imovel(cur, imovel_id: int) -> int:
    cur.execute("SELECT produtor_id FROM imoveis_rurais WHERE id = %s", (imovel_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Imóvel não encontrado")
    return row["produtor_id"]


# ─────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────

class SugestaoCulturaCreate(BaseModel):
    imovel_id: int
    nome: str = Field(..., min_length=2, max_length=100)
    descricao: Optional[str] = None
    motivo: Optional[str] = None
    experiencia: Optional[str] = None
    resultados_esperados: Optional[str] = None

class SugestaoAvaliar(BaseModel):
    status: Literal["aprovado", "rejeitado", "em_analise"]
    parecer: Optional[str] = None
    analisado_por: Optional[int] = None  # produtor_id de quem avaliou, se disponível

class ProtocoloCreate(BaseModel):
    imovel_id: int
    cultura_id: int
    titulo: str = Field(..., min_length=3, max_length=200)
    descricao: Optional[str] = None
    tipo: Literal["plantio", "tratos_culturais", "colheita", "pos_colheita"] = "tratos_culturais"
    dificuldade: Literal["basico", "intermediario", "avancado"] = "intermediario"
    tempo_execucao: Optional[str] = None
    epoca_aplicacao: Optional[str] = None
    materiais: Optional[str] = None
    equipamentos: Optional[str] = None
    passos: List[str] = Field(default_factory=list)
    dicas: Optional[str] = None
    resultados_esperados: Optional[str] = None
    fonte: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

class AvaliacaoProtocoloCreate(BaseModel):
    imovel_id: int
    nota: int = Field(..., ge=1, le=5)
    comentario: Optional[str] = None
    utilizou: bool = False
    resultado: Optional[str] = None

class PraticaSucessoCreate(BaseModel):
    imovel_id: int
    cultura_id: Optional[int] = None
    titulo: str = Field(..., min_length=3, max_length=200)
    descricao: Optional[str] = None
    desafio: Optional[str] = None
    solucao: Optional[str] = None
    resultados: Optional[str] = None
    periodo_inicio: Optional[date] = None
    periodo_fim: Optional[date] = None
    area_hectare: Optional[float] = None
    producao_total: Optional[float] = None
    produtividade: Optional[float] = None
    custo_total: Optional[float] = None
    receita_total: Optional[float] = None


# ─────────────────────────────────────────────────────────────
# CATÁLOGO DE CULTURAS
# ─────────────────────────────────────────────────────────────

@router.get("/{imovel_id}")
def listar_culturas(imovel_id: int, status_filtro: Optional[str] = Query(default=None, alias="status")):
    """Catálogo compartilhado: culturas publicadas por qualquer produtor,
    mais rascunhos/próprias do produtor deste imóvel."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, imovel_id)
            filtros = ["(status = 'ativo' OR created_by = %s)"]
            params = [produtor_id]
            if status_filtro:
                filtros.append("status = %s")
                params.append(status_filtro)
            cur.execute(f"""
                SELECT * FROM culturas WHERE {' AND '.join(filtros)}
                ORDER BY nome ASC
            """, params)
            return cur.fetchall()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# SUGESTÕES DE CULTURAS
# ─────────────────────────────────────────────────────────────

@router.get("/sugestoes/{imovel_id}")
def listar_sugestoes(imovel_id: int):
    """Sugestões do produtor deste imóvel + fila de pendentes/em análise
    (para permitir que qualquer produtor avalie sugestões da comunidade)."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, imovel_id)
            cur.execute("""
                SELECT s.*, p.nome AS produtor_nome
                FROM sugestoes_culturas s
                LEFT JOIN produtores p ON p.id = s.produtor_id
                WHERE s.produtor_id = %s OR s.status IN ('pendente', 'em_analise')
                ORDER BY s.data_sugestao DESC
            """, (produtor_id,))
            return cur.fetchall()
    finally:
        conn.close()


@router.post("/sugerir", status_code=201)
def sugerir_cultura(dados: SugestaoCulturaCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, dados.imovel_id)
            cur.execute("""
                INSERT INTO sugestoes_culturas
                    (produtor_id, imovel_id, nome, descricao, motivo, experiencia, resultados_esperados)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (produtor_id, dados.imovel_id, dados.nome.strip(), dados.descricao,
                  dados.motivo, dados.experiencia, dados.resultados_esperados))
            row = cur.fetchone()
            conn.commit()
            return row
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.put("/sugestoes/{sugestao_id}/avaliar")
def avaliar_sugestao(sugestao_id: int, dados: SugestaoAvaliar):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM sugestoes_culturas WHERE id = %s", (sugestao_id,))
            sugestao = cur.fetchone()
            if not sugestao:
                raise HTTPException(404, "Sugestão não encontrada")

            cultura_id = sugestao["cultura_id"]
            # Se aprovado e ainda não gerou uma cultura no catálogo, cria agora
            if dados.status == "aprovado" and not cultura_id:
                cur.execute("""
                    INSERT INTO culturas (nome, descricao, tipo, status, created_by)
                    VALUES (%s,%s,'temporaria','ativo',%s)
                    RETURNING id
                """, (sugestao["nome"], sugestao["descricao"], sugestao["produtor_id"]))
                cultura_id = cur.fetchone()["id"]

            cur.execute("""
                UPDATE sugestoes_culturas
                SET status = %s, parecer = %s, analisado_por = %s,
                    data_analise = NOW(), cultura_id = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING *
            """, (dados.status, dados.parecer, dados.analisado_por, cultura_id, sugestao_id))
            row = cur.fetchone()
            conn.commit()
            return row
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# PROTOCOLOS DE CULTIVO
# ─────────────────────────────────────────────────────────────

@router.get("/protocolos/{imovel_id}")
def listar_protocolos(imovel_id: int, cultura_id: Optional[int] = Query(default=None)):
    """Biblioteca compartilhada de protocolos publicados por qualquer produtor."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            filtros = ["status = 'publicado'"]
            params: list = []
            if cultura_id:
                filtros.append("cultura_id = %s")
                params.append(cultura_id)
            cur.execute(f"""
                SELECT pc.*, c.nome AS cultura_nome,
                       COALESCE(AVG(ap.nota), 0) AS nota_media,
                       COUNT(ap.id) AS total_avaliacoes
                FROM protocolos_cultivo pc
                LEFT JOIN culturas c ON c.id = pc.cultura_id
                LEFT JOIN avaliacoes_protocolos ap ON ap.protocolo_id = pc.id
                WHERE {' AND '.join(filtros)}
                GROUP BY pc.id, c.nome
                ORDER BY pc.nivel_confianca DESC, pc.created_at DESC
            """, params)
            return cur.fetchall()
    finally:
        conn.close()


@router.post("/protocolos", status_code=201)
def criar_protocolo(dados: ProtocoloCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, dados.imovel_id)
            cur.execute("SELECT id FROM culturas WHERE id = %s", (dados.cultura_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Cultura não encontrada")

            cur.execute("""
                INSERT INTO protocolos_cultivo
                    (cultura_id, produtor_id, titulo, descricao, tipo, dificuldade,
                     tempo_execucao, epoca_aplicacao, materiais, equipamentos,
                     passos, dicas, resultados_esperados, fonte, tags, created_by, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'publicado')
                RETURNING *
            """, (
                dados.cultura_id, produtor_id, dados.titulo.strip(), dados.descricao,
                dados.tipo, dados.dificuldade, dados.tempo_execucao, dados.epoca_aplicacao,
                dados.materiais, dados.equipamentos,
                psycopg2.extras.Json([p for p in dados.passos if p and p.strip()]),
                dados.dicas, dados.resultados_esperados, dados.fonte, dados.tags, produtor_id,
            ))
            row = cur.fetchone()
            conn.commit()
            return row
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/protocolos/{protocolo_id}/avaliar", status_code=201)
def avaliar_protocolo(protocolo_id: int, dados: AvaliacaoProtocoloCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, dados.imovel_id)
            cur.execute("SELECT id FROM protocolos_cultivo WHERE id = %s", (protocolo_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Protocolo não encontrado")
            cur.execute("""
                INSERT INTO avaliacoes_protocolos
                    (protocolo_id, produtor_id, nota, comentario, utilizou, resultado)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (protocolo_id, produtor_id) DO UPDATE SET
                    nota = EXCLUDED.nota, comentario = EXCLUDED.comentario,
                    utilizou = EXCLUDED.utilizou, resultado = EXCLUDED.resultado
                RETURNING *
            """, (protocolo_id, produtor_id, dados.nota, dados.comentario,
                  dados.utilizou, dados.resultado))
            row = cur.fetchone()
            conn.commit()
            return row
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# CASOS DE SUCESSO
# ─────────────────────────────────────────────────────────────

@router.get("/praticas-sucesso/{imovel_id}")
def listar_praticas_sucesso(imovel_id: int, cultura_id: Optional[int] = Query(default=None)):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            filtros = ["status = 'publicado'"]
            params: list = []
            if cultura_id:
                filtros.append("cultura_id = %s")
                params.append(cultura_id)
            cur.execute(f"""
                SELECT ps.*, c.nome AS cultura_nome, p.nome AS produtor_nome
                FROM praticas_sucesso ps
                LEFT JOIN culturas c ON c.id = ps.cultura_id
                LEFT JOIN produtores p ON p.id = ps.produtor_id
                WHERE {' AND '.join(filtros)}
                ORDER BY ps.destaque DESC, ps.created_at DESC
            """, params)
            return cur.fetchall()
    finally:
        conn.close()


@router.post("/praticas-sucesso", status_code=201)
def criar_pratica_sucesso(dados: PraticaSucessoCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, dados.imovel_id)
            lucro = None
            if dados.receita_total is not None and dados.custo_total is not None:
                lucro = dados.receita_total - dados.custo_total
            cur.execute("""
                INSERT INTO praticas_sucesso
                    (produtor_id, imovel_id, cultura_id, titulo, descricao, desafio, solucao,
                     resultados, periodo_inicio, periodo_fim, area_hectare, producao_total,
                     produtividade, custo_total, receita_total, lucro, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'publicado')
                RETURNING *
            """, (
                produtor_id, dados.imovel_id, dados.cultura_id, dados.titulo.strip(),
                dados.descricao, dados.desafio, dados.solucao, dados.resultados,
                dados.periodo_inicio, dados.periodo_fim, dados.area_hectare,
                dados.producao_total, dados.produtividade, dados.custo_total,
                dados.receita_total, lucro,
            ))
            row = cur.fetchone()
            conn.commit()
            return row
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()
