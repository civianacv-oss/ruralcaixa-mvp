# app/consorcios.py
# Módulo de Consórcios Rurais
# Vinculado a imoveis_rurais — aprovação por maioria simples
#
# Plugar no app/main.py:
#   from app.consorcios import router as consorcios_router
#   app.include_router(consorcios_router)

import uuid as _uuid
from decimal import Decimal
from typing import Optional, List
from datetime import date
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from app.db import engine

router = APIRouter(prefix="/consorcios", tags=["Consórcios Rurais"])

# ── Models ────────────────────────────────────────────────────────────────────

class ConsorcioCreate(BaseModel):
    imovel_id:   int
    nome:        str
    descricao:   Optional[str] = None
    safra:       Optional[str] = None
    cultura:     Optional[str] = None
    created_by:  Optional[int] = None  # produtor_id do criador

class ParticipanteAdd(BaseModel):
    produtor_id: int
    perc_rateio: float
    papel:       str = "participante"

class RateioItem(BaseModel):
    produtor_id: int
    perc_rateio: float

class LancamentoCreate(BaseModel):
    tipo:            str   # RECEITA | DESPESA
    descricao:       str
    valor:           float
    data_lancamento: Optional[str] = None
    categoria:       Optional[str] = None
    observacao:      Optional[str] = None
    lancado_por:     int   # produtor_id de quem lança
    rateio:          List[RateioItem]  # rateio definido no momento

class VotoBody(BaseModel):
    produtor_id:  int
    voto:         str  # sim | nao
    justificativa: Optional[str] = None

class ImportarDREBody(BaseModel):
    produtor_id: int

# ── Helpers ───────────────────────────────────────────────────────────────────

def _row(r):
    return dict(r._mapping) if r else None

def _rows(rs):
    return [dict(r._mapping) for r in rs]

def _calcular_maioria(votos_sim: int, total: int) -> bool:
    """Maioria simples: mais da metade votou sim."""
    return total > 0 and votos_sim > total / 2

def _processar_aprovacao(conn, lancamento_id: str, lancamento: dict):
    """Ao aprovar: gera cotas para cada participante."""
    consorcio_id = lancamento["consorcio_id"]
    valor = float(lancamento["valor"])

    # Busca rateio definido no lançamento
    cotas = conn.execute(text(
        "SELECT produtor_id, perc_rateio FROM consorcio_cotas WHERE lancamento_id = :lid"
    ), {"lid": lancamento_id}).fetchall()

    # Atualiza valor_cota
    for cota in cotas:
        valor_cota = round(valor * float(cota.perc_rateio) / 100, 2)
        conn.execute(text("""
            UPDATE consorcio_cotas SET valor_cota = :vc
            WHERE lancamento_id = :lid AND produtor_id = :pid
        """), {"vc": valor_cota, "lid": lancamento_id, "pid": cota.produtor_id})

    # Marca lançamento como aprovado
    conn.execute(text("""
        UPDATE consorcio_lancamentos
        SET status = 'aprovado', aprovado_em = NOW(), updated_at = NOW()
        WHERE id = :id
    """), {"id": lancamento_id})

# ── Consórcios ────────────────────────────────────────────────────────────────

