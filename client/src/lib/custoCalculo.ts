// ===== FUNÇÕES PARA CÁLCULO DE CUSTO MÉDIO PONDERADO =====

interface MovimentacaoCalculo {
  id: number;
  insumo_id: number;
  tipo: string;
  quantidade: number;
  valor_unitario: number | null;
  custo_medio_antes: number | null;
  custo_medio_depois: number | null;
}

interface InsumoCalculo {
  id: number;
  nome: string;
  estoque_atual: number;
  custo_medio: number | null;
  valor_total_estoque: number | null;
}

/**
 * Calcula o novo custo médio ponderado após uma compra.
 * Fórmula: (estoque_atual × custo_medio_atual + quantidade × valor_unitario) / (estoque_atual + quantidade)
 */
export function calcularNovoCustoMedio(
  estoqueAtual: number,
  custoMedioAtual: number | null,
  quantidadeCompra: number,
  valorUnitario: number
): number {
  if (!custoMedioAtual || estoqueAtual === 0) {
    return valorUnitario;
  }
  const valorTotalAtual = estoqueAtual * custoMedioAtual;
  const valorCompra = quantidadeCompra * valorUnitario;
  const novaQuantidade = estoqueAtual + quantidadeCompra;
  return (valorTotalAtual + valorCompra) / novaQuantidade;
}

/**
 * Calcula o valor total do estoque com base no custo médio.
 */
export function calcularValorTotalEstoque(
  estoqueAtual: number,
  custoMedio: number | null
): number {
  if (!custoMedio || estoqueAtual === 0) return 0;
  return estoqueAtual * custoMedio;
}

/**
 * Calcula o custo da baixa (custo médio no momento da saída).
 */
export function calcularCustoBaixa(
  insumo: InsumoCalculo,
  quantidadeBaixa: number
): {
  custoUnitario: number | null;
  valorTotalBaixa: number;
  novoEstoque: number;
  novoValorTotal: number;
} {
  const custoMedio = insumo.custo_medio || 0;
  const valorTotalBaixa = quantidadeBaixa * custoMedio;
  const novoEstoque = insumo.estoque_atual - quantidadeBaixa;
  const novoValorTotal = novoEstoque * custoMedio;
  return { custoUnitario: custoMedio, valorTotalBaixa, novoEstoque, novoValorTotal };
}

/**
 * Atualiza o insumo localmente após uma movimentação (para otimistic update).
 */
export function atualizarInsumoAposMovimentacao(
  insumo: InsumoCalculo,
  movimentacao: MovimentacaoCalculo
): InsumoCalculo {
  const novoInsumo = { ...insumo };

  if (movimentacao.tipo === "compra" && movimentacao.valor_unitario) {
    const novoCustoMedio = calcularNovoCustoMedio(
      insumo.estoque_atual,
      insumo.custo_medio,
      movimentacao.quantidade,
      movimentacao.valor_unitario
    );
    novoInsumo.custo_medio = novoCustoMedio;
    novoInsumo.estoque_atual = insumo.estoque_atual + movimentacao.quantidade;
    novoInsumo.valor_total_estoque = calcularValorTotalEstoque(novoInsumo.estoque_atual, novoCustoMedio);
  } else if (["uso", "venda", "perda"].includes(movimentacao.tipo)) {
    const baixa = calcularCustoBaixa(insumo, movimentacao.quantidade);
    novoInsumo.estoque_atual = baixa.novoEstoque;
    novoInsumo.valor_total_estoque = baixa.novoValorTotal;
  } else if (movimentacao.tipo === "ajuste_positivo") {
    novoInsumo.estoque_atual = insumo.estoque_atual + movimentacao.quantidade;
    novoInsumo.valor_total_estoque = calcularValorTotalEstoque(novoInsumo.estoque_atual, insumo.custo_medio);
  } else if (movimentacao.tipo === "ajuste_negativo") {
    novoInsumo.estoque_atual = Math.max(0, insumo.estoque_atual - movimentacao.quantidade);
    novoInsumo.valor_total_estoque = calcularValorTotalEstoque(novoInsumo.estoque_atual, insumo.custo_medio);
  }

  return novoInsumo;
}

/**
 * Formata valor monetário em BRL.
 */
export function fmtBRL(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
