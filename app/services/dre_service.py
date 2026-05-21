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

def gerar_dre(engine, produtor_id, view_type="managerial", year=None, start_date=None, end_date=None, visao_integral=False):
    from sqlalchemy import text
    periodo_inicio, periodo_fim, periodo_label = get_period_dates(view_type, year, start_date, end_date)

    with engine.connect() as conn:
        # Query adaptada para schema novo (subcontas UUID)
        lancamentos = conn.execute(text("""
            SELECT
                l.id,
                s.nome        AS subconta_nome,
                s.tipo        AS tipo,
                s.atividade_tipo,
                l.valor,
                l.data        AS data_lancamento,
                i.id          AS imovel_id,
                i.nome        AS imovel_nome,
                i.nirf,
                i.tipo_exploracao
            FROM lancamentos l
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            LEFT JOIN imoveis_rurais i ON i.produtor_id = l.produtor_id
            WHERE l.produtor_id = :pid
              AND l.data BETWEEN :inicio AND :fim
            ORDER BY i.id, l.data
        """), {
            "pid": produtor_id,
            "inicio": periodo_inicio.isoformat(),
            "fim": periodo_fim.isoformat()
        }).fetchall()

        # Participacoes por imovel
        try:
            participacoes_rows = conn.execute(text("""
                SELECT pi.imovel_id, pi.percentual, pi.nome_participante, pi.produtor_id,
                       ir.tipo_exploracao
                FROM participacoes_imovel pi
                JOIN imoveis_rurais ir ON ir.id = pi.imovel_id
                WHERE pi.produtor_id = :pid
                  AND pi.vigencia_inicio <= :fim
                  AND (pi.vigencia_fim IS NULL OR pi.vigencia_fim >= :inicio)
            """), {"pid": produtor_id, "inicio": periodo_inicio.isoformat(), "fim": periodo_fim.isoformat()}).fetchall()
            perc_map = {r[0]: float(r[1]) for r in participacoes_rows}
            part_map = {}
            for r in participacoes_rows:
                part_map.setdefault(r[0], []).append(r[2] or f"Produtor #{r[3]}")
            tipo_exp_map = {r[0]: r[4] for r in participacoes_rows}
        except Exception:
            perc_map = {}; part_map = {}; tipo_exp_map = {}

        imoveis = {}
        for row in lancamentos:
            r = dict(row._mapping)

            tipo_raw = (r.get("tipo") or "DESPESA").upper()
            # Normaliza tipo
            if tipo_raw == "RECEITA":
                tipo_norm = "receita"
            elif tipo_raw in ("INVESTIMENTO", "INVESTIMENTOS"):
                tipo_norm = "investimento"
            else:
                tipo_norm = "despesa"

            imovel_id   = r.get("imovel_id") or 0
            imovel_nome = r.get("imovel_nome") or "Imovel nao vinculado"
            nirf        = r.get("nirf") or ""

            # Participacao
            if imovel_id and imovel_id in perc_map:
                perc = perc_map[imovel_id]
            else:
                perc = 100.0

            valor_bruto = float(r.get("valor") or 0)
            valor_calc  = valor_bruto if (view_type == "managerial" and visao_integral) else round(valor_bruto * perc / 100, 2)

            sublabel = r.get("subconta_nome") or r.get("atividade_tipo") or tipo_norm.title()

            key = str(imovel_id)
            if key not in imoveis:
                tipo_exp_int = tipo_exp_map.get(imovel_id) or r.get("tipo_exploracao") or 1
                tipo_exp_str = TIPO_EXPLORACAO_MAP.get(int(tipo_exp_int) if tipo_exp_int else 1, "individual")
                imoveis[key] = {
                    "imovel_id": imovel_id,
                    "nome_imovel": imovel_nome,
                    "nirf": nirf,
                    "tipo_sociedade": f"{tipo_exp_str} ({perc:.0f}%)" if tipo_exp_str != "individual" else "Individual (100%)",
                    "participantes": part_map.get(imovel_id, []),
                    "_receitas": {}, "_despesas": {}, "_intermediacao": {}, "_investimentos": {},
                }

            bucket = {
                "receita": "_receitas",
                "despesa": "_despesas",
                "intermediacao": "_intermediacao",
                "investimento": "_investimentos"
            }.get(tipo_norm, "_despesas")

            d = imoveis[key][bucket]
            d[sublabel] = round(d.get(sublabel, 0) + valor_calc, 2)

        detalhamento = []
        total_rec_geral = 0.0
        total_desp_geral = 0.0

        for data in imoveis.values():
            rec  = data.pop("_receitas")
            desp = data.pop("_despesas")
            intr = data.pop("_intermediacao")
            inv  = data.pop("_investimentos")
            total_rec  = round(sum(rec.values()), 2)
            total_desp = round(sum(desp.values()) + sum(inv.values()), 2)
            total_rec_geral  += total_rec
            total_desp_geral += total_desp
            detalhamento.append({
                **data,
                "subcontas": {
                    "receitas": rec,
                    "despesas": {**desp, **inv},
                    "intermediacao": intr
                },
                "total_receitas": total_rec,
                "total_despesas": total_desp,
                "resultado_proporcional": round(total_rec - total_desp, 2),
            })

        # Se nao ha imovel vinculado, agrupa tudo em um bloco geral
        if not detalhamento:
            detalhamento = [{
                "imovel_id": 0, "nome_imovel": "Sem imovel vinculado", "nirf": "",
                "tipo_sociedade": "Individual (100%)", "participantes": [],
                "subcontas": {"receitas": {}, "despesas": {}, "intermediacao": {}},
                "total_receitas": 0, "total_despesas": 0, "resultado_proporcional": 0,
            }]

        return {
            "periodo": periodo_label,
            "view_type": view_type,
            "visao_integral": visao_integral if view_type == "managerial" else False,
            "periodo_inicio": periodo_inicio.isoformat(),
            "periodo_fim": periodo_fim.isoformat(),
            "total_receitas": round(total_rec_geral, 2),
            "total_despesas": round(total_desp_geral, 2),
            "total_geral": round(total_rec_geral - total_desp_geral, 2),
            "detalhamento_por_imovel": detalhamento,
        }
