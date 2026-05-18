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

CONTA_LABEL = {
    "1.1.1": "Venda Agricola",
    "1.1.2": "Venda Pecuaria",
    "1.2":   "Servicos Rurais",
    "1.3":   "Receita de Aluguel",
    "3.1.1": "Custeio Agricola",
    "3.1.2": "Combustivel e Lubrificantes",
    "3.1.3": "Pecuaria",
    "3.1.4": "Mao de Obra",
    "3.1.5": "Manutencao de Maquinas",
    "3.1.6": "Energia Eletrica",
    "3.1.7": "Arrendamento Pago",
    "5.1":   "Aquisicao de Maquinas",
    "5.2":   "Obras e Benfeitorias",
    "5.3":   "Aquisicao de Animais",
    "2.1":   "Comissao Recebida",
    "2.2":   "Comissao Paga",
}

def label_conta(conta_codigo, subconta=None, produto=None):
    return produto or subconta or CONTA_LABEL.get(conta_codigo, conta_codigo)

def tipo_from_conta(conta_codigo, tipo_raw):
    if tipo_raw in ("receita","despesa","investimento","intermediacao"):
        return tipo_raw
    c = conta_codigo or ""
    if c.startswith("1."): return "receita"
    if c.startswith("2."): return "intermediacao"
    if c.startswith("3."): return "despesa"
    if c.startswith("5."): return "investimento"
    return tipo_raw

def gerar_dre(engine, produtor_id, view_type="managerial", year=None, start_date=None, end_date=None, visao_integral=False):
    from sqlalchemy import text
    periodo_inicio, periodo_fim, periodo_label = get_period_dates(view_type, year, start_date, end_date)
    with engine.connect() as conn:
        lancamentos = conn.execute(text("""
            SELECT l.id, l.conta_codigo, l.tipo, l.descricao, l.valor, l.valor_bruto,
                   l.perc_participacao, l.data_lancamento, l.subconta, l.produto, l.imovel_id,
                   ir.nome AS imovel_nome, ir.nirf, ir.participacao AS participacao_imovel
            FROM lancamentos l
            LEFT JOIN imoveis_rurais ir ON ir.id = l.imovel_id
            WHERE l.produtor_id = :pid
              AND l.data_lancamento BETWEEN :inicio AND :fim
              AND l.confirmado = TRUE
            ORDER BY l.imovel_id, l.data_lancamento
        """), {"pid": produtor_id, "inicio": periodo_inicio.isoformat(), "fim": periodo_fim.isoformat()}).fetchall()

        try:
            participacoes_rows = conn.execute(text("""
                SELECT pi.imovel_id, pi.percentual, pi.nome_participante, pi.produtor_id, ir.tipo_sociedade
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
            tipo_soc_map = {r[0]: r[4] for r in participacoes_rows}
        except Exception:
            perc_map = {}; part_map = {}; tipo_soc_map = {}

        imoveis = {}
        for row in lancamentos:
            r = dict(row._mapping)
            tipo_norm = tipo_from_conta(r["conta_codigo"], r["tipo"])
            if tipo_norm == "intermediacao" and view_type == "fiscal":
                continue
            imovel_id   = r.get("imovel_id") or 0
            imovel_nome = r.get("imovel_nome") or "Imovel nao vinculado"
            nirf        = r.get("nirf") or ""
            if imovel_id and imovel_id in perc_map:
                perc = perc_map[imovel_id]
            elif r.get("perc_participacao") and float(r["perc_participacao"]) > 0:
                perc = float(r["perc_participacao"])
            elif r.get("participacao_imovel"):
                perc = float(r["participacao_imovel"])
            else:
                perc = 100.0
            valor_bruto = float(r.get("valor_bruto") or r.get("valor") or 0)
            valor_calc  = valor_bruto if (view_type == "managerial" and visao_integral) else round(valor_bruto * perc / 100, 2)
            sublabel = label_conta(r["conta_codigo"], r.get("subconta"), r.get("produto"))
            key = str(imovel_id)
            if key not in imoveis:
                tipo_soc = tipo_soc_map.get(imovel_id, "individual")
                imoveis[key] = {
                    "imovel_id": imovel_id, "nome_imovel": imovel_nome, "nirf": nirf,
                    "tipo_sociedade": f"{tipo_soc} ({perc:.0f}%)" if tipo_soc != "individual" else "Individual (100%)",
                    "participantes": part_map.get(imovel_id, []),
                    "_receitas": {}, "_despesas": {}, "_intermediacao": {}, "_investimentos": {},
                }
            bucket = {"receita":"_receitas","despesa":"_despesas","intermediacao":"_intermediacao","investimento":"_investimentos"}.get(tipo_norm,"_despesas")
            d = imoveis[key][bucket]
            d[sublabel] = round(d.get(sublabel, 0) + valor_calc, 2)

        detalhamento = []
        total_rec_geral = 0.0; total_desp_geral = 0.0
        for data in imoveis.values():
            rec  = data.pop("_receitas"); desp = data.pop("_despesas")
            intr = data.pop("_intermediacao"); inv = data.pop("_investimentos")
            total_rec  = round(sum(rec.values()), 2)
            total_desp = round(sum(desp.values()) + sum(inv.values()), 2)
            total_rec_geral += total_rec; total_desp_geral += total_desp
            detalhamento.append({**data,
                "subcontas": {"receitas": rec, "despesas": {**desp, **inv}, "intermediacao": intr},
                "total_receitas": total_rec, "total_despesas": total_desp,
                "resultado_proporcional": round(total_rec - total_desp, 2),
            })

        return {
            "periodo": periodo_label, "view_type": view_type,
            "visao_integral": visao_integral if view_type == "managerial" else False,
            "periodo_inicio": periodo_inicio.isoformat(), "periodo_fim": periodo_fim.isoformat(),
            "total_receitas": round(total_rec_geral, 2), "total_despesas": round(total_desp_geral, 2),
            "total_geral": round(total_rec_geral - total_desp_geral, 2),
            "detalhamento_por_imovel": detalhamento,
        }
