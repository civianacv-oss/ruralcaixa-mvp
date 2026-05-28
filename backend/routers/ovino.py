"""
RuralCaixa — routers/ovino.py

Endpoints do módulo Ovino de Corte.
Registre este router em main.py:

    from routers.ovino import router as ovino_router
    app.include_router(ovino_router)

Depende de:
  - database.py  → get_db() (AsyncSession do SQLAlchemy ou connection asyncpg)
  - services/ovino_ia.py → classificar_mensagem()
  - Tabelas criadas por 001_ovino_schema.sql
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Ajuste o import conforme seu projeto:
from database import get_db               # <- sua dependência de sessão
from services.ovino_ia import classificar_mensagem

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ovino", tags=["Ovino"])


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS (Pydantic)
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


class AnimalOut(AnimalCreate):
    id: int
    status: str
    created_at: datetime
    class Config:
        from_attributes = True


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


# ── WhatsApp webhook ──────────────────────────────────────────────────────────
class WhatsAppMensagem(BaseModel):
    telefone: str
    tipo_midia: str = "texto"   # texto | audio | imagem
    conteudo: str               # texto bruto ou transcrição de áudio
    imovel_id: Optional[int] = None


# ══════════════════════════════════════════════════════════════════════════════
# ANIMAIS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/animais", response_model=dict, status_code=status.HTTP_201_CREATED)
async def criar_animal(payload: AnimalCreate, db: AsyncSession = Depends(get_db)):
    q = text("""
        INSERT INTO ovino_animais
            (imovel_id, brinco, nome, raca, sexo, data_nascimento,
             peso_nascimento, mae_id, pai_id, lote_id, observacoes)
        VALUES
            (:imovel_id, :brinco, :nome, :raca, :sexo, :data_nascimento,
             :peso_nascimento, :mae_id, :pai_id, :lote_id, :observacoes)
        RETURNING id, brinco, status, created_at
    """)
    try:
        result = await db.execute(q, payload.model_dump())
        await db.commit()
        row = result.mappings().one()
        return dict(row)
    except Exception as e:
        await db.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(409, f"Brinco '{payload.brinco}' já cadastrado neste imóvel.")
        raise HTTPException(500, str(e))


@router.get("/animais", response_model=List[dict])
async def listar_animais(
    imovel_id: int = Query(...),
    status: Optional[str] = Query(None),
    lote_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    filtros = "WHERE a.imovel_id = :imovel_id"
    params: dict = {"imovel_id": imovel_id}
    if status:
        filtros += " AND a.status = :status"
        params["status"] = status
    if lote_id:
        filtros += " AND a.lote_id = :lote_id"
        params["lote_id"] = lote_id

    q = text(f"""
        SELECT a.*, l.nome AS lote_nome,
               (SELECT peso_kg FROM ovino_pesagens
                WHERE animal_id = a.id
                ORDER BY data_pesagem DESC LIMIT 1) AS ultimo_peso,
               (SELECT data_pesagem FROM ovino_pesagens
                WHERE animal_id = a.id
                ORDER BY data_pesagem DESC LIMIT 1) AS data_ultimo_peso
        FROM ovino_animais a
        LEFT JOIN ovino_lotes l ON l.id = a.lote_id
        {filtros}
        ORDER BY a.brinco
    """)
    result = await db.execute(q, params)
    return [dict(r) for r in result.mappings()]


@router.get("/animais/{animal_id}", response_model=dict)
async def detalhe_animal(animal_id: int, db: AsyncSession = Depends(get_db)):
    q = text("""
        SELECT a.*,
               l.nome AS lote_nome,
               m.brinco AS mae_brinco,
               p.brinco AS pai_brinco
        FROM ovino_animais a
        LEFT JOIN ovino_lotes l ON l.id = a.lote_id
        LEFT JOIN ovino_animais m ON m.id = a.mae_id
        LEFT JOIN ovino_animais p ON p.id = a.pai_id
        WHERE a.id = :id
    """)
    result = await db.execute(q, {"id": animal_id})
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Animal não encontrado.")
    return dict(row)


@router.patch("/animais/{animal_id}/status", response_model=dict)
async def atualizar_status_animal(
    animal_id: int,
    novo_status: str = Query(..., pattern="^(ativo|vendido|abatido|morto|descartado)$"),
    db: AsyncSession = Depends(get_db),
):
    q = text("""
        UPDATE ovino_animais SET status = :status, updated_at = NOW()
        WHERE id = :id RETURNING id, brinco, status
    """)
    result = await db.execute(q, {"status": novo_status, "id": animal_id})
    await db.commit()
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Animal não encontrado.")
    return dict(row)


# ══════════════════════════════════════════════════════════════════════════════
# LOTES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/lotes", response_model=dict, status_code=201)
async def criar_lote(payload: LoteCreate, db: AsyncSession = Depends(get_db)):
    q = text("""
        INSERT INTO ovino_lotes (imovel_id, nome, fase, data_inicio)
        VALUES (:imovel_id, :nome, :fase, :data_inicio)
        RETURNING id, nome, fase, data_inicio
    """)
    result = await db.execute(q, payload.model_dump())
    await db.commit()
    return dict(result.mappings().one())


@router.get("/lotes", response_model=List[dict])
async def listar_lotes(imovel_id: int = Query(...), db: AsyncSession = Depends(get_db)):
    q = text("""
        SELECT l.*,
               COUNT(a.id) FILTER (WHERE a.status = 'ativo') AS total_animais
        FROM ovino_lotes l
        LEFT JOIN ovino_animais a ON a.lote_id = l.id
        WHERE l.imovel_id = :imovel_id AND l.ativo = TRUE
        GROUP BY l.id
        ORDER BY l.data_inicio DESC
    """)
    result = await db.execute(q, {"imovel_id": imovel_id})
    return [dict(r) for r in result.mappings()]


# ══════════════════════════════════════════════════════════════════════════════
# PESAGENS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/pesagens", response_model=dict, status_code=201)
async def registrar_pesagem(payload: PesagemCreate, db: AsyncSession = Depends(get_db)):
    q = text("""
        INSERT INTO ovino_pesagens (animal_id, data_pesagem, peso_kg, motivo, registrado_por)
        VALUES (:animal_id, :data_pesagem, :peso_kg, :motivo, :registrado_por)
        RETURNING id, animal_id, data_pesagem, peso_kg, motivo
    """)
    result = await db.execute(q, payload.model_dump())
    await db.commit()
    return dict(result.mappings().one())


@router.get("/pesagens/{animal_id}", response_model=List[dict])
async def historico_pesagens(animal_id: int, db: AsyncSession = Depends(get_db)):
    """Retorna histórico completo + GMD entre pesagens consecutivas."""
    q = text("""
        SELECT p.*,
               ROUND(
                   (p.peso_kg - LAG(p.peso_kg) OVER (ORDER BY p.data_pesagem)) /
                   NULLIF(p.data_pesagem - LAG(p.data_pesagem) OVER (ORDER BY p.data_pesagem), 0)
               , 3) AS gmd_kg_dia
        FROM ovino_pesagens p
        WHERE p.animal_id = :animal_id
        ORDER BY p.data_pesagem
    """)
    result = await db.execute(q, {"animal_id": animal_id})
    return [dict(r) for r in result.mappings()]


# ══════════════════════════════════════════════════════════════════════════════
# SAÚDE
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/saude", response_model=dict, status_code=201)
async def registrar_evento_saude(payload: SaudeCreate, db: AsyncSession = Depends(get_db)):
    q = text("""
        INSERT INTO ovino_saude
            (imovel_id, animal_id, lote_id, tipo, data_evento, produto,
             dose_ml, via, proximo_em, resultado, registrado_por, observacoes)
        VALUES
            (:imovel_id, :animal_id, :lote_id, :tipo, :data_evento, :produto,
             :dose_ml, :via, :proximo_em, :resultado, :registrado_por, :observacoes)
        RETURNING id, tipo, data_evento, produto, proximo_em
    """)
    result = await db.execute(q, payload.model_dump())
    await db.commit()
    return dict(result.mappings().one())


@router.get("/saude/alertas", response_model=List[dict])
async def alertas_sanitarios(
    imovel_id: int = Query(...),
    dias_antecedencia: int = Query(7),
    db: AsyncSession = Depends(get_db),
):
    """Retorna manejos com proximo_em nos próximos N dias."""
    q = text("""
        SELECT s.*, a.brinco AS animal_brinco, l.nome AS lote_nome
        FROM ovino_saude s
        LEFT JOIN ovino_animais a ON a.id = s.animal_id
        LEFT JOIN ovino_lotes l ON l.id = s.lote_id
        WHERE s.imovel_id = :imovel_id
          AND s.proximo_em BETWEEN CURRENT_DATE AND CURRENT_DATE + :dias
        ORDER BY s.proximo_em
    """)
    result = await db.execute(q, {"imovel_id": imovel_id, "dias": dias_antecedencia})
    return [dict(r) for r in result.mappings()]


# ══════════════════════════════════════════════════════════════════════════════
# REPRODUÇÃO
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/reproducao", response_model=dict, status_code=201)
async def registrar_evento_reproducao(payload: ReproducaoCreate, db: AsyncSession = Depends(get_db)):
    q = text("""
        INSERT INTO ovino_reproducao
            (imovel_id, tipo, data_evento, matriz_id, reprodutor_id,
             cordeiros_vivos, cordeiros_mortos, observacoes, registrado_por)
        VALUES
            (:imovel_id, :tipo, :data_evento, :matriz_id, :reprodutor_id,
             :cordeiros_vivos, :cordeiros_mortos, :observacoes, :registrado_por)
        RETURNING id, tipo, data_evento, cordeiros_vivos
    """)
    result = await db.execute(q, payload.model_dump())
    await db.commit()
    row = dict(result.mappings().one())

    # Se for parto, ajusta status da matriz automaticamente
    if payload.tipo == "parto" and payload.matriz_id:
        await db.execute(
            text("UPDATE ovino_animais SET updated_at=NOW() WHERE id=:id"),
            {"id": payload.matriz_id},
        )
        await db.commit()

    return row


# ══════════════════════════════════════════════════════════════════════════════
# ABATES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/abates", response_model=dict, status_code=201)
async def registrar_abate(payload: AbateCreate, db: AsyncSession = Depends(get_db)):
    q = text("""
        INSERT INTO ovino_abates
            (animal_id, data_abate, peso_vivo_kg, peso_carcaca_kg,
             destino, valor_total_rs, comprador, registrado_por)
        VALUES
            (:animal_id, :data_abate, :peso_vivo_kg, :peso_carcaca_kg,
             :destino, :valor_total_rs, :comprador, :registrado_por)
        RETURNING id, animal_id, data_abate, peso_vivo_kg, peso_carcaca_kg, rendimento_pct
    """)
    result = await db.execute(q, payload.model_dump())
    # Marca animal como abatido
    await db.execute(
        text("UPDATE ovino_animais SET status='abatido', updated_at=NOW() WHERE id=:id"),
        {"id": payload.animal_id},
    )
    await db.commit()
    return dict(result.mappings().one())


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD — KPIs do imóvel
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard/{imovel_id}", response_model=dict)
async def dashboard_ovino(imovel_id: int, db: AsyncSession = Depends(get_db)):
    """KPIs consolidados para o imóvel: rebanho, reprodução, saúde, abates."""

    rebanho = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status='ativo')            AS total_ativo,
            COUNT(*) FILTER (WHERE status='ativo' AND sexo='F') AS matrizes,
            COUNT(*) FILTER (WHERE status='ativo' AND sexo='M') AS reprodutores
        FROM ovino_animais WHERE imovel_id = :id
    """), {"id": imovel_id})

    abates_30d = await db.execute(text("""
        SELECT
            COUNT(*)                        AS total_abatidos,
            ROUND(AVG(peso_carcaca_kg), 2)  AS media_carcaca_kg,
            ROUND(AVG(rendimento_pct), 2)   AS media_rendimento_pct,
            ROUND(SUM(valor_total_rs), 2)   AS receita_total_rs
        FROM ovino_abates ab
        JOIN ovino_animais a ON a.id = ab.animal_id
        WHERE a.imovel_id = :id
          AND ab.data_abate >= CURRENT_DATE - INTERVAL '30 days'
    """), {"id": imovel_id})

    partos_30d = await db.execute(text("""
        SELECT
            COUNT(*)        AS total_partos,
            SUM(cordeiros_vivos)  AS cordeiros_vivos,
            SUM(cordeiros_mortos) AS cordeiros_mortos
        FROM ovino_reproducao
        WHERE imovel_id = :id AND tipo = 'parto'
          AND data_evento >= CURRENT_DATE - INTERVAL '30 days'
    """), {"id": imovel_id})

    alertas_7d = await db.execute(text("""
        SELECT COUNT(*) AS total_alertas
        FROM ovino_saude
        WHERE imovel_id = :id
          AND proximo_em BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
    """), {"id": imovel_id})

    return {
        "rebanho":    dict(rebanho.mappings().one()),
        "abates_30d": dict(abates_30d.mappings().one()),
        "partos_30d": dict(partos_30d.mappings().one()),
        "alertas_7d": dict(alertas_7d.mappings().one()),
    }