@router.get("")
def listar_consorcios(
    imovel_id: Optional[int] = None,
    status:    Optional[str] = None,
):
    params = {}
    where = "WHERE 1=1"
    if imovel_id:
        params["imovel_id"] = imovel_id
        where += " AND c.imovel_id = :imovel_id"
    if status:
        params["status"] = status
        where += " AND c.status = :status"
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT c.*,
                   i.nome as imovel_nome,
                   COUNT(DISTINCT p.id) as total_participantes,
                   COUNT(DISTINCT l.id) as total_lancamentos
            FROM consorcios c
            JOIN imoveis_rurais i ON i.id = c.imovel_id
            LEFT JOIN consorcio_participantes p ON p.consorcio_id = c.id AND p.ativo = TRUE
            LEFT JOIN consorcio_lancamentos l ON l.consorcio_id = c.id
            {where}
            GROUP BY c.id, i.nome
            ORDER BY c.created_at DESC
        """), params).fetchall()
    return _rows(rows)

@router.post("", status_code=201)
def criar_consorcio(body: ConsorcioCreate):
    if not body.nome.strip():
        raise HTTPException(422, "Nome do consórcio é obrigatório")
    with engine.connect() as conn:
        imovel = conn.execute(
            text("SELECT id, nome FROM imoveis_rurais WHERE id = :id"),
            {"id": body.imovel_id}
        ).fetchone()
        if not imovel:
            raise HTTPException(422, "Imóvel não encontrado")

        cid = str(_uuid.uuid4())
        conn.execute(text("""
            INSERT INTO consorcios
              (id, imovel_id, nome, descricao, safra, cultura, created_by)
            VALUES (:id, :imovel_id, :nome, :desc, :safra, :cultura, :by)
        """), {
            "id": cid, "imovel_id": body.imovel_id,
            "nome": body.nome.strip(), "desc": body.descricao,
            "safra": body.safra, "cultura": body.cultura,
            "by": body.created_by,
        })
        conn.commit()
        row = conn.execute(
            text("SELECT * FROM consorcios WHERE id = :id"), {"id": cid}
        ).fetchone()
    return _row(row)

@router.get("/{consorcio_id}")
def detalhe_consorcio(consorcio_id: str):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT c.*, i.nome as imovel_nome, i.municipio, i.uf
            FROM consorcios c
            JOIN imoveis_rurais i ON i.id = c.imovel_id
            WHERE c.id = :id
        """), {"id": consorcio_id}).fetchone()
    if not row:
        raise HTTPException(404, "Consórcio não encontrado")
    return _row(row)

@router.patch("/{consorcio_id}")
def atualizar_consorcio(consorcio_id: str, body: dict):
    campos_ok = {"nome", "descricao", "safra", "cultura", "status"}
    campos = {k: v for k, v in body.items() if k in campos_ok and v is not None}
    if not campos:
        raise HTTPException(400, "Nenhum campo válido para atualizar")
    sets = ", ".join(f"{k} = :{k}" for k in campos)
    with engine.connect() as conn:
        row = conn.execute(text(f"""
            UPDATE consorcios SET {sets}, updated_at = NOW()
            WHERE id = :id RETURNING *
        """), {**campos, "id": consorcio_id}).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(404, "Consórcio não encontrado")
    return _row(row)

# ── Participantes ─────────────────────────────────────────────────────────────

@router.get("/{consorcio_id}/participantes")
def listar_participantes(consorcio_id: str):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT cp.*, p.nome as produtor_nome, p.cpf, p.telefone
            FROM consorcio_participantes cp
            JOIN produtores p ON p.id = cp.produtor_id
            WHERE cp.consorcio_id = :cid AND cp.ativo = TRUE
            ORDER BY cp.papel DESC, p.nome
        """), {"cid": consorcio_id}).fetchall()
    return _rows(rows)

@router.post("/{consorcio_id}/participantes", status_code=201)
def adicionar_participante(consorcio_id: str, body: ParticipanteAdd):
    if body.perc_rateio < 0 or body.perc_rateio > 100:
        raise HTTPException(422, "Percentual deve ser entre 0 e 100")
    with engine.connect() as conn:
        # Verificar soma dos percentuais
        soma = conn.execute(text("""
            SELECT COALESCE(SUM(perc_rateio), 0)
            FROM consorcio_participantes
            WHERE consorcio_id = :cid AND ativo = TRUE
        """), {"cid": consorcio_id}).scalar()
        if float(soma) + body.perc_rateio > 100:
            raise HTTPException(422, f"Soma dos percentuais ultrapassaria 100% (atual: {float(soma):.1f}%)")

        try:
            conn.execute(text("""
                INSERT INTO consorcio_participantes
                  (consorcio_id, produtor_id, perc_rateio, papel)
                VALUES (:cid, :pid, :perc, :papel)
            """), {
                "cid": consorcio_id, "pid": body.produtor_id,
                "perc": body.perc_rateio, "papel": body.papel,
            })
            conn.commit()
        except Exception as e:
            if "unique" in str(e).lower():
                raise HTTPException(409, "Participante já cadastrado neste consórcio")
            raise HTTPException(500, str(e))

        row = conn.execute(text("""
            SELECT cp.*, p.nome as produtor_nome
            FROM consorcio_participantes cp
            JOIN produtores p ON p.id = cp.produtor_id
            WHERE cp.consorcio_id = :cid AND cp.produtor_id = :pid
        """), {"cid": consorcio_id, "pid": body.produtor_id}).fetchone()
    return _row(row)

@router.delete("/{consorcio_id}/participantes/{produtor_id}")
def remover_participante(consorcio_id: str, produtor_id: int):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE consorcio_participantes SET ativo = FALSE
            WHERE consorcio_id = :cid AND produtor_id = :pid
        """), {"cid": consorcio_id, "pid": produtor_id})
        conn.commit()
    return {"sucesso": True}

