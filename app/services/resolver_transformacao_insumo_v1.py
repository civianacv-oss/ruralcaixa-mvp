"""
resolver_transformacao_insumo_v1.py (v3 - le direto estoque_atual/custo_medio)

Camada intermediaria entre o parser de linguagem natural e a gravacao
(transformacao_insumo_v1.processar_transformacao).

CORRECAO 31/07: saldo e custo medio de um insumo sao campos CACHEADOS em
insumos.estoque_atual / insumos.custo_medio (mantidos por
aplicar_movimentacao_insumo a cada movimento) - nao precisa (nem deve)
agregar via SUM sobre movimentacoes_insumo. Coluna de propriedade e
fazenda_id, nao imovel_id.

So faz LEITURA - abre e fecha sua propria conexao via app.db.get_db().
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Optional

from app.db import get_db
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


def _buscar_match_exato(cur, fazenda_id: int, nome_bruto: str) -> list:
    cur.execute(
        """
        SELECT id, nome, categoria, estoque_atual, custo_medio
        FROM insumos
        WHERE fazenda_id = %s AND ativo = TRUE AND LOWER(nome) = LOWER(%s)
        """,
        (fazenda_id, nome_bruto),
    )
    return cur.fetchall()


def _buscar_match_parcial(cur, fazenda_id: int, nome_bruto: str) -> list:
    cur.execute(
        """
        SELECT id, nome, categoria, estoque_atual, custo_medio
        FROM insumos
        WHERE fazenda_id = %s AND ativo = TRUE AND LOWER(nome) LIKE LOWER(%s)
        ORDER BY nome
        """,
        (fazenda_id, f"%{nome_bruto}%"),
    )
    return cur.fetchall()


def _linha_para_candidato(row: dict) -> InsumoCandidato:
    return InsumoCandidato(
        id=row["id"],
        nome=row["nome"],
        categoria=row["categoria"],
        saldo=Decimal(str(row["estoque_atual"] or 0)),
        custo_unitario=Decimal(str(row["custo_medio"] or 0)),
    )


def _resolver_um_item(cur, fazenda_id: int, item: ItemExtraido) -> ItemResolvido:
    nome_bruto = item.nome_insumo_bruto

    linhas = _buscar_match_exato(cur, fazenda_id, nome_bruto)
    if not linhas:
        linhas = _buscar_match_parcial(cur, fazenda_id, nome_bruto)

    if len(linhas) == 0:
        return ItemResolvido(
            nome_bruto=nome_bruto,
            quantidade_kg=item.quantidade_kg,
            status=StatusResolucao.NAO_ENCONTRADO,
        )

    if len(linhas) > 1:
        candidatos = [_linha_para_candidato(r) for r in linhas]
        return ItemResolvido(
            nome_bruto=nome_bruto,
            quantidade_kg=item.quantidade_kg,
            status=StatusResolucao.AMBIGUO,
            candidatos=candidatos,
        )

    insumo = _linha_para_candidato(linhas[0])

    custo_estimado = None
    saldo_suficiente = None
    if item.quantidade_kg is not None:
        custo_estimado = (item.quantidade_kg * insumo.custo_unitario).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        saldo_suficiente = insumo.saldo >= item.quantidade_kg

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
    """imovel_id e usado como fazenda_id (mesmo espaco de valores)."""
    fazenda_id = imovel_id
    conn = get_db()
    try:
        cur = conn.cursor()
        try:
            itens_resolvidos = [
                _resolver_um_item(cur, fazenda_id, item) for item in resultado_parse.itens
            ]
        finally:
            cur.close()
    finally:
        conn.close()

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


def buscar_insumo_por_id(imovel_id: int, insumo_id: int) -> Optional[InsumoCandidato]:
    """Busca saldo/custo ATUALIZADOS de um insumo especifico por id -
    usado ao resolver uma escolha de ambiguidade (evita reusar dado
    potencialmente desatualizado do momento da primeira mensagem)."""
    fazenda_id = imovel_id
    conn = get_db()
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT id, nome, categoria, estoque_atual, custo_medio
                FROM insumos
                WHERE fazenda_id = %s AND id = %s AND ativo = TRUE
                """,
                (fazenda_id, insumo_id),
            )
            row = cur.fetchone()
        finally:
            cur.close()
    finally:
        conn.close()

    return _linha_para_candidato(row) if row else None


def atribuir_numeracao_ambiguidade(resolucao: ResolucaoTransformacao) -> dict:
    """
    Retorna {numero_global: (indice_do_item, InsumoCandidato)}. Numeracao
    e GLOBAL (sequencial por toda a mensagem, nao reinicia por item) para
    que o produtor possa responder soh os numeros (ex: "1,4") sem
    ambiguidade sobre a qual item cada numero pertence.
    """
    numeracao = {}
    contador = 1
    for idx, item in enumerate(resolucao.itens):
        if item.status == StatusResolucao.AMBIGUO:
            for candidato in item.candidatos:
                numeracao[contador] = (idx, candidato)
                contador += 1
    return numeracao


def montar_mensagem_confirmacao_completa(resolucao: ResolucaoTransformacao) -> str:
    numeracao = atribuir_numeracao_ambiguidade(resolucao)
    numeros_por_item = {}
    for numero, (idx, candidato) in numeracao.items():
        numeros_por_item.setdefault(idx, []).append((numero, candidato))

    linhas = ["Confirma a mistura abaixo?\n"]

    nome_resultado = resolucao.nome_resultado or "(nome nao identificado)"
    linhas.append(f"Produto final: {nome_resultado}\n")
    linhas.append("Ingredientes:")

    bloqueios = []
    tem_ambiguidade = False

    for idx, item in enumerate(resolucao.itens):
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
            tem_ambiguidade = True
            linhas.append(
                f"  - {qtd_str} de '{item.nome_bruto}' ⚠️ AMBIGUO - qual voce quer dizer?"
            )
            for numero, candidato in numeros_por_item.get(idx, []):
                linhas.append(f"      {numero}) {candidato.nome}")

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

    if tem_ambiguidade:
        qtd_ambiguos = len(numeros_por_item)
        exemplo = ",".join(str(v[0][0]) for v in list(numeros_por_item.values())[:qtd_ambiguos])
        linhas.append(
            f"\nResponda com os números separados por vírgula, um para cada "
            f"item ambíguo acima (ex: \"{exemplo}\")."
        )
    elif bloqueios:
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