# ══════════════════════════════════════════════════════════════════════════════
# WEBHOOK WHATSAPP → OVINO (ponto de entrada do campo)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/webhook/whatsapp", response_model=dict)
async def webhook_whatsapp_ovino(payload: WhatsAppMensagem, db: AsyncSession = Depends(get_db)):
    """
    Recebe mensagem do WhatsApp (texto ou transcrição de áudio),
    classifica via IA e persiste o evento zootécnico.

    Retorna o resumo para o producer confirmar via WhatsApp.
    """

    # 1. Classifica via IA
    classificacao = await classificar_mensagem(
        texto=payload.conteudo,
        imovel_id=payload.imovel_id,
    )

    intent       = classificacao["intent"]
    entidades    = classificacao["entidades"]
    confianca    = classificacao["confianca"]
    resumo       = classificacao["resumo"]
    evento_id    = None
    evento_tabela= None
    status_log   = "processado"
    erro_msg     = None

    # 2. Persiste conforme a intent (confiança mínima 0.5)
    try:
        if confianca >= 0.5 and payload.imovel_id:

            if intent == "pesagem":
                animal = await _buscar_animal_por_brinco(
                    db, entidades.get("brinco"), payload.imovel_id
                )
                if animal:
                    r = await db.execute(text("""
                        INSERT INTO ovino_pesagens (animal_id, data_pesagem, peso_kg, motivo, registrado_por)
                        VALUES (:animal_id, :data, :peso, :motivo, :reg)
                        RETURNING id
                    """), {
                        "animal_id": animal["id"],
                        "data": entidades.get("data_evento"),
                        "peso": entidades.get("peso_kg"),
                        "motivo": entidades.get("motivo", "rotina"),
                        "reg": payload.telefone,
                    })
                    await db.commit()
                    evento_id, evento_tabela = r.scalar(), "ovino_pesagens"

            elif intent in ("vacinacao", "vermifugacao"):
                r = await db.execute(text("""
                    INSERT INTO ovino_saude
                        (imovel_id, tipo, data_evento, produto, dose_ml, via, registrado_por)
                    VALUES (:imovel_id, :tipo, :data, :produto, :dose, :via, :reg)
                    RETURNING id
                """), {
                    "imovel_id": payload.imovel_id,
                    "tipo": intent,
                    "data": entidades.get("data_evento"),
                    "produto": entidades.get("produto"),
                    "dose": entidades.get("dose_ml"),
                    "via": entidades.get("via"),
                    "reg": payload.telefone,
                })
                await db.commit()
                evento_id, evento_tabela = r.scalar(), "ovino_saude"

            elif intent == "famacha":
                animal = await _buscar_animal_por_brinco(
                    db, entidades.get("brinco"), payload.imovel_id
                )
                if animal:
                    r = await db.execute(text("""
                        INSERT INTO ovino_saude
                            (imovel_id, animal_id, tipo, data_evento, resultado, registrado_por)
                        VALUES (:imovel_id, :animal_id, 'famacha', :data, :resultado, :reg)
                        RETURNING id
                    """), {
                        "imovel_id": payload.imovel_id,
                        "animal_id": animal["id"],
                        "data": entidades.get("data_evento"),
                        "resultado": str(entidades.get("escore", "")),
                        "reg": payload.telefone,
                    })
                    await db.commit()
                    evento_id, evento_tabela = r.scalar(), "ovino_saude"

            elif intent == "parto":
                animal = await _buscar_animal_por_brinco(
                    db, entidades.get("brinco_matriz"), payload.imovel_id
                )
                r = await db.execute(text("""
                    INSERT INTO ovino_reproducao
                        (imovel_id, tipo, data_evento, matriz_id,
                         cordeiros_vivos, cordeiros_mortos, registrado_por)
                    VALUES (:imovel_id, 'parto', :data, :matriz_id,
                            :cv, :cm, :reg)
                    RETURNING id
                """), {
                    "imovel_id": payload.imovel_id,
                    "data": entidades.get("data_evento"),
                    "matriz_id": animal["id"] if animal else None,
                    "cv": entidades.get("cordeiros_vivos", 0),
                    "cm": entidades.get("cordeiros_mortos", 0),
                    "reg": payload.telefone,
                })
                await db.commit()
                evento_id, evento_tabela = r.scalar(), "ovino_reproducao"

            elif intent == "cadastro":
                try:
                    r = await db.execute(text("""
                        INSERT INTO ovino_animais
                            (imovel_id, brinco, sexo, raca, data_nascimento)
                        VALUES (:imovel_id, :brinco, :sexo, :raca, :dn)
                        RETURNING id
                    """), {
                        "imovel_id": payload.imovel_id,
                        "brinco": entidades.get("brinco"),
                        "sexo": entidades.get("sexo", "F"),
                        "raca": entidades.get("raca"),
                        "dn": entidades.get("data_nascimento"),
                    })
                    await db.commit()
                    evento_id, evento_tabela = r.scalar(), "ovino_animais"
                except Exception:
                    await db.rollback()
                    resumo = f"Animal {entidades.get('brinco')} já cadastrado."

            else:
                # intent não mapeado: loga mas não persiste
                status_log = "ignorado"

        elif confianca < 0.5:
            status_log = "pendente"
            resumo = "Não entendi bem. Pode repetir com mais detalhes?"

        else:
            status_log = "ignorado"

    except Exception as e:
        await db.rollback()
        status_log = "erro"
        erro_msg = str(e)
        resumo = "Erro ao salvar o evento. Tente novamente."
        logger.error("webhook_ovino | erro ao persistir: %s", e, exc_info=True)

    # 3. Persiste log
    try:
        await db.execute(text("""
            INSERT INTO ovino_whatsapp_log
                (telefone, tipo_midia, conteudo_raw, intent_detectada,
                 entidades_json, status, evento_id, evento_tabela, erro_msg)
            VALUES
                (:tel, :midia, :conteudo, :intent, :entidades::jsonb,
                 :status, :evento_id, :evento_tabela, :erro)
        """), {
            "tel": payload.telefone,
            "midia": payload.tipo_midia,
            "conteudo": payload.conteudo[:2000],
            "intent": intent,
            "entidades": str(entidades).replace("'", '"'),  # JSON-safe
            "status": status_log,
            "evento_id": evento_id,
            "evento_tabela": evento_tabela,
            "erro": erro_msg,
        })
        await db.commit()
    except Exception as e:
        logger.warning("webhook_ovino | falha ao salvar log: %s", e)

    # 4. Retorna confirmação (será enviada de volta pelo WhatsApp handler)
    return {
        "intent": intent,
        "confianca": confianca,
        "status": status_log,
        "resumo": resumo,
        "evento_id": evento_id,
        "evento_tabela": evento_tabela,
    }


# ── Helper interno ─────────────────────────────────────────────────────────────
async def _buscar_animal_por_brinco(
    db: AsyncSession,
    brinco: Optional[str],
    imovel_id: int,
) -> Optional[dict]:
    if not brinco:
        return None
    result = await db.execute(
        text("SELECT id, brinco FROM ovino_animais WHERE imovel_id=:iid AND LOWER(brinco)=LOWER(:b)"),
        {"iid": imovel_id, "b": brinco},
    )
    row = result.mappings().first()
    return dict(row) if row else None