# ── Lançamentos ───────────────────────────────────────────────────────────────

@router.get("/{consorcio_id}/lancamentos")
def listar_lancamentos(
    consorcio_id: str,
    status: Optional[str] = None,
    tipo:   Optional[str] = None,
):
    params = {"cid": consorcio_id}
    where = "WHERE l.consorcio_id = :cid"
    if status:
        params["status"] = status
        where += " AND l.status = :status"
    if tipo:
        params["tipo"] = tipo.upper()
        where += " AND l.tipo = :tipo"
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT l.*, p.nome as lancado_por_nome
            FROM consorcio_lancamentos l
            LEFT JOIN produtores p ON p.id = l.lancado_por
            {where}
            ORDER BY l.data_lancamento DESC, l.created_at DESC
        """), params).fetchall()
    return _rows(rows)

@router.post("/{consorcio_id}/lancamentos", status_code=201)
def criar_lancamento(consorcio_id: str, body: LancamentoCreate):
    if body.tipo.upper() not in ("RECEITA", "DESPESA"):
        raise HTTPException(422, "Tipo deve ser RECEITA ou DESPESA")
    if body.valor <= 0:
        raise HTTPException(422, "Valor deve ser maior que zero")
    if not body.rateio:
        raise HTTPException(422, "Defina o rateio entre os participantes")

    soma_perc = sum(r.perc_rateio for r in body.rateio)
    if abs(soma_perc - 100) > 0.01:
        raise HTTPException(422, f"Soma dos percentuais deve ser 100% (atual: {soma_perc:.2f}%)")

    with engine.connect() as conn:
        # Verificar consórcio
        cons = conn.execute(
            text("SELECT id, status FROM consorcios WHERE id = :id"),
            {"id": consorcio_id}
        ).fetchone()
        if not cons:
            raise HTTPException(404, "Consórcio não encontrado")
        if cons.status != "ativo":
            raise HTTPException(422, "Consórcio não está ativo")

        # Verificar que quem lança é participante
        part = conn.execute(text("""
            SELECT id FROM consorcio_participantes
            WHERE consorcio_id = :cid AND produtor_id = :pid AND ativo = TRUE
        """), {"cid": consorcio_id, "pid": body.lancado_por}).fetchone()
        if not part:
            raise HTTPException(403, "Somente participantes ativos podem lançar")

        total_part = conn.execute(text("""
            SELECT COUNT(*) FROM consorcio_participantes
            WHERE consorcio_id = :cid AND ativo = TRUE
        """), {"cid": consorcio_id}).scalar()

        lid = str(_uuid.uuid4())
        data_lanc = body.data_lancamento or str(date.today())

        conn.execute(text("""
            INSERT INTO consorcio_lancamentos
              (id, consorcio_id, tipo, descricao, valor, data_lancamento,
               categoria, observacao, lancado_por, rateio_manual,
               total_participantes, status)
            VALUES
              (:id, :cid, :tipo, :desc, :valor, :data,
               :cat, :obs, :by, TRUE, :total, 'pendente')
        """), {
            "id": lid, "cid": consorcio_id,
            "tipo": body.tipo.upper(), "desc": body.descricao,
            "valor": body.valor, "data": data_lanc,
            "cat": body.categoria, "obs": body.observacao,
            "by": body.lancado_por, "total": total_part,
        })

        # Inserir cotas (valor_cota = 0 até aprovação)
        for r in body.rateio:
            conn.execute(text("""
                INSERT INTO consorcio_cotas
                  (lancamento_id, produtor_id, perc_rateio, valor_cota)
                VALUES (:lid, :pid, :perc, 0)
            """), {"lid": lid, "pid": r.produtor_id, "perc": r.perc_rateio})

        # Voto automático de quem lançou = sim
        conn.execute(text("""
            INSERT INTO consorcio_votos (lancamento_id, produtor_id, voto)
            VALUES (:lid, :pid, 'sim')
        """), {"lid": lid, "pid": body.lancado_por})

        conn.execute(text("""
            UPDATE consorcio_lancamentos SET votos_sim = 1 WHERE id = :id
        """), {"id": lid})

        # Verificar se já tem maioria (caso consórcio tenha 1 participante)
        lanc = conn.execute(
            text("SELECT * FROM consorcio_lancamentos WHERE id = :id"), {"id": lid}
        ).fetchone()
        if _calcular_maioria(1, int(total_part)):
            _processar_aprovacao(conn, lid, _row(lanc))

        conn.commit()
        row = conn.execute(
            text("SELECT * FROM consorcio_lancamentos WHERE id = :id"), {"id": lid}
        ).fetchone()
    return _row(row)

@router.get("/{consorcio_id}/lancamentos/{lancamento_id}")
def detalhe_lancamento(consorcio_id: str, lancamento_id: str):
    with engine.connect() as conn:
        lanc = conn.execute(text("""
            SELECT l.*, p.nome as lancado_por_nome
            FROM consorcio_lancamentos l
            LEFT JOIN produtores p ON p.id = l.lancado_por
            WHERE l.id = :lid AND l.consorcio_id = :cid
        """), {"lid": lancamento_id, "cid": consorcio_id}).fetchone()
        if not lanc:
            raise HTTPException(404, "Lançamento não encontrado")

        votos = conn.execute(text("""
            SELECT v.*, p.nome as produtor_nome
            FROM consorcio_votos v
            JOIN produtores p ON p.id = v.produtor_id
            WHERE v.lancamento_id = :lid
        """), {"lid": lancamento_id}).fetchall()

        cotas = conn.execute(text("""
            SELECT c.*, p.nome as produtor_nome
            FROM consorcio_cotas c
            JOIN produtores p ON p.id = c.produtor_id
            WHERE c.lancamento_id = :lid
            ORDER BY c.perc_rateio DESC
        """), {"lid": lancamento_id}).fetchall()

    return {
        **_row(lanc),
        "votos": _rows(votos),
        "cotas": _rows(cotas),
    }

# ── Votação ───────────────────────────────────────────────────────────────────

@router.post("/{consorcio_id}/lancamentos/{lancamento_id}/votar")
def votar(consorcio_id: str, lancamento_id: str, body: VotoBody):
    if body.voto not in ("sim", "nao"):
        raise HTTPException(422, "Voto deve ser 'sim' ou 'nao'")

    with engine.connect() as conn:
        lanc = conn.execute(
            text("SELECT * FROM consorcio_lancamentos WHERE id = :id AND consorcio_id = :cid"),
            {"id": lancamento_id, "cid": consorcio_id}
        ).fetchone()
        if not lanc:
            raise HTTPException(404, "Lançamento não encontrado")
        if _row(lanc)["status"] != "pendente":
            raise HTTPException(422, f"Lançamento já está {_row(lanc)['status']}")

        # Verificar participante ativo
        part = conn.execute(text("""
            SELECT id FROM consorcio_participantes
            WHERE consorcio_id = :cid AND produtor_id = :pid AND ativo = TRUE
        """), {"cid": consorcio_id, "pid": body.produtor_id}).fetchone()
        if not part:
            raise HTTPException(403, "Somente participantes ativos podem votar")

        # Voto duplicado?
        voto_existente = conn.execute(text("""
            SELECT id FROM consorcio_votos
            WHERE lancamento_id = :lid AND produtor_id = :pid
        """), {"lid": lancamento_id, "pid": body.produtor_id}).fetchone()
        if voto_existente:
            raise HTTPException(409, "Participante já votou neste lançamento")

        # Registrar voto
        conn.execute(text("""
            INSERT INTO consorcio_votos (lancamento_id, produtor_id, voto, justificativa)
            VALUES (:lid, :pid, :voto, :just)
        """), {
            "lid": lancamento_id, "pid": body.produtor_id,
            "voto": body.voto, "just": body.justificativa,
        })

        # Atualizar contadores
        campo = "votos_sim" if body.voto == "sim" else "votos_nao"
        conn.execute(text(f"""
            UPDATE consorcio_lancamentos
            SET {campo} = {campo} + 1, updated_at = NOW()
            WHERE id = :id
        """), {"id": lancamento_id})

        # Re-ler lançamento atualizado
        lanc_upd = conn.execute(
            text("SELECT * FROM consorcio_lancamentos WHERE id = :id"), {"id": lancamento_id}
        ).fetchone()
        l = _row(lanc_upd)

        # Verificar maioria
        if _calcular_maioria(l["votos_sim"], l["total_participantes"]):
            _processar_aprovacao(conn, lancamento_id, l)
        elif _calcular_maioria(l["votos_nao"], l["total_participantes"]):
            conn.execute(text("""
                UPDATE consorcio_lancamentos SET status = 'rejeitado', updated_at = NOW()
                WHERE id = :id
            """), {"id": lancamento_id})

        conn.commit()
        row = conn.execute(
            text("SELECT * FROM consorcio_lancamentos WHERE id = :id"), {"id": lancamento_id}
        ).fetchone()

    return _row(row)

# ── Cotas e importação para DRE ───────────────────────────────────────────────

@router.get("/{consorcio_id}/lancamentos/{lancamento_id}/cotas")
def listar_cotas(consorcio_id: str, lancamento_id: str):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT c.*, p.nome as produtor_nome
            FROM consorcio_cotas c
            JOIN produtores p ON p.id = c.produtor_id
            WHERE c.lancamento_id = :lid
            ORDER BY c.perc_rateio DESC
        """), {"lid": lancamento_id}).fetchall()
    return _rows(rows)

