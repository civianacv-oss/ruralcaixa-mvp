"""
Administradores de imóvel — vínculo operacional sem participação societária.

Resolve a causa raiz do bug do duplicado Fazenda Emboque: antes disso, a
única forma de dar acesso a uma propriedade era via participacoes_imovel
como cotitular (percentual > 0), o que fazia o fluxo de "incluir pessoa"
ser confundido com "incluir sócio" e gerar cadastros duplicados.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import date
from app.db import get_db

router = APIRouter(prefix="/imoveis-rurais", tags=["Administradores"])


class AdicionarAdministrador(BaseModel):
    produtor_id: int


@router.get("/{imovel_id}/administradores")
def listar_administradores(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT pi.produtor_id, pi.vigencia_inicio, p.nome, p.cpf
            FROM participacoes_imovel pi
            JOIN produtores p ON p.id = pi.produtor_id
            WHERE pi.imovel_id = %s
              AND pi.tipo_vinculo = 'administrador'
              AND pi.vigencia_fim IS NULL
            ORDER BY pi.vigencia_inicio ASC
        """, (imovel_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/{imovel_id}/administradores")
def adicionar_administrador(imovel_id: int, data: AdicionarAdministrador):
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("SELECT id, nome FROM produtores WHERE id = %s", (data.produtor_id,))
        produtor = cur.fetchone()
        if not produtor:
            raise HTTPException(status_code=404, detail="Produtor não encontrado. A pessoa precisa ter um cadastro no sistema antes de virar administrador de uma propriedade.")

        cur.execute("SELECT id FROM imoveis_rurais WHERE id = %s", (imovel_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Imóvel não encontrado.")

        # Evita duplicar se já for administrador ativo
        cur.execute("""
            SELECT id FROM participacoes_imovel
            WHERE imovel_id = %s AND produtor_id = %s
              AND tipo_vinculo = 'administrador' AND vigencia_fim IS NULL
        """, (imovel_id, data.produtor_id))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Essa pessoa já é administradora dessa propriedade.")

        cur.execute("""
            INSERT INTO participacoes_imovel
                (imovel_id, produtor_id, percentual, nome_participante,
                 vigencia_inicio, tipo_vinculo)
            VALUES (%s, %s, 0, %s, %s, 'administrador')
            RETURNING id
        """, (imovel_id, data.produtor_id, produtor["nome"], date.today()))
        novo_id = cur.fetchone()["id"]

        conn.commit()
        return {"ok": True, "id": novo_id, "produtor_id": data.produtor_id, "produtor_nome": produtor["nome"]}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{imovel_id}/administradores/{produtor_id}")
def remover_administrador(imovel_id: int, produtor_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE participacoes_imovel
            SET vigencia_fim = CURRENT_DATE
            WHERE imovel_id = %s AND produtor_id = %s
              AND tipo_vinculo = 'administrador' AND vigencia_fim IS NULL
        """, (imovel_id, produtor_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Vínculo de administrador não encontrado ou já removido.")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
