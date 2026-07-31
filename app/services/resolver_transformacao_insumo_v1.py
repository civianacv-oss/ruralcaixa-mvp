"""
resolver_transformacao_insumo_v1.py (v2 - adaptado ao padrao SQLAlchemy)

Camada intermediaria entre o parser de linguagem natural
(parser_transformacao_insumo_v1.py) e a gravacao no banco
(transformacao_insumo_v1.processar_transformacao).

So faz LEITURA (catalogo, saldo, custo) - abre sua propria conexao via
engine.connect() (nao precisa participar da transacao de escrita, que so
comeca depois que o produtor confirma com SIM).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Optional

from sqlalchemy import text

from app.db import engine
from app.services.parser_transformacao_insumo_v1 import ResultadoParse, ItemExtraido


class StatusResolucao(str, Enum):
    RESOLVIDO = "resolvido"
    AMBIGUO = "ambiguo"
    NAO_ENCONTRADO = "nao_encontrado"


@dataclass
class InsumoCandidato:
    id: int
    nome: str
    categoria: str
    saldo: Decimal
    custo_unitario: Decimal


@dataclass
class ItemResolvido:
    nome_bruto: str
    quantidade_kg: Optional[Decimal]
    status: StatusResolucao
    insumo: Optional[InsumoCandidato] = None
    candidatos: list = field(default_factory=list)
    custo_estimado: Optional[Decimal] = None
    saldo_suficiente: Optional[bool] = None


@dataclass
class ResolucaoTransformacao:
    itens: list = field(default_factory=list)
    nome_resultado: Optional[str] = None
    custo_total_estimado: Optional[Decimal] = None

    @property
    def pronto_para_confirmar(self) -> bool:
        if not self.itens or self.nome_resultado is None:
            return False
        return all(
            item.status == StatusResolucao.RESOLVIDO and item.saldo_suficiente
            for item in self.itens
        )


# ---------------------------------------------------------------------------
# Resolucao contra o catalogo
# ---------------------------------------------------------------------------

def _buscar_match_exato(conn, imovel_id: int, nome_bruto: str) -> list:
    rows = conn.execute(
        text(
            """
            SELECT id, nome, categoria
            FROM insumos
            WHERE imovel_id = :imovel_id AND ativo = TRUE AND LOWER(nome) = LOWER(:nome)
            """
        ),
        {"imovel_id": imovel_id, "nome": nome_bruto},
    ).fetchall()
    return rows


def _buscar_match_parcial(conn, imovel_id: int, nome_bruto: str) -> list:
    rows = conn.execute(
        text(
            """
            SELECT id, nome, categoria
            FROM insumos
            WHERE imovel_id = :imovel_id AND ativo = TRUE AND LOWER(nome) LIKE LOWER(:padrao)
            ORDER BY nome
            """
        ),
        {"imovel_id": imovel_id, "padrao": f"%{nome_bruto}%"},
    ).fetchall()
    return rows


def _buscar_saldo_e_custo(conn, imovel_id: int, insumo_id: int) -> tuple:
    row = conn.execute(
        text(
            """
            SELECT
                COALESCE(SUM(
                    CASE WHEN direcao = 'entrada' THEN quantidade ELSE -quantidade END
                ), 0) AS saldo,
                COALESCE(
                    SUM(CASE WHEN direcao = 'entrada' THEN quantidade * custo_unitario ELSE 0 END)
                    / NULLIF(SUM(CASE WHEN direcao = 'entrada' THEN quantidade ELSE 0 END), 0),
                    0
                ) AS custo_medio
            FROM movimentacoes_insumo
            WHERE imovel_id = :imovel_id AND insumo_id = :insumo_id
            """
        ),
        {"imovel_id": imovel_id, "insumo_id": insumo_id},
    ).fetchone()
    return Decimal(row[0]), Decimal(row[1])


def _resolver_um_item(conn, imovel_id: int, item: ItemExtraido) -> ItemResolvido:
    nome_bruto = item.nome_insumo_bruto

    candidatos_rows = _buscar_match_exato(conn, imovel_id, nome_bruto)
    if not candidatos_rows:
        candidatos_rows = _buscar_match_parcial(conn, imovel_id, nome_bruto)

    if len(candidatos_rows) == 0:
        return ItemResolvido(
            nome_bruto=nome_bruto,
            quantidade_kg=item.quantidade_kg,
            status=StatusResolucao.NAO_ENCONTRADO,
        )

    if len(candidatos_rows) > 1:
        candidatos = []
        for insumo_id, nome, categoria in candidatos_rows:
            saldo, custo = _buscar_saldo_e_custo(conn, imovel_id, insumo_id)
            candidatos.append(
                InsumoCandidato(
                    id=insumo_id, nome=nome, categoria=categoria,
                    saldo=saldo, custo_unitario=custo,
                )
            )
        return ItemResolvido(
            nome_bruto=nome_bruto,
            quantidade_kg=item.quantidade_kg,
            status=StatusResolucao.AMBIGUO,
            candidatos=candidatos,
        )

    insumo_id, nome, categoria = candidatos_rows[0]
    saldo, custo = _buscar_saldo_e_custo(conn, imovel_id, insumo_id)
    insumo = InsumoCandidato(
        id=insumo_id, nome=nome, categoria=categoria,
        saldo=saldo, custo_unitario=custo,
    )

    custo_estimado = None
    saldo_suficiente = None
    if item.quantidade_kg is not None:
        custo_estimado = (item.quantidade_kg * custo).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        saldo_suficiente = saldo >= item.quantidade_kg

    return ItemResolvido(
        nome_bruto=nome_bruto,
        quantidade_kg=item.quantidade_kg,
        status=StatusResolucao.RESOLVIDO,
        insumo=insumo,
        custo_estimado=custo_estimado,
        saldo_suficiente=saldo_suficiente,
    )


def resolver_transformacao(
    imovel_id: int, resultado_parse: ResultadoParse
) -> ResolucaoTransformacao:
    """Abre sua propria conexao (somente leitura) via engine.connect()."""
    with engine.connect() as conn:
        itens_resolvidos = [
            _resolver_um_item(conn, imovel_id, item) for item in resultado_parse.itens
        ]

    custo_total = None
    if all(
        i.status == StatusResolucao.RESOLVIDO and i.custo_estimado is not None
        for i in itens_resolvidos
    ) and itens_resolvidos:
        custo_total = sum((i.custo_estimado for i in itens_resolvidos), Decimal("0"))

    return ResolucaoTransformacao(
        itens=itens_resolvidos,
        nome_resultado=resultado_parse.nome_resultado,
        custo_total_estimado=custo_total,
    )


# ---------------------------------------------------------------------------
# Mensagem de confirmacao completa (SIM/NAO, uma unica mensagem)
# ---------------------------------------------------------------------------

def montar_mensagem_confirmacao_completa(resolucao: ResolucaoTransformacao) -> str:
    linhas = ["Confirma a mistura abaixo?\n"]

    nome_resultado = resolucao.nome_resultado or "(nome nao identificado)"
    linhas.append(f"Produto final: {nome_resultado}\n")
    linhas.append("Ingredientes:")

    bloqueios = []

    for item in resolucao.itens:
        qtd_str = f"{item.quantidade_kg:g} kg" if item.quantidade_kg is not None else "quantidade nao clara"

        if item.status == StatusResolucao.RESOLVIDO:
            linhas.append(
                f"  - {qtd_str} de {item.insumo.nome} "
                f"(saldo atual: {item.insumo.saldo:g} kg, "
                f"custo médio: R$ {item.insumo.custo_unitario:.2f}/kg)"
            )
            if item.custo_estimado is not None:
                linhas.append(f"      custo estimado: R$ {item.custo_estimado:.2f}")
            if item.saldo_suficiente is False:
                linhas.append(
                    f"      ⚠️ ESTOQUE INSUFICIENTE: disponivel apenas "
                    f"{item.insumo.saldo:g} kg"
                )
                bloqueios.append(f"Estoque insuficiente de {item.insumo.nome}.")

        elif item.status == StatusResolucao.AMBIGUO:
            nomes_candidatos = ", ".join(c.nome for c in item.candidatos)
            linhas.append(
                f"  - {qtd_str} de '{item.nome_bruto}' "
                f"⚠️ AMBIGUO - encontrei mais de um insumo parecido: {nomes_candidatos}"
            )
            bloqueios.append(
                f"Qual '{item.nome_bruto}' voce quer dizer: {nomes_candidatos}?"
            )

        elif item.status == StatusResolucao.NAO_ENCONTRADO:
            linhas.append(
                f"  - {qtd_str} de '{item.nome_bruto}' "
                f"⚠️ NAO ENCONTRADO no catalogo de insumos"
            )
            bloqueios.append(
                f"'{item.nome_bruto}' nao esta cadastrado no seu catalogo de insumos."
            )

    if resolucao.custo_total_estimado is not None:
        linhas.append(f"\nCusto total estimado: R$ {resolucao.custo_total_estimado:.2f}")

    if bloqueios:
        linhas.append("\nAntes de confirmar, preciso resolver:")
        for b in bloqueios:
            linhas.append(f"  ⚠️ {b}")
        linhas.append(
            "\nResponda NAO e reenvie com a correcao (nome completo do "
            "insumo, ou ajuste a quantidade)."
        )
    else:
        linhas.append("\nResponda SIM para confirmar e dar baixa no estoque, ou NAO para corrigir.")

    return "\n".join(linhas)