@router.post("/{consorcio_id}/lancamentos/{lancamento_id}/importar-dre")
def importar_para_dre(consorcio_id: str, lancamento_id: str, body: ImportarDREBody):
    """Importa a cota do participante para o DRE individual dele."""
    with engine.connect() as conn:
        lanc = conn.execute(
            text("SELECT * FROM consorcio_lancamentos WHERE id = :id AND consorcio_id = :cid"),
            {"id": lancamento_id, "cid": consorcio_id}
        ).fetchone()
        if not lanc:
            raise HTTPException(404, "Lançamento não encontrado")
        if _row(lanc)["status"] != "aprovado":
            raise HTTPException(422, "Só é possível importar lançamentos aprovados")

        cota = conn.execute(text("""
            SELECT * FROM consorcio_cotas
            WHERE lancamento_id = :lid AND produtor_id = :pid
        """), {"lid": lancamento_id, "pid": body.produtor_id}).fetchone()
        if not cota:
            raise HTTPException(404, "Cota não encontrada para este participante")
        if _row(cota)["importado"]:
            raise HTTPException(409, "Cota já importada para o DRE")

        l = _row(lanc)

        # Criar lançamento individual no DRE
        import uuid as _u2
        lanc_dre_id_val = None
        try:
            # Busca subconta pelo tipo (RECEITA/DESPESA) e categoria
            nome_sub = l.get("categoria") or l.get("descricao", "Consórcio")
            sub = conn.execute(text("""
                SELECT id FROM subcontas
                WHERE LOWER(nome) LIKE LOWER(:nome) AND tipo = :tipo
                LIMIT 1
            """), {"nome": f"%{nome_sub[:20]}%", "tipo": l["tipo"]}).fetchone()

            if not sub:
                sub_id = str(_u2.uuid4())
                conn.execute(text("""
                    INSERT INTO subcontas (id, nome, tipo, atividade_tipo)
                    VALUES (:id, :nome, :tipo, 'RURAL')
                """), {"id": sub_id, "nome": nome_sub[:100], "tipo": l["tipo"]})
            else:
                sub_id = sub[0]

            lanc_dre_id_val = str(_u2.uuid4())
            conn.execute(text("""
                INSERT INTO lancamentos
                  (id, produtor_id, subconta_id, valor, data,
                   origem, consorcio_lancamento_id)
                VALUES (:id, :pid, :sub, :valor, :data,
                        'consorcio', :cons_lanc_id)
            """), {
                "id":           lanc_dre_id_val,
                "pid":          body.produtor_id,
                "sub":          sub_id,
                "valor":        float(_row(cota)["valor_cota"]),
                "data":         l["data_lancamento"],
                "cons_lanc_id": lancamento_id,
            })
        except Exception as e:
            raise HTTPException(500, f"Erro ao criar lançamento no DRE: {str(e)}")

        # Marcar como importado
        conn.execute(text("""
            UPDATE consorcio_cotas
            SET importado = TRUE, lancamento_dre_id = :dre_id, importado_em = NOW()
            WHERE lancamento_id = :lid AND produtor_id = :pid
        """), {"dre_id": lanc_dre_id_val, "lid": lancamento_id, "pid": body.produtor_id})

        conn.commit()

        cota_upd = conn.execute(text("""
            SELECT c.*, p.nome as produtor_nome
            FROM consorcio_cotas c JOIN produtores p ON p.id = c.produtor_id
            WHERE c.lancamento_id = :lid AND c.produtor_id = :pid
        """), {"lid": lancamento_id, "pid": body.produtor_id}).fetchone()

    return {
        "sucesso": True,
        "cota": _row(cota_upd),
        "lancamento_dre_id": lanc_dre_id_val,
    }

