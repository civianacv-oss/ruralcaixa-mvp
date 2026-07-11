"""
RuralCaixa — routers/caprino.py  (v2 — psycopg2 síncrono)
Compatível com o padrão do main_api.py existente.

Adicione em main_api.py:
    from routers.caprino import router as caprino_router
    app.include_router(caprino_router)
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime, timedelta
import psycopg2
import psycopg2.extras
import logging
import sys
import os

# Importa o serviço de IA
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.services.caprino_ia import classificar_mensagem_sync

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/caprino", tags=["Caprino"])

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
    cabritos_vivos: int = 0
    cabritos_mortos: int = 0
    observacoes: Optional[str] = None
    registrado_por: Optional[str] = None

class RegistrarPesagemIn(BaseModel):
    animal_id: int
    data_pesagem: date = Field(default_factory=date.today)
    peso_kg: float
    motivo: str = "rotina"
    registrado_por: Optional[str] = None


@router.post("/pesagens")
def registrar_pesagem(data: RegistrarPesagemIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO caprino_pesagens (animal_id, data_pesagem, peso_kg, motivo, registrado_por)
            VALUES (%s,%s,%s,%s,%s)
            RETURNING id, animal_id, data_pesagem, peso_kg, motivo
            """,
            (data.animal_id, data.data_pesagem, data.peso_kg, data.motivo, data.registrado_por),
        )
        row = dict(cur.fetchone())
        conn.commit()
        return row
    finally:
        conn.close()


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

@router.patch("/animais/{animal_id}")
def editar_animal(animal_id: int, payload: dict):
    conn = get_db()
    try:
        cur = conn.cursor()
        campos = []
        valores = []
        for campo in ["brinco","sexo","raca","data_nascimento","lote_id","observacoes"]:
            if campo in payload:
                campos.append(f"{campo} = %s")
                valores.append(payload[campo] if payload[campo] != "" else None)
        if not campos:
            raise HTTPException(400, "Nenhum campo informado.")
        campos.append("updated_at = NOW()")
        valores.append(animal_id)
        cur.execute(f"""
            UPDATE caprino_animais SET {", ".join(campos)}
            WHERE id = %s RETURNING id, brinco, sexo, raca, lote_id, status
        """, valores)
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Animal não encontrado.")
        conn.commit()
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


def _limpar_unicode(valor):
    """Remove surrogates soltos e outros caracteres inválidos que às vezes
    sobrevivem de exports de planilha/HTML malformados — sem isso, o
    psycopg2 quebra com UnicodeEncodeError ao gravar no Postgres."""
    if valor is None or not isinstance(valor, str):
        return valor
    return valor.encode("utf-8", errors="replace").decode("utf-8")


def _limpar_unicode_dict(d: dict) -> dict:
    return {k: _limpar_unicode(v) for k, v in d.items()}


