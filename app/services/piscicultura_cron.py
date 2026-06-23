"""
RuralCaixa — app/services/piscicultura_cron.py

Cron de geração e envio de alertas de piscicultura.
Responsabilidade deste módulo: apenas gerar a lista de alertas.
Envio, deduplicação e marcação ficam no AlertaService.

Alertas gerados (8 tipos):
  1. ph_faixa_critica       : pH fora da faixa ideal no último registro diário
  2. oxigenio_critico       : O₂ dissolvido < 2 mg/L no último registro diário
  3. temperatura_fora_range : temperatura fora do range por espécie
  4. amonia_alta            : amonia_mg_l > 0.5 mg/L ou nitrito_mg_l > 0.2 mg/L
                              (colunas dedicadas em registros_diarios_piscicultura)
  5. despesca_proxima       : ciclo com despesca prevista em ≤ 7 dias
  6. ica_elevado            : ICA acumulado > 2.5 na última biometria
  7. mortalidade_elevada    : mortalidade acumulada > 10% do plantel inicial
  8. biometria_atrasada     : última biometria há ≥ 30 dias (ou nenhuma registrada)

Limites de referência (EMBRAPA / SEBRAE Aquicultura):
  pH ideal: 6.5–8.5  |  crítico: < 6.0 ou > 9.0
  O₂: ideal > 3 mg/L |  crítico: < 2 mg/L
  ICA limite: 2.5 kg ração / kg ganho de peso
  Mortalidade crítica: > 10% do plantel inicial
  Biometria: recomendada a cada 15–30 dias
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

# ── Limites por parâmetro ──────────────────────────────────────────────────────
PH_MIN_CRITICO   = 6.0
PH_MAX_CRITICO   = 9.0
PH_MIN_AVISO     = 6.5
PH_MAX_AVISO     = 8.5
O2_CRITICO       = 2.0
O2_AVISO         = 3.0
ICA_LIMITE       = 2.5
MORTALIDADE_PERC = 10.0   # %
BIOMETRIA_DIAS   = 30     # dias sem biometria = alerta

# Ranges de temperatura por espécie (°C): (min_aviso, max_aviso, min_critico, max_critico)
TEMP_RANGES: dict[str, tuple[float, float, float, float]] = {
    "tilapia":   (24, 32, 20, 35),
    "tilápia":   (24, 32, 20, 35),
    "tambaqui":  (26, 30, 22, 33),
    "pintado":   (22, 28, 18, 32),
    "carpa":     (20, 28, 15, 32),
    "pacu":      (24, 30, 20, 34),
    "pirarucu":  (26, 32, 22, 36),
    "matrinxa":  (24, 30, 20, 34),
}


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ── 1, 2, 3, 4: Qualidade da água ─────────────────────────────────────────────
def _gerar_alertas_qualidade_agua(cur, imovel_id: Optional[int]) -> list[dict]:
    """pH, O₂, temperatura e alertas textuais de amônia/nitrito."""
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT DISTINCT ON (c.id)
            c.id            AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.especie,
            r.data_registro,
            r.ph,
            r.oxigenio_dissolvido,
            r.temperatura_c,
            r.amonia_mg_l,
            r.nitrito_mg_l
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
    alertas: list[dict] = []

    for r in rows:
        ciclo    = r["nome_ciclo"] or f"Ciclo {r['ciclo_id']}"
        especie  = (r["especie"] or "").lower()
        data_ref = r["data_registro"]

        # 1. pH
        if r["ph"] is not None:
            ph = float(r["ph"])
            if ph < PH_MIN_CRITICO or ph > PH_MAX_CRITICO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="ph_faixa_critica",
                    titulo=f"🧪 pH crítico: {ciclo} ({ph})",
                    descricao=(
                        f"Ciclo {ciclo}: pH {ph} — faixa crítica (< {PH_MIN_CRITICO} ou > {PH_MAX_CRITICO}). "
                        f"Aplicar calagem ou ácido conforme necessidade. Ideal: {PH_MIN_AVISO}–{PH_MAX_AVISO}."
                    ),
                    nivel="critico", prioridade="alta",
                    data_referencia=data_ref,
                    data_vencimento=date.today(),
                    origem_evento="cron_piscicultura",
                ))
            elif ph < PH_MIN_AVISO or ph > PH_MAX_AVISO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="ph_faixa_critica",
                    titulo=f"🧪 pH fora do ideal: {ciclo} ({ph})",
                    descricao=(
                        f"Ciclo {ciclo}: pH {ph} — fora da faixa ideal ({PH_MIN_AVISO}–{PH_MAX_AVISO}). "
                        f"Monitorar e corrigir se necessário."
                    ),
                    nivel="aviso", prioridade="media",
                    data_referencia=data_ref,
                    data_vencimento=date.today() + timedelta(days=1),
                    origem_evento="cron_piscicultura",
                ))

        # 2. O₂ dissolvido
        if r["oxigenio_dissolvido"] is not None:
            o2 = float(r["oxigenio_dissolvido"])
            if o2 < O2_CRITICO:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="oxigenio_critico",
                    titulo=f"💨 O₂ crítico: {ciclo} ({o2} mg/L)",
                    descricao=(
                        f"Ciclo {ciclo}: O₂ dissolvido {o2} mg/L — abaixo do crítico ({O2_CRITICO} mg/L). "
                        f"Ligar aeradores IMEDIATAMENTE. Risco de mortandade em massa."
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
                    descricao=(
                        f"Ciclo {ciclo}: O₂ dissolvido {o2} mg/L — abaixo do ideal ({O2_AVISO} mg/L). "
                        f"Verificar aeradores e renovação de água."
                    ),
                    nivel="aviso", prioridade="media",
                    data_referencia=data_ref,
                    data_vencimento=date.today() + timedelta(days=1),
                    origem_evento="cron_piscicultura",
                ))

        # 3. Temperatura por espécie
        if r["temperatura_c"] is not None:
            temp = float(r["temperatura_c"])
            if especie in TEMP_RANGES:
                t_min_av, t_max_av, t_min_cr, t_max_cr = TEMP_RANGES[especie]
            else:
                # Fallback genérico para espécies não mapeadas
                t_min_av, t_max_av, t_min_cr, t_max_cr = 24.0, 32.0, 20.0, 35.0

            if temp < t_min_cr or temp > t_max_cr:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="temperatura_fora_range",
                    titulo=f"🌡️ Temperatura crítica: {ciclo} ({temp}°C)",
                    descricao=(
                        f"Ciclo {ciclo} ({r['especie']}): {temp}°C — fora da faixa crítica "
                        f"({t_min_cr}–{t_max_cr}°C). Verificar sombreamento/aquecimento URGENTE."
                    ),
                    nivel="critico", prioridade="alta",
                    data_referencia=data_ref,
                    data_vencimento=date.today(),
                    origem_evento="cron_piscicultura",
                ))
            elif temp < t_min_av or temp > t_max_av:
                alertas.append(dict(
                    imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                    tipo_alerta="temperatura_fora_range",
                    titulo=f"🌡️ Temperatura fora do ideal: {ciclo} ({temp}°C)",
                    descricao=(
                        f"Ciclo {ciclo} ({r['especie']}): {temp}°C — ideal {t_min_av}–{t_max_av}°C. "
                        f"Monitorar e ajustar se necessário."
                    ),
                    nivel="aviso", prioridade="media",
                    data_referencia=data_ref,
                    data_vencimento=date.today() + timedelta(days=2),
                    origem_evento="cron_piscicultura",
                ))

        # 4. Amônia (NH3+NH4) — limite crítico: 0.5 mg/L
        NH3_MAX = 0.5
        if r["amonia_mg_l"] is not None and float(r["amonia_mg_l"]) > NH3_MAX:
            nh3 = float(r["amonia_mg_l"])
            alertas.append(dict(
                imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                tipo_alerta="amonia_alta",
                titulo=f"☠️ Amônia alta: {ciclo} ({nh3} mg/L)",
                descricao=(
                    f"Ciclo {ciclo}: amônia {nh3} mg/L — acima do limite ({NH3_MAX} mg/L). "
                    f"Reduzir densidade, aumentar renovação de água e verificar biofiltro."
                ),
                nivel="critico", prioridade="alta",
                data_referencia=data_ref,
                data_vencimento=date.today(),
                origem_evento="cron_piscicultura",
            ))

        # 4b. Nitrito (NO2) — limite crítico: 0.2 mg/L
        NO2_MAX = 0.2
        if r["nitrito_mg_l"] is not None and float(r["nitrito_mg_l"]) > NO2_MAX:
            no2 = float(r["nitrito_mg_l"])
            alertas.append(dict(
                imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
                tipo_alerta="amonia_alta",
                titulo=f"☠️ Nitrito alto: {ciclo} ({no2} mg/L)",
                descricao=(
                    f"Ciclo {ciclo}: nitrito {no2} mg/L — acima do limite ({NO2_MAX} mg/L). "
                    f"Verificar biofiltro, reduzir arraçoamento e aumentar renovação de água."
                ),
                nivel="critico", prioridade="alta",
                data_referencia=data_ref,
                data_vencimento=date.today(),
                origem_evento="cron_piscicultura",
            ))

    return alertas


# ── 5: Despesca prevista nos próximos 7 dias ──────────────────────────────────
def _gerar_alertas_despesca(cur, imovel_id: Optional[int]) -> list[dict]:
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [7]
    if imovel_id:
        params.insert(0, imovel_id)

    cur.execute(
        f"""
        SELECT
            c.id            AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.especie,
            c.data_despesca_prevista,
            c.meta_peso_final_g,
            c.qtd_alevinos
        FROM ciclos_piscicultura c
        WHERE c.status = 'ativo'
          AND c.data_despesca_prevista BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
          {filtro}
        ORDER BY c.data_despesca_prevista
        """,
        params,
    )
    rows = cur.fetchall()
    alertas: list[dict] = []

    for r in rows:
        dias = (r["data_despesca_prevista"] - date.today()).days
        nivel = "critico" if dias <= 2 else "aviso"
        peso_est = ""
        if r["meta_peso_final_g"] and r["qtd_alevinos"]:
            total_kg = round(float(r["meta_peso_final_g"]) * r["qtd_alevinos"] / 1000, 0)
            peso_est = f" Peso estimado: {total_kg:.0f} kg."
        alertas.append(dict(
            imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
            tipo_alerta="despesca_proxima",
            titulo=f"🎣 Despesca em {dias}d: {r['nome_ciclo']}",
            descricao=(
                f"Ciclo {r['nome_ciclo']} ({r['especie']}): despesca prevista "
                f"{r['data_despesca_prevista'].strftime('%d/%m/%Y')}.{peso_est} "
                f"Preparar equipamentos, comprador e transporte."
            ),
            nivel=nivel, prioridade="alta" if nivel == "critico" else "media",
            data_referencia=r["data_despesca_prevista"],
            data_vencimento=r["data_despesca_prevista"],
            origem_evento="cron_piscicultura",
        ))

    return alertas


# ── 6: ICA elevado (última biometria com ica_acumulado > 2.5) ─────────────────
def _gerar_alertas_ica(cur, imovel_id: Optional[int]) -> list[dict]:
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [ICA_LIMITE] + ([] if not imovel_id else [imovel_id])

    cur.execute(
        f"""
        SELECT DISTINCT ON (c.id)
            c.id            AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.especie,
            b.data_biometria,
            b.ica_acumulado
        FROM ciclos_piscicultura c
        JOIN biometrias_piscicultura b ON b.ciclo_id = c.id
        WHERE c.status = 'ativo'
          AND b.ica_acumulado IS NOT NULL
          AND b.ica_acumulado > %s
          {filtro}
        ORDER BY c.id, b.data_biometria DESC
        """,
        params,
    )
    rows = cur.fetchall()
    alertas: list[dict] = []

    for r in rows:
        ica = float(r["ica_acumulado"])
        alertas.append(dict(
            imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
            tipo_alerta="ica_elevado",
            titulo=f"📊 ICA alto: {r['nome_ciclo']} ({ica:.2f})",
            descricao=(
                f"Ciclo {r['nome_ciclo']} ({r['especie']}): ICA acumulado {ica:.2f} "
                f"(limite: {ICA_LIMITE} kg ração/kg ganho). "
                f"Verificar qualidade da ração, sanidade e densidade do plantel."
            ),
            nivel="aviso", prioridade="media",
            data_referencia=r["data_biometria"],
            data_vencimento=date.today() + timedelta(days=3),
            origem_evento="cron_piscicultura",
        ))

    return alertas


# ── 7: Mortalidade acumulada > 10% ───────────────────────────────────────────
def _gerar_alertas_mortalidade(cur, imovel_id: Optional[int]) -> list[dict]:
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            c.id            AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.especie,
            c.qtd_alevinos,
            COALESCE(SUM(r.mortalidade_qtd), 0) AS total_mortes
        FROM ciclos_piscicultura c
        LEFT JOIN registros_diarios_piscicultura r ON r.ciclo_id = c.id
        WHERE c.status = 'ativo'
          AND c.qtd_alevinos > 0
          {filtro}
        GROUP BY c.id, c.imovel_id, c.nome_ciclo, c.especie, c.qtd_alevinos
        HAVING COALESCE(SUM(r.mortalidade_qtd), 0)::float / c.qtd_alevinos * 100 > %s
        """,
        params + [MORTALIDADE_PERC],
    )
    rows = cur.fetchall()
    alertas: list[dict] = []

    for r in rows:
        taxa = round(r["total_mortes"] / r["qtd_alevinos"] * 100, 1)
        nivel = "critico" if taxa > 20 else "aviso"
        alertas.append(dict(
            imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
            tipo_alerta="mortalidade_elevada",
            titulo=f"💀 Mortalidade {taxa}%: {r['nome_ciclo']}",
            descricao=(
                f"Ciclo {r['nome_ciclo']} ({r['especie']}): {r['total_mortes']} mortes acumuladas "
                f"({taxa}% do plantel inicial de {r['qtd_alevinos']} alevinos). "
                f"Investigar causa, verificar qualidade da água e sanidade URGENTE."
            ),
            nivel=nivel, prioridade="alta",
            data_vencimento=date.today(),
            origem_evento="cron_piscicultura",
        ))

    return alertas


