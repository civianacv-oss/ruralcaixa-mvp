"""
RuralCaixa — app/services/estoque_insumos.py

Engine central de estoque de insumos. Ponto único de verdade para:
  - Saldo físico do insumo (estoque_atual) — GLOBAL por fazenda, não por ciclo/safra.
  - Preço Médio Ponderado (PMP) — GLOBAL, recalculado a cada entrada.
  - Rastreabilidade de custo por atividade (origem_modulo/origem_tipo/origem_id),
    para relatórios de custo por ciclo de piscicultura, safra/talhão de açaí,
    lote de rebanho etc., SEM fragmentar o estoque físico.

Todo módulo de produção (piscicultura, açaí, bovino, ovino, ...) que consome ou
compra um insumo do catálogo geral deve chamar aplicar_movimentacao_insumo()
em vez de gravar diretamente em `insumos` ou `movimentacoes_insumo`.

Uso típico (dentro de uma transação já aberta pelo router chamador):

    from app.services.estoque_insumos import aplicar_movimentacao_insumo

    resultado = aplicar_movimentacao_insumo(
        cur, fazenda_id=1, insumo_id=42,
        tipo="uso", quantidade=25.0,
        origem_modulo="piscicultura", origem_tipo="ciclo", origem_id=7,
        origem_descricao="Ciclo Tilápia 2026-A",
        observacao="Ração do dia 2026-07-02",
        data_movim=date(2026, 7, 2),
    )
    # resultado["custo_total"], resultado["novo_estoque"], resultado["novo_custo_medio"]

O caller é responsável pelo commit/rollback da conexão.
"""

from datetime import date as _date
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException

TIPOS_ENTRADA = {"compra", "producao_propria", "doacao", "ajuste_positivo"}
TIPOS_SAIDA = {"uso", "venda", "perda", "ajuste_negativo"}
TIPOS_VALIDOS = TIPOS_ENTRADA | TIPOS_SAIDA


def _f(v) -> float:
    """Converte Decimal/None para float com segurança."""
    if v is None:
        return 0.0
    return float(v)


def aplicar_movimentacao_insumo(
    cur,
    fazenda_id: int,
    insumo_id: int,
    tipo: str,
    quantidade: float,
    custo_unitario: Optional[float] = None,
    origem_modulo: str = "manual",
    origem_tipo: Optional[str] = None,
    origem_id: Optional[int] = None,
    origem_descricao: Optional[str] = None,
    observacao: Optional[str] = None,
    data_movim: Optional[_date] = None,
    permitir_estoque_negativo: bool = False,
) -> dict:
    """
    Registra uma movimentação de estoque e atualiza saldo + PMP do insumo,
    de forma atômica (mesma transação do cursor recebido).

    - Entradas (compra/producao_propria/doacao/ajuste_positivo):
        recalcula PMP = (estoque_atual*custo_medio_atual + quantidade*custo_unitario)
                         / (estoque_atual + quantidade)
        Se custo_unitario não informado, mantém o PMP atual (ex.: doação sem valor).
    - Saídas (uso/venda/perda/ajuste_negativo):
        baixa pelo PMP vigente (custo_unitario é ignorado/calculado, não recebido).
        PMP não muda numa saída — só entradas alteram o PMP.

    Levanta HTTPException 400 se a saída deixaria o estoque negativo
    (a menos que permitir_estoque_negativo=True).
    """
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(400, f"tipo de movimentação inválido: {tipo}")
    if quantidade is None or quantidade <= 0:
        raise HTTPException(400, "quantidade deve ser maior que zero")

    # Lock da linha do insumo para evitar corrida em movimentações concorrentes
    cur.execute("""
        SELECT id, fazenda_id, estoque_atual, custo_medio, preco_estimado, nome, unidade
        FROM insumos WHERE id = %s AND fazenda_id = %s
        FOR UPDATE
    """, (insumo_id, fazenda_id))
    insumo = cur.fetchone()
    if not insumo:
        raise HTTPException(404, f"Insumo {insumo_id} não encontrado nesta fazenda")

    estoque_atual = _f(insumo["estoque_atual"])
    custo_medio_antes = _f(insumo["custo_medio"]) or _f(insumo["preco_estimado"])

    if tipo in TIPOS_ENTRADA:
        if custo_unitario is not None and custo_unitario > 0:
            valor_atual_total = estoque_atual * custo_medio_antes
            valor_entrada = quantidade * custo_unitario
            nova_quantidade = estoque_atual + quantidade
            custo_medio_depois = (
                (valor_atual_total + valor_entrada) / nova_quantidade
                if nova_quantidade > 0 else custo_unitario
            )
        else:
            custo_medio_depois = custo_medio_antes
        novo_estoque = estoque_atual + quantidade
        custo_unitario_movim = custo_unitario
        custo_total = quantidade * (custo_unitario or 0)

    else:  # saída
        novo_estoque = estoque_atual - quantidade
        if novo_estoque < 0 and not permitir_estoque_negativo:
            raise HTTPException(
                400,
                f"Estoque insuficiente de '{insumo['nome']}': "
                f"disponível {estoque_atual:g} {insumo['unidade']}, "
                f"solicitado {quantidade:g} {insumo['unidade']}. "
                f"Registre uma compra/entrada antes de dar baixa."
            )
        custo_medio_depois = custo_medio_antes  # PMP não muda em saída
        custo_unitario_movim = custo_medio_antes
        custo_total = quantidade * custo_medio_antes

    cur.execute("""
        INSERT INTO movimentacoes_insumo
            (insumo_id, fazenda_id, tipo, quantidade, custo_unitario, custo_total,
             observacao, data_movim, origem_modulo, origem_tipo, origem_id,
             origem_descricao, custo_medio_antes, custo_medio_depois)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING *
    """, (
        insumo_id, fazenda_id, tipo, quantidade, custo_unitario_movim, custo_total,
        observacao, data_movim or _date.today(), origem_modulo, origem_tipo, origem_id,
        origem_descricao, custo_medio_antes, custo_medio_depois,
    ))
    movimentacao = cur.fetchone()

    cur.execute("""
        UPDATE insumos SET estoque_atual = %s, custo_medio = %s, atualizado_em = NOW()
        WHERE id = %s
    """, (novo_estoque, custo_medio_depois, insumo_id))

    return {
        "movimentacao": movimentacao,
        "movimentacao_id": movimentacao["id"],
        "insumo_id": insumo_id,
        "novo_estoque": novo_estoque,
        "novo_custo_medio": custo_medio_depois,
        "custo_unitario_aplicado": custo_unitario_movim,
        "custo_total": custo_total,
    }