@router.post("/animais", status_code=201)
def criar_animal(payload: AnimalCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO caprino_animais
                (imovel_id, brinco, nome, raca, sexo, data_nascimento,
                 peso_nascimento, mae_id, pai_id, lote_id, observacoes)
            VALUES
                (%(imovel_id)s, %(brinco)s, %(nome)s, %(raca)s, %(sexo)s,
                 %(data_nascimento)s, %(peso_nascimento)s, %(mae_id)s,
                 %(pai_id)s, %(lote_id)s, %(observacoes)s)
            RETURNING id, brinco, status, created_at
        """, _limpar_unicode_dict(payload.model_dump()))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, f"Brinco '{payload.brinco}' já cadastrado neste imóvel.")
    except (UnicodeError, UnicodeEncodeError, UnicodeDecodeError) as e:
        conn.rollback()
        raise HTTPException(400, f"Caractere inválido em algum campo de texto do animal '{payload.brinco}': {e}")
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
                   (SELECT peso_kg FROM caprino_pesagens
                    WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS ultimo_peso,
                   (SELECT data_pesagem FROM caprino_pesagens
                    WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS data_ultimo_peso
            FROM caprino_animais a
            LEFT JOIN caprino_lotes l ON l.id = a.lote_id
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
            FROM caprino_animais a
            LEFT JOIN caprino_lotes l ON l.id = a.lote_id
            LEFT JOIN caprino_animais m ON m.id = a.mae_id
            LEFT JOIN caprino_animais p ON p.id = a.pai_id
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
            UPDATE caprino_animais SET status = %s, updated_at = NOW()
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
            INSERT INTO caprino_lotes (imovel_id, nome, fase, data_inicio)
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
            FROM caprino_lotes l
            LEFT JOIN caprino_animais a ON a.lote_id = l.id
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
def criar_pesagem(payload: dict):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO caprino_pesagens (animal_id, peso_kg, data_pesagem, motivo, registrado_por)
            VALUES (%s, %s, COALESCE(%s::date, CURRENT_DATE), %s, %s)
            RETURNING id, animal_id, peso_kg, data_pesagem
        """, (
            payload["animal_id"],
            payload["peso_kg"],
            payload.get("data_pesagem"),
            payload.get("motivo", "manual"),
            payload.get("registrado_por", "usuario"),
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/pesagens", status_code=201)
def criar_pesagem(payload: dict):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO caprino_pesagens (animal_id, peso_kg, data_pesagem, motivo, registrado_por)
            VALUES (%s, %s, COALESCE(%s::date, CURRENT_DATE), %s, %s)
            RETURNING id, animal_id, peso_kg, data_pesagem
        """, (
            payload["animal_id"],
            payload["peso_kg"],
            payload.get("data_pesagem"),
            payload.get("motivo", "manual"),
            payload.get("registrado_por", "usuario"),
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/pesagens", status_code=201)
def criar_pesagem(payload: dict):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO caprino_pesagens (animal_id, peso_kg, data_pesagem, motivo, registrado_por)
            VALUES (%s, %s, COALESCE(%s::date, CURRENT_DATE), %s, %s)
            RETURNING id, animal_id, peso_kg, data_pesagem
        """, (
            payload["animal_id"],
            payload["peso_kg"],
            payload.get("data_pesagem"),
            payload.get("motivo", "manual"),
            payload.get("registrado_por", "usuario"),
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/pesagens", status_code=201)
def criar_pesagem(payload: dict):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO caprino_pesagens (animal_id, peso_kg, data_pesagem, motivo, registrado_por)
            VALUES (%s, %s, COALESCE(%s::date, CURRENT_DATE), %s, %s)
            RETURNING id, animal_id, peso_kg, data_pesagem
        """, (
            payload["animal_id"],
            payload["peso_kg"],
            payload.get("data_pesagem"),
            payload.get("motivo", "manual"),
            payload.get("registrado_por", "usuario"),
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/pesagens", status_code=201)
def criar_pesagem(payload: dict):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO caprino_pesagens (animal_id, peso_kg, data_pesagem, motivo, registrado_por)
            VALUES (%s, %s, COALESCE(%s::date, CURRENT_DATE), %s, %s)
            RETURNING id, animal_id, peso_kg, data_pesagem
        """, (
            payload["animal_id"],
            payload["peso_kg"],
            payload.get("data_pesagem"),
            payload.get("motivo", "manual"),
            payload.get("registrado_por", "usuario"),
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
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
            FROM caprino_pesagens p
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
            INSERT INTO caprino_saude
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
            FROM caprino_saude s
            LEFT JOIN caprino_animais a ON a.id = s.animal_id
            LEFT JOIN caprino_lotes l ON l.id = s.lote_id
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
            INSERT INTO caprino_reproducao
                (imovel_id, tipo, data_evento, matriz_id, reprodutor_id,
                 cabritos_vivos, cabritos_mortos, observacoes, registrado_por)
            VALUES
                (%(imovel_id)s, %(tipo)s, %(data_evento)s, %(matriz_id)s,
                 %(reprodutor_id)s, %(cabritos_vivos)s, %(cabritos_mortos)s,
                 %(observacoes)s, %(registrado_por)s)
            RETURNING id, tipo, data_evento, cabritos_vivos
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
            INSERT INTO caprino_abates
                (animal_id, data_abate, peso_vivo_kg, peso_carcaca_kg,
                 destino, valor_total_rs, comprador, registrado_por)
            VALUES
                (%(animal_id)s, %(data_abate)s, %(peso_vivo_kg)s, %(peso_carcaca_kg)s,
                 %(destino)s, %(valor_total_rs)s, %(comprador)s, %(registrado_por)s)
            RETURNING id, animal_id, data_abate, peso_vivo_kg, peso_carcaca_kg, rendimento_pct
        """, payload.model_dump())
        row = dict(cur.fetchone())
        MAPA_STATUS_BAIXA = {
            "abate_proprio": "abatido",
            "abate_frigorif": "abatido",
            "venda": "vendido",
            "morte": "morto",
            "doacao": "descartado",
            "permuta": "descartado",
        }
        novo_status = MAPA_STATUS_BAIXA.get(payload.destino, "abatido")
        cur.execute(
            "UPDATE caprino_animais SET status=%s, updated_at=NOW() WHERE id=%s",
            (novo_status, payload.animal_id)
        )
        conn.commit()
        return row
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard/{imovel_id}")
def dashboard_caprino(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status='ativo')              AS total_ativo,
                COUNT(*) FILTER (WHERE status='ativo' AND sexo='F') AS matrizes,
                COUNT(*) FILTER (WHERE status='ativo' AND sexo='M') AS reprodutores
            FROM caprino_animais WHERE imovel_id = %s
        """, (imovel_id,))
        rebanho = dict(cur.fetchone())

        cur.execute("""
            SELECT
                COUNT(*)                        AS total_abatidos,
                ROUND(AVG(peso_carcaca_kg), 2)  AS media_carcaca_kg,
                ROUND(AVG(rendimento_pct), 2)   AS media_rendimento_pct,
                ROUND(SUM(valor_total_rs), 2)   AS receita_total_rs
            FROM caprino_abates ab
            JOIN caprino_animais a ON a.id = ab.animal_id
            WHERE a.imovel_id = %s
              AND ab.data_abate >= CURRENT_DATE - INTERVAL '30 days'
        """, (imovel_id,))
        abates = dict(cur.fetchone())

        cur.execute("""
            SELECT COUNT(*) AS total_partos,
                   SUM(cabritos_vivos)   AS cabritos_vivos,
                   SUM(cabritos_mortos)  AS cabritos_mortos
            FROM caprino_reproducao
            WHERE imovel_id = %s AND tipo = 'parto'
              AND data_evento >= CURRENT_DATE - INTERVAL '30 days'
        """, (imovel_id,))
        partos = dict(cur.fetchone())

        cur.execute("""
            SELECT COUNT(*) AS total_alertas
            FROM caprino_saude
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
                SELECT id FROM caprino_lotes
                WHERE imovel_id = %s AND fase = %s AND ativo = TRUE
                ORDER BY data_inicio DESC LIMIT 1
            """, (imovel_id, fase))
            row = cur.fetchone()
            if row:
                lote_ids[fase] = row["id"]
            else:
                cur.execute("""
                    INSERT INTO caprino_lotes (imovel_id, nome, fase, data_inicio)
                    VALUES (%s, %s, %s, CURRENT_DATE) RETURNING id
                """, (imovel_id, nomes_padrao[fase], fase))
                lote_ids[fase] = cur.fetchone()["id"]

        if not config.dry_run:
            conn.commit()

        cur.execute("""
            SELECT a.id, a.brinco, a.sexo, a.lote_id, a.data_nascimento,
                   (SELECT peso_kg FROM caprino_pesagens WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS ultimo_peso
            FROM caprino_animais a
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
                    cur.execute("UPDATE caprino_animais SET lote_id=%s, updated_at=NOW() WHERE id=%s",
                                (lote_destino_id, animal["id"]))
                    cur.execute("""
                        INSERT INTO caprino_saude (imovel_id, animal_id, tipo, data_evento, observacoes, registrado_por)
                        VALUES (%s, %s, 'outro', CURRENT_DATE, %s, 'sistema')
                    """, (imovel_id, animal["id"], f"Reclassificado para {fase_destino}: {motivo}"))
                alertas_criados_animal = 0
                tarefas_criadas_animal = 0
                if not config.dry_run:
                    from app.services.caprino_alertas import gerar_alertas_reclassificacao
                    alertas_criados_animal = gerar_alertas_reclassificacao(
                        cur, imovel_id, animal["id"], lote_destino_id, fase_destino
                    )
                    from app.services.caprino_tarefas import gerar_tarefas_por_protocolo
                    tarefas_criadas_animal = gerar_tarefas_por_protocolo(
                        cur, imovel_id, animal["id"], lote_destino_id, fase_destino
                    )
                if not config.dry_run:
                    # Registra movimentação de lote via função SQL
                    cur.execute(
                        "SELECT registrar_movimentacao_lote(%s, %s, %s, 'reclassificacao')",
                        (animal["id"], lote_destino_id, imovel_id)
                    )
                movidos += 1
                detalhes.append({"brinco": animal["brinco"],
                                  "acao": "movido" if not config.dry_run else "seria_movido",
                                  "fase": fase_destino, "motivo": motivo,
                                  "alertas_criados": alertas_criados_animal,
                                  "tarefas_criadas": tarefas_criadas_animal})

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
            FROM caprino_alertas a
            LEFT JOIN caprino_animais an ON an.id = a.animal_id
            LEFT JOIN caprino_lotes l ON l.id = a.lote_id
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
            UPDATE caprino_alertas SET status = %s, updated_at = NOW()
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
            FROM caprino_alertas
            WHERE imovel_id = %s
            GROUP BY prioridade
            ORDER BY prioridade
        """, (imovel_id,))
        por_prioridade = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT l.nome AS lote_nome, l.fase,
                   COUNT(*) FILTER (WHERE a.status = 'pendente') AS alertas_pendentes
            FROM caprino_alertas a
            JOIN caprino_lotes l ON l.id = a.lote_id
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
# TAREFAS ZOOTÉCNICAS
# ══════════════════════════════════════════════════════════════════════════════

class TarefaCreate(BaseModel):
    imovel_id: int
    animal_id: Optional[int] = None
    lote_id: Optional[int] = None
    tipo: str
    titulo: str
    descricao: Optional[str] = None
    prioridade: str = "media"
    data_prevista: date
    data_vencimento: Optional[date] = None
    responsavel_nome: Optional[str] = None
    responsavel_telefone: Optional[str] = None
    recorrencia_dias: Optional[int] = None
    origem: str = "manual"


@router.get("/tarefas")
def listar_tarefas(
    imovel_id: int = Query(...),
    status: Optional[str] = Query("pendente"),
    tipo: Optional[str] = Query(None),
    animal_id: Optional[int] = Query(None),
    lote_id: Optional[int] = Query(None),
    dias_proximos: Optional[int] = Query(None),
    prioridade: Optional[str] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = """
            SELECT t.*,
                   a.brinco AS animal_brinco,
                   l.nome AS lote_nome,
                   l.fase AS lote_fase
            FROM caprino_tarefas t
            LEFT JOIN caprino_animais a ON a.id = t.animal_id
            LEFT JOIN caprino_lotes l ON l.id = t.lote_id
            WHERE t.imovel_id = %s
        """
        params = [imovel_id]
        if status:
            sql += " AND t.status = %s"; params.append(status)
        if tipo:
            sql += " AND t.tipo = %s"; params.append(tipo)
        if animal_id:
            sql += " AND t.animal_id = %s"; params.append(animal_id)
        if lote_id:
            sql += " AND t.lote_id = %s"; params.append(lote_id)
        if prioridade:
            sql += " AND t.prioridade = %s"; params.append(prioridade)
        if dias_proximos:
            sql += " AND t.data_vencimento <= CURRENT_DATE + %s"; params.append(dias_proximos)
        sql += " ORDER BY t.prioridade DESC, t.data_vencimento ASC LIMIT 200"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/tarefas", status_code=201)
def criar_tarefa(payload: TarefaCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        data_venc = payload.data_vencimento or (payload.data_prevista + timedelta(days=3))

        import hashlib
        h_raw = f"{payload.animal_id or ''}:{payload.lote_id or ''}:{payload.imovel_id}:{payload.tipo}:{payload.titulo.lower().strip()}:{payload.data_prevista.isoformat()}:{payload.origem}"
        h = hashlib.sha256(h_raw.encode()).hexdigest()

        cur.execute("""
            INSERT INTO caprino_tarefas
                (imovel_id, animal_id, lote_id, tipo, titulo, descricao,
                 prioridade, data_prevista, data_vencimento,
                 responsavel_nome, responsavel_telefone,
                 recorrencia_dias, origem, hash_unicidade)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id, titulo, status, data_prevista
        """, (payload.imovel_id, payload.animal_id, payload.lote_id,
              payload.tipo, payload.titulo, payload.descricao,
              payload.prioridade, payload.data_prevista, data_venc,
              payload.responsavel_nome, payload.responsavel_telefone,
              payload.recorrencia_dias, payload.origem, h))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(409, "Tarefa já existe.")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/tarefas/{tarefa_id}/concluir")
def concluir_tarefa_endpoint(
    tarefa_id: int,
    executado_por: str = Query("usuario"),
    observacao: Optional[str] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        from app.services.caprino_tarefas import concluir_tarefa
        nova_id = concluir_tarefa(cur, tarefa_id, executado_por, observacao)
        conn.commit()
        return {
            "status": "concluida",
            "tarefa_id": tarefa_id,
            "proxima_tarefa_id": nova_id,
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.patch("/tarefas/{tarefa_id}/reagendar")
def reagendar_tarefa(
    tarefa_id: int,
    nova_data: date = Query(...),
    motivo: Optional[str] = Query(None),
    executado_por: str = Query("usuario"),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE caprino_tarefas
            SET data_prevista=%s, data_vencimento=%s+3, status='reagendada',
                status_detalhe=%s, updated_at=NOW()
            WHERE id=%s RETURNING id, titulo, data_prevista
        """, (nova_data, nova_data, motivo, tarefa_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tarefa não encontrada.")
        cur.execute("""
            INSERT INTO caprino_tarefa_execucao
                (tarefa_id, acao, executado_por, observacao, reagendado_para, status_resultante)
            VALUES (%s,'reagendada',%s,%s,%s,'reagendada')
        """, (tarefa_id, executado_por, motivo, nova_data))
        conn.commit()
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/tarefas/resumo/{imovel_id}")
def resumo_tarefas(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                prioridade,
                COUNT(*) FILTER (WHERE status='pendente')                          AS pendentes,
                COUNT(*) FILTER (WHERE status='pendente'
                    AND data_vencimento < CURRENT_DATE)                            AS atrasadas,
                COUNT(*) FILTER (WHERE status='pendente'
                    AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE+7)   AS esta_semana,
                COUNT(*) FILTER (WHERE status='concluida'
                    AND data_conclusao >= CURRENT_DATE-30)                         AS concluidas_30d
            FROM caprino_tarefas
            WHERE imovel_id = %s
            GROUP BY prioridade ORDER BY prioridade
        """, (imovel_id,))
        por_prioridade = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT tipo,
                   COUNT(*) FILTER (WHERE status='pendente') AS pendentes
            FROM caprino_tarefas
            WHERE imovel_id = %s
            GROUP BY tipo HAVING COUNT(*) FILTER (WHERE status='pendente') > 0
            ORDER BY pendentes DESC
        """, (imovel_id,))
        por_tipo = [dict(r) for r in cur.fetchall()]

        return {"por_prioridade": por_prioridade, "por_tipo": por_tipo}
    finally:
        conn.close()


@router.get("/tarefas/{tarefa_id}/historico")
def historico_tarefa(tarefa_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM caprino_tarefa_execucao
            WHERE tarefa_id = %s ORDER BY executado_em DESC
        """, (tarefa_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/protocolos")
def listar_protocolos(imovel_id: Optional[int] = Query(None)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.*, COUNT(e.id) AS total_etapas
            FROM caprino_protocolo_manejo p
            LEFT JOIN caprino_protocolo_etapa e ON e.protocolo_id = p.id AND e.ativo = TRUE
            WHERE p.ativo = TRUE AND (p.imovel_id = %s OR p.imovel_id IS NULL)
            GROUP BY p.id ORDER BY p.fase_lote
        """, (imovel_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# PROTOCOLO SANITÁRIO
# ══════════════════════════════════════════════════════════════════════════════

class AplicacaoSanitariaCreate(BaseModel):
    imovel_id: int
    insumo_id: int
    animal_id: Optional[int] = None
    lote_id: Optional[int] = None
    data_aplicacao: date = Field(default_factory=date.today)
    dose_ml: Optional[float] = None
    via: Optional[str] = None
    lote_produto: Optional[str] = None
    validade_produto: Optional[date] = None
    dias_carencia_override: Optional[int] = None  # sobrescreve o padrão do insumo
    responsavel_nome: Optional[str] = None
    responsavel_tel: Optional[str] = None
    observacoes: Optional[str] = None
    origem: str = "manual"


@router.get("/sanitario/insumos")
def listar_insumos(
    imovel_id: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = "SELECT * FROM caprino_insumo_sanitario WHERE ativo = TRUE"
        params = []
        if categoria:
            sql += " AND categoria = %s"; params.append(categoria)
        sql += " ORDER BY categoria, nome_comercial"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/sanitario/aplicar", status_code=201)
def registrar_aplicacao(payload: AplicacaoSanitariaCreate):
    """
    Registra aplicação sanitária (individual ou por lote).
    Gera automaticamente:
    - Período de carência por animal/lote
    - Tarefa de reforço se o insumo exigir
    - Bloqueio de abate durante carência
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Busca insumo para obter defaults
        cur.execute("SELECT * FROM caprino_insumo_sanitario WHERE id = %s", (payload.insumo_id,))
        insumo = cur.fetchone()
        if not insumo:
            raise HTTPException(404, "Insumo não encontrado.")
        ins = dict(insumo)

        dias_carencia = payload.dias_carencia_override \
            if payload.dias_carencia_override is not None \
            else (ins["dias_carencia"] or 0)

        dose = payload.dose_ml or ins["dose_padrao_ml"]
        via = payload.via or ins["via_padrao"]

        # Se aplicação por lote, expande para todos os animais ativos
        animais_alvo = []
        if payload.lote_id and not payload.animal_id:
            cur.execute("""
                SELECT id, brinco FROM caprino_animais
                WHERE lote_id = %s AND status = 'ativo'
            """, (payload.lote_id,))
            animais_alvo = [dict(r) for r in cur.fetchall()]
        elif payload.animal_id:
            animais_alvo = [{"id": payload.animal_id}]

        aplicacoes_criadas = []
        tarefas_reforco = 0

        for animal in animais_alvo if animais_alvo else [{"id": None}]:
            animal_id = animal.get("id")

            # Calcula reforço
            reforco_previsto = None
            if ins["dias_reforco"] and not ins.get("reforco_aplicado"):
                reforco_previsto = payload.data_aplicacao + timedelta(days=ins["dias_reforco"])

            cur.execute("""
                INSERT INTO caprino_sanitario_aplicacao
                    (imovel_id, insumo_id, animal_id, lote_id, data_aplicacao,
                     dose_ml, via, lote_produto, validade_produto, fabricante,
                     dias_carencia, reforco_previsto,
                     responsavel_nome, responsavel_tel, observacoes, origem)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, data_liberacao, reforco_previsto
            """, (payload.imovel_id, payload.insumo_id, animal_id, payload.lote_id,
                  payload.data_aplicacao, dose, via, payload.lote_produto,
                  payload.validade_produto, ins["fabricante"],
                  dias_carencia, reforco_previsto,
                  payload.responsavel_nome, payload.responsavel_tel,
                  payload.observacoes, payload.origem))
            aplic = dict(cur.fetchone())
            aplicacoes_criadas.append(aplic)

            # Gera tarefa de reforço se necessário
            if reforco_previsto and ins["reforco_obrigatorio"] and animal_id:
                import hashlib
                titulo_reforco = f"💉 Reforço: {ins['nome_comercial']}"
                h_raw = f"{animal_id}::{payload.imovel_id}:vacina:{titulo_reforco.lower()}:{reforco_previsto.isoformat()}:protocolo"
                h = hashlib.sha256(h_raw.encode()).hexdigest()
                cur.execute("""
                    INSERT INTO caprino_tarefas
                        (imovel_id, animal_id, lote_id, tipo, titulo,
                         prioridade, data_prevista, data_vencimento,
                         origem, responsavel_nome, responsavel_telefone, hash_unicidade)
                    VALUES (%s,%s,%s,'vacina',%s,'alta',%s,%s,'protocolo',%s,%s,%s)
                    ON CONFLICT (hash_unicidade) DO NOTHING
                    RETURNING id
                """, (payload.imovel_id, animal_id, payload.lote_id, titulo_reforco,
                      reforco_previsto, reforco_previsto + timedelta(days=5),
                      payload.responsavel_nome, payload.responsavel_tel, h))
                row = cur.fetchone()
                if row:
                    tarefas_reforco += 1
                    # Vincula tarefa à aplicação
                    cur.execute("""
                        UPDATE caprino_sanitario_aplicacao
                        SET tarefa_reforco_id = %s WHERE id = %s
                    """, (dict(row)["id"], aplic["id"]))

        conn.commit()

        return {
            "aplicacoes_criadas": len(aplicacoes_criadas),
            "animais_tratados": len([a for a in animais_alvo if a.get("id")]) or 1,
            "dias_carencia": dias_carencia,
            "data_liberacao": aplicacoes_criadas[0]["data_liberacao"].isoformat() if aplicacoes_criadas else None,
            "reforco_previsto": aplicacoes_criadas[0]["reforco_previsto"].isoformat() if aplicacoes_criadas and aplicacoes_criadas[0].get("reforco_previsto") else None,
            "tarefas_reforco_criadas": tarefas_reforco,
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/sanitario/carencias")
def listar_carencias(
    imovel_id: int = Query(...),
    incluir_lote: Optional[int] = Query(None),
):
    """Retorna animais/lotes com carência ativa — bloqueia abate."""
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = """
            SELECT * FROM caprino_carencias_ativas
            WHERE imovel_id = %s
        """
        params = [imovel_id]
        if incluir_lote:
            sql += " AND lote_id = %s"; params.append(incluir_lote)
        sql += " ORDER BY dias_restantes ASC"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/sanitario/verificar-abate/{animal_id}")
def verificar_carencia_abate(animal_id: int):
    """
    Verifica se o animal está liberado para abate.
    Considera carências do animal e do lote ao qual pertence.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Busca lote atual do animal
        cur.execute("SELECT lote_id, brinco FROM caprino_animais WHERE id = %s", (animal_id,))
        animal = cur.fetchone()
        if not animal:
            raise HTTPException(404, "Animal não encontrado.")
        a = dict(animal)

        # Verifica carência do animal
        cur.execute("""
            SELECT * FROM caprino_carencias_ativas
            WHERE animal_id = %s
            ORDER BY data_liberacao DESC LIMIT 1
        """, (animal_id,))
        carencia_animal = cur.fetchone()

        # Verifica carência do lote
        carencia_lote = None
        if a["lote_id"]:
            cur.execute("""
                SELECT * FROM caprino_carencias_ativas
                WHERE lote_id = %s
                ORDER BY data_liberacao DESC LIMIT 1
            """, (a["lote_id"],))
            carencia_lote = cur.fetchone()

        bloqueado = carencia_animal is not None or carencia_lote is not None
        maior_carencia = None
        if carencia_animal and carencia_lote:
            ca = dict(carencia_animal)
            cl = dict(carencia_lote)
            maior_carencia = ca if ca["data_liberacao"] >= cl["data_liberacao"] else cl
        elif carencia_animal:
            maior_carencia = dict(carencia_animal)
        elif carencia_lote:
            maior_carencia = dict(carencia_lote)

        return {
            "animal_id": animal_id,
            "brinco": a["brinco"],
            "liberado_para_abate": not bloqueado,
            "carencia_ativa": maior_carencia,
            "data_liberacao": maior_carencia["data_liberacao"].isoformat() if maior_carencia else None,
            "dias_restantes": maior_carencia["dias_restantes"] if maior_carencia else 0,
        }
    finally:
        conn.close()


@router.get("/sanitario/historico")
def historico_sanitario(
    imovel_id: int = Query(...),
    animal_id: Optional[int] = Query(None),
    lote_id: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    limit: int = Query(50),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = """
            SELECT ap.*,
                   ins.nome_comercial, ins.principio_ativo, ins.categoria,
                   an.brinco AS animal_brinco,
                   l.nome AS lote_nome,
                   ap.data_liberacao,
                   CASE WHEN ap.data_liberacao >= CURRENT_DATE THEN TRUE ELSE FALSE END AS carencia_ativa
            FROM caprino_sanitario_aplicacao ap
            JOIN caprino_insumo_sanitario ins ON ins.id = ap.insumo_id
            LEFT JOIN caprino_animais an ON an.id = ap.animal_id
            LEFT JOIN caprino_lotes l ON l.id = ap.lote_id
            WHERE ap.imovel_id = %s
        """
        params = [imovel_id]
        if animal_id:
            sql += " AND ap.animal_id = %s"; params.append(animal_id)
        if lote_id:
            sql += " AND ap.lote_id = %s"; params.append(lote_id)
        if categoria:
            sql += " AND ins.categoria = %s"; params.append(categoria)
        sql += f" ORDER BY ap.data_aplicacao DESC LIMIT {limit}"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/sanitario/calendario")
def calendario_sanitario(
    imovel_id: int = Query(...),
    dias: int = Query(60),
):
    """Próximas aplicações previstas: reforços pendentes + tarefas sanitárias."""
    conn = get_db()
    try:
        cur = conn.cursor()

        # Reforços pendentes de aplicações já feitas
        cur.execute("""
            SELECT
                ap.reforco_previsto AS data_prevista,
                ins.nome_comercial,
                ins.categoria,
                'reforco' AS tipo,
                an.brinco AS animal_brinco,
                l.nome AS lote_nome,
                ap.responsavel_nome
            FROM caprino_sanitario_aplicacao ap
            JOIN caprino_insumo_sanitario ins ON ins.id = ap.insumo_id
            LEFT JOIN caprino_animais an ON an.id = ap.animal_id
            LEFT JOIN caprino_lotes l ON l.id = ap.lote_id
            WHERE ap.imovel_id = %s
              AND ap.reforco_previsto IS NOT NULL
              AND ap.reforco_aplicado = FALSE
              AND ap.reforco_previsto <= CURRENT_DATE + %s
            ORDER BY ap.reforco_previsto
        """, (imovel_id, dias))
        reforcos = [dict(r) for r in cur.fetchall()]

        # Tarefas sanitárias pendentes
        cur.execute("""
            SELECT t.data_prevista, t.titulo AS nome_comercial,
                   t.tipo AS categoria, 'tarefa' AS tipo,
                   an.brinco AS animal_brinco, l.nome AS lote_nome,
                   t.responsavel_nome
            FROM caprino_tarefas t
            LEFT JOIN caprino_animais an ON an.id = t.animal_id
            LEFT JOIN caprino_lotes l ON l.id = t.lote_id
            WHERE t.imovel_id = %s
              AND t.tipo IN ('vacina','vermifugacao')
              AND t.status = 'pendente'
              AND t.data_prevista <= CURRENT_DATE + %s
            ORDER BY t.data_prevista
        """, (imovel_id, dias))
        tarefas_san = [dict(r) for r in cur.fetchall()]

        return {
            "reforcos_pendentes": reforcos,
            "tarefas_sanitarias": tarefas_san,
            "total": len(reforcos) + len(tarefas_san),
        }
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# MOVIMENTAÇÕES DE LOTE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/movimentacoes/{animal_id}")
def historico_movimentacoes(animal_id: int):
    """Histórico completo de lotes de um animal."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT m.*, l.nome AS lote_nome, l.fase
            FROM caprino_movimentacao_lote m
            JOIN caprino_lotes l ON l.id = m.lote_id
            WHERE m.animal_id = %s
            ORDER BY m.data_entrada DESC
        """, (animal_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# INDICADORES ZOOTÉCNICOS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/indicadores/{imovel_id}")
def indicadores_por_lote(imovel_id: int):
    """
    KPIs zootécnicos por lote: GMD, peso médio, mortalidade, abate, projeção.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Indicadores da view
        cur.execute("""
            SELECT *,
                -- Projeção de abate: dias para atingir 35kg no GMD atual
                CASE
                    WHEN gmd_kg_dia > 0 AND peso_medio_atual IS NOT NULL AND peso_medio_atual < 35
                    THEN ROUND((35 - peso_medio_atual) / gmd_kg_dia)
                    WHEN peso_medio_atual >= 35 THEN 0
                    ELSE NULL
                END AS dias_projecao_abate_35kg
            FROM caprino_indicadores_lote
            WHERE imovel_id = %s
            ORDER BY fase
        """, (imovel_id,))
        lotes = [dict(r) for r in cur.fetchall()]

        # Consolidado do imóvel
        cur.execute("""
            SELECT
                SUM(animais_ativos)                                 AS total_ativo,
                ROUND(AVG(gmd_kg_dia)::NUMERIC, 3)                  AS gmd_medio,
                ROUND(AVG(peso_medio_atual)::NUMERIC, 2)            AS peso_medio_geral,
                SUM(mortes)                                         AS total_mortes,
                SUM(abates)                                         AS total_abates,
                ROUND(AVG(taxa_mortalidade_pct)::NUMERIC, 1)        AS taxa_mortalidade_media
            FROM caprino_indicadores_lote
            WHERE imovel_id = %s
        """, (imovel_id,))
        consolidado = dict(cur.fetchone())

        return {
            "consolidado": consolidado,
            "por_lote": lotes,
        }
    finally:
        conn.close()


@router.get("/indicadores/animal/{animal_id}")
def indicadores_animal(animal_id: int):
    """GMD, ganho total, dias no lote atual e projeção para um animal específico."""
    conn = get_db()
    try:
        cur = conn.cursor()

        # Pesagens ordenadas
        cur.execute("""
            SELECT peso_kg, data_pesagem,
                   ROUND(
                       (peso_kg - LAG(peso_kg) OVER (ORDER BY data_pesagem)) /
                       NULLIF(data_pesagem - LAG(data_pesagem) OVER (ORDER BY data_pesagem), 0)
                   ::NUMERIC, 3) AS gmd_periodo
            FROM caprino_pesagens
            WHERE animal_id = %s
            ORDER BY data_pesagem
        """, (animal_id,))
        pesagens = [dict(r) for r in cur.fetchall()]

        # Movimentação atual
        cur.execute("""
            SELECT m.*, l.nome AS lote_nome, l.fase
            FROM caprino_movimentacao_lote m
            JOIN caprino_lotes l ON l.id = m.lote_id
            WHERE m.animal_id = %s AND m.ativa = TRUE
            LIMIT 1
        """, (animal_id,))
        movim = cur.fetchone()
        movim_atual = dict(movim) if movim else None

        # Calcula GMD geral
        if len(pesagens) >= 2:
            primeiro = pesagens[0]
            ultimo = pesagens[-1]
            dias_total = (ultimo["data_pesagem"] - primeiro["data_pesagem"]).days
            gmd_geral = round(
                (float(ultimo["peso_kg"]) - float(primeiro["peso_kg"])) / dias_total, 3
            ) if dias_total > 0 else None
            ganho_total = round(float(ultimo["peso_kg"]) - float(primeiro["peso_kg"]), 2)
        else:
            gmd_geral = None
            ganho_total = None

        # Projeção de abate
        peso_atual = float(pesagens[-1]["peso_kg"]) if pesagens else None
        projecao_35 = None
        projecao_40 = None
        if gmd_geral and peso_atual:
            if peso_atual < 35:
                projecao_35 = round((35 - peso_atual) / gmd_geral)
            if peso_atual < 40:
                projecao_40 = round((40 - peso_atual) / gmd_geral)

        # Custo de insumos vinculados (item "Rebanho x Insumos"): direto no animal
        # OU rateado pelo lote (mesmo padrão usado no módulo Bovino).
        cur.execute("""
            SELECT COALESCE(SUM(custo_total), 0) AS custo_direto
            FROM movimentacoes_insumo
            WHERE animal_id = %s AND tipo = 'uso' AND especie = 'caprinos'
              AND data_movim >= CURRENT_DATE - 30
        """, (animal_id,))
        custo_direto = float(cur.fetchone()["custo_direto"] or 0)

        custo_lote_rateado = 0.0
        if movim_atual and movim_atual.get("lote_id"):
            cur.execute("SELECT COUNT(*) AS qtd FROM caprino_animais WHERE lote_id = %s AND status = 'ativo'", (movim_atual["lote_id"],))
            qtd_lote = cur.fetchone()["qtd"] or 1
            cur.execute("""
                SELECT COALESCE(SUM(custo_total), 0) AS custo_lote
                FROM movimentacoes_insumo
                WHERE lote_id = %s AND tipo = 'uso' AND especie = 'caprinos' AND data_movim >= CURRENT_DATE - 30
            """, (movim_atual["lote_id"],))
            custo_lote_rateado = float(cur.fetchone()["custo_lote"] or 0) / qtd_lote

        custo_insumos_periodo = round(custo_direto + custo_lote_rateado, 2)
        custo_por_kg_ganho = round(custo_insumos_periodo / ganho_total, 2) if ganho_total and ganho_total > 0 else None

        return {
            "pesagens": pesagens,
            "gmd_geral": gmd_geral,
            "ganho_total_kg": ganho_total,
            "peso_atual": peso_atual,
            "movimentacao_atual": movim_atual,
            "custo_insumos_periodo": custo_insumos_periodo,
            "custo_por_kg_ganho": custo_por_kg_ganho,
            "projecao_abate": {
                "meta_35kg": {"dias": projecao_35, "data": (
                    (date.today() + timedelta(days=projecao_35)).isoformat()
                    if projecao_35 else None
                )},
                "meta_40kg": {"dias": projecao_40, "data": (
                    (date.today() + timedelta(days=projecao_40)).isoformat()
                    if projecao_40 else None
                )},
            }
        }
    finally:
        conn.close()


@router.post("/desvios/processar")
def processar_desvios_endpoint(imovel_id: Optional[int] = Query(None)):
    """Detecta desvios zootécnicos e emite alertas. Chamado pelo cron."""
    try:
        from app.services.caprino_desvios import processar_desvios_caprinos
        return processar_desvios_caprinos(imovel_id=imovel_id)
    except Exception as e:
        raise HTTPException(500, str(e))


# ══════════════════════════════════════════════════════════════════════════════
# PREVISÃO DE DEMANDA DE RAÇÃO
# ══════════════════════════════════════════════════════════════════════════════

class RacaoConfigUpdate(BaseModel):
    pct_ms_racao: Optional[float] = None
    preco_racao_kg: Optional[float] = None
    estoque_atual_kg: Optional[float] = None
    margem_seguranca_dias: Optional[int] = None
    perda_cocho_pct: Optional[float] = None


def _resolver_fase_racao(fase_lote: str, sexo: str) -> str:
    """Mapeia fase do lote para categoria de consumo de ração."""
    if fase_lote == "reprodução":
        return "matriz_seca" if sexo == "F" else "reprodutor"
    mapa = {
        "cria": "cria", "recria": "recria",
        "engorda": "engorda", "descarte": "descarte",
    }
    return mapa.get(fase_lote, "engorda")


@router.get("/racao/previsao/{imovel_id}")
def previsao_racao(imovel_id: int):
    """
    Calcula previsão de demanda de ração por lote e total da fazenda.
    Retorna consumo diário, projeção 7/15/30 dias, custo e alerta de estoque.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Configuração da fazenda
        cur.execute("""
            SELECT * FROM caprino_racao_config WHERE imovel_id = %s
        """, (imovel_id,))
        config_row = cur.fetchone()
        config = dict(config_row) if config_row else {
            "pct_ms_racao": 88.0, "preco_racao_kg": None,
            "estoque_atual_kg": None, "margem_seguranca_dias": 7,
            "perda_cocho_pct": 5.0
        }

        pct_ms = float(config["pct_ms_racao"]) / 100
        perda = float(config["perda_cocho_pct"]) / 100
        preco = float(config["preco_racao_kg"]) if config["preco_racao_kg"] else None
        estoque = float(config["estoque_atual_kg"]) if config["estoque_atual_kg"] else None
        margem_dias = config["margem_seguranca_dias"] or 7

        # Parâmetros de consumo por fase
        cur.execute("""
            SELECT fase, pct_ms_pv_dia FROM caprino_racao_parametro
            WHERE ativo = TRUE AND (imovel_id = %s OR imovel_id IS NULL)
            ORDER BY imovel_id DESC NULLS LAST
        """, (imovel_id,))
        params_ms = {}
        for r in cur.fetchall():
            p = dict(r)
            if p["fase"] not in params_ms:
                params_ms[p["fase"]] = float(p["pct_ms_pv_dia"]) / 100

        # Animais ativos com última pesagem e lote
        cur.execute("""
            SELECT a.id, a.brinco, a.sexo, a.lote_id,
                   l.nome AS lote_nome, l.fase AS lote_fase,
                   (SELECT peso_kg FROM caprino_pesagens
                    WHERE animal_id = a.id
                    ORDER BY data_pesagem DESC LIMIT 1) AS peso_atual
            FROM caprino_animais a
            LEFT JOIN caprino_lotes l ON l.id = a.lote_id
            WHERE a.imovel_id = %s AND a.status = 'ativo'
        """, (imovel_id,))
        animais = [dict(r) for r in cur.fetchall()]

        # Calcula por lote
        lotes_calc = {}
        total_ms_dia = 0.0
        sem_peso = 0

        for a in animais:
            peso = float(a["peso_atual"]) if a["peso_atual"] else None
            if not peso:
                sem_peso += 1
                continue

            fase_racao = _resolver_fase_racao(a.get("lote_fase") or "engorda", a.get("sexo", "M"))
            pct = params_ms.get(fase_racao, 0.035)

            ms_animal_dia = peso * pct
            racao_animal_dia = (ms_animal_dia / pct_ms) * (1 + perda)

            lote_key = a.get("lote_id") or 0
            lote_nome = a.get("lote_nome") or "Sem lote"
            fase_lote = a.get("lote_fase") or "—"

            if lote_key not in lotes_calc:
                lotes_calc[lote_key] = {
                    "lote_id": lote_key,
                    "lote_nome": lote_nome,
                    "fase": fase_lote,
                    "fase_racao": fase_racao,
                    "animais": 0,
                    "peso_total": 0.0,
                    "ms_dia": 0.0,
                    "racao_dia": 0.0,
                    "pct_ms_usado": round(pct * 100, 1),
                }

            lotes_calc[lote_key]["animais"] += 1
            lotes_calc[lote_key]["peso_total"] += peso
            lotes_calc[lote_key]["ms_dia"] += ms_animal_dia
            lotes_calc[lote_key]["racao_dia"] += racao_animal_dia
            total_ms_dia += ms_animal_dia

        # Monta resultado por lote
        por_lote = []
        for lk, l in lotes_calc.items():
            r_dia = round(l["racao_dia"], 2)
            custo_dia = round(r_dia * preco, 2) if preco else None
            por_lote.append({
                **l,
                "peso_medio": round(l["peso_total"] / l["animais"], 1) if l["animais"] else None,
                "ms_dia": round(l["ms_dia"], 2),
                "racao_dia_kg": r_dia,
                "racao_7d_kg": round(r_dia * 7, 1),
                "racao_15d_kg": round(r_dia * 15, 1),
                "racao_30d_kg": round(r_dia * 30, 1),
                "custo_dia_rs": custo_dia,
                "custo_30d_rs": round(custo_dia * 30, 2) if custo_dia else None,
            })

        # Totais da fazenda
        total_racao_dia = sum(l["racao_dia_kg"] for l in por_lote)
        total_custo_dia = round(total_racao_dia * preco, 2) if preco else None

        # Alerta de estoque
        alerta_estoque = None
        dias_estoque = None
        if estoque and total_racao_dia > 0:
            dias_estoque = round(estoque / total_racao_dia, 1)
            if dias_estoque <= margem_dias:
                alerta_estoque = {
                    "severidade": "alta" if dias_estoque <= 3 else "media",
                    "mensagem": f"Estoque para {dias_estoque} dias — reposição necessária",
                    "repor_kg": round(total_racao_dia * 30 - estoque, 1),
                    "custo_reposicao_rs": round((total_racao_dia * 30 - estoque) * preco, 2) if preco else None,
                }

        return {
            "config": {
                "pct_ms_racao": config["pct_ms_racao"],
                "perda_cocho_pct": config["perda_cocho_pct"],
                "preco_racao_kg": preco,
                "estoque_atual_kg": estoque,
                "margem_seguranca_dias": margem_dias,
            },
            "por_lote": sorted(por_lote, key=lambda x: x["racao_dia_kg"], reverse=True),
            "totais": {
                "animais_com_peso": sum(l["animais"] for l in por_lote),
                "animais_sem_peso": sem_peso,
                "racao_dia_kg": round(total_racao_dia, 2),
                "racao_7d_kg": round(total_racao_dia * 7, 1),
                "racao_15d_kg": round(total_racao_dia * 15, 1),
                "racao_30d_kg": round(total_racao_dia * 30, 1),
                "custo_dia_rs": total_custo_dia,
                "custo_30d_rs": round(total_custo_dia * 30, 2) if total_custo_dia else None,
                "dias_estoque_restante": dias_estoque,
            },
            "alerta_estoque": alerta_estoque,
        }
    finally:
        conn.close()


@router.patch("/racao/config/{imovel_id}")
def atualizar_config_racao(imovel_id: int, payload: RacaoConfigUpdate):
    """Atualiza configuração de ração da fazenda."""
    conn = get_db()
    try:
        cur = conn.cursor()
        fields = []
        values = []
        if payload.pct_ms_racao is not None:
            fields.append("pct_ms_racao = %s"); values.append(payload.pct_ms_racao)
        if payload.preco_racao_kg is not None:
            fields.append("preco_racao_kg = %s"); values.append(payload.preco_racao_kg)
        if payload.estoque_atual_kg is not None:
            fields.append("estoque_atual_kg = %s"); values.append(payload.estoque_atual_kg)
            fields.append("data_ultimo_estoque = CURRENT_DATE")
        if payload.margem_seguranca_dias is not None:
            fields.append("margem_seguranca_dias = %s"); values.append(payload.margem_seguranca_dias)
        if payload.perda_cocho_pct is not None:
            fields.append("perda_cocho_pct = %s"); values.append(payload.perda_cocho_pct)

        if not fields:
            raise HTTPException(400, "Nenhum campo informado.")

        fields.append("updated_at = NOW()")
        values.append(imovel_id)

        cur.execute(f"""
            INSERT INTO caprino_racao_config (imovel_id) VALUES (%s)
            ON CONFLICT (imovel_id) DO NOTHING
        """, (imovel_id,))
        cur.execute(f"""
            UPDATE caprino_racao_config SET {", ".join(fields)}
            WHERE imovel_id = %s
        """, values)
        conn.commit()
        return {"status": "atualizado", "imovel_id": imovel_id}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# CONTROLE DE MORTALIDADE
# ══════════════════════════════════════════════════════════════════════════════

CAUSAS_CATEGORIA = {
    "doenca": ["respiratoria","digestiva","clostridiose","parasitaria","nervosa","outro"],
    "acidente": ["trauma","afogamento","intoxicacao","outro"],
    "predador": ["cao","onca","raposa","outro"],
    "neonatal": ["natimorto","hipotermia","inanição","malformacao","outro"],
    "descarte_sanitario": ["brucelose","tuberculose","outro"],
    "causa_desconhecida": [],
    "outro": [],
}

def _calcular_faixa_etaria(data_nascimento, data_morte) -> str:
    if not data_nascimento:
        return "desconhecida"
    dias = (data_morte - data_nascimento).days
    if dias < 30:
        return "neonatal"
    if dias < 180:
        return "jovem"
    return "adulto"


class MorteCreate(BaseModel):
    imovel_id: int
    animal_id: int
    data_morte: date = Field(default_factory=date.today)
    causa_categoria: str
    causa_subcategoria: Optional[str] = None
    diagnostico: Optional[str] = None
    peso_morte_kg: Optional[float] = None
    observacoes: Optional[str] = None
    registrado_por: Optional[str] = None
    origem: str = "dashboard"


@router.post("/mortalidade", status_code=201)
def registrar_morte(payload: MorteCreate):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Busca dados do animal
        cur.execute("""
            SELECT a.*, l.id AS lote_id_atual
            FROM caprino_animais a
            LEFT JOIN caprino_lotes l ON l.id = a.lote_id
            WHERE a.id = %s AND a.status = 'ativo'
        """, (payload.animal_id,))
        animal = cur.fetchone()
        if not animal:
            raise HTTPException(404, "Animal não encontrado ou já inativo.")
        a = dict(animal)

        faixa = _calcular_faixa_etaria(a.get("data_nascimento"), payload.data_morte)

        # Registra morte
        cur.execute("""
            INSERT INTO caprino_mortalidade
                (imovel_id, animal_id, lote_id, data_morte,
                 causa_categoria, causa_subcategoria, diagnostico,
                 faixa_etaria, peso_morte_kg, observacoes,
                 registrado_por, origem)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (payload.imovel_id, payload.animal_id, a.get("lote_id"),
              payload.data_morte, payload.causa_categoria,
              payload.causa_subcategoria, payload.diagnostico,
              faixa, payload.peso_morte_kg, payload.observacoes,
              payload.registrado_por, payload.origem))
        morte_id = cur.fetchone()["id"]

        # Atualiza status do animal
        cur.execute("""
            UPDATE caprino_animais
            SET status = 'morto', data_morte = %s,
                causa_morte_id = %s, updated_at = NOW()
            WHERE id = %s
        """, (payload.data_morte, morte_id, payload.animal_id))

        # Verifica se deve gerar alerta de cluster
        cur.execute("""
            SELECT COUNT(*) AS mortes, causa_categoria
            FROM caprino_mortalidade
            WHERE lote_id = %s AND data_morte >= %s
            GROUP BY causa_categoria
            ORDER BY mortes DESC LIMIT 1
        """, (a.get("lote_id"), payload.data_morte - timedelta(days=7)))
        cluster = cur.fetchone()

        alerta_cluster = None
        if cluster:
            c = dict(cluster)
            if c["mortes"] >= 2:
                alerta_cluster = {
                    "tipo": "cluster_mortalidade",
                    "causa": c["causa_categoria"],
                    "mortes_7d": c["mortes"],
                    "mensagem": f"⚠️ Cluster: {c['mortes']} mortes por {c['causa_categoria']} em 7 dias no lote"
                }
                # Gera alerta no sistema
                import hashlib
                h = hashlib.sha256(
                    f"{a.get('lote_id')}:cluster_mortalidade:{payload.causa_categoria}:{payload.data_morte.isoformat()[:7]}".encode()
                ).hexdigest()
                cur.execute("""
                    INSERT INTO caprino_alertas
                        (imovel_id, lote_id, tipo_alerta, titulo, prioridade,
                         data_referencia, data_vencimento, origem_evento, hash_unicidade)
                    VALUES (%s,%s,'cluster_mortalidade',%s,'alta',CURRENT_DATE,CURRENT_DATE+1,'desvio',%s)
                    ON CONFLICT (hash_unicidade) DO NOTHING
                """, (payload.imovel_id, a.get("lote_id"),
                      alerta_cluster["mensagem"], h))

        conn.commit()
        return {
            "morte_id": morte_id,
            "brinco": a["brinco"],
            "faixa_etaria": faixa,
            "causa": f"{payload.causa_categoria}/{payload.causa_subcategoria or '—'}",
            "alerta_cluster": alerta_cluster,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/mortalidade/{imovel_id}")
def listar_mortes(
    imovel_id: int,
    dias: int = Query(90),
    causa_categoria: Optional[str] = Query(None),
    lote_id: Optional[int] = Query(None),
):
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = """
            SELECT m.*, a.brinco, a.sexo, a.data_nascimento,
                   l.nome AS lote_nome, l.fase AS lote_fase
            FROM caprino_mortalidade m
            JOIN caprino_animais a ON a.id = m.animal_id
            LEFT JOIN caprino_lotes l ON l.id = m.lote_id
            WHERE m.imovel_id = %s AND m.data_morte >= %s
        """
        params = [imovel_id, date.today() - timedelta(days=dias)]
        if causa_categoria:
            sql += " AND m.causa_categoria = %s"; params.append(causa_categoria)
        if lote_id:
            sql += " AND m.lote_id = %s"; params.append(lote_id)
        sql += " ORDER BY m.data_morte DESC LIMIT 200"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/mortalidade/indicadores/{imovel_id}")
def indicadores_mortalidade(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Por lote
        cur.execute("""
            SELECT * FROM caprino_mortalidade_indicadores
            WHERE imovel_id = %s
            ORDER BY mortes_30d DESC
        """, (imovel_id,))
        por_lote = [dict(r) for r in cur.fetchall()]

        # Por causa (90 dias)
        cur.execute("""
            SELECT causa_categoria, causa_subcategoria,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE data_morte >= CURRENT_DATE-30) AS ultimos_30d
            FROM caprino_mortalidade
            WHERE imovel_id = %s AND data_morte >= CURRENT_DATE - 90
            GROUP BY causa_categoria, causa_subcategoria
            ORDER BY total DESC
        """, (imovel_id,))
        por_causa = [dict(r) for r in cur.fetchall()]

        # Tendência mensal (12 meses)
        cur.execute("""
            SELECT TO_CHAR(data_morte, 'YYYY-MM') AS mes,
                   COUNT(*) AS mortes,
                   COUNT(*) FILTER (WHERE causa_categoria = 'doenca') AS doenca,
                   COUNT(*) FILTER (WHERE causa_categoria = 'neonatal') AS neonatal
            FROM caprino_mortalidade
            WHERE imovel_id = %s AND data_morte >= CURRENT_DATE - 365
            GROUP BY mes ORDER BY mes
        """, (imovel_id,))
        tendencia = [dict(r) for r in cur.fetchall()]

        # Alertas de taxa alta
        alertas_taxa = []
        for l in por_lote:
            taxa = float(l["taxa_mortalidade_30d_pct"] or 0)
            mortes = l["mortes_30d"]
            if taxa > 5 or (taxa > 3 and mortes >= 2):
                alertas_taxa.append({
                    "lote_nome": l["lote_nome"],
                    "taxa": taxa,
                    "mortes_30d": mortes,
                    "severidade": "alta" if taxa > 5 else "media",
                })

        return {
            "por_lote": por_lote,
            "por_causa": por_causa,
            "tendencia_mensal": tendencia,
            "alertas_taxa": alertas_taxa,
        }
    finally:
        conn.close()


@router.get("/mortalidade/causas/lista")
def listar_causas():
    """Retorna categorias e subcategorias disponíveis."""
    return CAUSAS_CATEGORIA


# ══════════════════════════════════════════════════════════════════════════════
# MANEJO DE PASTAGEM
# ══════════════════════════════════════════════════════════════════════════════

class PiqueteCreate(BaseModel):
    imovel_id: int
    nome: str
    area_ha: float
    forrageira: Optional[str] = None
    capacidade_suporte_ua_ha: float = 5.0
    peso_referencia_ua_kg: float = 450.0
    fator_equivalencia_caprino: float = 0.15
    dias_ocupacao_padrao: int = 7
    dias_descanso_padrao: int = 28
    criterio_rotacao: str = "DIAS"
    observacoes: Optional[str] = None


class MoverLoteRequest(BaseModel):
    lote_id: int
    registrado_por: Optional[str] = None
    origem: str = "dashboard"


@router.get("/pastagem/piquetes/{imovel_id}")
def listar_piquetes(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM caprino_piquete_status
            WHERE imovel_id = %s
            ORDER BY status, piquete_nome
        """, (imovel_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.post("/pastagem/piquetes", status_code=201)
def criar_piquete(payload: PiqueteCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO caprino_piquete
                (imovel_id, nome, area_ha, forrageira,
                 capacidade_suporte_ua_ha, peso_referencia_ua_kg,
                 fator_equivalencia_caprino, dias_ocupacao_padrao,
                 dias_descanso_padrao, criterio_rotacao, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id, nome, area_ha, status
        """, (payload.imovel_id, payload.nome, payload.area_ha,
              payload.forrageira, payload.capacidade_suporte_ua_ha,
              payload.peso_referencia_ua_kg, payload.fator_equivalencia_caprino,
              payload.dias_ocupacao_padrao, payload.dias_descanso_padrao,
              payload.criterio_rotacao, payload.observacoes))
        row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/pastagem/piquetes/{piquete_id}/mover-lote")
def mover_lote_para_piquete(piquete_id: int, payload: MoverLoteRequest):
    """
    Move um lote para o piquete. Fecha o piquete anterior e abre o novo.
    Calcula UA e pressão de pastejo automaticamente.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Busca piquete
        cur.execute("SELECT * FROM caprino_piquete WHERE id = %s AND ativo = TRUE", (piquete_id,))
        piquete = cur.fetchone()
        if not piquete:
            raise HTTPException(404, "Piquete não encontrado.")
        p = dict(piquete)

        if p["status"] == "descanso":
            raise HTTPException(422, f"Piquete em descanso até {p['data_liberacao_descanso']}.")
        if p["status"] == "recuperacao":
            raise HTTPException(422, "Piquete em recuperação — não pode receber lote.")

        # Calcula UA do lote
        cur.execute("""
            SELECT COUNT(*) AS total,
                   SUM(COALESCE((
                       SELECT peso_kg FROM caprino_pesagens
                       WHERE animal_id = a.id
                       ORDER BY data_pesagem DESC LIMIT 1
                   ), 0)) AS peso_total
            FROM caprino_animais a
            WHERE a.lote_id = %s AND a.status = 'ativo'
        """, (payload.lote_id,))
        lote_info = dict(cur.fetchone())
        ua_lote = round(lote_info["total"] * p["fator_equivalencia_caprino"], 2)
        capacidade = round(p["area_ha"] * p["capacidade_suporte_ua_ha"], 2)
        pressao = round(ua_lote / capacidade * 100, 1) if capacidade > 0 else 0

        data_saida_prev = date.today() + timedelta(days=p["dias_ocupacao_padrao"])

        # Fecha movimentação anterior do lote se existir
        cur.execute("""
            UPDATE caprino_piquete_movimentacao
            SET data_saida = CURRENT_DATE, motivo_saida = 'rotacao'
            WHERE lote_id = %s AND data_saida IS NULL
        """, (payload.lote_id,))

        # Fecha piquete anterior do lote
        cur.execute("""
            UPDATE caprino_piquete
            SET status = 'descanso',
                lote_id_atual = NULL,
                data_entrada_atual = NULL,
                data_saida_prevista = NULL,
                ultima_ocupacao_inicio = data_entrada_atual,
                ultima_ocupacao_fim = CURRENT_DATE,
                data_liberacao_descanso = CURRENT_DATE + dias_descanso_padrao,
                updated_at = NOW()
            WHERE lote_id_atual = %s AND id != %s
        """, (payload.lote_id, piquete_id))

        # Registra movimentação
        cur.execute("""
            INSERT INTO caprino_piquete_movimentacao
                (piquete_id, lote_id, imovel_id, data_entrada,
                 ua_entrada, pressao_entrada_pct, registrado_por, origem)
            VALUES (%s,%s,%s,CURRENT_DATE,%s,%s,%s,%s)
        """, (piquete_id, payload.lote_id, p["imovel_id"],
              ua_lote, pressao, payload.registrado_por, payload.origem))

        # Atualiza piquete
        cur.execute("""
            UPDATE caprino_piquete
            SET status = 'ocupado',
                lote_id_atual = %s,
                data_entrada_atual = CURRENT_DATE,
                data_saida_prevista = %s,
                updated_at = NOW()
            WHERE id = %s
        """, (payload.lote_id, data_saida_prev, piquete_id))

        # Alerta se pressão > 110%
        alerta_pressao = None
        if pressao > 110:
            alerta_pressao = {
                "severidade": "alta",
                "mensagem": f"⚠️ Pressão de pastejo {pressao}% — acima da capacidade do piquete",
            }

        conn.commit()
        return {
            "piquete": p["nome"],
            "lote_id": payload.lote_id,
            "ua_lote": ua_lote,
            "capacidade_ua": capacidade,
            "pressao_pct": pressao,
            "data_saida_prevista": data_saida_prev.isoformat(),
            "alerta_pressao": alerta_pressao,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/pastagem/piquetes/{piquete_id}/fechar")
def fechar_piquete(piquete_id: int, motivo: str = Query("rotacao")):
    """Fecha o piquete e inicia período de descanso."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM caprino_piquete WHERE id = %s", (piquete_id,))
        p = dict(cur.fetchone())

        cur.execute("""
            UPDATE caprino_piquete_movimentacao
            SET data_saida = CURRENT_DATE, motivo_saida = %s
            WHERE piquete_id = %s AND data_saida IS NULL
        """, (motivo, piquete_id))

        cur.execute("""
            UPDATE caprino_piquete
            SET status = 'descanso',
                lote_id_atual = NULL,
                data_entrada_atual = NULL,
                ultima_ocupacao_inicio = data_entrada_atual,
                ultima_ocupacao_fim = CURRENT_DATE,
                data_liberacao_descanso = CURRENT_DATE + dias_descanso_padrao,
                updated_at = NOW()
            WHERE id = %s
        """, (piquete_id,))
        conn.commit()
        return {"status": "descanso", "data_liberacao": (date.today() + timedelta(days=p["dias_descanso_padrao"])).isoformat()}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/pastagem/alertas/{imovel_id}")
def alertas_pastagem(imovel_id: int):
    """Gera alertas operacionais de pastagem."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM caprino_piquete_status WHERE imovel_id = %s", (imovel_id,))
        piquetes = [dict(r) for r in cur.fetchall()]

        alertas = []
        for p in piquetes:
            dias_ocup = p.get("dias_ocupacao_atual") or 0
            pressao = float(p.get("pressao_pct") or 0)
            dias_lib = p.get("dias_para_liberar")

            # Crítico: pressão > 110%
            if pressao > 110:
                alertas.append({"piquete": p["piquete_nome"], "severidade": "alta",
                    "tipo": "pressao_excessiva",
                    "mensagem": f"Pressão {pressao}% — mover lote imediatamente"})

            # Alto: tempo máximo excedido
            if p["status"] == "ocupado" and dias_ocup and dias_ocup > p["dias_ocupacao_padrao"]:
                alertas.append({"piquete": p["piquete_nome"], "severidade": "alta",
                    "tipo": "tempo_excedido",
                    "mensagem": f"Lote há {dias_ocup} dias (máx {p['dias_ocupacao_padrao']}d) — rotacionar"})

            # Médio: descanso concluído
            if p["status"] == "descanso" and dias_lib is not None and dias_lib <= 0:
                alertas.append({"piquete": p["piquete_nome"], "severidade": "media",
                    "tipo": "descanso_concluido",
                    "mensagem": f"Piquete pronto para reocupação"})

            # Médio: descanso concluindo em breve
            if p["status"] == "descanso" and dias_lib is not None and 0 < dias_lib <= 3:
                alertas.append({"piquete": p["piquete_nome"], "severidade": "media",
                    "tipo": "descanso_proximidade",
                    "mensagem": f"Piquete liberado em {dias_lib} dia(s)"})

            # Médio: pressão alta mas não crítica
            if 80 <= pressao <= 110:
                alertas.append({"piquete": p["piquete_nome"], "severidade": "media",
                    "tipo": "pressao_alta",
                    "mensagem": f"Pressão {pressao}% — monitorar lotação"})

        return {"alertas": alertas, "total": len(alertas), "piquetes": piquetes}
    finally:
        conn.close()


@router.get("/pastagem/historico/{piquete_id}")
def historico_piquete(piquete_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT m.*, l.nome AS lote_nome, l.fase
            FROM caprino_piquete_movimentacao m
            JOIN caprino_lotes l ON l.id = m.lote_id
            WHERE m.piquete_id = %s
            ORDER BY m.data_entrada DESC LIMIT 50
        """, (piquete_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# ANÁLISE DE SAZONALIDADE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/sazonalidade/{imovel_id}")
def analise_sazonalidade(
    imovel_id: int,
    meses: int = Query(24),
):
    """
    Análise de sazonalidade de abates e margens por mês.
    Identifica os meses mais lucrativos para venda.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Dados mensais de abates
        cur.execute("""
            SELECT
                TO_CHAR(data_abate, 'YYYY-MM')          AS mes,
                TO_CHAR(data_abate, 'MM')               AS mes_num,
                TO_CHAR(data_abate, 'MM/YYYY') AS mes_label,
                COUNT(*)                                 AS total_abates,
                ROUND(AVG(peso_vivo_kg)::NUMERIC, 1)    AS peso_vivo_medio,
                ROUND(AVG(peso_carcaca_kg)::NUMERIC, 1) AS peso_carcaca_medio,
                ROUND(AVG(rendimento_pct)::NUMERIC, 1)  AS rendimento_medio,
                SUM(valor_total_rs)                     AS receita_total,
                ROUND(AVG(valor_total_rs)::NUMERIC, 2)  AS receita_media_animal,
                ROUND(
                    SUM(valor_total_rs) /
                    NULLIF(SUM(peso_carcaca_kg), 0), 2
                )                                       AS preco_medio_kg_carcaca
            FROM caprino_abates ab JOIN caprino_animais ani ON ani.id = ab.animal_id
            WHERE ani.imovel_id = %s
              AND ab.data_abate >= CURRENT_DATE - (%s * INTERVAL '1 month')
            GROUP BY TO_CHAR(ab.data_abate, 'YYYY-MM'), TO_CHAR(ab.data_abate, 'MM'), TO_CHAR(ab.data_abate, 'MM/YYYY')
            ORDER BY mes
        """, (imovel_id, meses))
        por_mes = [dict(r) for r in cur.fetchall()]

        # Agrega por mês do ano (ignora ano) para sazonalidade
        cur.execute("""
            SELECT
                TO_CHAR(data_abate, 'MM')               AS mes_num,
                TO_CHAR(data_abate, 'Month')             AS mes_nome,
                COUNT(*)                                 AS total_abates,
                ROUND(AVG(valor_total_rs)::NUMERIC, 2)  AS receita_media,
                ROUND(
                    SUM(valor_total_rs) /
                    NULLIF(SUM(peso_carcaca_kg), 0), 2
                )                                       AS preco_medio_kg,
                ROUND(AVG(rendimento_pct)::NUMERIC, 1)  AS rendimento_medio
            FROM caprino_abates ab JOIN caprino_animais ani ON ani.id = ab.animal_id
            WHERE ani.imovel_id = %s
              AND ab.data_abate >= CURRENT_DATE - (%s * INTERVAL '1 month')
            GROUP BY TO_CHAR(data_abate, 'MM'), TO_CHAR(data_abate, 'Month')
            ORDER BY mes_num
        """, (imovel_id, meses))
        por_mes_ano = [dict(r) for r in cur.fetchall()]

        # Ranking de meses mais lucrativos
        ranking = sorted(
            [m for m in por_mes_ano if m["preco_medio_kg"]],
            key=lambda x: float(x["preco_medio_kg"] or 0),
            reverse=True
        )

        # Melhor e pior mês
        melhor_mes = ranking[0] if ranking else None
        pior_mes = ranking[-1] if len(ranking) > 1 else None

        # Totais gerais
        cur.execute("""
            SELECT
                COUNT(*)                                AS total_abates,
                SUM(valor_total_rs)                     AS receita_total,
                ROUND(AVG(valor_total_rs)::NUMERIC, 2)  AS ticket_medio,
                ROUND(AVG(rendimento_pct)::NUMERIC, 1)  AS rendimento_medio,
                ROUND(SUM(valor_total_rs) /
                    NULLIF(SUM(peso_carcaca_kg), 0), 2) AS preco_medio_kg_geral
            FROM caprino_abates ab JOIN caprino_animais ani ON ani.id = ab.animal_id
            WHERE ani.imovel_id = %s
              AND ab.data_abate >= CURRENT_DATE - (%s * INTERVAL '1 month')
        """, (imovel_id, meses))
        totais = dict(cur.fetchone())

        return {
            "periodo_meses": meses,
            "totais": totais,
            "por_mes": por_mes,
            "sazonalidade": por_mes_ano,
            "ranking_preco_kg": ranking,
            "melhor_mes": melhor_mes,
            "pior_mes": pior_mes,
            "recomendacao": (
                f"Melhor época para venda: {melhor_mes['mes_nome']} "
                f"(R$ {melhor_mes['preco_medio_kg']}/kg de carcaça em média)"
                if melhor_mes else
                "Registre abates para gerar análise de sazonalidade."
            ),
        }
    except Exception as e:
        import traceback as _tb
        from fastapi import HTTPException as _H
        raise _H(status_code=500, detail=_tb.format_exc())
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# MULTIESPÉCIE — ESPÉCIES E FASES PRODUTIVAS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/especies")
def listar_especies():
    """Lista espécies disponíveis no sistema."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM especie WHERE ativo = TRUE ORDER BY nome")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@router.get("/especies/{codigo}/fases")
def listar_fases(codigo: str):
    """Lista fases produtivas de uma espécie."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT f.*, e.nome AS especie_nome
            FROM fase_produtiva f
            JOIN especie e ON e.id = f.especie_id
            WHERE e.codigo = %s AND f.ativo = TRUE
            ORDER BY f.ordem
        """, (codigo.upper(),))
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# WEBHOOK WHATSAPP
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/webhook/whatsapp")
def webhook_whatsapp_caprino(payload: WhatsAppMensagem):
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
                        INSERT INTO caprino_pesagens
                            (animal_id, data_pesagem, peso_kg, motivo, registrado_por)
                        VALUES (%s, %s, %s, %s, %s) RETURNING id
                    """, (animal["id"], entidades.get("data_evento"), entidades.get("peso_kg"),
                          entidades.get("motivo", "rotina"), payload.telefone))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "caprino_pesagens"

            elif intent in ("vacinacao", "vermifugacao"):
                cur.execute("""
                    INSERT INTO caprino_saude
                        (imovel_id, tipo, data_evento, produto, dose_ml, via, registrado_por)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                """, (payload.imovel_id, intent, entidades.get("data_evento"),
                      entidades.get("produto"), entidades.get("dose_ml"),
                      entidades.get("via"), payload.telefone))
                evento_id = cur.fetchone()["id"]
                evento_tab = "caprino_saude"

            elif intent == "famacha":
                animal = _buscar_animal(cur, entidades.get("brinco"), payload.imovel_id)
                if animal:
                    cur.execute("""
                        INSERT INTO caprino_saude
                            (imovel_id, animal_id, tipo, data_evento, resultado, registrado_por)
                        VALUES (%s, %s, 'famacha', %s, %s, %s) RETURNING id
                    """, (payload.imovel_id, animal["id"], entidades.get("data_evento"),
                          str(entidades.get("escore", "")), payload.telefone))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "caprino_saude"

            elif intent == "parto":
                animal = _buscar_animal(cur, entidades.get("brinco_matriz"), payload.imovel_id)
                cur.execute("""
                    INSERT INTO caprino_reproducao
                        (imovel_id, tipo, data_evento, matriz_id,
                         cabritos_vivos, cabritos_mortos, registrado_por)
                    VALUES (%s, 'parto', %s, %s, %s, %s, %s) RETURNING id
                """, (payload.imovel_id, entidades.get("data_evento"),
                      animal["id"] if animal else None,
                      entidades.get("cabritos_vivos", 0),
                      entidades.get("cabritos_mortos", 0),
                      payload.telefone))
                evento_id = cur.fetchone()["id"]
                evento_tab = "caprino_reproducao"

            elif intent == "cadastro":
                try:
                    cur.execute("""
                        INSERT INTO caprino_animais
                            (imovel_id, brinco, sexo, raca, data_nascimento)
                        VALUES (%s, %s, %s, %s, %s) RETURNING id
                    """, (payload.imovel_id, entidades.get("brinco"),
                          entidades.get("sexo", "F"), entidades.get("raca"),
                          entidades.get("data_nascimento")))
                    evento_id = cur.fetchone()["id"]
                    evento_tab = "caprino_animais"
                except psycopg2.errors.UniqueViolation:
                    conn.rollback()
                    resumo = f"Animal {entidades.get('brinco')} já cadastrado."
            elif intent == "compra":
                produtor_id = _produtor_do_imovel_caprino(cur, payload.imovel_id)
                valor_total = entidades.get("valor_total")
                qtd = entidades.get("quantidade")
                if valor_total:
                    lanc_id = _criar_lancamento_lcdpr_caprino(
                        conn, produtor_id, entidades.get("data_evento"), "despesa",
                        valor_total, f"Compra de {qtd or '?'} caprino(s)"
                                     + (f" — {entidades['raca']}" if entidades.get("raca") else ""),
                    )
                    if lanc_id:
                        evento_id = lanc_id
                        evento_tab = "lancamentos"
                        resumo = (
                            f"✅ Compra registrada: {qtd or '?'} animal(is) por "
                            f"R$ {float(valor_total):,.2f}. Lance o rebanho individualmente "
                            f"(com brinco) quando possível para o cadastro ficar completo."
                        )
                    else:
                        status_log = "erro"
                        resumo = "Entendi a compra, mas não consegui gravar o lançamento financeiro. Confira manualmente."
                else:
                    status_log = "pendente"
                    resumo = "Entendi que foi uma compra, mas não identifiquei o valor. Pode informar o valor total?"

            elif intent == "venda":
                produtor_id = _produtor_do_imovel_caprino(cur, payload.imovel_id)
                valor_total = entidades.get("valor_total")
                qtd = entidades.get("quantidade")
                if valor_total:
                    lanc_id = _criar_lancamento_lcdpr_caprino(
                        conn, produtor_id, entidades.get("data_evento"), "receita",
                        valor_total, f"Venda de {qtd or '?'} caprino(s)"
                                     + (f" — brinco {entidades['brinco']}" if entidades.get("brinco") else ""),
                    )
                    if lanc_id:
                        evento_id = lanc_id
                        evento_tab = "lancamentos"
                        resumo = (
                            f"✅ Venda registrada: {qtd or '?'} animal(is) por "
                            f"R$ {float(valor_total):,.2f}."
                        )
                    else:
                        status_log = "erro"
                        resumo = "Entendi a venda, mas não consegui gravar o lançamento financeiro. Confira manualmente."
                else:
                    status_log = "pendente"
                    resumo = "Entendi que foi uma venda, mas não identifiquei o valor. Pode informar o valor total?"

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
        logger.error("webhook_caprino erro: %s", e, exc_info=True)

    # Log da mensagem
    try:
        import json
        cur2 = conn.cursor()
        cur2.execute("""
            INSERT INTO caprino_whatsapp_log
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
def _produtor_do_imovel_caprino(cur, imovel_id: int):
    cur.execute("SELECT produtor_id FROM imoveis_rurais WHERE id = %s", (imovel_id,))
    row = cur.fetchone()
    return row["produtor_id"] if row else None


def _criar_lancamento_lcdpr_caprino(conn, produtor_id, data, tipo: str, valor: float,
                                     descricao: str, origem: str = "whatsapp_caprino"):
    """Cria lançamento LCDPR em conexão própria (mesmo padrão de piscicultura.py /
    ovino.py), para não interferir na transação principal do webhook."""
    tipo_lancamento = "Receita" if tipo == "receita" else "Despesa"
    lcdpr_conn = None
    try:
        lcdpr_conn = get_db()
        with lcdpr_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id FROM subcontas WHERE LOWER(tipo) = LOWER(%s) LIMIT 1
            """, (tipo_lancamento,))
            sub = cur.fetchone()
            subconta_id = sub["id"] if sub else None
            cur.execute("""
                INSERT INTO lancamentos (produtor_id, subconta_id, valor, data, origem)
                VALUES (%s, %s, %s, %s, %s) RETURNING id
            """, (produtor_id, subconta_id, float(valor), data, origem))
            row = cur.fetchone()
            lcdpr_conn.commit()
            return row["id"] if row else None
    except Exception as e:
        logger.error("[CAPRINO] Erro ao criar lançamento LCDPR: %s", e)
        if lcdpr_conn:
            lcdpr_conn.rollback()
        return None
    finally:
        if lcdpr_conn:
            lcdpr_conn.close()


def _buscar_animal(cur, brinco: Optional[str], imovel_id: int) -> Optional[dict]:
    if not brinco:
        return None
    cur.execute(
        "SELECT id, brinco FROM caprino_animais WHERE imovel_id=%s AND LOWER(brinco)=LOWER(%s)",
        (imovel_id, brinco)
    )
    row = cur.fetchone()
    return dict(row) if row else None