# ── 8: Biometria atrasada (≥ 30 dias sem biometria) ──────────────────────────
def _gerar_alertas_biometria_atrasada(cur, imovel_id: Optional[int]) -> list[dict]:
    filtro = "AND c.imovel_id = %s" if imovel_id else ""
    params = [] if not imovel_id else [imovel_id]

    cur.execute(
        f"""
        SELECT
            c.id            AS ciclo_id,
            c.imovel_id,
            c.nome_ciclo,
            c.especie,
            MAX(b.data_biometria) AS ultima_biometria
        FROM ciclos_piscicultura c
        LEFT JOIN biometrias_piscicultura b ON b.ciclo_id = c.id
        WHERE c.status = 'ativo'
          {filtro}
        GROUP BY c.id, c.imovel_id, c.nome_ciclo, c.especie
        HAVING MAX(b.data_biometria) IS NULL
            OR MAX(b.data_biometria) < CURRENT_DATE - %s
        """,
        params + [BIOMETRIA_DIAS],
    )
    rows = cur.fetchall()
    alertas: list[dict] = []

    for r in rows:
        if r["ultima_biometria"] is None:
            dias_txt = "nunca realizada"
        else:
            dias_val = (date.today() - r["ultima_biometria"]).days
            dias_txt = f"há {dias_val} dias"

        alertas.append(dict(
            imovel_id=r["imovel_id"], ref_id=r["ciclo_id"],
            tipo_alerta="biometria_atrasada",
            titulo=f"📏 Biometria atrasada: {r['nome_ciclo']} ({dias_txt})",
            descricao=(
                f"Ciclo {r['nome_ciclo']} ({r['especie']}): última biometria {dias_txt}. "
                f"Recomendado realizar a cada {BIOMETRIA_DIAS} dias para "
                f"estimar biomassa, ajustar ração e calcular ICA."
            ),
            nivel="aviso", prioridade="media",
            data_vencimento=date.today() + timedelta(days=3),
            origem_evento="cron_piscicultura",
        ))

    return alertas


# ── Ponto de entrada ──────────────────────────────────────────────────────────
def processar_alertas_piscicultura(imovel_id: Optional[int] = None, dias: int = 1) -> dict:
    """
    Ponto de entrada do cron.
    Gera alertas, persiste sem duplicatas via AlertaService e envia WhatsApp.
    """
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        svc = AlertaService(conn, tabela="piscicultura_alertas", col_ref_id="ciclo_id")

        alertas: list[dict] = []
        alertas += _gerar_alertas_qualidade_agua(cur, imovel_id)        # 1, 2, 3, 4
        alertas += _gerar_alertas_despesca(cur, imovel_id)              # 5
        alertas += _gerar_alertas_ica(cur, imovel_id)                   # 6
        alertas += _gerar_alertas_mortalidade(cur, imovel_id)           # 7
        alertas += _gerar_alertas_biometria_atrasada(cur, imovel_id)    # 8

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
