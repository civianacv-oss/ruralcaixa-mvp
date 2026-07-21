"""
Endpoint agregador do Painel Fiscal.

Reúne o status das 6 obrigações (NF-e, eSocial, EFD-Reinf/DARF, DCTFWeb,
Livro Caixa, Simulador Tributário) num único payload pro front consumir
no /painel-fiscal.

COMO INTEGRAR:
1. Copiar este arquivo para app/routers/fiscal.py
2. Registrar o router em app/main.py:
       from app.routers import fiscal
       app.include_router(fiscal.router)
3. Ajustar cada função `_status_<obrigacao>()` com o nome real da tabela
   e das colunas — estão marcadas com TODO abaixo porque não tenho o
   schema exato dessas tabelas na memória. O restante (formato da
   resposta, tratamento de erro, conexão) já segue os padrões do projeto.

IMPORTANTE (padrões já conhecidos do RuralCaixa):
- get_db() retorna conexão com RealDictCursor (dicts, não tuplas)
- Parametros de query SEMPRE como tuple(), nunca list
- imoveis_rurais é o nome real da tabela de propriedades (não "imoveis")
- Se qualquer bloco aqui precisar de rollback próprio, abrir conexão
  separada — não reaproveitar a conexão de outro bloco em transação
"""

from datetime import date, datetime
from fastapi import APIRouter, HTTPException
from app.db import get_db

router = APIRouter(prefix="/fiscal", tags=["fiscal"])


# ---------------------------------------------------------------------------
# Cada função abaixo devolve um dict no formato:
# {
#   "status": "em_dia" | "pendente" | "atrasado" | "disponivel",
#   "destaque": str,          # texto curto mostrado no card fechado
#   "detalhes": [ {"label": str, "valor": str}, ... ],
# }
# Se a obrigação não tiver dado (produtor ainda não usou o módulo),
# devolver status "disponivel" com destaque explicando isso.
# ---------------------------------------------------------------------------


def _status_nfe(cur, imovel_id: int) -> dict:
    # TODO: confirmar nome real da tabela de notas fiscais emitidas
    # (provável: nfe_emitidas ou notas_fiscais)
    cur.execute(
        """
        SELECT COUNT(*) AS total,
               COALESCE(SUM(valor_total), 0) AS total_valor,
               MAX(data_emissao) AS ultima_emissao
        FROM nfe_emitidas
        WHERE imovel_id = %s
          AND date_trunc('month', data_emissao) = date_trunc('month', CURRENT_DATE)
        """,
        (imovel_id,),
    )
    row = cur.fetchone()
    total = row["total"] or 0
    ultima = row["ultima_emissao"]

    return {
        "status": "em_dia",
        "destaque": f"{total} notas emitidas no mês",
        "detalhes": [
            {"label": "Última emissão", "valor": ultima.strftime("%d/%m/%Y") if ultima else "—"},
            {"label": "Total emitido (mês)", "valor": f"R$ {float(row['total_valor']):.2f}"},
        ],
    }


def _status_esocial(cur, imovel_id: int) -> dict:
    # TODO: confirmar tabela de eventos eSocial (provável: esocial_eventos)
    # com colunas tipo_evento, competencia, vencimento, transmitido
    cur.execute(
        """
        SELECT tipo_evento, competencia, vencimento, transmitido
        FROM esocial_eventos
        WHERE imovel_id = %s AND transmitido = FALSE
        ORDER BY vencimento ASC
        LIMIT 1
        """,
        (imovel_id,),
    )
    row = cur.fetchone()
    if not row:
        return {
            "status": "em_dia",
            "destaque": "Nenhum evento pendente",
            "detalhes": [],
        }

    dias_para_vencer = (row["vencimento"] - date.today()).days
    status = "atrasado" if dias_para_vencer < 0 else "pendente"
    destaque = (
        f"Vence em {dias_para_vencer} dias" if dias_para_vencer >= 0
        else f"Atrasado há {abs(dias_para_vencer)} dias"
    )

    return {
        "status": status,
        "destaque": destaque,
        "detalhes": [
            {"label": "Evento pendente", "valor": row["tipo_evento"]},
            {"label": "Vencimento", "valor": row["vencimento"].strftime("%d/%m/%Y")},
            {"label": "Competência", "valor": row["competencia"]},
        ],
    }


