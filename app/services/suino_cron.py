"""
RuralCaixa — app/services/suino_cron.py

Cron de geração e envio de alertas suínos.
Responsabilidade deste módulo: apenas gerar a lista de alertas.
Envio, deduplicação e marcação ficam no AlertaService.

Alertas gerados:
  - parto_previsto      : porca com parto previsto em ≤ 3 dias
  - peso_baixo          : animal abaixo do peso mínimo para a fase
  - vacina_vencendo     : vacina vencendo em ≤ 7 dias (se tabela existir)
  - mortalidade_elevada : lote com mortalidade > 5% no mês
"""

import hashlib
import logging
import os
from datetime import date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras

from app.services.alerta_service import AlertaService

logger = logging.getLogger(__name__)
DB_URL = os.environ.get("DATABASE_URL", "")

# Peso mínimo esperado por fase (kg) — valores de referência ABCS
PESO_MINIMO_FASE = {
    "maternidade":  1.2,   # leitão ao nascer
    "creche":       6.0,   # saída da creche
    "crescimento": 30.0,
    "terminacao":  70.0,
}


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _gerar_alertas_parto(cur, imovel_id: Optional[int]) -> list[dict]:
    """Porcas com parto previsto nos próximos 3 dias."""
    filtro = "AND r.imovel_id = %s" if imovel_id else ""
    params = [3]
    if imovel_id:
        params.insert(0, imovel_id)

    cur.execute(
        f"""
        SELECT
            r.imovel_id,
            r.animal_id,
            r.lote_id,
            r.data_parto_prev,
            a.brinco
        FROM suino_reproducao r
        JOIN suino_animais a ON a.id = r.animal_id
        WHERE r.data_parto_real IS NULL
          AND r.data_parto_prev BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
          {filtro}
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        brinco = r.get("brinco") or r["animal_id"]
        dias = (r["data_parto_prev"] - date.today()).days
        nivel = "critico" if dias <= 1 else "aviso"
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["animal_id"],
                tipo_alerta="parto_previsto",
                titulo=f"🐷 Parto previsto: {brinco} em {dias}d",
                descricao=f"Porca {brinco} — parto previsto {r['data_parto_prev'].strftime('%d/%m/%Y')}",
                nivel=nivel,
                prioridade="alta" if nivel == "critico" else "media",
                data_vencimento=r["data_parto_prev"],
                origem_evento="cron_suino",
            )
        )
    return alertas


def _gerar_alertas_peso(cur, imovel_id: Optional[int]) -> list[dict]:
    """Animais com peso abaixo do mínimo para a fase."""
    filtro = "AND a.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            a.imovel_id,
            a.id AS animal_id,
            a.lote_id,
            a.brinco,
            a.fase,
            p.peso_kg,
            p.data AS data_pesagem
        FROM suino_animais a
        JOIN LATERAL (
            SELECT peso_kg, data
            FROM suino_pesagens
            WHERE animal_id = a.id
            ORDER BY data DESC
            LIMIT 1
        ) p ON TRUE
        WHERE a.status = 'ativo'
          {filtro}
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        minimo = PESO_MINIMO_FASE.get(r.get("fase") or "", None)
        if minimo is None:
            continue
        if float(r["peso_kg"]) < minimo:
            deficit = round(minimo - float(r["peso_kg"]), 1)
            alertas.append(
                dict(
                    imovel_id=r["imovel_id"],
                    ref_id=r["animal_id"],
                    tipo_alerta="peso_baixo",
                    titulo=f"⚖️ Peso baixo: {r['brinco']} ({r['peso_kg']} kg)",
                    descricao=(
                        f"Fase {r['fase']} — mínimo esperado {minimo} kg, "
                        f"déficit {deficit} kg. Pesagem: {r['data_pesagem'].strftime('%d/%m/%Y')}"
                    ),
                    nivel="aviso",
                    prioridade="media",
                    data_vencimento=date.today() + timedelta(days=7),
                    origem_evento="cron_suino",
                )
            )
    return alertas


def _gerar_alertas_mortalidade(cur, imovel_id: Optional[int]) -> list[dict]:
    """Lotes com mortalidade > 5% no mês corrente."""
    filtro = "AND l.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            l.imovel_id,
            l.id AS lote_id,
            l.nome AS lote_nome,
            COUNT(a.id) FILTER (WHERE a.status = 'ativo')  AS vivos,
            COUNT(m.id) AS mortes_mes
        FROM suino_lotes l
        LEFT JOIN suino_animais a ON a.lote_id = l.id
        LEFT JOIN suino_mortes m
            ON m.lote_id = l.id
            AND date_trunc('month', m.data_morte) = date_trunc('month', CURRENT_DATE)
        WHERE l.status = 'ativo'
          {filtro}
        GROUP BY l.imovel_id, l.id, l.nome
        HAVING COUNT(a.id) FILTER (WHERE a.status = 'ativo') > 0
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        vivos = r["vivos"] or 1
        taxa = r["mortes_mes"] / vivos * 100
        if taxa > 5:
            alertas.append(
                dict(
                    imovel_id=r["imovel_id"],
                    ref_id=r["lote_id"],
                    tipo_alerta="mortalidade_elevada",
                    titulo=f"💀 Mortalidade elevada: {r['lote_nome']} ({taxa:.1f}%)",
                    descricao=(
                        f"Lote {r['lote_nome']}: {r['mortes_mes']} mortes este mês "
                        f"({taxa:.1f}% do plantel). Investigar causa."
                    ),
                    nivel="critico",
                    prioridade="alta",
                    data_vencimento=date.today(),
                    origem_evento="cron_suino",
                )
            )
    return alertas


def processar_alertas_suinos(imovel_id: Optional[int] = None, dias: int = 1) -> dict:
    """
    Ponto de entrada do cron.
    Gera alertas, persiste sem duplicatas e envia WhatsApp.
    """
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        svc = AlertaService(conn, tabela="suino_alertas", col_ref_id="animal_id")

        alertas: list[dict] = []
        alertas += _gerar_alertas_parto(cur, imovel_id)
        alertas += _gerar_alertas_peso(cur, imovel_id)
        alertas += _gerar_alertas_mortalidade(cur, imovel_id)

        criados = svc.upsert(alertas)
        resultado = svc.processar_e_enviar(dias=dias, imovel_id=imovel_id)
        resultado["alertas_gerados"] = criados
        return resultado
    except Exception as e:
        conn.rollback()
        logger.error("Erro cron alertas suínos: %s", e, exc_info=True)
        return {"erro": str(e)}
    finally:
        conn.close()
