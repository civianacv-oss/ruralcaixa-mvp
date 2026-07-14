"""
RuralCaixa — routers/forum_cultura.py
Fórum de discussão por cultura — tópicos, respostas, curtidas, marcação de solução.

Adicione em app/main.py:
    from app.routers.forum_cultura import router as forum_cultura_router
    if forum_cultura_router: app.include_router(forum_cultura_router)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
import psycopg2
import psycopg2.extras
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/forum", tags=["Forum"])

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


class TopicoCreate(BaseModel):
    cultura_id: int
    imovel_id: int
    titulo: str = Field(..., min_length=3, max_length=200)
    conteudo: str = Field(..., min_length=3)
    tags: List[str] = Field(default_factory=list)

class RespostaCreate(BaseModel):
    topico_id: int
    imovel_id: int
    conteudo: str = Field(..., min_length=1)

class CurtirBody(BaseModel):
    imovel_id: int
    resposta_id: Optional[int] = None  # se informado, curte a resposta; senão, curte o tópico

class ResolverBody(BaseModel):
    resposta_id: int


def _produtor_do_imovel(cur, imovel_id: int) -> int:
    cur.execute("SELECT produtor_id FROM imoveis_rurais WHERE id = %s", (imovel_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Imóvel não encontrado")
    return row["produtor_id"]


@router.get("/topicos")
def listar_topicos(cultura_id: int = Query(...)):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT t.*, p.nome AS autor, t.produtor_id AS autor_id,
                       (SELECT COUNT(*) FROM forum_respostas r WHERE r.topico_id = t.id) AS respostas
                FROM forum_topicos t
                LEFT JOIN produtores p ON p.id = t.produtor_id
                WHERE t.cultura_id = %s
                ORDER BY t.fixado DESC, t.ultima_atividade DESC
            """, (cultura_id,))
            return cur.fetchall()
    finally:
        conn.close()


@router.get("/respostas")
def listar_respostas(topico_id: int = Query(...)):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # Registra visualização do tópico
            cur.execute("UPDATE forum_topicos SET visualizacoes = visualizacoes + 1 WHERE id = %s", (topico_id,))
            cur.execute("""
                SELECT r.*, p.nome AS autor, r.produtor_id AS autor_id
                FROM forum_respostas r
                LEFT JOIN produtores p ON p.id = r.produtor_id
                WHERE r.topico_id = %s
                ORDER BY r.resolucao DESC, r.data_criacao ASC
            """, (topico_id,))
            respostas = cur.fetchall()
            conn.commit()
            return respostas
    finally:
        conn.close()


@router.post("/topicos", status_code=201)
def criar_topico(dados: TopicoCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, dados.imovel_id)
            cur.execute("SELECT id FROM culturas WHERE id = %s", (dados.cultura_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Cultura não encontrada")
            cur.execute("""
                INSERT INTO forum_topicos (cultura_id, produtor_id, titulo, conteudo, tags)
                VALUES (%s,%s,%s,%s,%s)
                RETURNING *
            """, (dados.cultura_id, produtor_id, dados.titulo.strip(), dados.conteudo,
                  [t.strip() for t in dados.tags if t.strip()]))
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


@router.post("/respostas", status_code=201)
def criar_resposta(dados: RespostaCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, dados.imovel_id)
            cur.execute("SELECT id FROM forum_topicos WHERE id = %s", (dados.topico_id,))
            if not cur.fetchone():
                raise HTTPException(404, "Tópico não encontrado")
            cur.execute("""
                INSERT INTO forum_respostas (topico_id, produtor_id, conteudo)
                VALUES (%s,%s,%s)
                RETURNING *
            """, (dados.topico_id, produtor_id, dados.conteudo))
            row = cur.fetchone()
            cur.execute("""
                UPDATE forum_topicos SET ultima_atividade = NOW() WHERE id = %s
            """, (dados.topico_id,))
            conn.commit()
            return row
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/topicos/{topico_id}/curtir", status_code=200)
def curtir(topico_id: int, dados: CurtirBody):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            produtor_id = _produtor_do_imovel(cur, dados.imovel_id)
            try:
                if dados.resposta_id:
                    cur.execute("""
                        INSERT INTO forum_curtidas (produtor_id, topico_id, resposta_id)
                        VALUES (%s,%s,%s)
                    """, (produtor_id, topico_id, dados.resposta_id))
                    cur.execute("""
                        UPDATE forum_respostas SET curtidas = curtidas + 1 WHERE id = %s
                    """, (dados.resposta_id,))
                else:
                    cur.execute("""
                        INSERT INTO forum_curtidas (produtor_id, topico_id, resposta_id)
                        VALUES (%s,%s,NULL)
                    """, (produtor_id, topico_id))
                    cur.execute("""
                        UPDATE forum_topicos SET curtidas = curtidas + 1 WHERE id = %s
                    """, (topico_id,))
                conn.commit()
                return {"ok": True}
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                return {"ok": True, "ja_curtido": True}
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.put("/topicos/{topico_id}/resolver")
def marcar_resolvido(topico_id: int, dados: ResolverBody):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM forum_respostas WHERE id = %s AND topico_id = %s",
                        (dados.resposta_id, topico_id))
            if not cur.fetchone():
                raise HTTPException(404, "Resposta não encontrada neste tópico")
            cur.execute("UPDATE forum_respostas SET resolucao = FALSE WHERE topico_id = %s", (topico_id,))
            cur.execute("UPDATE forum_respostas SET resolucao = TRUE WHERE id = %s", (dados.resposta_id,))
            cur.execute("""
                UPDATE forum_topicos SET resolvido = TRUE, resposta_solucao_id = %s
                WHERE id = %s RETURNING *
            """, (dados.resposta_id, topico_id))
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
