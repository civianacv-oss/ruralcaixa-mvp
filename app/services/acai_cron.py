"""
RuralCaixa — app/services/acai_cron.py

Cron de geração e envio de alertas de açaí.
Responsabilidade deste módulo: apenas gerar a lista de alertas.
Envio, deduplicação e marcação ficam no AlertaService.

Alertas gerados:
  - sem_colheita_6m     : talhão ativo sem colheita registrada há mais de 6 meses
                          (açaí produz praticamente o ano todo em condições normais)
  - produtividade_baixa : talhão com produtividade < 50% da média do imovel
  - insumo_sem_registro : talhão ativo sem registro de insumo (adubação) há mais de 90 dias
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


def _gerar_alertas_sem_colheita(cur, imovel_id: Optional[int]) -> list[dict]:
    """Talhões ativos sem colheita há mais de 6 meses."""
    filtro = "WHERE t.imovel_id = %s AND t.ativo = TRUE" if imovel_id else "WHERE t.ativo = TRUE"
    params = [imovel_id] if imovel_id else []

    cur.execute(
        f"""
        SELECT
            t.imovel_id,
            t.id AS talhao_id,
            t.nome AS talhao_nome,
            t.area_ha,
            MAX(s.data_colheita) AS ultima_colheita
        FROM acai_talhoes t
        LEFT JOIN acai_safras s ON s.talhao_id = t.id
        {filtro}
        GROUP BY t.imovel_id, t.id, t.nome, t.area_ha
        HAVING MAX(s.data_colheita) < CURRENT_DATE - 180
            OR MAX(s.data_colheita) IS NULL
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        ult = r["ultima_colheita"]
        dias = (date.today() - ult).days if ult else 999
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["talhao_id"],
                tipo_alerta="sem_colheita_6m",
                titulo=f"🌴 Sem colheita: {r['talhao_nome']} ({dias}d)",
                descricao=(
                    f"Talhão {r['talhao_nome']} ({r['area_ha']} ha) sem colheita registrada "
                    f"há {dias} dias. Verificar produção ou atualizar o sistema."
                ),
                nivel="aviso",
                prioridade="media",
                data_vencimento=date.today() + timedelta(days=14),
                origem_evento="cron_acai",
            )
        )
    return alertas


def _gerar_alertas_produtividade(cur, imovel_id: Optional[int]) -> list[dict]:
    """Talhões com produtividade < 50% da média do imóvel no mesmo período."""
    filtro = "AND t.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        WITH prod_talhao AS (
            SELECT
                t.imovel_id,
                t.id AS talhao_id,
                t.nome,
                t.area_ha,
                COALESCE(SUM(s.quantidade_kg), 0) AS total_kg,
                CASE WHEN t.area_ha > 0
                     THEN COALESCE(SUM(s.quantidade_kg), 0) / t.area_ha
                     ELSE 0 END AS kg_ha
            FROM acai_talhoes t
            LEFT JOIN acai_safras s
                ON s.talhao_id = t.id
                AND s.data_colheita >= CURRENT_DATE - 365
            WHERE t.ativo = TRUE
              {filtro}
            GROUP BY t.imovel_id, t.id, t.nome, t.area_ha
        ),
        media_imovel AS (
            SELECT imovel_id, AVG(kg_ha) AS media_kg_ha
            FROM prod_talhao
            WHERE kg_ha > 0
            GROUP BY imovel_id
        )
        SELECT
            pt.imovel_id,
            pt.talhao_id,
            pt.nome,
            pt.area_ha,
            pt.kg_ha,
            mi.media_kg_ha
        FROM prod_talhao pt
        JOIN media_imovel mi ON mi.imovel_id = pt.imovel_id
        WHERE pt.kg_ha > 0
          AND pt.kg_ha < mi.media_kg_ha * 0.5
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        queda = round((1 - float(r["kg_ha"]) / float(r["media_kg_ha"])) * 100)
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["talhao_id"],
                tipo_alerta="produtividade_baixa",
                titulo=f"📉 Produtividade baixa: {r['nome']} (-{queda}%)",
                descricao=(
                    f"Talhão {r['nome']}: {r['kg_ha']:.0f} kg/ha nos últimos 12 meses. "
                    f"Média do imóvel: {r['media_kg_ha']:.0f} kg/ha. "
                    f"Verificar adubação, pragas e manejo."
                ),
                nivel="aviso",
                prioridade="media",
                data_vencimento=date.today() + timedelta(days=30),
                origem_evento="cron_acai",
            )
        )
    return alertas


def _gerar_alertas_sem_insumo(cur, imovel_id: Optional[int]) -> list[dict]:
    """Talhões sem registro de insumo (adubação) há mais de 90 dias."""
    filtro = "AND t.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            t.imovel_id,
            t.id AS talhao_id,
            t.nome,
            MAX(i.data_lancamento) AS ultimo_insumo
        FROM acai_talhoes t
        LEFT JOIN acai_insumos i ON i.talhao_id = t.id
        WHERE t.ativo = TRUE
          {filtro}
        GROUP BY t.imovel_id, t.id, t.nome
        HAVING MAX(i.data_lancamento) < CURRENT_DATE - 90
            OR MAX(i.data_lancamento) IS NULL
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        ult = r["ultimo_insumo"]
        dias = (date.today() - ult).days if ult else 999
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["talhao_id"],
                tipo_alerta="insumo_sem_registro",
                titulo=f"🌿 Sem adubação: {r['nome']} ({dias}d)",
                descricao=(
                    f"Talhão {r['nome']} sem registro de insumo há {dias} dias. "
                    f"Verificar necessidade de adubação ou atualizar o sistema."
                ),
                nivel="info",
                prioridade="baixa",
                data_vencimento=date.today() + timedelta(days=30),
                origem_evento="cron_acai",
            )
        )
    return alertas


def processar_alertas_acai(imovel_id: Optional[int] = None, dias: int = 1) -> dict:
    """
    Ponto de entrada do cron.
    Gera alertas, persiste sem duplicatas e envia WhatsApp.
    """
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        svc = AlertaService(conn, tabela="acai_alertas", col_ref_id="talhao_id")

        alertas: list[dict] = []
        alertas += _gerar_alertas_sem_colheita(cur, imovel_id)
        alertas += _gerar_alertas_produtividade(cur, imovel_id)
        alertas += _gerar_alertas_sem_insumo(cur, imovel_id)

        criados = svc.upsert(alertas)
        resultado = svc.processar_e_enviar(dias=dias, imovel_id=imovel_id)
        resultado["alertas_gerados"] = criados
        return resultado
    except Exception as e:
        conn.rollback()
        logger.error("Erro cron alertas açaí: %s", e, exc_info=True)
        return {"erro": str(e)}
    finally:
        conn.close()
