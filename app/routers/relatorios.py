"""
app/routers/relatorios.py — RuralCaixa MVP

Router de relatorios. Comeca so com "Rebanho Geral" (o unico que a tela
de Relatorios.tsx precisa agora); os outros 5 endpoints que a tela ja
lista (financeiro, lancamentos, saude, agricultura, compravenda) ainda
NAO EXISTEM -- ficam como pendencia futura, nao inventados aqui.

Hoje cobre bovino (unica especie com dado real em producao). Ovino/
caprino/suino tem tabela propria mas referenciam uma tabela "imoveis"
que pode nao existir mais -- precisa investigar antes de incluir aqui
(ver diagnostico separado).
"""
from fastapi import APIRouter, Query
from typing import Optional
from datetime import date
import psycopg2
import psycopg2.extras
import os

router = APIRouter(prefix="/relatorios", tags=["Relatorios"])


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=psycopg2.extras.RealDictCursor)


@router.get("/rebanho")
def relatorio_rebanho(
    imovel_id: int,
    data_inicio: Optional[date] = Query(None),
    data_fim: Optional[date] = Query(None),
    produtor_id: Optional[int] = Query(None),
):
    """
    Resumo do rebanho bovino do imovel: totais por categoria, status e
    aptidao (leite/corte), mais peso medio da ultima pesagem de cada
    animal ativo. data_inicio/data_fim reservados para uso futuro
    (ex: entradas/saidas no periodo) -- hoje o resumo e sempre "foto atual".
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status = 'ativo') AS ativos,
                   COUNT(*) FILTER (WHERE aptidao_manejo = 'leite' AND status = 'ativo') AS leite_ativos,
                   COUNT(*) FILTER (WHERE aptidao_manejo = 'corte' AND status = 'ativo') AS corte_ativos
            FROM bovino_animais
            WHERE imovel_id = %s
        """, (imovel_id,))
        totais = dict(cur.fetchone())

        cur.execute("""
            SELECT categoria, COUNT(*) AS qtd
            FROM bovino_animais
            WHERE imovel_id = %s AND status = 'ativo'
            GROUP BY categoria
            ORDER BY qtd DESC
        """, (imovel_id,))
        por_categoria = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT status, COUNT(*) AS qtd
            FROM bovino_animais
            WHERE imovel_id = %s
            GROUP BY status
            ORDER BY qtd DESC
        """, (imovel_id,))
        por_status = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT r.nome AS raca, COUNT(*) AS qtd
            FROM bovino_animais a
            LEFT JOIN bovino_racas r ON r.id = a.raca_id
            WHERE a.imovel_id = %s AND a.status = 'ativo'
            GROUP BY r.nome
            ORDER BY qtd DESC
        """, (imovel_id,))
        por_raca = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT
                ROUND(AVG(p.peso_kg), 1) AS peso_medio_kg,
                COUNT(p.peso_kg) AS qtd_com_pesagem
            FROM bovino_animais a
            LEFT JOIN LATERAL (
                SELECT peso_kg FROM bovino_pesagens
                WHERE animal_id = a.id ORDER BY data DESC LIMIT 1
            ) p ON TRUE
            WHERE a.imovel_id = %s AND a.status = 'ativo'
        """, (imovel_id,))
        peso = dict(cur.fetchone())

        especies = {
            "bovino": {
                "totais": totais,
                "por_categoria": por_categoria,
                "por_status": por_status,
                "por_raca": por_raca,
                "peso_medio_kg": peso["peso_medio_kg"],
                "qtd_com_pesagem": peso["qtd_com_pesagem"],
            },
        }

        # Ovino e suino: tabelas existem e tem dado real, mas referenciam uma
        # tabela "imoveis" legada que nao existe mais no banco (FK quebrada
        # de origem, nunca corrigida). Isso nao impede o SELECT por
        # imovel_id normalmente -- so registramos o alerta separado.
        cur.execute("""
            SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='ativo') AS ativos
            FROM ovino_animais WHERE imovel_id = %s
        """, (imovel_id,))
        ovino_totais = dict(cur.fetchone())
        if ovino_totais["total"] > 0:
            cur.execute("""
                SELECT status, COUNT(*) AS qtd FROM ovino_animais
                WHERE imovel_id = %s GROUP BY status ORDER BY qtd DESC
            """, (imovel_id,))
            especies["ovino"] = {
                "totais": ovino_totais,
                "por_status": [dict(r) for r in cur.fetchall()],
            }

        cur.execute("""
            SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='ativo') AS ativos
            FROM suino_animais WHERE imovel_id = %s
        """, (imovel_id,))
        suino_totais = dict(cur.fetchone())
        if suino_totais["total"] > 0:
            cur.execute("""
                SELECT categoria, COUNT(*) AS qtd FROM suino_animais
                WHERE imovel_id = %s AND status = 'ativo' GROUP BY categoria ORDER BY qtd DESC
            """, (imovel_id,))
            especies["suino"] = {
                "totais": suino_totais,
                "por_categoria": [dict(r) for r in cur.fetchall()],
            }

        return {
            "imovel_id": imovel_id,
            "gerado_em": date.today().isoformat(),
            "periodo": {
                "data_inicio": data_inicio.isoformat() if data_inicio else None,
                "data_fim": data_fim.isoformat() if data_fim else None,
            },
            "especies": especies,
        }
    finally:
        conn.close()


def _gpd_e_peso(cur, tabela_animais, tabela_pesagens, imovel_id, extra_where="", coluna_data="data_pesagem"):
    """
    Calcula cabecas ativas, peso medio (ultima pesagem de cada animal ativo)
    e GPD medio (Ganho de Peso Diario), usando TODO o historico de pesagens
    disponivel (nao janela mensal -- pesagem e evento esporadico, nao serie
    diaria, entao "GPD do mes passado" seria maioria nula/enganoso).
    GPD e uma media ponderada: soma dos ganhos de todo animal com 2+
    pesagens dividido pela soma dos dias entre a 1a e a ultima pesagem.

    `coluna_data`: nome da coluna de data em tabela_pesagens -- a maioria
    usa "data_pesagem" (ovino/caprino/suino), mas bovino_pesagens usa so
    "data" (schema mais antigo, criado antes do padrao se firmar).
    """
    cur.execute(f"""
        SELECT COUNT(*) AS cabecas_ativas
        FROM {tabela_animais}
        WHERE imovel_id = %s AND status = 'ativo' {extra_where}
    """, (imovel_id,))
    cabecas_ativas = cur.fetchone()["cabecas_ativas"]

    cur.execute(f"""
        SELECT ROUND(AVG(p.peso_kg), 1) AS peso_medio_kg, COUNT(p.peso_kg) AS qtd_com_pesagem
        FROM {tabela_animais} a
        LEFT JOIN LATERAL (
            SELECT peso_kg FROM {tabela_pesagens}
            WHERE animal_id = a.id ORDER BY {coluna_data} DESC LIMIT 1
        ) p ON TRUE
        WHERE a.imovel_id = %s AND a.status = 'ativo' {extra_where}
    """, (imovel_id,))
    peso = cur.fetchone()

    cur.execute(f"""
        WITH pesos AS (
            SELECT p.animal_id,
                   MIN(p.{coluna_data}) AS d0, MAX(p.{coluna_data}) AS d1,
                   (ARRAY_AGG(p.peso_kg ORDER BY p.{coluna_data} ASC))[1] AS peso0,
                   (ARRAY_AGG(p.peso_kg ORDER BY p.{coluna_data} DESC))[1] AS peso1
            FROM {tabela_pesagens} p
            JOIN {tabela_animais} a ON a.id = p.animal_id
            WHERE a.imovel_id = %s AND a.status = 'ativo' {extra_where}
            GROUP BY p.animal_id
            HAVING COUNT(*) >= 2 AND MAX(p.{coluna_data}) > MIN(p.{coluna_data})
        )
        SELECT
            SUM(peso1 - peso0) AS ganho_total_kg,
            SUM(d1 - d0) AS dias_total,
            CASE WHEN SUM(d1 - d0) > 0
                 THEN ROUND(SUM(peso1 - peso0)::numeric / SUM(d1 - d0), 3)
                 ELSE NULL END AS gpd_medio_kg_dia
        FROM pesos
    """, (imovel_id,))
    gpd = cur.fetchone()

    return {
        "cabecas_ativas": cabecas_ativas,
        "peso_medio_kg": peso["peso_medio_kg"],
        "qtd_com_pesagem": peso["qtd_com_pesagem"],
        "gpd_medio_kg_dia": gpd["gpd_medio_kg_dia"],
    }


@router.get("/eficiencia-alimentar")
def relatorio_eficiencia_alimentar(imovel_id: int, produtor_id: int):
    """
    Custo de racao por kg de peso vivo ganho, por rebanho (bovino de corte,
    ovino, caprino, suino) -- generalizacao do IOFC pra alem do leite.

    APROXIMACAO CONHECIDA: o custo de racao hoje e lancado por PROPRIEDADE
    INTEIRA (movimentacoes_insumo/insumos nao tem rastreio por especie/lote
    ainda, so o piloto bovino tem isso via bot). Entao o custo mensal medio
    de racao da fazenda e RATEADO proporcionalmente pela quantidade de
    cabecas de cada rebanho -- nao e o custo real de cada um, e uma
    estimativa ate existir lancamento por lote em todas as especies.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        # Custo medio mensal de racao da fazenda inteira, ultimos 3 meses
        # (mesma fonte/logica do IOFC do leite: consumo real, nao compra)
        cur.execute("""
            SELECT COALESCE(AVG(custo_mes), 0) AS custo_racao_mensal_medio
            FROM (
                SELECT date_trunc('month', m.data_movim) AS mes, SUM(m.custo_total) AS custo_mes
                FROM movimentacoes_insumo m
                JOIN insumos i ON i.id = m.insumo_id
                WHERE m.tipo = 'uso'
                  AND i.fazenda_id = %s
                  AND LOWER(i.categoria) IN ('racao', 'ração', 'nutricao', 'nutrição')
                  AND m.data_movim >= CURRENT_DATE - INTERVAL '3 months'
                GROUP BY date_trunc('month', m.data_movim)
            ) sub
        """, (imovel_id,))
        custo_racao_mensal_medio = float(cur.fetchone()["custo_racao_mensal_medio"] or 0)

        grupos = {
            "bovino_corte": _gpd_e_peso(cur, "bovino_animais", "bovino_pesagens", imovel_id, "AND aptidao_manejo = 'corte'", coluna_data="data"),
            "bovino_leite": _gpd_e_peso(cur, "bovino_animais", "bovino_pesagens", imovel_id, "AND aptidao_manejo = 'leite'", coluna_data="data"),
            "ovino": _gpd_e_peso(cur, "ovino_animais", "ovino_pesagens", imovel_id),
            "caprino": _gpd_e_peso(cur, "caprino_animais", "caprino_pesagens", imovel_id),
            "suino": _gpd_e_peso(cur, "suino_animais", "suino_pesagens", imovel_id),
        }

        cabecas_totais = sum(g["cabecas_ativas"] for g in grupos.values())

        resultado = {}
        for nome, g in grupos.items():
            if g["cabecas_ativas"] == 0:
                continue
            proporcao = g["cabecas_ativas"] / cabecas_totais if cabecas_totais > 0 else 0
            custo_alocado = round(custo_racao_mensal_medio * proporcao, 2)
            custo_por_kg_ganho_dia = None
            if g["gpd_medio_kg_dia"] and g["gpd_medio_kg_dia"] > 0:
                denom = g["gpd_medio_kg_dia"] * 30 * g["cabecas_ativas"]
                if denom > 0:
                    custo_por_kg_ganho_dia = round(custo_alocado / denom, 4)
            resultado[nome] = {
                **g,
                "proporcao_cabecas": round(proporcao, 3),
                "custo_racao_alocado_mensal": custo_alocado,
                "custo_por_kg_ganho": custo_por_kg_ganho_dia,
            }

        return {
            "imovel_id": imovel_id,
            "gerado_em": date.today().isoformat(),
            "custo_racao_mensal_medio_fazenda": round(custo_racao_mensal_medio, 2),
            "cabecas_totais_fazenda": cabecas_totais,
            "rebanhos": resultado,
            "aviso": (
                "Custo de ração rateado proporcionalmente por número de cabeças "
                "(aproximação) -- ainda não há lançamento de ração por lote/espécie "
                "para todos os rebanhos."
            ),
        }
    finally:
        conn.close()
