# app/services/dre_service.py
# DRE individual com suporte a lançamentos de consórcio (origem='consorcio')

from datetime import date
from typing import Optional

def get_period_dates(view_type, year=None, start_date=None, end_date=None):
    today = date.today()
    if view_type == "fiscal":
        y = year or today.year
        return date(y, 1, 1), date(y, 12, 31), f"Ano Fiscal {y}"
    elif view_type == "managerial":
        if year:
            s = date(year, 7, 1); e = date(year + 1, 6, 30)
        elif today.month >= 7:
            s = date(today.year, 7, 1); e = date(today.year + 1, 6, 30)
        else:
            s = date(today.year - 1, 7, 1); e = date(today.year, 6, 30)
        return s, e, f"Safra {s.year}/{e.year}"
    elif view_type == "custom":
        if not start_date or not end_date:
            raise ValueError("start_date e end_date obrigatorios para view_type=custom")
        return start_date, end_date, f"{start_date} a {end_date}"
    raise ValueError(f"view_type invalido: {view_type}")

TIPO_EXPLORACAO_MAP = {
    1: "individual", 2: "condominio", 3: "arrendamento",
    4: "parceria", 5: "comodato", 6: "outros"
}

def gerar_dre(engine, produtor_id, view_type="managerial", year=None,
              start_date=None, end_date=None, visao_integral=False):
    from sqlalchemy import text
    periodo_inicio, periodo_fim, periodo_label = get_period_dates(
        view_type, year, start_date, end_date
    )

    with engine.connect() as conn:
        # ── Lançamentos (agora inclui origem e consorcio_lancamento_id) ──────
        lancamentos = conn.execute(text("""
            SELECT
                l.id,
                s.nome            AS subconta_nome,
                s.tipo            AS tipo,
                s.atividade_tipo,
                l.valor,
                l.data            AS data_lancamento,
                l.origem,
                l.consorcio_lancamento_id,
                i.id              AS imovel_id,
                i.nome            AS imovel_nome,
                i.nirf,
                i.tipo_exploracao,
                -- Info do consórcio quando origem=consorcio
                cl.descricao      AS consorcio_descricao,
                cl.categoria      AS consorcio_categoria,
                c.nome            AS consorcio_nome
            FROM lancamentos l
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            LEFT JOIN imoveis_rurais i ON i.produtor_id = l.produtor_id
            LEFT JOIN consorcio_lancamentos cl
                ON cl.id = l.consorcio_lancamento_id
            LEFT JOIN consorcios c
                ON c.id = cl.consorcio_id
            WHERE l.produtor_id = :pid
              AND l.data BETWEEN :inicio AND :fim
            ORDER BY i.id, l.data
        """), {
            "pid":    produtor_id,
            "inicio": periodo_inicio.isoformat(),
            "fim":    periodo_fim.isoformat(),
        }).fetchall()

        # ── Participações por imóvel ──────────────────────────────────────────
        try:
            participacoes_rows = conn.execute(text("""
                SELECT pi.imovel_id, pi.percentual, pi.nome_participante,
                       pi.produtor_id, ir.tipo_exploracao
                FROM participacoes_imovel pi
                JOIN imoveis_rurais ir ON ir.id = pi.imovel_id
                WHERE pi.produtor_id = :pid
                  AND pi.vigencia_inicio <= :fim
                  AND (pi.vigencia_fim IS NULL OR pi.vigencia_fim >= :inicio)
            """), {
                "pid":    produtor_id,
                "inicio": periodo_inicio.isoformat(),
                "fim":    periodo_fim.isoformat(),
            }).fetchall()
            perc_map     = {r[0]: float(r[1]) for r in participacoes_rows}
            part_map     = {}
            tipo_exp_map = {r[0]: r[4] for r in participacoes_rows}
            for r in participacoes_rows:
                part_map.setdefault(r[0], []).append(r[2] or f"Produtor #{r[3]}")
        except Exception:
            perc_map = {}; part_map = {}; tipo_exp_map = {}

        # ── Montar DRE por imóvel ─────────────────────────────────────────────
        imoveis = {}
        consorcios_resumo = {}   # consórcio_nome → {receita, despesa}

        for row in lancamentos:
            r = dict(row._mapping)

            tipo_raw = (r.get("tipo") or "DESPESA").upper()
            if tipo_raw == "RECEITA":
                tipo_norm = "receita"
            elif tipo_raw in ("INVESTIMENTO", "INVESTIMENTOS"):
                tipo_norm = "investimento"
            else:
                tipo_norm = "despesa"

            imovel_id   = r.get("imovel_id") or 0
            imovel_nome = r.get("imovel_nome") or "Imovel nao vinculado"
            nirf        = r.get("nirf") or ""
            origem      = r.get("origem") or "manual"

            perc       = perc_map.get(imovel_id, 100.0) if imovel_id else 100.0
            valor_bruto = float(r.get("valor") or 0)
            valor_calc  = (valor_bruto
                           if (view_type == "managerial" and visao_integral)
                           else round(valor_bruto * perc / 100, 2))

            # Label da subconta — lançamentos de consórcio usam nome do consórcio
            if origem == "consorcio" and r.get("consorcio_nome"):
                cons_nome = r["consorcio_nome"]
                cat       = r.get("consorcio_categoria") or r.get("consorcio_descricao") or "Consórcio"
                sublabel  = f"[Consórcio] {cons_nome} — {cat}"

                # Acumula no resumo de consórcios
                if cons_nome not in consorcios_resumo:
                    consorcios_resumo[cons_nome] = {"receita": 0.0, "despesa": 0.0}
                if tipo_norm == "receita":
                    consorcios_resumo[cons_nome]["receita"] = round(
                        consorcios_resumo[cons_nome]["receita"] + valor_calc, 2)
                else:
                    consorcios_resumo[cons_nome]["despesa"] = round(
                        consorcios_resumo[cons_nome]["despesa"] + valor_calc, 2)
            else:
                sublabel = r.get("subconta_nome") or r.get("atividade_tipo") or tipo_norm.title()

            key = str(imovel_id)
            if key not in imoveis:
                tipo_exp_int = tipo_exp_map.get(imovel_id) or r.get("tipo_exploracao") or 1
                tipo_exp_str = TIPO_EXPLORACAO_MAP.get(
                    int(tipo_exp_int) if tipo_exp_int else 1, "individual"
                )
                imoveis[key] = {
                    "imovel_id":     imovel_id,
                    "nome_imovel":   imovel_nome,
                    "nirf":          nirf,
                    "tipo_sociedade": (
                        f"{tipo_exp_str} ({perc:.0f}%)"
                        if tipo_exp_str != "individual"
                        else "Individual (100%)"
                    ),
                    "participantes": part_map.get(imovel_id, []),
                    "_receitas": {}, "_despesas": {},
                    "_intermediacao": {}, "_investimentos": {},
                    "_consorcios": {},   # bucket separado para cotas de consórcio
                }

            bucket = {
                "receita":      "_receitas",
                "despesa":      "_despesas",
                "intermediacao":"_intermediacao",
                "investimento": "_investimentos",
            }.get(tipo_norm, "_despesas")

            # Lançamentos de consórcio ficam num bucket próprio dentro do imóvel
            if origem == "consorcio":
                d = imoveis[key]["_consorcios"]
            else:
                d = imoveis[key][bucket]

            d[sublabel] = round(d.get(sublabel, 0) + valor_calc, 2)

        # ── Consolidar por imóvel ─────────────────────────────────────────────
        detalhamento = []
        total_rec_geral  = 0.0
        total_desp_geral = 0.0

        for data in imoveis.values():
            rec  = data.pop("_receitas")
            desp = data.pop("_despesas")
            intr = data.pop("_intermediacao")
            inv  = data.pop("_investimentos")
            cons = data.pop("_consorcios")   # cotas de consórcio

            total_rec  = round(sum(rec.values()) + sum(
                v for k, v in cons.items()
                if "[Consórcio]" in k and
                   any(t in k for t in ["receita", "Receita", "RECEITA", "Venda", "venda"])
            ), 2)

            # Separa cotas de receita e despesa no bucket consórcio
            cons_rec  = {k: v for k, v in cons.items()
                         if any(t in k.lower() for t in ["receita","venda","produto"])}
            cons_desp = {k: v for k, v in cons.items() if k not in cons_rec}

            total_rec  = round(sum(rec.values()) + sum(cons_rec.values()), 2)
            total_desp = round(sum(desp.values()) + sum(inv.values()) + sum(cons_desp.values()), 2)

            total_rec_geral  += total_rec
            total_desp_geral += total_desp

            detalhamento.append({
                **data,
                "subcontas": {
                    "receitas":   rec,
                    "despesas":   {**desp, **inv},
                    "intermediacao": intr,
                    "consorcios": cons,   # ← NOVO: cotas de consórcio separadas
                },
                "total_receitas":          total_rec,
                "total_despesas":          total_desp,
                "resultado_proporcional":  round(total_rec - total_desp, 2),
            })

        if not detalhamento:
            detalhamento = [{
                "imovel_id": 0, "nome_imovel": "Sem imovel vinculado", "nirf": "",
                "tipo_sociedade": "Individual (100%)", "participantes": [],
                "subcontas": {
                    "receitas": {}, "despesas": {},
                    "intermediacao": {}, "consorcios": {}
                },
                "total_receitas": 0, "total_despesas": 0, "resultado_proporcional": 0,
            }]

        return {
            "periodo":        periodo_label,
            "view_type":      view_type,
            "visao_integral": visao_integral if view_type == "managerial" else False,
            "periodo_inicio": periodo_inicio.isoformat(),
            "periodo_fim":    periodo_fim.isoformat(),
            "total_receitas": round(total_rec_geral, 2),
            "total_despesas": round(total_desp_geral, 2),
            "total_geral":    round(total_rec_geral - total_desp_geral, 2),
            "detalhamento_por_imovel": detalhamento,
            # ← NOVO: resumo das cotas de consórcio do produtor
            "consorcios_participante": [
                {
                    "consorcio": nome,
                    "receita":   v["receita"],
                    "despesa":   v["despesa"],
                    "resultado": round(v["receita"] - v["despesa"], 2),
                }
                for nome, v in consorcios_resumo.items()
            ],
        }