def _status_efdreinf(cur, imovel_id: int) -> dict:
    # TODO: confirmar tabela de EFD-Reinf/DARF (provável: efdreinf_apuracoes)
    # com colunas competencia, vencimento, valor_multa, quitado
    cur.execute(
        """
        SELECT competencia, vencimento, valor_multa
        FROM efdreinf_apuracoes
        WHERE imovel_id = %s AND quitado = FALSE
        ORDER BY vencimento ASC
        LIMIT 1
        """,
        (imovel_id,),
    )
    row = cur.fetchone()
    if not row:
        return {"status": "em_dia", "destaque": "Nenhuma pendência", "detalhes": []}

    dias_atraso = (date.today() - row["vencimento"]).days
    status = "atrasado" if dias_atraso > 0 else "pendente"

    return {
        "status": status,
        "destaque": f"Multa estimada R$ {float(row['valor_multa']):.2f}",
        "detalhes": [
            {"label": "Competência em atraso", "valor": row["competencia"]},
            {"label": "Vencimento original", "valor": row["vencimento"].strftime("%d/%m/%Y")},
            {"label": "Dias em atraso", "valor": f"{max(dias_atraso, 0)} dias"},
        ],
    }


def _status_dctfweb(cur, imovel_id: int) -> dict:
    # TODO: confirmar tabela de transmissões DCTFWeb (provável: dctfweb_transmissoes)
    cur.execute(
        """
        SELECT competencia, data_transmissao, situacao, proxima_competencia
        FROM dctfweb_transmissoes
        WHERE imovel_id = %s
        ORDER BY data_transmissao DESC
        LIMIT 1
        """,
        (imovel_id,),
    )
    row = cur.fetchone()
    if not row:
        return {"status": "disponivel", "destaque": "Nenhuma transmissão ainda", "detalhes": []}

    return {
        "status": "em_dia" if row["situacao"] == "aceita" else "pendente",
        "destaque": f"Próximo: {row['proxima_competencia']}",
        "detalhes": [
            {"label": "Última transmissão", "valor": row["data_transmissao"].strftime("%d/%m/%Y")},
            {"label": "Situação", "valor": row["situacao"]},
        ],
    }


