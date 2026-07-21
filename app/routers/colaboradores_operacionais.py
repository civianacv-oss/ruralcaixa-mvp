"""
app/routers/colaboradores_operacionais.py — RuralCaixa MVP

Cadastro LEVE (nome + telefone, sem CPF) pra trabalhadores operacionais
que só precisam reportar consumo de insumo pelo bot (Telegram/WhatsApp).

Ver migrate_colaboradores_operacionais_v1.py pro contexto completo.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.db import get_db

router = APIRouter(prefix="/imoveis-rurais", tags=["Colaboradores Operacionais"])


class ColaboradorOperacionalIn(BaseModel):
    nome: str
    telefone: str


@router.get("/{imovel_id}/colaboradores-operacionais")
def listar_colaboradores_operacionais(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, nome, telefone, telegram_chat_id, created_at
            FROM colaboradores_operacionais
            WHERE imovel_id = %s AND ativo = TRUE
            ORDER BY created_at ASC
        """, (imovel_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/{imovel_id}/colaboradores-operacionais")
def adicionar_colaborador_operacional(imovel_id: int, data: ColaboradorOperacionalIn):
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("SELECT id FROM imoveis_rurais WHERE id = %s", (imovel_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Imóvel não encontrado.")

        nome = data.nome.strip()
        telefone = data.telefone.strip()
        if not nome:
            raise HTTPException(status_code=400, detail="Informe o nome do colaborador.")
        if len(telefone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")) < 8:
            raise HTTPException(status_code=400, detail="Telefone inválido.")

        cur.execute("""
            INSERT INTO colaboradores_operacionais (imovel_id, nome, telefone)
            VALUES (%s, %s, %s)
            RETURNING id, nome, telefone, telegram_chat_id, created_at
        """, (imovel_id, nome, telefone))
        novo = dict(cur.fetchone())
        conn.commit()
        return {"ok": True, **novo}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{imovel_id}/colaboradores-operacionais/{colaborador_id}")
def remover_colaborador_operacional(imovel_id: int, colaborador_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE colaboradores_operacionais
            SET ativo = FALSE
            WHERE id = %s AND imovel_id = %s AND ativo = TRUE
        """, (colaborador_id, imovel_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Colaborador não encontrado ou já removido.")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