# ── Resumo financeiro do consórcio ────────────────────────────────────────────

@router.get("/{consorcio_id}/resumo")
def resumo_consorcio(consorcio_id: str):
    with engine.connect() as conn:
        cons = conn.execute(
            text("SELECT * FROM consorcios WHERE id = :id"), {"id": consorcio_id}
        ).fetchone()
        if not cons:
            raise HTTPException(404, "Consórcio não encontrado")

        totais = conn.execute(text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'pendente')  as pendentes,
                COUNT(*) FILTER (WHERE status = 'aprovado')  as aprovados,
                COUNT(*) FILTER (WHERE status = 'rejeitado') as rejeitados,
                COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA' AND status = 'aprovado'), 0) as receita,
                COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA' AND status = 'aprovado'), 0) as despesa
            FROM consorcio_lancamentos
            WHERE consorcio_id = :cid
        """), {"cid": consorcio_id}).fetchone()

        participantes = conn.execute(text("""
            SELECT cp.produtor_id, p.nome,
                   cp.perc_rateio, cp.papel,
                   COALESCE(SUM(cc.valor_cota) FILTER (
                       WHERE cl.tipo = 'RECEITA' AND cl.status = 'aprovado'
                   ), 0) as receita_cota,
                   COALESCE(SUM(cc.valor_cota) FILTER (
                       WHERE cl.tipo = 'DESPESA' AND cl.status = 'aprovado'
                   ), 0) as despesa_cota,
                   COUNT(cc.id) FILTER (WHERE cc.importado = TRUE) as cotas_importadas
            FROM consorcio_participantes cp
            JOIN produtores p ON p.id = cp.produtor_id
            LEFT JOIN consorcio_cotas cc ON cc.produtor_id = cp.produtor_id
            LEFT JOIN consorcio_lancamentos cl ON cl.id = cc.lancamento_id
                AND cl.consorcio_id = :cid
            WHERE cp.consorcio_id = :cid AND cp.ativo = TRUE
            GROUP BY cp.produtor_id, p.nome, cp.perc_rateio, cp.papel
            ORDER BY cp.papel DESC, p.nome
        """), {"cid": consorcio_id}).fetchall()

    t = _row(totais)
    return {
        "consorcio": _row(cons),
        "lancamentos": {
            "pendentes":  int(t["pendentes"]),
            "aprovados":  int(t["aprovados"]),
            "rejeitados": int(t["rejeitados"]),
            "receita":    float(t["receita"]),
            "despesa":    float(t["despesa"]),
            "saldo":      float(t["receita"]) - float(t["despesa"]),
        },
        "participantes": _rows(participantes),
    }


# ── DRE Analítico do Consórcio ────────────────────────────────────────────────
# Adicionar este endpoint ao router existente (já importado acima)

@router.get("/{consorcio_id}/dre")
def dre_consorcio(
    consorcio_id: str,
    safra:     Optional[str] = None,   # ex: "2025/26" — filtra por safra
    categoria: Optional[str] = None,   # filtra por categoria
):
    """
    DRE analítico do consórcio:
    - Receitas e despesas aprovadas por categoria
    - Evolução mensal
    - Resultado por participante
    """
    with engine.connect() as conn:
        cons = conn.execute(
            text("SELECT * FROM consorcios WHERE id = :id"), {"id": consorcio_id}
        ).fetchone()
        if not cons:
            raise HTTPException(404, "Consórcio não encontrado")

        params = {"cid": consorcio_id}
        where_extra = ""
        if categoria:
            params["cat"] = categoria
            where_extra += " AND LOWER(l.categoria) = LOWER(:cat)"

        # ── Totais por categoria ──────────────────────────────────────────────
        por_categoria = conn.execute(text(f"""
            SELECT
                l.tipo,
                COALESCE(l.categoria, 'Sem categoria') AS categoria,
                COUNT(*) AS total_lancamentos,
                SUM(l.valor) AS valor_total
            FROM consorcio_lancamentos l
            WHERE l.consorcio_id = :cid
              AND l.status = 'aprovado'
              {where_extra}
            GROUP BY l.tipo, COALESCE(l.categoria, 'Sem categoria')
            ORDER BY l.tipo, valor_total DESC
        """), params).fetchall()

        # ── Evolução mensal ───────────────────────────────────────────────────
        por_mes = conn.execute(text(f"""
            SELECT
                TO_CHAR(l.data_lancamento, 'YYYY-MM') AS mes,
                l.tipo,
                SUM(l.valor) AS valor
            FROM consorcio_lancamentos l
            WHERE l.consorcio_id = :cid
              AND l.status = 'aprovado'
              {where_extra}
            GROUP BY TO_CHAR(l.data_lancamento, 'YYYY-MM'), l.tipo
            ORDER BY mes, l.tipo
        """), params).fetchall()

        # ── Resultado por participante ────────────────────────────────────────
        por_participante = conn.execute(text(f"""
            SELECT
                p.id   AS produtor_id,
                p.nome AS produtor_nome,
                cp.perc_rateio,
                COALESCE(SUM(cc.valor_cota) FILTER (
                    WHERE cl.tipo = 'RECEITA'
                ), 0) AS receita_cota,
                COALESCE(SUM(cc.valor_cota) FILTER (
                    WHERE cl.tipo = 'DESPESA'
                ), 0) AS despesa_cota,
                COUNT(cc.id) FILTER (WHERE cc.importado = TRUE) AS cotas_importadas,
                COUNT(cc.id) AS total_cotas
            FROM consorcio_participantes cp
            JOIN produtores p ON p.id = cp.produtor_id
            LEFT JOIN consorcio_cotas cc ON cc.produtor_id = cp.produtor_id
            LEFT JOIN consorcio_lancamentos cl
                ON cl.id = cc.lancamento_id
               AND cl.consorcio_id = :cid
               AND cl.status = 'aprovado'
               {where_extra}
            WHERE cp.consorcio_id = :cid AND cp.ativo = TRUE
            GROUP BY p.id, p.nome, cp.perc_rateio
            ORDER BY cp.perc_rateio DESC
        """), params).fetchall()

        # ── Totais gerais ─────────────────────────────────────────────────────
        totais = conn.execute(text(f"""
            SELECT
                COALESCE(SUM(valor) FILTER (WHERE tipo='RECEITA'), 0) AS receita,
                COALESCE(SUM(valor) FILTER (WHERE tipo='DESPESA'), 0) AS despesa
            FROM consorcio_lancamentos
            WHERE consorcio_id = :cid AND status = 'aprovado'
            {where_extra}
        """), params).fetchone()

        # ── Lançamentos pendentes ─────────────────────────────────────────────
        pendentes = conn.execute(text("""
            SELECT COUNT(*) FROM consorcio_lancamentos
            WHERE consorcio_id = :cid AND status = 'pendente'
        """), {"cid": consorcio_id}).scalar()

    t = _row(totais)
    receita = float(t["receita"])
    despesa = float(t["despesa"])

    # Montar evolução mensal em estrutura {mes: {receita, despesa, saldo}}
    meses = {}
    for r in por_mes:
        m = dict(r._mapping)
        mes = m["mes"]
        if mes not in meses:
            meses[mes] = {"mes": mes, "receita": 0.0, "despesa": 0.0, "saldo": 0.0}
        if m["tipo"] == "RECEITA":
            meses[mes]["receita"] = float(m["valor"])
        else:
            meses[mes]["despesa"] = float(m["valor"])
    for m in meses.values():
        m["saldo"] = round(m["receita"] - m["despesa"], 2)

    # Montar categorias separadas por tipo
    cats_receita = []
    cats_despesa = []
    for r in por_categoria:
        d = dict(r._mapping)
        item = {
            "categoria":          d["categoria"],
            "total_lancamentos":  int(d["total_lancamentos"]),
            "valor_total":        float(d["valor_total"]),
            "percentual":         round(float(d["valor_total"]) / receita * 100, 1)
                                  if d["tipo"] == "RECEITA" and receita > 0
                                  else round(float(d["valor_total"]) / despesa * 100, 1)
                                  if despesa > 0 else 0,
        }
        if d["tipo"] == "RECEITA":
            cats_receita.append(item)
        else:
            cats_despesa.append(item)

    participantes_dre = []
    for r in por_participante:
        d = dict(r._mapping)
        rec = float(d["receita_cota"])
        dep = float(d["despesa_cota"])
        participantes_dre.append({
            "produtor_id":      d["produtor_id"],
            "produtor_nome":    d["produtor_nome"],
            "perc_rateio":      float(d["perc_rateio"]),
            "receita_cota":     rec,
            "despesa_cota":     dep,
            "resultado_cota":   round(rec - dep, 2),
            "cotas_importadas": int(d["cotas_importadas"]),
            "total_cotas":      int(d["total_cotas"]),
            "pct_importado":    round(int(d["cotas_importadas"]) / int(d["total_cotas"]) * 100, 0)
                                if int(d["total_cotas"]) > 0 else 0,
        })

    return {
        "consorcio": _row(cons),
        "filtros":   {"categoria": categoria, "safra": safra},
        "resumo": {
            "receita":            receita,
            "despesa":            despesa,
            "resultado":          round(receita - despesa, 2),
            "margem_pct":         round((receita - despesa) / receita * 100, 1)
                                  if receita > 0 else 0,
            "lancamentos_pendentes": int(pendentes),
        },
        "por_categoria": {
            "receitas":  cats_receita,
            "despesas":  cats_despesa,
        },
        "evolucao_mensal":   list(meses.values()),
        "por_participante":  participantes_dre,
    }
