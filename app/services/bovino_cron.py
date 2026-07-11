"""
RuralCaixa — app/services/bovino_cron.py

Cron de geração e envio de alertas bovinos.
Responsabilidade deste módulo: apenas gerar a lista de alertas.
Envio, deduplicação e marcação ficam no AlertaService.

Alertas gerados:
  - reforco_sanitario   : vacina/medicamento com reforço vencendo em ≤ 7 dias
  - parto_previsto      : fêmea prenha com parto previsto em ≤ 7 dias
  - sem_pesagem         : animal sem pesagem há mais de 30 dias
  - leite_baixo         : vaca com produção abaixo de 50% da média histórica
"""

import logging
import os
from datetime import date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras

from app.services.alerta_service import AlertaService
from app.services.cotacoes_service import garantir_cotacoes_atualizadas
from app.routers.producao_insumos import _calcular_producao_e_custo

logger = logging.getLogger(__name__)
DB_URL = os.environ.get("DATABASE_URL", "")


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _gerar_alertas_reforco(cur, imovel_id: Optional[int]) -> list[dict]:
    """Reforços sanitários vencendo nos próximos 7 dias."""
    filtro = "AND (a.imovel_id = %s OR l.imovel_id = %s)" if imovel_id else ""
    params = [7]
    if imovel_id:
        params = [imovel_id, imovel_id, 7]

    cur.execute(
        f"""
        SELECT
            COALESCE(a.imovel_id, l.imovel_id) AS imovel_id,
            s.animal_id,
            s.lote_id,
            s.tipo,
            s.produto,
            s.data_reforco,
            COALESCE(a.brinco, a.nome) AS animal_ref,
            l.nome AS lote_nome
        FROM bovino_sanitario s
        LEFT JOIN bovino_animais a ON a.id = s.animal_id
        LEFT JOIN bovino_lotes   l ON l.id = s.lote_id
        WHERE s.data_reforco BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
          {filtro}
        ORDER BY s.data_reforco
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        dias = (r["data_reforco"] - date.today()).days
        nivel = "critico" if dias <= 1 else "aviso"
        ref = r.get("animal_ref") or r.get("lote_nome") or "animal"
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r.get("animal_id"),
                tipo_alerta="reforco_sanitario",
                titulo=f"💉 Reforço {r['tipo']}: {ref} em {dias}d",
                descricao=(
                    f"Produto: {r['produto']} — reforço previsto "
                    f"{r['data_reforco'].strftime('%d/%m/%Y')}"
                ),
                nivel=nivel,
                prioridade="alta" if nivel == "critico" else "media",
                data_vencimento=r["data_reforco"],
                origem_evento="cron_bovino",
            )
        )
    return alertas


def _gerar_alertas_parto(cur, imovel_id: Optional[int]) -> list[dict]:
    """Fêmeas prenhas com parto previsto em ≤ 7 dias."""
    filtro = "AND a.imovel_id = %s" if imovel_id else ""
    params = [7]
    if imovel_id:
        params.insert(0, imovel_id)

    cur.execute(
        f"""
        SELECT
            a.imovel_id,
            r.femea_id,
            a.brinco,
            a.nome AS femea_nome,
            r.data_parto_prev
        FROM bovino_reproducao r
        JOIN bovino_animais a ON a.id = r.femea_id
        WHERE r.resultado = 'positivo'
          AND r.data_parto_real IS NULL
          AND r.data_parto_prev BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
          {filtro}
        ORDER BY r.data_parto_prev
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        dias = (r["data_parto_prev"] - date.today()).days
        nivel = "critico" if dias <= 2 else "aviso"
        nome = r.get("brinco") or r.get("femea_nome") or r["femea_id"]
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["femea_id"],
                tipo_alerta="parto_previsto",
                titulo=f"🐄 Parto previsto: {nome} em {dias}d",
                descricao=(
                    f"Fêmea {nome} — parto previsto "
                    f"{r['data_parto_prev'].strftime('%d/%m/%Y')}"
                ),
                nivel=nivel,
                prioridade="alta" if nivel == "critico" else "media",
                data_vencimento=r["data_parto_prev"],
                origem_evento="cron_bovino",
            )
        )
    return alertas


def _gerar_alertas_sem_pesagem(cur, imovel_id: Optional[int]) -> list[dict]:
    """Animais sem pesagem há mais de 30 dias."""
    filtro = "AND a.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            a.imovel_id,
            a.id AS animal_id,
            COALESCE(a.brinco, a.nome, a.id::text) AS ref,
            MAX(p.data) AS ultima_pesagem
        FROM bovino_animais a
        LEFT JOIN bovino_pesagens p ON p.animal_id = a.id
        WHERE a.status = 'ativo'
          {filtro}
        GROUP BY a.imovel_id, a.id, a.brinco, a.nome
        HAVING MAX(p.data) < CURRENT_DATE - 30
            OR MAX(p.data) IS NULL
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        ult = r["ultima_pesagem"]
        dias_sem = (date.today() - ult).days if ult else 999
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["animal_id"],
                tipo_alerta="sem_pesagem",
                titulo=f"⚖️ Sem pesagem: {r['ref']} ({dias_sem}d)",
                descricao=(
                    f"Última pesagem: {ult.strftime('%d/%m/%Y') if ult else 'nunca registrada'}. "
                    f"Registrar pesagem para acompanhar desenvolvimento."
                ),
                nivel="info",
                prioridade="baixa",
                data_vencimento=date.today() + timedelta(days=7),
                origem_evento="cron_bovino",
            )
        )
    return alertas


