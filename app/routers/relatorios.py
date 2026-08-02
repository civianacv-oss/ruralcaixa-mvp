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
from fastapi import APIRouter, Query, Request, HTTPException
from typing import Optional
from datetime import date
import psycopg2
import psycopg2.extras
import os

router = APIRouter(prefix="/relatorios", tags=["Relatorios"])


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=psycopg2.extras.RealDictCursor)


# 02/08: resumo_por_atividade e comparativo_atividades aceitavam
# produtor_id cru via query param, sem checar contra quem estava
# autenticado -- qualquer token valido (de qualquer produtor) conseguia
# ler o relatorio financeiro de QUALQUER outro produtor so trocando o
# numero na URL (pendencia de seguranca registrada em sessao anterior,
# "baixo risco enquanto so o Cicero tem token valido" -- deixou de ser
# baixo risco no momento em que o painel virou multiusuario de verdade,
# ver fix do ImovelSelector na mesma sessao).
#
# Ainda nao existe um sistema formal de "papel" (role) no banco -- por
# ora, a tela /contador (que navega por produtor_id de qualquer
# produtor) e uso interno do Cicero (produtor_id=1) como operador,
# nao uma feature aberta a terceiros. Ate um sistema de role real
# existir, a regra e simples: so pode consultar dado de OUTRO produtor
# se for o proprio Cicero autenticado.
_PRODUTOR_ID_OPERADOR = 1


def _autorizar_produtor_id(request: Request, produtor_id_solicitado: int) -> int:
    """Retorna o produtor_id que a consulta deve usar, ou lanca 403 se o
    token autenticado nao tiver permissao pra ver o produtor_id pedido."""
    produtor_id_token = getattr(request.state, "produtor_id", None)
    if produtor_id_token is None:
        raise HTTPException(status_code=401, detail="Token nao identificado.")
    if produtor_id_solicitado == produtor_id_token:
        return produtor_id_solicitado
    if produtor_id_token == _PRODUTOR_ID_OPERADOR:
        return produtor_id_solicitado
    raise HTTPException(
        status_code=403,
        detail="Voce nao tem permissao pra ver o relatorio de outro produtor.",
    )


def _autorizar_imovel_id(request: Request, imovel_id_solicitado: int) -> int:
    """Mesma logica de _autorizar_produtor_id, mas para endpoints que
    filtram por imovel_id (rebanho, eficiencia-alimentar). Reaproveita
    listar_imoveis_acessiveis (db.py) -- fonte unica de verdade criada
    em 30/07 pro bug do /imoveis/buscar?cpf=... -- em vez de confiar
    cegamente no imovel_id que vier na query string."""
    produtor_id_token = getattr(request.state, "produtor_id", None)
    if produtor_id_token is None:
        raise HTTPException(status_code=401, detail="Token nao identificado.")
    if produtor_id_token == _PRODUTOR_ID_OPERADOR:
        return imovel_id_solicitado

    from app.db import listar_imoveis_acessiveis
    acessiveis = {i["imovel_id"] for i in listar_imoveis_acessiveis(produtor_id_token)}
    if imovel_id_solicitado not in acessiveis:
        raise HTTPException(
            status_code=403,
            detail="Voce nao tem permissao pra ver o relatorio deste imovel.",
        )
    return imovel_id_solicitado


@router.get("/rebanho")
def relatorio_rebanho(
    request: Request,
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
    imovel_id = _autorizar_imovel_id(request, imovel_id)
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
def relatorio_eficiencia_alimentar(request: Request, imovel_id: int, produtor_id: int):
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
    imovel_id = _autorizar_imovel_id(request, imovel_id)
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


@router.get("/atividades")
def listar_atividades(produtor_id: Optional[int] = Query(None)):
    """Catalogo de atividades pro filtro do Dashboard. Retorna as
    atividades padrao do sistema (produtor_id NULL) mais as especificas
    do produtor, se houver."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, nome, tipo, categoria, icone, cor, ordem_exibicao, ativo
            FROM atividades
            WHERE ativo = true
              AND (produtor_id IS NULL OR produtor_id = %s)
            ORDER BY ordem_exibicao
        """, (produtor_id,))
        return list(cur.fetchall())
    finally:
        conn.close()


