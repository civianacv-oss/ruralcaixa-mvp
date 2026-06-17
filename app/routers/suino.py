"""
RuralCaixa — routers/suino.py
Módulo Suíno — compatível com o padrão psycopg2 síncrono do projeto.

Adicione em app/main.py:
    from app.routers.suino import router as suino_router
    if suino_router: app.include_router(suino_router)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime, timedelta
import psycopg2
import psycopg2.extras
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/suino", tags=["Suino"])

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ─────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────

class AnimalCreate(BaseModel):
    imovel_id: int
    brinco: str
    nome: Optional[str] = None
    raca: Optional[str] = None
    sexo: str = Field(..., pattern="^[MF]$")
    categoria: str = "leitao"
    data_nascimento: Optional[date] = None
    peso_nascimento: Optional[float] = None
    mae_id: Optional[int] = None
    pai_id: Optional[int] = None
    lote_id: Optional[int] = None
    observacoes: Optional[str] = None

class AnimalUpdate(BaseModel):
    brinco: Optional[str] = None
    nome: Optional[str] = None
    raca: Optional[str] = None
    sexo: Optional[str] = None
    categoria: Optional[str] = None
    lote_id: Optional[int] = None
    observacoes: Optional[str] = None
    novo_peso: Optional[float] = None

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
    cachaço_id: Optional[int] = None
    leitoes_vivos: int = 0
    leitoes_mortos: int = 0
    leitoes_mumificados: int = 0
    peso_medio_leitao: Optional[float] = None
    observacoes: Optional[str] = None
    registrado_por: Optional[str] = None

class AbateCreate(BaseModel):
    animal_id: int
    data_abate: date = Field(default_factory=date.today)
    peso_vivo_kg: Optional[float] = None
    peso_carcaca_kg: Optional[float] = None
    classificacao: str = "suino_pesado"
    destino: str = "frigorifico"
    valor_total_rs: Optional[float] = None
    comprador: Optional[str] = None
    registrado_por: Optional[str] = None

class LoteCreate(BaseModel):
    imovel_id: int
    nome: str
    fase: str = "leitao"
    data_inicio: date = Field(default_factory=date.today)

class AlertaStatusUpdate(BaseModel):
    novo_status: str


# ─────────────────────────────────────────────────────────────
# ANIMAIS
# ─────────────────────────────────────────────────────────────

@router.patch("/animais/{animal_id}")
def atualizar_animal(animal_id: int, dados: AnimalUpdate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM suino_animais WHERE id = %s", (animal_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Animal não encontrado")

        campos = []
        valores = []
        for campo in ["brinco", "nome", "raca", "sexo", "categoria", "lote_id", "observacoes"]:
            val = getattr(dados, campo)
            if val is not None:
                campos.append(f"{campo} = %s")
                valores.append(val)

        if campos:
            valores.append(animal_id)
            cur.execute(f"UPDATE suino_animais SET {', '.join(campos)} WHERE id = %s", valores)

        if dados.novo_peso is not None:
            cur.execute("""
                INSERT INTO suino_pesagens (animal_id, peso_kg, motivo)
                VALUES (%s, %s, 'rotina')
            """, (animal_id, dados.novo_peso))

        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/animais", status_code=201)
def cadastrar_animal(dados: AnimalCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO suino_animais
                (imovel_id, brinco, nome, raca, sexo, categoria,
                 data_nascimento, peso_nascimento, mae_id, pai_id, lote_id, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (dados.imovel_id, dados.brinco, dados.nome, dados.raca, dados.sexo,
              dados.categoria, dados.data_nascimento, dados.peso_nascimento,
              dados.mae_id, dados.pai_id, dados.lote_id, dados.observacoes))
        animal_id = cur.fetchone()["id"]

        if dados.peso_nascimento:
            cur.execute("""
                INSERT INTO suino_pesagens (animal_id, peso_kg, motivo)
                VALUES (%s, %s, 'nascimento')
            """, (animal_id, dados.peso_nascimento))

        conn.commit()
        return {"id": animal_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/animais")
def listar_animais(
    imovel_id: int = Query(...),
    status: Optional[str] = Query(None),
    lote_id: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        filtros = ["a.imovel_id = %s"]
        params = [imovel_id]
        if status:
            filtros.append("a.status = %s"); params.append(status)
        if lote_id:
            filtros.append("a.lote_id = %s"); params.append(lote_id)
        if categoria:
            filtros.append("a.categoria = %s"); params.append(categoria)

        cur.execute(f"""
            SELECT a.*,
                   l.nome AS lote_nome,
                   (SELECT peso_kg FROM suino_pesagens WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS ultimo_peso,
                   (SELECT data_pesagem FROM suino_pesagens WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS data_ultimo_peso
            FROM suino_animais a
            LEFT JOIN suino_lotes l ON l.id = a.lote_id
            WHERE {' AND '.join(filtros)}
            ORDER BY a.brinco
        """, params)
        return cur.fetchall()
    finally:
        conn.close()


@router.get("/animais/{animal_id}")
def detalhar_animal(animal_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT a.*, l.nome AS lote_nome
            FROM suino_animais a
            LEFT JOIN suino_lotes l ON l.id = a.lote_id
            WHERE a.id = %s
        """, (animal_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Animal não encontrado")
        return dict(row)
    finally:
        conn.close()


@router.patch("/animais/{animal_id}/status")
def atualizar_status(animal_id: int, novo_status: str = Query(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE suino_animais SET status = %s WHERE id = %s", (novo_status, animal_id))
        conn.commit()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# LOTES
# ─────────────────────────────────────────────────────────────

@router.post("/lotes", status_code=201)
def criar_lote(dados: LoteCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO suino_lotes (imovel_id, nome, fase, data_inicio)
            VALUES (%s, %s, %s, %s) RETURNING id
        """, (dados.imovel_id, dados.nome, dados.fase, dados.data_inicio))
        lote_id = cur.fetchone()["id"]
        conn.commit()
        return {"id": lote_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/lotes")
def listar_lotes(imovel_id: int = Query(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT l.*,
                   COUNT(a.id) FILTER (WHERE a.status='ativo') AS total_animais
            FROM suino_lotes l
            LEFT JOIN suino_animais a ON a.lote_id = l.id
            WHERE l.imovel_id = %s AND l.ativo = TRUE
            GROUP BY l.id
            ORDER BY l.data_inicio DESC
        """, (imovel_id,))
        return cur.fetchall()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# PESAGENS
# ─────────────────────────────────────────────────────────────

@router.post("/pesagens", status_code=201)
def registrar_pesagem(dados: PesagemCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO suino_pesagens (animal_id, data_pesagem, peso_kg, motivo, registrado_por)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        """, (dados.animal_id, dados.data_pesagem, dados.peso_kg, dados.motivo, dados.registrado_por))
        pesagem_id = cur.fetchone()["id"]
        conn.commit()
        return {"id": pesagem_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/pesagens/{animal_id}")
def historico_pesagens(animal_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM suino_pesagens
            WHERE animal_id = %s
            ORDER BY data_pesagem DESC
        """, (animal_id,))
        return cur.fetchall()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# SAÚDE / SANITÁRIO
# ─────────────────────────────────────────────────────────────

@router.post("/saude", status_code=201)
def registrar_saude(dados: SaudeCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO suino_saude
                (imovel_id, animal_id, lote_id, tipo, data_evento,
                 produto, dose_ml, via, proximo_em, resultado, registrado_por, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (dados.imovel_id, dados.animal_id, dados.lote_id, dados.tipo,
              dados.data_evento, dados.produto, dados.dose_ml, dados.via,
              dados.proximo_em, dados.resultado, dados.registrado_por, dados.observacoes))
        saude_id = cur.fetchone()["id"]
        conn.commit()
        return {"id": saude_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/sanitario/historico")
def historico_sanitario(imovel_id: int = Query(...), limit: int = Query(50)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT s.*, a.brinco AS animal_brinco, l.nome AS lote_nome
            FROM suino_saude s
            LEFT JOIN suino_animais a ON a.id = s.animal_id
            LEFT JOIN suino_lotes l ON l.id = s.lote_id
            WHERE s.imovel_id = %s
            ORDER BY s.data_evento DESC
            LIMIT %s
        """, (imovel_id, limit))
        return cur.fetchall()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# REPRODUÇÃO
# ─────────────────────────────────────────────────────────────

@router.post("/reproducao", status_code=201)
def registrar_reproducao(dados: ReproducaoCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO suino_reproducao
                (imovel_id, tipo, data_evento, matriz_id, cachaço_id,
                 leitoes_vivos, leitoes_mortos, leitoes_mumificados,
                 peso_medio_leitao, observacoes, registrado_por)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (dados.imovel_id, dados.tipo, dados.data_evento,
              dados.matriz_id, dados.cachaço_id,
              dados.leitoes_vivos, dados.leitoes_mortos, dados.leitoes_mumificados,
              dados.peso_medio_leitao, dados.observacoes, dados.registrado_por))
        rep_id = cur.fetchone()["id"]

        # Ao registrar parto, cria os leitões automaticamente se informado
        if dados.tipo == "parto" and dados.leitoes_vivos > 0:
            for i in range(dados.leitoes_vivos):
                brinco_temp = f"L{rep_id}-{i+1:02d}"
                cur.execute("""
                    INSERT INTO suino_animais
                        (imovel_id, brinco, sexo, categoria, mae_id, peso_nascimento)
                    VALUES (%s, %s, 'M', 'leitao', %s, %s)
                    ON CONFLICT (imovel_id, brinco) DO NOTHING
                """, (dados.imovel_id, brinco_temp, dados.matriz_id, dados.peso_medio_leitao))

        conn.commit()
        return {"id": rep_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# ABATES / SAÍDAS
# ─────────────────────────────────────────────────────────────

@router.post("/abates", status_code=201)
def registrar_abate(dados: AbateCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO suino_abates
                (animal_id, data_abate, peso_vivo_kg, peso_carcaca_kg,
                 classificacao, destino, valor_total_rs, comprador, registrado_por)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
        """, (dados.animal_id, dados.data_abate, dados.peso_vivo_kg, dados.peso_carcaca_kg,
              dados.classificacao, dados.destino, dados.valor_total_rs,
              dados.comprador, dados.registrado_por))
        abate_id = cur.fetchone()["id"]
        cur.execute("UPDATE suino_animais SET status = 'abatido' WHERE id = %s", (dados.animal_id,))
        conn.commit()
        return {"id": abate_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────────────────

@router.get("/dashboard/{imovel_id}")
def dashboard_suino(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status='ativo')                           AS total_ativo,
                COUNT(*) FILTER (WHERE status='ativo' AND sexo='F'
                                   AND categoria IN ('matriz','reproducao'))      AS matrizes,
                COUNT(*) FILTER (WHERE status='ativo' AND sexo='M'
                                   AND categoria = 'cachaço')                    AS cachacos,
                COUNT(*) FILTER (WHERE status='ativo' AND categoria='terminacao') AS terminacao,
                COUNT(*) FILTER (WHERE status='ativo' AND categoria IN ('leitao','creche','recria')) AS jovens
            FROM suino_animais WHERE imovel_id = %s
        """, (imovel_id,))
        rebanho = dict(cur.fetchone())

        cur.execute("""
            SELECT
                COUNT(*)                        AS total_abatidos,
                ROUND(AVG(peso_carcaca_kg), 2)  AS media_carcaca_kg,
                ROUND(AVG(rendimento_pct), 2)   AS media_rendimento_pct,
                ROUND(SUM(valor_total_rs), 2)   AS receita_total_rs
            FROM suino_abates ab
            JOIN suino_animais a ON a.id = ab.animal_id
            WHERE a.imovel_id = %s
              AND ab.data_abate >= CURRENT_DATE - INTERVAL '30 days'
        """, (imovel_id,))
        abates = dict(cur.fetchone())

        cur.execute("""
            SELECT COUNT(*) AS total_partos,
                   SUM(leitoes_vivos)        AS leitoes_vivos,
                   SUM(leitoes_mortos)       AS leitoes_mortos,
                   SUM(leitoes_mumificados)  AS leitoes_mumificados
            FROM suino_reproducao
            WHERE imovel_id = %s AND tipo = 'parto'
              AND data_evento >= CURRENT_DATE - INTERVAL '30 days'
        """, (imovel_id,))
        partos = dict(cur.fetchone())

        cur.execute("""
            SELECT COUNT(*) AS total_alertas
            FROM suino_alertas
            WHERE imovel_id = %s AND status = 'pendente'
        """, (imovel_id,))
        alertas = dict(cur.fetchone())

        return {
            "rebanho": rebanho,
            "abates_30d": abates,
            "partos_30d": partos,
            "alertas_pendentes": alertas,
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# INDICADORES POR LOTE
# ─────────────────────────────────────────────────────────────

@router.get("/indicadores/{imovel_id}")
def indicadores_lotes(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                l.id AS lote_id, l.nome AS lote_nome, l.fase,
                COUNT(a.id) FILTER (WHERE a.status='ativo')   AS animais_ativos,
                COUNT(a.id) FILTER (WHERE a.status='morto')   AS mortes,
                COUNT(a.id) FILTER (WHERE a.status='abatido') AS abates,
                ROUND(AVG(p.peso_kg), 2)                       AS peso_medio_atual,
                ROUND(AVG(EXTRACT(DAY FROM NOW() - l.data_inicio)), 0) AS dias_medio_lote
            FROM suino_lotes l
            LEFT JOIN suino_animais a ON a.lote_id = l.id
            LEFT JOIN LATERAL (
                SELECT peso_kg FROM suino_pesagens
                WHERE animal_id = a.id
                ORDER BY data_pesagem DESC LIMIT 1
            ) p ON TRUE
            WHERE l.imovel_id = %s AND l.ativo = TRUE
            GROUP BY l.id, l.nome, l.fase
            ORDER BY l.data_inicio DESC
        """, (imovel_id,))
        return cur.fetchall()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# ALERTAS
# ─────────────────────────────────────────────────────────────

@router.get("/alertas")
def listar_alertas(
    imovel_id: int = Query(...),
    status: Optional[str] = Query("pendente"),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT al.*, a.brinco AS animal_brinco, l.nome AS lote_nome
            FROM suino_alertas al
            LEFT JOIN suino_animais a ON a.id = al.animal_id
            LEFT JOIN suino_lotes l ON l.id = al.lote_id
            WHERE al.imovel_id = %s AND al.status = %s
            ORDER BY
                CASE al.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
                al.created_at DESC
        """, (imovel_id, status))
        return cur.fetchall()
    finally:
        conn.close()


@router.patch("/alertas/{alerta_id}/status")
def atualizar_alerta(alerta_id: int, dados: AlertaStatusUpdate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE suino_alertas SET status = %s WHERE id = %s
        """, (dados.novo_status, alerta_id))
        conn.commit()
        return {"ok": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# PREVISÃO DE RAÇÃO
# ─────────────────────────────────────────────────────────────

@router.get("/racao/previsao/{imovel_id}")
def previsao_racao(imovel_id: int):
    """
    Calcula consumo estimado de ração por lote com base no peso médio.
    Suínos consomem ~3-4% do peso vivo/dia em matéria seca.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                l.id AS lote_id, l.nome AS lote_nome, l.fase,
                COUNT(a.id) FILTER (WHERE a.status='ativo') AS animais,
                ROUND(AVG(p.peso_kg), 2) AS peso_medio
            FROM suino_lotes l
            LEFT JOIN suino_animais a ON a.lote_id = l.id AND a.status = 'ativo'
            LEFT JOIN LATERAL (
                SELECT peso_kg FROM suino_pesagens
                WHERE animal_id = a.id
                ORDER BY data_pesagem DESC LIMIT 1
            ) p ON TRUE
            WHERE l.imovel_id = %s AND l.ativo = TRUE
            GROUP BY l.id, l.nome, l.fase
            HAVING COUNT(a.id) FILTER (WHERE a.status='ativo') > 0
        """, (imovel_id,))
        lotes = cur.fetchall()

        # Percentual de consumo por fase (% do peso vivo/dia)
        pct_fase = {
            "maternidade": 0.04, "leitao": 0.08, "creche": 0.05,
            "recria": 0.04, "terminacao": 0.03,
            "gestacao": 0.025, "reproducao": 0.025, "descarte": 0.025,
        }

        resultado = []
        total_dia = 0.0
        for lote in lotes:
            lote = dict(lote)
            peso = float(lote["peso_medio"] or 0)
            animais = int(lote["animais"] or 0)
            pct = pct_fase.get(lote["fase"], 0.035)
            racao_dia = round(peso * pct * animais, 1)
            total_dia += racao_dia
            resultado.append({
                **lote,
                "pct_consumo_dia": pct,
                "racao_dia_kg": racao_dia,
                "racao_7d_kg": round(racao_dia * 7, 1),
                "racao_30d_kg": round(racao_dia * 30, 1),
            })

        return {
            "por_lote": resultado,
            "totais": {
                "racao_dia_kg": round(total_dia, 1),
                "racao_7d_kg": round(total_dia * 7, 1),
                "racao_30d_kg": round(total_dia * 30, 1),
            }
        }
    finally:
        conn.close()