def estornar_movimentacao(cur, fazenda_id: int, movimentacao_id: int, motivo: str = "Estorno") -> Optional[dict]:
    """
    Reverte uma movimentação anterior (compensação, não exclusão — mantém auditoria).
    Usado quando um registro de origem é editado/excluído (ex.: ração do dia recalculada).
    """
    cur.execute("""
        SELECT * FROM movimentacoes_insumo WHERE id = %s AND fazenda_id = %s
    """, (movimentacao_id, fazenda_id))
    original = cur.fetchone()
    if not original:
        return None

    tipo_estorno = "ajuste_positivo" if original["tipo"] in TIPOS_SAIDA else "ajuste_negativo"
    return aplicar_movimentacao_insumo(
        cur, fazenda_id=fazenda_id, insumo_id=original["insumo_id"],
        tipo=tipo_estorno, quantidade=_f(original["quantidade"]),
        custo_unitario=_f(original["custo_unitario"]) or None,
        origem_modulo=original["origem_modulo"], origem_tipo=original["origem_tipo"],
        origem_id=original["origem_id"],
        origem_descricao=f"{motivo} (mov. #{movimentacao_id})",
        observacao=motivo, data_movim=_date.today(),
        permitir_estoque_negativo=True,
    )


def custos_por_origem(cur, fazenda_id: int, origem_modulo: str, origem_id: int) -> dict:
    """
    Soma o custo de insumos consumidos (saídas) por uma origem específica
    (ex.: um ciclo de piscicultura, um talhão de açaí), para relatórios de
    apropriação de custo por atividade sem depender de estoque segregado.
    """
    cur.execute("""
        SELECT m.insumo_id, i.nome AS insumo_nome, i.unidade,
               SUM(m.quantidade) AS quantidade_total,
               SUM(m.custo_total) AS custo_total
        FROM movimentacoes_insumo m
        JOIN insumos i ON i.id = m.insumo_id
        WHERE m.fazenda_id = %s AND m.origem_modulo = %s AND m.origem_id = %s
          AND m.tipo IN ('uso','venda','perda','ajuste_negativo')
        GROUP BY m.insumo_id, i.nome, i.unidade
        ORDER BY custo_total DESC
    """, (fazenda_id, origem_modulo, origem_id))
    itens = cur.fetchall()
    custo_total_geral = sum(_f(i["custo_total"]) for i in itens)
    return {"itens": itens, "custo_total": custo_total_geral}
