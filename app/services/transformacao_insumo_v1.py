"""
transformacao_insumo_v1.py (v3 - reaproveita a engine central de estoque)

Modulo de TRANSFORMACAO de insumo (mistura de materias-primas em produto
acabado, ex: milho + soja + nucleo -> Racao X).

CORRECAO CRITICA (31/07): as tabelas `insumos` e `movimentacoes_insumo`
sao PRE-EXISTENTES e ja usadas por todo o sistema via
app/services/estoque_insumos.py:aplicar_movimentacao_insumo(). Esse
modulo NUNCA deve gravar direto em `insumos`/`movimentacoes_insumo` -
sempre delega pra la, como qualquer outro modulo de producao
(piscicultura, acai, bovino, ovino) ja faz. Isso tambem resolve de graca:
  - nome real da coluna e fazenda_id (nao imovel_id)
  - saldo/custo medio sao campos CACHEADOS em insumos.estoque_atual/
    custo_medio (nao agregados via SUM sobre o historico)
  - PMP, lock de linha (FOR UPDATE) e checagem de estoque negativo ja
    vem prontos, testados, em producao

"uso" (saida) e "producao_propria" (entrada) ja sao tipos validos em
TIPOS_VALIDOS de estoque_insumos.py - nao precisou de nenhum tipo novo
nem migracao de schema para o campo `tipo`.

As tabelas transformacoes_insumo/transformacao_ingredientes (criadas por
mim em 31/07, via scripts/criar_tabelas_transformacao_v1.py) continuam
como estao - sao NOVAS, sem dependentes, usam imovel_id corretamente
(referenciando imoveis_rurais). Servem so para a RASTREABILIDADE extra
(qual MP foi para qual mistura) que aplicar_movimentacao_insumo sozinho
nao fornece nesse nivel de detalhe agregado.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
import logging

from fastapi import HTTPException

from app.db import get_db
from app.services.estoque_insumos import aplicar_movimentacao_insumo

logger = logging.getLogger("ruralcaixa.transformacao_insumo")


class TransformacaoError(Exception):
    """Erro generico de negocio no fluxo de transformacao."""


class InsumoNaoEncontradoError(TransformacaoError):
    def __init__(self, nome_insumo: str):
        super().__init__(
            f"Insumo '{nome_insumo}' nao encontrado no catalogo desta fazenda."
        )
        self.nome_insumo = nome_insumo


class EstoqueInsuficienteError(TransformacaoError):
    def __init__(self, mensagem: str):
        super().__init__(mensagem)


@dataclass
class TransformacaoResultado:
    transformacao_id: int
    insumo_resultado_id: int
    movimentacao_entrada_id: int
    lote_resultado: str
    quantidade_resultado: Decimal
    custo_total_resultado: Decimal
    custo_unitario_resultado: Decimal
    perda_processual: Decimal
    ingredientes_processados: list


def _buscar_insumo_por_nome_exato(cur, fazenda_id: int, nome_insumo: str) -> Optional[dict]:
    cur.execute(
        """
        SELECT id, nome FROM insumos
        WHERE fazenda_id = %s AND ativo = TRUE AND LOWER(nome) = LOWER(%s)
        LIMIT 1
        """,
        (fazenda_id, nome_insumo),
    )
    return cur.fetchone()


def _criar_insumo_resultado(cur, fazenda_id: int, nome_resultado: str) -> int:
    cur.execute(
        """
        INSERT INTO insumos (fazenda_id, nome, categoria, unidade, origem, ativo, criado_em, atualizado_em)
        VALUES (%s, %s, 'racao', 'kg', 'producao_propria', TRUE, NOW(), NOW())
        RETURNING id
        """,
        (fazenda_id, nome_resultado),
    )
    return cur.fetchone()["id"]


def _gerar_lote_resultado(cur, imovel_id: int, data_movimentacao: date) -> str:
    prefixo = f"MIST-{imovel_id}-{data_movimentacao.strftime('%Y%m%d')}"
    cur.execute(
        """
        SELECT COUNT(*) AS qtd FROM transformacoes_insumo
        WHERE imovel_id = %s AND data_movimentacao = %s
        """,
        (imovel_id, data_movimentacao),
    )
    seq = cur.fetchone()["qtd"] + 1
    return f"{prefixo}-{seq:03d}"


def processar_transformacao(
    imovel_id: int,
    produtor_id: int,
    ingredientes: list,
    nome_resultado: str,
    data_movimentacao: Optional[date] = None,
    peso_real_resultado: Optional[Decimal] = None,
) -> TransformacaoResultado:
    """
    imovel_id aqui e usado como fazenda_id ao chamar aplicar_movimentacao_insumo
    e ao consultar/criar linhas em `insumos` - mesmo espaco de valores
    (imoveis_rurais.id), so que a tabela legada usa esse nome de coluna.

    ingredientes: lista de dicts {"nome_insumo": str, "quantidade": number}
    """
    if not ingredientes:
        raise TransformacaoError("Nenhum ingrediente informado para a transformacao.")

    data_movimentacao = data_movimentacao or date.today()
    fazenda_id = imovel_id

    ingredientes_parsed = [
        (str(i["nome_insumo"]).strip(), Decimal(str(i["quantidade"])))
        for i in ingredientes
    ]

    conn = get_db()
    cur = conn.cursor()
    try:
        # -----------------------------------------------------------
        # Passo 1: resolver TODOS os insumos das materias-primas antes
        # de mexer em qualquer estoque (aplicar_movimentacao_insumo
        # checa saldo suficiente sozinho e levanta HTTPException se
        # faltar - mas so queremos comecar a baixar depois de saber
        # que todo mundo existe no catalogo).
        # -----------------------------------------------------------
        materias_primas = []
        for nome_insumo, quantidade in ingredientes_parsed:
            insumo = _buscar_insumo_por_nome_exato(cur, fazenda_id, nome_insumo)
            if insumo is None:
                raise InsumoNaoEncontradoError(nome_insumo)
            materias_primas.append(
                {"insumo_id": insumo["id"], "nome": insumo["nome"], "quantidade": quantidade}
            )

        # -----------------------------------------------------------
        # Passo 2: baixar cada materia-prima via aplicar_movimentacao_insumo
        # (tipo="uso" - saida - ja existente, PMP/saldo tratados la)
        # -----------------------------------------------------------
        quantidade_total_mp = Decimal("0")
        custo_total_resultado = Decimal("0")
        ingredientes_processados = []

        for mp in materias_primas:
            try:
                resultado_mov = aplicar_movimentacao_insumo(
                    cur,
                    fazenda_id=fazenda_id,
                    insumo_id=mp["insumo_id"],
                    tipo="uso",
                    quantidade=float(mp["quantidade"]),
                    origem_modulo="transformacao_insumo",
                    origem_tipo="ingrediente",
                    origem_descricao=f"Mistura para produzir '{nome_resultado}'",
                    observacao=f"Baixa para transformacao em '{nome_resultado}'",
                    data_movim=data_movimentacao,
                )
            except HTTPException as exc:
                # aplicar_movimentacao_insumo levanta 400 pra estoque
                # insuficiente - traduz pro nosso tipo de erro de negocio
                raise EstoqueInsuficienteError(str(exc.detail)) from exc

            custo_total_mp = Decimal(str(resultado_mov["custo_total"])).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            quantidade_total_mp += mp["quantidade"]
            custo_total_resultado += custo_total_mp

            ingredientes_processados.append(
                {
                    "insumo_id": mp["insumo_id"],
                    "nome": mp["nome"],
                    "quantidade_usada": mp["quantidade"],
                    "custo_unitario_na_data": Decimal(str(resultado_mov["custo_unitario_aplicado"])),
                    "custo_total": custo_total_mp,
                    "movimentacao_saida_id": resultado_mov["movimentacao_id"],
                }
            )

        # -----------------------------------------------------------
        # Passo 3: resolver o insumo resultado (criar ou reaproveitar)
        # -----------------------------------------------------------
        insumo_resultado = _buscar_insumo_por_nome_exato(cur, fazenda_id, nome_resultado)
        if insumo_resultado is None:
            insumo_resultado_id = _criar_insumo_resultado(cur, fazenda_id, nome_resultado)
        else:
            insumo_resultado_id = insumo_resultado["id"]

        # -----------------------------------------------------------
        # Passo 3b: quantidade final e perda processual
        # -----------------------------------------------------------
        if peso_real_resultado is not None:
            quantidade_resultado = Decimal(str(peso_real_resultado))
            perda_processual = quantidade_total_mp - quantidade_resultado
            if perda_processual < 0:
                logger.warning(
                    "Transformacao '%s' na fazenda %s: peso real (%s) maior "
                    "que soma das MPs (%s). Perda ajustada para 0.",
                    nome_resultado, fazenda_id, quantidade_resultado, quantidade_total_mp,
                )
                perda_processual = Decimal("0")
        else:
            quantidade_resultado = quantidade_total_mp
            perda_processual = Decimal("0")

        custo_unitario_resultado = (
            custo_total_resultado / quantidade_resultado
        ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

        # -----------------------------------------------------------
        # Passo 4: entrada do resultado (tipo="producao_propria" - ja
        # existente - recalcula PMP automaticamente, mesclando com
        # saldo/custo anterior se o insumo ja existia)
        # -----------------------------------------------------------
        resultado_entrada = aplicar_movimentacao_insumo(
            cur,
            fazenda_id=fazenda_id,
            insumo_id=insumo_resultado_id,
            tipo="producao_propria",
            quantidade=float(quantidade_resultado),
            custo_unitario=float(custo_unitario_resultado),
            origem_modulo="transformacao_insumo",
            origem_tipo="mistura",
            origem_descricao=f"Mistura de {len(materias_primas)} materias-primas",
            observacao=f"Entrada por transformacao em '{nome_resultado}'",
            data_movim=data_movimentacao,
        )
        movimentacao_entrada_id = resultado_entrada["movimentacao_id"]

        # -----------------------------------------------------------
        # Passo 5: cabecalho da transformacao (tabela propria, com
        # rastreabilidade - imovel_id aqui esta correto, e minha tabela)
        # -----------------------------------------------------------
        lote_resultado = _gerar_lote_resultado(cur, imovel_id, data_movimentacao)

        cur.execute(
            """
            INSERT INTO transformacoes_insumo (
                imovel_id, produtor_id, insumo_resultado_id,
                quantidade_resultado, custo_total_resultado,
                movimentacao_entrada_id, perda_processual,
                data_movimentacao, data_registro, lote_resultado
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
            RETURNING id
            """,
            (
                imovel_id, produtor_id, insumo_resultado_id,
                quantidade_resultado, custo_total_resultado,
                movimentacao_entrada_id, perda_processual,
                data_movimentacao, lote_resultado,
            ),
        )
        transformacao_id = cur.fetchone()["id"]

        # -----------------------------------------------------------
        # Passo 6: ingredientes (rastreabilidade linha a linha)
        # -----------------------------------------------------------
        for mp in ingredientes_processados:
            cur.execute(
                """
                INSERT INTO transformacao_ingredientes (
                    transformacao_id, insumo_mp_id, movimentacao_saida_id,
                    quantidade_usada, custo_unitario_na_data, custo_total
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    transformacao_id, mp["insumo_id"], mp["movimentacao_saida_id"],
                    mp["quantidade_usada"], mp["custo_unitario_na_data"], mp["custo_total"],
                ),
            )

        conn.commit()

        logger.info(
            "Transformacao %s concluida na fazenda %s: %s -> %s kg de '%s' "
            "(custo unit. R$ %s, perda %s kg)",
            transformacao_id, fazenda_id, quantidade_total_mp,
            quantidade_resultado, nome_resultado, custo_unitario_resultado,
            perda_processual,
        )

        return TransformacaoResultado(
            transformacao_id=transformacao_id,
            insumo_resultado_id=insumo_resultado_id,
            movimentacao_entrada_id=movimentacao_entrada_id,
            lote_resultado=lote_resultado,
            quantidade_resultado=quantidade_resultado,
            custo_total_resultado=custo_total_resultado,
            custo_unitario_resultado=custo_unitario_resultado,
            perda_processual=perda_processual,
            ingredientes_processados=ingredientes_processados,
        )

    except Exception:
        conn.rollback()
        logger.exception(
            "Transformacao revertida (ROLLBACK) na fazenda %s para resultado '%s'",
            fazenda_id, nome_resultado,
        )
        raise
    finally:
        cur.close()
        conn.close()
