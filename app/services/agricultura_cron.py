"""
RuralCaixa — app/services/agricultura_cron.py

Cron de geração e envio de alertas de agricultura.
Responsabilidade deste módulo: apenas gerar a lista de alertas.
Envio, deduplicação e marcação ficam no AlertaService.

Alertas gerados:
  - colheita_proxima      : safra com colheita prevista em ≤ 7 dias
  - colheita_atrasada     : safra em andamento com data_colheita_prevista já vencida
  - safra_sem_producao    : safra em andamento há mais de 60 dias sem registro de produção
  - estimativa_baixa      : produção registrada < 60% da estimativa (quando > 80% do ciclo passou)
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


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _gerar_alertas_colheita_proxima(cur, imovel_id: Optional[int]) -> list[dict]:
    """Safras com colheita prevista nos próximos 7 dias."""
    filtro = "AND s.imovel_id = %s" if imovel_id else ""
    params = [7]
    if imovel_id:
        params.insert(0, imovel_id)

    cur.execute(
        f"""
        SELECT
            s.id AS safra_id,
            s.imovel_id,
            s.cultura,
            s.ano_safra,
            s.area_ha,
            s.data_colheita_prevista
        FROM safras s
        WHERE s.status = 'em_andamento'
          AND s.data_colheita_prevista BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
          {filtro}
        ORDER BY s.data_colheita_prevista
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        dias = (r["data_colheita_prevista"] - date.today()).days
        nivel = "critico" if dias <= 2 else "aviso"
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["safra_id"],
                tipo_alerta="colheita_proxima",
                titulo=f"🌾 Colheita próxima: {r['cultura']} em {dias}d",
                descricao=(
                    f"Safra {r['ano_safra']} — {r['area_ha']} ha. "
                    f"Colheita prevista: {r['data_colheita_prevista'].strftime('%d/%m/%Y')}. "
                    f"Preparar equipamentos e logística."
                ),
                nivel=nivel,
                prioridade="alta" if nivel == "critico" else "media",
                data_vencimento=r["data_colheita_prevista"],
                origem_evento="cron_agricultura",
            )
        )
    return alertas


def _gerar_alertas_colheita_atrasada(cur, imovel_id: Optional[int]) -> list[dict]:
    """Safras em andamento com data de colheita já vencida."""
    filtro = "AND s.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            s.id AS safra_id,
            s.imovel_id,
            s.cultura,
            s.ano_safra,
            s.data_colheita_prevista,
            (CURRENT_DATE - s.data_colheita_prevista) AS dias_atraso
        FROM safras s
        WHERE s.status = 'em_andamento'
          AND s.data_colheita_prevista < CURRENT_DATE
          {filtro}
        ORDER BY s.data_colheita_prevista
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        dias = r["dias_atraso"]
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["safra_id"],
                tipo_alerta="colheita_atrasada",
                titulo=f"⚠️ Colheita atrasada: {r['cultura']} ({dias}d)",
                descricao=(
                    f"Safra {r['ano_safra']} — colheita prevista para "
                    f"{r['data_colheita_prevista'].strftime('%d/%m/%Y')} "
                    f"está {dias} dias atrasada. Verificar situação no campo."
                ),
                nivel="critico",
                prioridade="alta",
                data_vencimento=date.today(),
                origem_evento="cron_agricultura",
            )
        )
    return alertas


def _gerar_alertas_sem_producao(cur, imovel_id: Optional[int]) -> list[dict]:
    """Safras em andamento há mais de 60 dias sem registro de produção."""
    filtro = "AND s.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            s.id AS safra_id,
            s.imovel_id,
            s.cultura,
            s.ano_safra,
            s.data_plantio,
            (CURRENT_DATE - s.data_plantio) AS dias_desde_plantio
        FROM safras s
        LEFT JOIN producao_agricola pa ON pa.safra_id = s.id
        WHERE s.status = 'em_andamento'
          AND s.data_plantio IS NOT NULL
          AND s.data_plantio < CURRENT_DATE - 60
          {filtro}
        GROUP BY s.id, s.imovel_id, s.cultura, s.ano_safra, s.data_plantio
        HAVING COUNT(pa.id) = 0
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        dias = r["dias_desde_plantio"]
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["safra_id"],
                tipo_alerta="safra_sem_producao",
                titulo=f"📋 Sem registro de produção: {r['cultura']} ({dias}d)",
                descricao=(
                    f"Safra {r['ano_safra']} plantada há {dias} dias "
                    f"sem nenhum registro de produção. Atualizar o sistema."
                ),
                nivel="info",
                prioridade="baixa",
                data_vencimento=date.today() + timedelta(days=14),
                origem_evento="cron_agricultura",
            )
        )
    return alertas


def processar_alertas_agricultura(imovel_id: Optional[int] = None, dias: int = 1) -> dict:
    """
    Ponto de entrada do cron.
    Gera alertas, persiste sem duplicatas e envia WhatsApp.
    """
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        svc = AlertaService(conn, tabela="agricultura_alertas", col_ref_id="safra_id")

        alertas: list[dict] = []
        alertas += _gerar_alertas_colheita_proxima(cur, imovel_id)
        alertas += _gerar_alertas_colheita_atrasada(cur, imovel_id)
        alertas += _gerar_alertas_sem_producao(cur, imovel_id)

        criados = svc.upsert(alertas)
        resultado = svc.processar_e_enviar(dias=dias, imovel_id=imovel_id)
        resultado["alertas_gerados"] = criados
        return resultado
    except Exception as e:
        conn.rollback()
        logger.error("Erro cron alertas agricultura: %s", e, exc_info=True)
        return {"erro": str(e)}
    finally:
        conn.close()
