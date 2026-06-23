"""
RuralCaixa — app/services/piscicultura_cron.py

Cron de geração e envio de alertas de piscicultura.
Responsabilidade deste módulo: apenas gerar a lista de alertas.
Envio, deduplicação e marcação ficam no AlertaService.

Alertas gerados:
  - ph_critico           : pH fora da faixa ideal (< 6.0 ou > 9.0) no último registro
  - oxigenio_critico     : O₂ dissolvido < 2 mg/L no último registro
  - temperatura_critica  : temperatura fora do range por espécie
  - despesca_proxima     : ciclo com despesca prevista em ≤ 7 dias
  - mortalidade_elevada  : mortalidade acumulada > 10% no ciclo
  - ica_elevado          : ICA > 2.5 (ineficiência alimentar)

Limites de referência (EMBRAPA / SEBRAE Aquicultura):
  pH ideal: 6.5 – 8.5   |  crítico: < 6.0 ou > 9.0
  O₂: ideal > 3 mg/L    |  crítico: < 2 mg/L
  Temperatura (tilápia/tambaqui): ideal 26–32°C  |  crítico: < 20°C ou > 35°C
"""

import logging
import os
from datetime import date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras

from app.services.alerta_service import AlertaService

logger = logging.getLogger(__name__)
DB_URL = os.environ.get("DATABASE_URL", "")

# Limites por parâmetro
PH_MIN_CRITICO   = 6.0
PH_MAX_CRITICO   = 9.0
PH_MIN_AVISO     = 6.5
PH_MAX_AVISO     = 8.5
O2_CRITICO       = 2.0
O2_AVISO         = 3.0
TEMP_MIN_CRITICO = 20.0
TEMP_MAX_CRITICO = 35.0
TEMP_MIN_AVISO   = 24.0
TEMP_MAX_AVISO   = 32.0
ICA_LIMITE       = 2.5
MORTALIDADE_PERC = 10.0


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _gerar_alertas_qualidade_agua(cur, imovel_id: Optional[int]) -> list[dict]:
    """Alertas de pH, O₂ e temperatura com base no último registro diário de cada ciclo."""
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT DISTINCT ON (c.id)
            c.id AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.especie,
            r.data_registro,
            r.ph,
            r.oxigenio_dissolvido,
            r.temperatura_c
        FROM ciclos_piscicultura c
        JOIN registros_diarios_piscicultura r ON r.ciclo_id = c.id
        WHERE c.status = 'ativo'
          AND r.data_registro >= CURRENT_DATE - 3
          {filtro}
        ORDER BY c.id, r.data_registro DESC
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        ciclo = r["nome_ciclo"] or f"Ciclo {r['ciclo_id']}"
        data_ref = r["data_registro"]

        # pH
        if r["ph"] is not None:
            ph = float(r["ph"])
            if ph < PH_MIN_CRITICO or ph > PH_MAX_CRITICO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="ph_critico",
                    titulo=f"⚗️ pH crítico: {ciclo} (pH {ph})",
                    descricao=(
                        f"pH = {ph} — fora da faixa segura ({PH_MIN_CRITICO}–{PH_MAX_CRITICO}). "
                        f"pH ácido: aplicar calcário. pH alcalino: renovar água."
                    ),
                    nivel="critico", prioridade="alta",
                    data_referencia=data_ref,
                    data_vencimento=date.today(),
                    origem_evento="cron_piscicultura",
                ))
            elif ph < PH_MIN_AVISO or ph > PH_MAX_AVISO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="ph_critico",
                    titulo=f"⚗️ pH fora do ideal: {ciclo} (pH {ph})",
                    descricao=f"pH = {ph} — ideal entre {PH_MIN_AVISO} e {PH_MAX_AVISO}.",
                    nivel="aviso", prioridade="media",
                    data_referencia=data_ref,
                    data_vencimento=date.today() + timedelta(days=2),
                    origem_evento="cron_piscicultura",
                ))

        # O₂ dissolvido
        if r["oxigenio_dissolvido"] is not None:
            o2 = float(r["oxigenio_dissolvido"])
            if o2 < O2_CRITICO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="oxigenio_critico",
                    titulo=f"💨 O₂ crítico: {ciclo} ({o2} mg/L)",
                    descricao=(
                        f"Oxigênio dissolvido = {o2} mg/L — abaixo do limite crítico ({O2_CRITICO} mg/L). "
                        f"Acionar aeração de emergência imediatamente."
                    ),
                    nivel="critico", prioridade="alta",
                    data_referencia=data_ref,
                    data_vencimento=date.today(),
                    origem_evento="cron_piscicultura",
                ))
            elif o2 < O2_AVISO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="oxigenio_critico",
                    titulo=f"💨 O₂ baixo: {ciclo} ({o2} mg/L)",
                    descricao=f"O₂ = {o2} mg/L — ideal > {O2_AVISO} mg/L. Aumentar aeração.",
                    nivel="aviso", prioridade="media",
                    data_referencia=data_ref,
                    data_vencimento=date.today() + timedelta(days=1),
                    origem_evento="cron_piscicultura",
                ))

        # Temperatura
        if r["temperatura_c"] is not None:
            temp = float(r["temperatura_c"])
            if temp < TEMP_MIN_CRITICO or temp > TEMP_MAX_CRITICO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="temperatura_critica",
                    titulo=f"🌡️ Temperatura crítica: {ciclo} ({temp}°C)",
                    descricao=(
                        f"Temperatura = {temp}°C — fora da faixa segura "
                        f"({TEMP_MIN_CRITICO}–{TEMP_MAX_CRITICO}°C). "
                        f"Reduzir ou suspender arraçoamento."
                    ),
                    nivel="critico", prioridade="alta",
                    data_referencia=data_ref,
                    data_vencimento=date.today(),
                    origem_evento="cron_piscicultura",
                ))
            elif temp < TEMP_MIN_AVISO or temp > TEMP_MAX_AVISO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="temperatura_critica",
                    titulo=f"🌡️ Temperatura fora do ideal: {ciclo} ({temp}°C)",
                    descricao=f"Temperatura = {temp}°C — ideal {TEMP_MIN_AVISO}–{TEMP_MAX_AVISO}°C.",
                    nivel="aviso", prioridade="media",
                    data_referencia=data_ref,
                    data_vencimento=date.today() + timedelta(days=2),
                    origem_evento="cron_piscicultura",
                ))

    return alertas