@router.get("/resumo-por-atividade")
def resumo_por_atividade(
    request: Request,
    produtor_id: int,
    meses: int = Query(12, ge=1, le=36),
):
    """Receita/despesa/resultado por mes, agrupado por atividade.
    Alimenta o grafico comparativo do Dashboard. Lancamentos sem
    atividade_id (historico anterior ao backfill, ou casos ambiguos)
    caem no grupo "Nao classificado" em vez de sumir da soma."""
    produtor_id = _autorizar_produtor_id(request, produtor_id)
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                COALESCE(a.id::text, 'sem_atividade')   AS atividade_id,
                COALESCE(a.nome, 'Não classificado')     AS atividade_nome,
                COALESCE(a.cor, '#9ca3af')                AS cor,
                COALESCE(a.icone, '❓')                    AS icone,
                date_trunc('month', l.data)::date         AS mes,
                SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END) AS receita,
                SUM(CASE WHEN s.tipo != 'RECEITA' THEN l.valor ELSE 0 END) AS despesa,
                COUNT(*) AS total_lancamentos
            FROM lancamentos l
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            LEFT JOIN atividades a ON a.id = l.atividade_id
            WHERE l.produtor_id = %(produtor_id)s
              AND l.data >= CURRENT_DATE - (%(meses)s * 30)
            GROUP BY a.id, a.nome, a.cor, a.icone, date_trunc('month', l.data)
            ORDER BY mes DESC
        """, {"produtor_id": produtor_id, "meses": meses})
        linhas = list(cur.fetchall())

        for l in linhas:
            l["receita"] = float(l["receita"] or 0)
            l["despesa"] = float(l["despesa"] or 0)
            l["resultado"] = round(l["receita"] - l["despesa"], 2)
            l["mes"] = l["mes"].isoformat()

        return linhas
    finally:
        conn.close()


@router.get("/comparativo-atividades")
def comparativo_atividades(
    request: Request,
    produtor_id: int,
    meses: int = Query(12, ge=1, le=36),
):
    """Mesma base do resumo-por-atividade, mas ja consolidado no total
    do periodo (nao por mes) -- usado na tabela de rentabilidade
    comparada do Dashboard."""
    produtor_id = _autorizar_produtor_id(request, produtor_id)
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                COALESCE(a.id::text, 'sem_atividade')   AS atividade_id,
                COALESCE(a.nome, 'Não classificado')     AS atividade_nome,
                COALESCE(a.cor, '#9ca3af')                AS cor,
                COALESCE(a.icone, '❓')                    AS icone,
                SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END) AS receita_total,
                SUM(CASE WHEN s.tipo != 'RECEITA' THEN l.valor ELSE 0 END) AS despesa_total,
                COUNT(*) AS total_lancamentos
            FROM lancamentos l
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            LEFT JOIN atividades a ON a.id = l.atividade_id
            WHERE l.produtor_id = %(produtor_id)s
              AND l.data >= CURRENT_DATE - (%(meses)s * 30)
            GROUP BY a.id, a.nome, a.cor, a.icone
            ORDER BY (SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END)
                      - SUM(CASE WHEN s.tipo != 'RECEITA' THEN l.valor ELSE 0 END)) DESC
        """, {"produtor_id": produtor_id, "meses": meses})
        linhas = list(cur.fetchall())

        for l in linhas:
            receita = float(l["receita_total"] or 0)
            despesa = float(l["despesa_total"] or 0)
            l["receita_total"] = receita
            l["despesa_total"] = despesa
            l["resultado_total"] = round(receita - despesa, 2)
            l["margem_percentual"] = round((receita - despesa) / receita * 100, 1) if receita else 0.0

        return linhas
    finally:
        conn.close()
