"""
RuralCaixa — routers/ovino.py  (v2 — psycopg2 síncrono)
Compatível com o padrão do main_api.py existente.

Adicione em main_api.py:
    from routers.ovino import router as ovino_router
    app.include_router(ovino_router)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime
import psycopg2
import psycopg2.extras
import logging
import sys
import os

# Importa o serviço de IA
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.services.ovino_ia import classificar_mensagem_sync

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ovino", tags=["Ovino"])

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class AnimalCreate(BaseModel):
    imovel_id: int
    brinco: str
    nome: Optional[str] = None
    raca: Optional[str] = None
    sexo: str = Field(..., pattern="^[MF]$")
    data_nascimento: Optional[date] = None
    peso_nascimento: Optional[float] = None
    mae_id: Optional[int] = None
    pai_id: Optional[int] = None
    lote_id: Optional[int] = None
    observacoes: Optional[str] = None

class PesagemCreate(BaseModel):
    animal_id: int
    data_pesagem: date = Field(default_factory=date.today)
    peso_kg: float
    motivo: str = "rotina"
    registrado_por: Optional[str] = None

class SaudeCreate(BaseModel):
    imovel_id: int
    animal_id: Optional[int] = None
    lote_id: Optional[int] = None
    tipo: str
    data_evento: date = Field(default_factory=date.today)
    produto: Optional[str] = None
    dose_ml: Optional[float] = None
    via: Optional[str] = None
    proximo_em: Optional[date] = None
    resultado: Optional[str] = None
    registrado_por: Optional[str] = None
    observacoes: Optional[str] = None

class ReproducaoCreate(BaseModel):
    imovel_id: int
    tipo: str
    data_evento: date = Field(default_factory=date.today)
    matriz_id: Optional[int] = None
    reprodutor_id: Optional[int] = None
    cordeiros_vivos: int = 0
    cordeiros_mortos: int = 0
    observacoes: Optional[str] = None
    registrado_por: Optional[str] = None

class AbateCreate(BaseModel):
    animal_id: int
    data_abate: date = Field(default_factory=date.today)
    peso_vivo_kg: Optional[float] = None
    peso_carcaca_kg: Optional[float] = None
    destino: str = "frigorifico"
    valor_total_rs: Optional[float] = None
    comprador: Optional[str] = None
    registrado_por: Optional[str] = None

class LoteCreate(BaseModel):
    imovel_id: int
    nome: str
    fase: str = "cria"
    data_inicio: date = Field(default_factory=date.today)


class ConfigReclassificacao(BaseModel):
    idade_max_cria_dias: int = 90
    idade_max_recria_dias: int = 210
    peso_min_engorda: float = 20.0
    peso_min_reproducao_femea: float = 28.0
    idade_min_reproducao_dias: int = 270
    peso_pre_abate_macho: float = 35.0
    dry_run: bool = False


class WhatsAppMensagem(BaseModel):
    telefone: str
    tipo_midia: str = "texto"
    conteudo: str
    imovel_id: Optional[int] = None


# ══════════════════════════════════════════════════════════════════════════════
# ANIMAIS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/animais", status_code=201)
def criar_animal(payload: AnimalCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ovino_animais
                (imovel_id, brinco, nome, raca, sexo, data_nascimento,
                 peso_nascimento, mae_id, pai_id, lote_id, observacoes)
            VALUES
                (%(imovel_id)s, %(brinco)s, %(nome)s, %(raca)s, %(sexo)s,
                 %(data_nascimento)s, %(peso_nascimento)s, %(mae_id)s,
                 %(pai_id)s, %(lote_id)s, %(observacoes)s)
            RETURNING id, brinco, status, created_at
        """, payload.model_dump())
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, f"Brinco '{payload.brinco}' já cadastrado neste imóvel.")
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/animais")
def listar_animais(
    imovel_id: int = Query(...),
    status: Optional[str] = Query(None),
    lote_id: Optional[int] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = """
            SELECT a.*, l.nome AS lote_nome,
                   (SELECT peso_kg FROM ovino_pesagens
                    WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS ultimo_peso,
                   (SELECT data_pesagem FROM ovino_pesagens
                    WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS data_ultimo_peso
            FROM ovino_animais a
            LEFT JOIN ovino_lotes l ON l.id = a.lote_id
            WHERE a.imovel_id = %s
        """
        params = [imovel_id]
        if status:
            sql += " AND a.status = %s"
            params.append(status)
        if lote_id:
            sql += " AND a.lote_id = %s"
            params.append(lote_id)
        sql += " ORDER BY a.brinco"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/animais/{animal_id}")
def detalhe_animal(animal_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT a.*, l.nome AS lote_nome,
                   m.brinco AS mae_brinco, p.brinco AS pai_brinco
            FROM ovino_animais a
            LEFT JOIN ovino_lotes l ON l.id = a.lote_id
            LEFT JOIN ovino_animais m ON m.id = a.mae_id
            LEFT JOIN ovino_animais p ON p.id = a.pai_id
            WHERE a.id = %s
        """, (animal_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Animal não encontrado.")
        return dict(row)
    finally:
        conn.close()


@router.patch("/animais/{animal_id}/status")
def atualizar_status_animal(animal_id: int, novo_status: str = Query(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE ovino_animais SET status = %s, updated_at = NOW()
            WHERE id = %s RETURNING id, brinco, status
        """, (novo_status, animal_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Animal não encontrado.")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# LOTES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/lotes", status_code=201)
def criar_lote(payload: LoteCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ovino_lotes (imovel_id, nome, fase, data_inicio)
            VALUES (%(imovel_id)s, %(nome)s, %(fase)s, %(data_inicio)s)
            RETURNING id, nome, fase, data_inicio
        """, payload.model_dump())
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


@router.get("/lotes")
def listar_lotes(imovel_id: int = Query(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT l.*,
                   COUNT(a.id) FILTER (WHERE a.status = 'ativo') AS total_animais
            FROM ovino_lotes l
            LEFT JOIN ovino_animais a ON a.lote_id = l.id
            WHERE l.imovel_id = %s AND l.ativo = TRUE
            GROUP BY l.id
            ORDER BY l.data_inicio DESC
        """, (imovel_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# PESAGENS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/pesagens", status_code=201)
def registrar_pesagem(payload: PesagemCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ovino_pesagens (animal_id, data_pesagem, peso_kg, motivo, registrado_por)
            VALUES (%(animal_id)s, %(data_pesagem)s, %(peso_kg)s, %(motivo)s, %(registrado_por)s)
            RETURNING id, animal_id, data_pesagem, peso_kg, motivo
        """, payload.model_dump())
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


@router.get("/pesagens/{animal_id}")
def historico_pesagens(animal_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.*,
                   ROUND(
                       (p.peso_kg - LAG(p.peso_kg) OVER (ORDER BY p.data_pesagem)) /
                       NULLIF(p.data_pesagem - LAG(p.data_pesagem) OVER (ORDER BY p.data_pesagem), 0)
                   , 3) AS gmd_kg_dia
            FROM ovino_pesagens p
            WHERE p.animal_id = %s
            ORDER BY p.data_pesagem
        """, (animal_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# SAÚDE
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/saude", status_code=201)
def registrar_evento_saude(payload: SaudeCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ovino_saude
                (imovel_id, animal_id, lote_id, tipo, data_evento, produto,
                 dose_ml, via, proximo_em, resultado, registrado_por, observacoes)
            VALUES
                (%(imovel_id)s, %(animal_id)s, %(lote_id)s, %(tipo)s, %(data_evento)s,
                 %(produto)s, %(dose_ml)s, %(via)s, %(proximo_em)s, %(resultado)s,
                 %(registrado_por)s, %(observacoes)s)
            RETURNING id, tipo, data_evento, produto, proximo_em
        """, payload.model_dump())
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


@router.get("/saude/alertas")
def alertas_sanitarios(
    imovel_id: int = Query(...),
    dias_antecedencia: int = Query(7),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT s.*, a.brinco AS animal_brinco, l.nome AS lote_nome
            FROM ovino_saude s
            LEFT JOIN ovino_animais a ON a.id = s.animal_id
            LEFT JOIN ovino_lotes l ON l.id = s.lote_id
            WHERE s.imovel_id = %s
              AND s.proximo_em BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
            ORDER BY s.proximo_em
        """, (imovel_id, dias_antecedencia))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# REPRODUÇÃO
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/reproducao", status_code=201)
def registrar_reproducao(payload: ReproducaoCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ovino_reproducao
                (imovel_id, tipo, data_evento, matriz_id, reprodutor_id,
                 cordeiros_vivos, cordeiros_mortos, observacoes, registrado_por)
            VALUES
                (%(imovel_id)s, %(tipo)s, %(data_evento)s, %(matriz_id)s,
                 %(reprodutor_id)s, %(cordeiros_vivos)s, %(cordeiros_mortos)s,
                 %(observacoes)s, %(registrado_por)s)
            RETURNING id, tipo, data_evento, cordeiros_vivos
        """, payload.model_dump())
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ABATES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/abates", status_code=201)
def registrar_abate(payload: AbateCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ovino_abates
                (animal_id, data_abate, peso_vivo_kg, peso_carcaca_kg,
                 destino, valor_total_rs, comprador, registrado_por)
            VALUES
                (%(animal_id)s, %(data_abate)s, %(peso_vivo_kg)s, %(peso_carcaca_kg)s,
                 %(destino)s, %(valor_total_rs)s, %(comprador)s, %(registrado_por)s)
            RETURNING id, animal_id, data_abate, peso_vivo_kg, peso_carcaca_kg, rendimento_pct
        """, payload.model_dump())
        row = dict(cur.fetchone())
        cur.execute(
            "UPDATE ovino_animais SET status='abatido', updated_at=NOW() WHERE id=%s",
            (payload.animal_id,)
        )
        conn.commit()
        return row
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard/{imovel_id}")
def dashboard_ovino(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status='ativo')              AS total_ativo,
                COUNT(*) FILTER (WHERE status='ativo' AND sexo='F') AS matrizes,
                COUNT(*) FILTER (WHERE status='ativo' AND sexo='M') AS reprodutores
            FROM ovino_animais WHERE imovel_id = %s
        """, (imovel_id,))
        rebanho = dict(cur.fetchone())

        cur.execute("""
            SELECT
                COUNT(*)                        AS total_abatidos,
                ROUND(AVG(peso_carcaca_kg), 2)  AS media_carcaca_kg,
                ROUND(AVG(rendimento_pct), 2)   AS media_rendimento_pct,
                ROUND(SUM(valor_total_rs), 2)   AS receita_total_rs
            FROM ovino_abates ab
            JOIN ovino_animais a ON a.id = ab.animal_id
            WHERE a.imovel_id = %s
              AND ab.data_abate >= CURRENT_DATE - INTERVAL '30 days'
        """, (imovel_id,))
        abates = dict(cur.fetchone())

        cur.execute("""
            SELECT COUNT(*) AS total_partos,
                   SUM(cordeiros_vivos)   AS cordeiros_vivos,
                   SUM(cordeiros_mortos)  AS cordeiros_mortos
            FROM ovino_reproducao
            WHERE imovel_id = %s AND tipo = 'parto'
              AND data_evento >= CURRENT_DATE - INTERVAL '30 days'
        """, (imovel_id,))
        partos = dict(cur.fetchone())

        cur.execute("""
            SELECT COUNT(*) AS total_alertas
            FROM ovino_saude
            WHERE imovel_id = %s
              AND proximo_em BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
        """, (imovel_id,))
        alertas = dict(cur.fetchone())

        return {
            "rebanho": rebanho,
            "abates_30d": abates,
            "partos_30d": partos,
            "alertas_7d": alertas,
        }
    finally:
        conn.close()



# ══════════════════════════════════════════════════════════════════════════════
# RECLASSIFICAÇÃO AUTOMÁTICA DE LOTES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/animais/reclassificar")
def reclassificar_rebanho(
    imovel_id: int = Query(...),
    config: ConfigReclassificacao = None,
):
    from datetime import date as date_type
    if config is None:
        config = ConfigReclassificacao()

    conn = get_db()
    try:
        cur = conn.cursor()

        fases = ["cria", "recria", "engorda", "reprodução", "descarte"]
        nomes_padrao = {"cria": "Cria", "recria": "Recria", "engorda": "Engorda",
                        "reprodução": "Reprodução", "descarte": "Pré-abate"}

        lote_ids = {}
        for fase in fases:
            cur.execute("""
                SELECT id FROM ovino_lotes
                WHERE imovel_id = %s AND fase = %s AND ativo = TRUE
                ORDER BY data_inicio DESC LIMIT 1
            """, (imovel_id, fase))
            row = cur.fetchone()
            if row:
                lote_ids[fase] = row["id"]
            else:
                cur.execute("""
                    INSERT INTO ovino_lotes (imovel_id, nome, fase, data_inicio)
                    VALUES (%s, %s, %s, CURRENT_DATE) RETURNING id
                """, (imovel_id, nomes_padrao[fase], fase))
                lote_ids[fase] = cur.fetchone()["id"]

        if not config.dry_run:
            conn.commit()

        cur.execute("""
            SELECT a.id, a.brinco, a.sexo, a.lote_id, a.data_nascimento,
                   (SELECT peso_kg FROM ovino_pesagens WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS ultimo_peso
            FROM ovino_animais a
            WHERE a.imovel_id = %s AND a.status = 'ativo'
            ORDER BY a.brinco
        """, (imovel_id,))
        animais = cur.fetchall()

        hoje = date_type.today()
        movidos = 0
        sem_alteracao = 0
        sem_dados = 0
        detalhes = []

        for animal in animais:
            animal = dict(animal)
            sexo = animal["sexo"]
            peso = float(animal["ultimo_peso"]) if animal["ultimo_peso"] else None
            dn = animal["data_nascimento"]
            idade_dias = (hoje - dn).days if dn else None

            fase_destino = None
            motivo = ""

            if (sexo == "F" and idade_dias is not None
                    and idade_dias >= config.idade_min_reproducao_dias
                    and peso is not None and peso >= config.peso_min_reproducao_femea):
                fase_destino = "reprodução"
                motivo = f"femea, {idade_dias}d, {peso}kg >= {config.peso_min_reproducao_femea}kg"

            elif sexo == "M" and peso is not None and peso >= config.peso_pre_abate_macho:
                fase_destino = "descarte"
                motivo = f"macho, peso {peso}kg >= {config.peso_pre_abate_macho}kg"

            elif idade_dias is not None and idade_dias < config.idade_max_cria_dias:
                fase_destino = "cria"
                motivo = f"idade {idade_dias}d < {config.idade_max_cria_dias}d"

            elif (idade_dias is not None and idade_dias <= config.idade_max_recria_dias
                    and (peso is None or peso < config.peso_min_engorda)):
                fase_destino = "recria"
                motivo = f"idade {idade_dias}d, peso {peso or '?'}kg"

            elif idade_dias is not None or peso is not None:
                fase_destino = "engorda"
                motivo = f"idade {idade_dias or '?'}d, peso {peso or '?'}kg"

            else:
                sem_dados += 1
                detalhes.append({"brinco": animal["brinco"], "acao": "sem_dados"})
                continue

            lote_destino_id = lote_ids[fase_destino]

            if animal["lote_id"] == lote_destino_id:
                sem_alteracao += 1
            else:
                if not config.dry_run:
                    cur.execute("UPDATE ovino_animais SET lote_id=%s, updated_at=NOW() WHERE id=%s",
                                (lote_destino_id, animal["id"]))
                    cur.execute("""
                        INSERT INTO ovino_saude (imovel_id, animal_id, tipo, data_evento, observacoes, registrado_por)
                        VALUES (%s, %s, 'outro', CURRENT_DATE, %s, 'sistema')
                    """, (imovel_id, animal["id"], f"Reclassificado para {fase_destino}: {motivo}"))
                alertas_criados_animal = 0
                if not config.dry_run:
                    from app.services.ovino_alertas import gerar_alertas_reclassificacao
                    alertas_criados_animal = gerar_alertas_reclassificacao(
                        cur, imovel_id, animal["id"], lote_destino_id, fase_destino
                    )
                movidos += 1
                detalhes.append({"brinco": animal["brinco"],
                                  "acao": "movido" if not config.dry_run else "seria_movido",
                                  "fase": fase_destino, "motivo": motivo,
                                  "alertas_criados": alertas_criados_animal})

        if not config.dry_run:
            conn.commit()

        return {"dry_run": config.dry_run, "total": len(animais),
                "movidos": movidos, "sem_alteracao": sem_alteracao,
                "sem_dados": sem_dados, "detalhes": detalhes}

    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ALERTAS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/alertas")
def listar_alertas(
    imovel_id: int = Query(...),
    status: Optional[str] = Query("pendente"),
    prioridade: Optional[str] = Query(None),
    lote_id: Optional[int] = Query(None),
    dias_proximos: Optional[int] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = """
            SELECT a.*, an.brinco AS animal_brinco, l.nome AS lote_nome
            FROM ovino_alertas a
            LEFT JOIN ovino_animais an ON an.id = a.animal_id
            LEFT JOIN ovino_lotes l ON l.id = a.lote_id
            WHERE a.imovel_id = %s
        """
        params = [imovel_id]
        if status:
            sql += " AND a.status = %s"; params.append(status)
        if prioridade:
            sql += " AND a.prioridade = %s"; params.append(prioridade)
        if lote_id:
            sql += " AND a.lote_id = %s"; params.append(lote_id)
        if dias_proximos:
            sql += " AND a.data_vencimento <= CURRENT_DATE + %s"; params.append(dias_proximos)
        sql += " ORDER BY a.prioridade DESC, a.data_vencimento ASC LIMIT 200"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.patch("/alertas/{alerta_id}/status")
def atualizar_status_alerta(
    alerta_id: int,
    novo_status: str = Query(..., pattern="^(concluido|cancelado|pendente)$"),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE ovino_alertas SET status = %s, updated_at = NOW()
            WHERE id = %s RETURNING id, tipo_alerta, status
        """, (novo_status, alerta_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Alerta não encontrado.")
        conn.commit()
        return dict(row)
    finally:
        conn.close()


@router.get("/alertas/resumo/{imovel_id}")
def resumo_alertas(imovel_id: int):
    """Contagem de alertas por prioridade e por lote — para o dashboard."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                prioridade,
                COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
                COUNT(*) FILTER (WHERE status = 'pendente'
                    AND data_vencimento <= CURRENT_DATE) AS vencidos,
                COUNT(*) FILTER (WHERE status = 'pendente'
                    AND data_vencimento = CURRENT_DATE + 1) AS amanha
            FROM ovino_alertas
            WHERE imovel_id = %s
            GROUP BY prioridade
            ORDER BY prioridade
        """, (imovel_id,))
        por_prioridade = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT l.nome AS lote_nome, l.fase,
                   COUNT(*) FILTER (WHERE a.status = 'pendente') AS alertas_pendentes
            FROM ovino_alertas a
            JOIN ovino_lotes l ON l.id = a.lote_id
            WHERE a.imovel_id = %s
            GROUP BY l.id, l.nome, l.fase
            HAVING COUNT(*) FILTER (WHERE a.status = 'pendente') > 0
            ORDER BY alertas_pendentes DESC
        """, (imovel_id,))
        por_lote = [dict(r) for r in cur.fetchall()]

        return {"por_prioridade": por_prioridade, "por_lote": por_lote}
    finally:
        conn.close()

# ══════════════════════════════════════════════════════════════════════════════
# WEBHOOK WHATSAPP
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/webhook/whatsapp")
def webhook_whatsapp_ovino(payload: WhatsAppMensagem):
    # 1. Classifica via IA (síncrono)
    classificacao = classificar_mensagem_sync(
        texto=payload.conteudo,
        imovel_id=payload.imovel_id,
    )

    intent      = classificacao["intent"]
    entidades   = classificacao["entidades"]
    confianca   = classificacao["confianca"]
    resumo      = classificacao["resumo"]
    evento_id   = None
    evento_tab  = None
    status_log  = "processado"
    erro_msg    = None

    conn = get_db()
    try:
        cur = conn.cursor()

        if confianca >= 0.5 and payload.imovel_id:

            if intent == "pesagem":
                animal = _buscar_animal(cur, entidades.get("brinco"), payload.imovel_id)
                if animal:
                    cur.execute("""
                        INSERT INTO ovino_pesagens
                            (animal_id, data_pesagem, peso_kg, motivo, registrado_por)
                        VALUES (%s, %s, %s, %s, %s) RETURNING id
                    """, (animal["id"], entidades.get("data_evento"), entidades.get("peso_kg"),
                          entidades.get("motivo", "rotina"), payload.telefone))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "ovino_pesagens"

            elif intent in ("vacinacao", "vermifugacao"):
                cur.execute("""
                    INSERT INTO ovino_saude
                        (imovel_id, tipo, data_evento, produto, dose_ml, via, registrado_por)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                """, (payload.imovel_id, intent, entidades.get("data_evento"),
                      entidades.get("produto"), entidades.get("dose_ml"),
                      entidades.get("via"), payload.telefone))
                evento_id = cur.fetchone()["id"]
                evento_tab = "ovino_saude"

            elif intent == "famacha":
                animal = _buscar_animal(cur, entidades.get("brinco"), payload.imovel_id)
                if animal:
                    cur.execute("""
                        INSERT INTO ovino_saude
                            (imovel_id, animal_id, tipo, data_evento, resultado, registrado_por)
                        VALUES (%s, %s, 'famacha', %s, %s, %s) RETURNING id
                    """, (payload.imovel_id, animal["id"], entidades.get("data_evento"),
                          str(entidades.get("escore", "")), payload.telefone))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "ovino_saude"

            elif intent == "parto":
                animal = _buscar_animal(cur, entidades.get("brinco_matriz"), payload.imovel_id)
                cur.execute("""
                    INSERT INTO ovino_reproducao
                        (imovel_id, tipo, data_evento, matriz_id,
                         cordeiros_vivos, cordeiros_mortos, registrado_por)
                    VALUES (%s, 'parto', %s, %s, %s, %s, %s) RETURNING id
                """, (payload.imovel_id, entidades.get("data_evento"),
                      animal["id"] if animal else None,
                      entidades.get("cordeiros_vivos", 0),
                      entidades.get("cordeiros_mortos", 0),
                      payload.telefone))
                evento_id = cur.fetchone()["id"]
                evento_tab = "ovino_reproducao"

            elif intent == "cadastro":
                try:
                    cur.execute("""
                        INSERT INTO ovino_animais
                            (imovel_id, brinco, sexo, raca, data_nascimento)
                        VALUES (%s, %s, %s, %s, %s) RETURNING id
                    """, (payload.imovel_id, entidades.get("brinco"),
                          entidades.get("sexo", "F"), entidades.get("raca"),
                          entidades.get("data_nascimento")))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "ovino_animais"
                except psycopg2.errors.UniqueViolation:
                    conn.rollback()
                    resumo = f"Animal {entidades.get('brinco')} já cadastrado."
            else:
                status_log = "ignorado"

        elif confianca < 0.5:
            status_log = "pendente"
            resumo = "Não entendi bem. Pode repetir com mais detalhes?"
        else:
            status_log = "ignorado"

        conn.commit()

    except Exception as e:
        conn.rollback()
        status_log = "erro"
        erro_msg = str(e)
        resumo = "Erro ao salvar. Tente novamente."
        logger.error("webhook_ovino erro: %s", e, exc_info=True)

    # Log da mensagem
    try:
        import json
        cur2 = conn.cursor()
        cur2.execute("""
            INSERT INTO ovino_whatsapp_log
                (telefone, tipo_midia, conteudo_raw, intent_detectada,
                 entidades_json, status, evento_id, evento_tabela, erro_msg)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
        """, (payload.telefone, payload.tipo_midia, payload.conteudo[:2000],
              intent, json.dumps(entidades, default=str),
              status_log, evento_id, evento_tab, erro_msg))
        conn.commit()
    except Exception as e:
        logger.warning("Falha ao salvar log WhatsApp: %s", e)
    finally:
        conn.close()

    return {
        "intent": intent,
        "confianca": confianca,
        "status": status_log,
        "resumo": resumo,
        "evento_id": evento_id,
        "evento_tabela": evento_tab,
    }


# ── Helper ────────────────────────────────────────────────────────────────────
def _buscar_animal(cur, brinco: Optional[str], imovel_id: int) -> Optional[dict]:
    if not brinco:
        return None
    cur.execute(
        "SELECT id, brinco FROM ovino_animais WHERE imovel_id=%s AND LOWER(brinco)=LOWER(%s)",
        (imovel_id, brinco)
    )
    row = cur.fetchone()
    return dict(row) if row else None