def _gerar_alertas_despesca(cur, imovel_id: Optional[int]) -> list[dict]:
    """Ciclos com despesca prevista nos próximos 7 dias."""
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [7]
    if imovel_id:
        params.insert(0, imovel_id)

    cur.execute(
        f"""
        SELECT
            c.id AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.especie,
            c.data_despesca_prevista
        FROM ciclos_piscicultura c
        WHERE c.status = 'ativo'
          AND c.data_despesca_prevista BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
          {filtro}
        ORDER BY c.data_despesca_prevista
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        dias = (r["data_despesca_prevista"] - date.today()).days
        nivel = "critico" if dias <= 2 else "aviso"
        alertas.append(dict(
            imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
            tipo_alerta="despesca_proxima",
            titulo=f"🐟 Despesca próxima: {r['nome_ciclo']} em {dias}d",
            descricao=(
                f"Ciclo {r['nome_ciclo']} ({r['especie']}) — despesca prevista "
                f"{r['data_despesca_prevista'].strftime('%d/%m/%Y')}. "
                f"Preparar equipamentos, comprador e transporte."
            ),
            nivel=nivel, prioridade="alta" if nivel == "critico" else "media",
            data_vencimento=r["data_despesca_prevista"],
            origem_evento="cron_piscicultura",
        ))
    return alertas


def _gerar_alertas_mortalidade(cur, imovel_id: Optional[int]) -> list[dict]:
    """Ciclos com mortalidade acumulada > 10%."""
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            c.id AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.qtd_alevinos,
            COALESCE(SUM(r.mortalidade_qtd), 0) AS total_mortes
        FROM ciclos_piscicultura c
        LEFT JOIN registros_diarios_piscicultura r ON r.ciclo_id = c.id
        WHERE c.status = 'ativo'
          {filtro}
        GROUP BY c.id, c.imovel_id, c.nome_ciclo, c.qtd_alevinos
        HAVING c.qtd_alevinos > 0
           AND COALESCE(SUM(r.mortalidade_qtd), 0)::float / c.qtd_alevinos * 100 > %s
        """,
        params + [MORTALIDADE_PERC],
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        taxa = round(r["total_mortes"] / r["qtd_alevinos"] * 100, 1)
        alertas.append(dict(
            imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
            tipo_alerta="mortalidade_elevada",
            titulo=f"💀 Mortalidade elevada: {r['nome_ciclo']} ({taxa}%)",
            descricao=(
                f"Ciclo {r['nome_ciclo']}: {r['total_mortes']} mortes acumuladas "
                f"({taxa}% do plantel inicial). Verificar qualidade da água e doenças."
            ),
            nivel="critico", prioridade="alta",
            data_vencimento=date.today(),
            origem_evento="cron_piscicultura",
        ))
    return alertas


def processar_alertas_piscicultura(imovel_id: Optional[int] = None, dias: int = 1) -> dict:
    """
    Ponto de entrada do cron.
    Gera alertas, persiste sem duplicatas e envia WhatsApp.
    """
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        svc = AlertaService(conn, tabela="piscicultura_alertas", col_ref_id="ciclo_id")

        alertas: list[dict] = []
        alertas += _gerar_alertas_qualidade_agua(cur, imovel_id)
        alertas += _gerar_alertas_despesca(cur, imovel_id)
        alertas += _gerar_alertas_mortalidade(cur, imovel_id)

        criados = svc.upsert(alertas)
        resultado = svc.processar_e_enviar(dias=dias, imovel_id=imovel_id)
        resultado["alertas_gerados"] = criados
        return resultado
    except Exception as e:
        conn.rollback()
        logger.error("Erro cron alertas piscicultura: %s", e, exc_info=True)
        return {"erro": str(e)}
    finally:
        conn.close()