def _gerar_alertas_leite(cur, imovel_id: Optional[int]) -> list[dict]:
    """Vacas com produção de leite abaixo de 50% da média histórica."""
    filtro = "AND pl.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        WITH media_hist AS (
            SELECT animal_id, AVG(litros) AS media_litros
            FROM bovino_producao_leite
            WHERE data >= CURRENT_DATE - 90
            GROUP BY animal_id
        ),
        ultima_prod AS (
            SELECT DISTINCT ON (animal_id)
                animal_id, litros, data
            FROM bovino_producao_leite
            ORDER BY animal_id, data DESC
        )
        SELECT
            pl.imovel_id,
            up.animal_id,
            a.brinco,
            up.litros AS litros_hoje,
            mh.media_litros,
            up.data AS data_registro
        FROM ultima_prod up
        JOIN media_hist mh ON mh.animal_id = up.animal_id
        JOIN bovino_producao_leite pl ON pl.animal_id = up.animal_id AND pl.data = up.data
        JOIN bovino_animais a ON a.id = up.animal_id
        WHERE up.litros < mh.media_litros * 0.5
          AND up.data >= CURRENT_DATE - 3
          {filtro}
        """,
        params,
    )
    rows = cur.fetchall()
    alertas = []
    for r in rows:
        queda = round((1 - float(r["litros_hoje"]) / float(r["media_litros"])) * 100)
        alertas.append(
            dict(
                imovel_id=r["imovel_id"],
                ref_id=r["animal_id"],
                tipo_alerta="leite_baixo",
                titulo=f"🥛 Queda de produção: {r['brinco']} (-{queda}%)",
                descricao=(
                    f"Produção atual: {r['litros_hoje']:.1f} L — "
                    f"média 90 dias: {r['media_litros']:.1f} L. "
                    f"Verificar saúde e alimentação."
                ),
                nivel="aviso",
                prioridade="media",
                data_vencimento=date.today() + timedelta(days=3),
                origem_evento="cron_bovino",
            )
        )
    return alertas


def _gerar_alertas_engorda(cur, imovel_id: Optional[int], preco_arroba: float) -> list[dict]:
    """Animais de corte cujo custo de engorda (R$/kg de ganho) supera o
    valor de mercado do kg de boi gordo (arroba CEPEA / 15). Reaproveita
    o mesmo calculo de custo usado no endpoint producao-insumos."""
    filtro = "AND imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]
    cur.execute(
        f"""
        SELECT id, imovel_id, brinco, nome
        FROM bovino_animais
        WHERE status = \'ativo\' AND aptidao_manejo = \'corte\' {filtro}
        """,
        params,
    )
    animais = cur.fetchall()
    alertas = []
    valor_por_kg_mercado = float(preco_arroba) / 15.0

    for a in animais:
        try:
            producao, tipo_producao, custo, aviso = _calcular_producao_e_custo(
                cur, "bovinos", a["id"], 30
            )
        except Exception:
            continue
        if custo is None or not producao or producao <= 0:
            continue
        custo_por_kg = custo / producao
        if custo_por_kg > valor_por_kg_mercado:
            diferenca = custo_por_kg - valor_por_kg_mercado
            ref = a.get("brinco") or a.get("nome") or str(a["id"])
            alertas.append(
                dict(
                    imovel_id=a["imovel_id"],
                    ref_id=a["id"],
                    tipo_alerta="engorda_antieconomica",
                    titulo=f"\U0001F4C9 Engorda antieconomica: {ref}",
                    descricao=(
                        f"Custo de R$ {custo_por_kg:.2f}/kg de ganho supera o valor de "
                        f"mercado (R$ {valor_por_kg_mercado:.2f}/kg, arroba CEPEA "
                        f"R$ {preco_arroba:.2f}). Diferenca: R$ {diferenca:.2f}/kg. "
                        f"Considere vender. (Fonte: CEPEA)"
                    ),
                    nivel="aviso",
                    prioridade="media",
                    data_vencimento=date.today() + timedelta(days=7),
                    origem_evento="cron_bovino",
                )
            )
    return alertas


def processar_alertas_bovinos(imovel_id: Optional[int] = None, dias: int = 1) -> dict:
    """
    Ponto de entrada do cron.
    Gera alertas, persiste sem duplicatas e envia WhatsApp.
    """
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        svc = AlertaService(conn, tabela="bovino_alertas", col_ref_id="animal_id")

        alertas: list[dict] = []
        alertas += _gerar_alertas_reforco(cur, imovel_id)
        alertas += _gerar_alertas_parto(cur, imovel_id)
        alertas += _gerar_alertas_sem_pesagem(cur, imovel_id)
        alertas += _gerar_alertas_leite(cur, imovel_id)

        preco_arroba = garantir_cotacoes_atualizadas(conn)
        if preco_arroba:
            alertas += _gerar_alertas_engorda(cur, imovel_id, preco_arroba)

        criados = svc.upsert(alertas)
        resultado = svc.processar_e_enviar(dias=dias, imovel_id=imovel_id)
        resultado["alertas_gerados"] = criados
        return resultado
    except Exception as e:
        conn.rollback()
        logger.error("Erro cron alertas bovinos: %s", e, exc_info=True)
        return {"erro": str(e)}
    finally:
        conn.close()