def _status_livro_caixa(cur, imovel_id: int) -> dict:
    # Corrigido: o módulo real de Livro Caixa (app/routers/livro_caixa.py)
    # lê da tabela livro_caixa_lancamentos, filtrada por imovel_id — não
    # da tabela "lancamentos" comum. Elas agora ficam sincronizadas via
    # trigger (migration_021_sync_livro_caixa.sql).
    ano_atual = date.today().year
    cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) AS receitas,
            COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0) AS despesas,
            MAX(data_lancamento) AS ultimo_lancamento
        FROM livro_caixa_lancamentos
        WHERE imovel_id = %s AND ano_base = %s
        """,
        (imovel_id, ano_atual),
    )
    row = cur.fetchone()
    receitas = float(row["receitas"] or 0)
    despesas = float(row["despesas"] or 0)
    saldo = receitas - despesas
    ultimo = row["ultimo_lancamento"]

    return {
        "status": "em_dia",
        "destaque": f"Saldo: R$ {saldo:.2f}",
        "detalhes": [
            {"label": "Último lançamento", "valor": ultimo.strftime("%d/%m/%Y") if ultimo else "—"},
            {"label": "Receitas (ano)", "valor": f"R$ {receitas:.2f}"},
            {"label": "Despesas (ano)", "valor": f"R$ {despesas:.2f}"},
        ],
    }


def _status_simulador(cur, imovel_id: int) -> dict:
    # Simulador não tem "pendência" — é sempre disponível.
    # TODO: se houver histórico de simulações salvas, buscar a última aqui
    # (provável: simulacoes_tributarias)
    return {
        "status": "disponivel",
        "destaque": "Comparativo de regimes",
        "detalhes": [
            {"label": "Regime atual", "valor": "A confirmar"},
            {"label": "Última simulação", "valor": "—"},
        ],
    }


def _safe(cur, conn, fn, imovel_id: int) -> dict:
    """
    Roda uma função _status_* isolada. Se a tabela ainda não existir
    (UndefinedTable) ou algo mais der errado, devolve um card neutro em
    vez de derrubar o painel inteiro — assim os módulos que já têm tabela
    aparecem certos enquanto os outros ainda não foram migrados/wireados.
    """
    try:
        return fn(cur, imovel_id)
    except Exception as e:
        conn.rollback()  # limpa a transação abortada pelo erro, senão o cursor trava
        return {
            "status": "disponivel",
            "destaque": "Ainda sem dados neste módulo",
            "detalhes": [{"label": "Detalhe técnico", "valor": str(e).split("\n")[0][:120]}],
        }


@router.get("/{modulo}/historico/{imovel_id}")
def historico_fiscal(modulo: str, imovel_id: int):
    """
    Devolve a lista completa de registros de um módulo específico
    (usado pelo modal "Ver histórico" no PainelFiscal).

    Formato: {"linhas": [{"label": str, "valor": str}, ...]}
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        if modulo == "nfe":
            cur.execute(
                """
                SELECT numero_nfe, data_emissao, valor_total
                FROM nfe_emitidas
                WHERE imovel_id = %s
                ORDER BY data_emissao DESC
                LIMIT 50
                """,
                (imovel_id,),
            )
            linhas = [
                {
                    "label": f"NF-e {r['numero_nfe'] or '—'} · {r['data_emissao'].strftime('%d/%m/%Y')}",
                    "valor": f"R$ {float(r['valor_total']):.2f}",
                }
                for r in cur.fetchall()
            ]

        elif modulo == "esocial":
            cur.execute(
                """
                SELECT tipo_evento, competencia, vencimento, transmitido
                FROM esocial_eventos
                WHERE imovel_id = %s
                ORDER BY vencimento DESC
                LIMIT 50
                """,
                (imovel_id,),
            )
            linhas = [
                {
                    "label": f"{r['tipo_evento']} · {r['competencia']}",
                    "valor": "Transmitido" if r["transmitido"] else f"Vence {r['vencimento'].strftime('%d/%m/%Y')}",
                }
                for r in cur.fetchall()
            ]

        elif modulo == "efdreinf":
            cur.execute(
                """
                SELECT competencia, vencimento, valor_darf, quitado
                FROM efdreinf_apuracoes
                WHERE imovel_id = %s
                ORDER BY vencimento DESC
                LIMIT 50
                """,
                (imovel_id,),
            )
            linhas = [
                {
                    "label": f"Competência {r['competencia']} · {'quitado' if r['quitado'] else 'em aberto'}",
                    "valor": f"R$ {float(r['valor_darf']):.2f}",
                }
                for r in cur.fetchall()
            ]

        elif modulo == "dctfweb":
            cur.execute(
                """
                SELECT competencia, data_transmissao, situacao
                FROM dctfweb_transmissoes
                WHERE imovel_id = %s
                ORDER BY data_transmissao DESC
                LIMIT 50
                """,
                (imovel_id,),
            )
            linhas = [
                {
                    "label": f"Competência {r['competencia']} · {r['data_transmissao'].strftime('%d/%m/%Y')}",
                    "valor": r["situacao"],
                }
                for r in cur.fetchall()
            ]

        elif modulo == "livrocaixa":
            cur.execute(
                """
                SELECT data_lancamento, valor, tipo, categoria
                FROM livro_caixa_lancamentos
                WHERE imovel_id = %s
                ORDER BY data_lancamento DESC
                LIMIT 50
                """,
                (imovel_id,),
            )
            linhas = [
                {
                    "label": f"{r['data_lancamento'].strftime('%d/%m/%Y')} · {r['categoria']}",
                    "valor": f"{'+' if r['tipo'] == 'receita' else '-'}R$ {float(r['valor']):.2f}",
                }
                for r in cur.fetchall()
            ]

        else:
            linhas = []

        return {"linhas": linhas}

    except Exception as e:
        conn.rollback()
        # Tabela ainda não existe ou módulo sem histórico salvo — devolve
        # vazio em vez de 500, o front já trata lista vazia como "sem registros"
        return {"linhas": [], "aviso": str(e).split("\n")[0][:120]}
    finally:
        conn.close()


@router.get("/resumo/{imovel_id}")
def resumo_fiscal(imovel_id: int):
    """
    Devolve o status consolidado das 6 obrigações fiscais pra um imóvel,
    no formato consumido pelo componente PainelFiscal (frontend).

    Cada obrigação é isolada via _safe(): uma tabela faltando não impede
    as outras 5 de aparecer corretas.
    """
    conn = get_db()
    try:
        cur = conn.cursor()

        obrigacoes = [
            {"id": "nfe", "nome": "NF-e Produtor",
             **_safe(cur, conn, _status_nfe, imovel_id)},
            {"id": "esocial", "nome": "eSocial Rural",
             **_safe(cur, conn, _status_esocial, imovel_id)},
            {"id": "efdreinf", "nome": "EFD-Reinf / DARF",
             **_safe(cur, conn, _status_efdreinf, imovel_id)},
            {"id": "dctfweb", "nome": "DCTFWeb",
             **_safe(cur, conn, _status_dctfweb, imovel_id)},
            {"id": "livrocaixa", "nome": "Livro Caixa",
             **_safe(cur, conn, _status_livro_caixa, imovel_id)},
            {"id": "simulador", "nome": "Simulador Tributário",
             **_safe(cur, conn, _status_simulador, imovel_id)},
        ]

        contagem = {}
        for o in obrigacoes:
            contagem[o["status"]] = contagem.get(o["status"], 0) + 1

        return {
            "imovel_id": imovel_id,
            "gerado_em": datetime.now().isoformat(),
            "resumo": contagem,
            "obrigacoes": obrigacoes,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao montar painel fiscal: {str(e)}")
    finally:
        conn.close()
