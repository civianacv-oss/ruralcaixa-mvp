// ===== ANÁLISE DE RENTABILIDADE DE INSUMOS =====
// Metodologia baseada em Embrapa (PSP Leite, BR-CORTE), EPAGRI e CEPEA
// Referência: Custo Unitário de Produção (CUP) — Embrapa/EPAGRI

import { fmtBRL } from "./custoCalculo";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type SistemaProducao = "corte" | "leite";

export interface EntradaCustoInsumo {
  nome: string;
  categoria: string;
  quantidadeUsada: number;
  unidade: string;
  custoUnitario: number; // R$ por unidade (custo médio ponderado do estoque)
}

// ── Pecuária de Corte ──────────────────────────────────────────────────────────

export interface EntradaCorte {
  sistema: "corte";
  /** Número de animais no confinamento/pastagem */
  numeroAnimais: number;
  /** Peso médio inicial dos animais (kg) */
  pesoInicialMedio: number;
  /** Peso médio final dos animais (kg) */
  pesoFinalMedio: number;
  /** Duração do período de análise (dias) */
  periodoDias: number;
  /** Insumos consumidos no período */
  insumos: EntradaCustoInsumo[];
  /** Outros custos do período (mão de obra, manutenção, etc.) em R$ */
  outrosCustos: number;
  /** Preço de venda da arroba (@) na região (R$/@) */
  precoArrobaVenda: number;
  /** Rendimento de carcaça (%) — padrão Embrapa: 52% */
  rendimentoCarcaca: number;
}

export interface ResultadoCorte {
  sistema: "corte";
  // Produção
  ganhoPesoTotalKg: number;
  ganhoPesoMedioDiario: number; // GMD (kg/animal/dia)
  totalArrobasProduzidasAt: number; // @ produzidas
  // Custos
  custoAlimentarTotal: number; // R$
  custoTotalPeriodo: number; // R$
  custoPorKgGanho: number; // R$/kg
  custoPorArroba: number; // R$/@
  // Conversão alimentar
  conversaoAlimentar: number; // kg ração / kg ganho
  totalRacaoConsumidaKg: number;
  // Receita e margem
  receitaTotalEstimada: number; // R$
  margemBruta: number; // R$
  margemBrutaPerc: number; // %
  // Indicadores por animal
  custoPorAnimal: number; // R$
  lucroPorAnimal: number; // R$
  // Viabilidade
  viavel: boolean;
  pontoEquilibrio: number; // R$/@ mínimo para cobrir custos
  // Detalhamento por insumo
  detalheInsumos: DetalheInsumo[];
  // Alertas e recomendações
  alertas: string[];
  recomendacoes: string[];
}

// ── Pecuária Leiteira ──────────────────────────────────────────────────────────

export interface EntradaLeite {
  sistema: "leite";
  /** Número de vacas em lactação */
  vacasLactacao: number;
  /** Produção total de leite no período (litros) */
  producaoTotalLitros: number;
  /** Duração do período de análise (dias) */
  periodoDias: number;
  /** Insumos consumidos no período */
  insumos: EntradaCustoInsumo[];
  /** Outros custos do período (mão de obra, manutenção, etc.) em R$ */
  outrosCustos: number;
  /** Preço de venda do leite na região (R$/litro) */
  precoLeiteLitro: number;
}

export interface ResultadoLeite {
  sistema: "leite";
  // Produção
  producaoMediaDiariaVaca: number; // litros/vaca/dia
  producaoTotalLitros: number;
  // Custos
  custoAlimentarTotal: number; // R$
  custoTotalPeriodo: number; // R$
  custoAlimentarPorLitro: number; // R$/litro
  custoPorLitro: number; // CUP total — R$/litro
  // Receita e margem
  receitaTotalEstimada: number; // R$
  margemBruta: number; // R$
  margemBrutaPerc: number; // %
  // Indicadores por vaca
  custoPorVaca: number; // R$/vaca/mês
  lucroPorVaca: number; // R$/vaca/mês
  // Viabilidade
  viavel: boolean;
  pontoEquilibrio: number; // R$/litro mínimo para cobrir custos
  // Detalhamento
  detalheInsumos: DetalheInsumo[];
  alertas: string[];
  recomendacoes: string[];
}

// ── Compartilhado ──────────────────────────────────────────────────────────────

export interface DetalheInsumo {
  nome: string;
  categoria: string;
  custoTotal: number;
  percSobreCustoTotal: number;
  custoUnitario: number;
  quantidadeUsada: number;
  unidade: string;
}

// ── Calculadora ────────────────────────────────────────────────────────────────

export class CalculadoraRentabilidade {
  /**
   * Calcula rentabilidade para pecuária de corte.
   * Metodologia: Embrapa BR-CORTE / CEPEA
   */
  calcularCorte(entrada: EntradaCorte): ResultadoCorte {
    const {
      numeroAnimais,
      pesoInicialMedio,
      pesoFinalMedio,
      periodoDias,
      insumos,
      outrosCustos,
      precoArrobaVenda,
      rendimentoCarcaca,
    } = entrada;

    // ── Produção ──────────────────────────────────────────────────────────────
    const ganhoPesoMedioAnimal = pesoFinalMedio - pesoInicialMedio; // kg/animal
    const ganhoPesoTotalKg = ganhoPesoMedioAnimal * numeroAnimais;
    const ganhoPesoMedioDiario = periodoDias > 0 ? ganhoPesoMedioAnimal / periodoDias : 0; // GMD

    // Arrobas produzidas: (ganho de peso × rendimento de carcaça) / 15 kg por @
    const totalArrobasProduzidasAt = (ganhoPesoTotalKg * (rendimentoCarcaca / 100)) / 15;

    // ── Custos ────────────────────────────────────────────────────────────────
    const detalheInsumos = this.calcularDetalheInsumos(insumos, 0); // provisório
    const custoAlimentarTotal = insumos
      .filter((i) => ["racao", "sal_mineral", "suplemento"].includes(i.categoria))
      .reduce((s, i) => s + i.quantidadeUsada * i.custoUnitario, 0);

    const custoInsumosTotalGeral = insumos.reduce(
      (s, i) => s + i.quantidadeUsada * i.custoUnitario,
      0
    );
    const custoTotalPeriodo = custoInsumosTotalGeral + outrosCustos;

    // Detalhamento com % correto
    const detalheInsumosCorrigido = this.calcularDetalheInsumos(insumos, custoTotalPeriodo);

    const custoPorKgGanho = ganhoPesoTotalKg > 0 ? custoTotalPeriodo / ganhoPesoTotalKg : 0;
    const custoPorArroba = totalArrobasProduzidasAt > 0 ? custoTotalPeriodo / totalArrobasProduzidasAt : 0;
    const custoPorAnimal = numeroAnimais > 0 ? custoTotalPeriodo / numeroAnimais : 0;

    // Conversão alimentar: kg ração / kg ganho
    const totalRacaoConsumidaKg = insumos
      .filter((i) => i.categoria === "racao")
      .reduce((s, i) => s + i.quantidadeUsada, 0);
    const conversaoAlimentar = ganhoPesoTotalKg > 0 ? totalRacaoConsumidaKg / ganhoPesoTotalKg : 0;

    // ── Receita e margem ──────────────────────────────────────────────────────
    const receitaTotalEstimada = totalArrobasProduzidasAt * precoArrobaVenda;
    const margemBruta = receitaTotalEstimada - custoTotalPeriodo;
    const margemBrutaPerc = receitaTotalEstimada > 0 ? (margemBruta / receitaTotalEstimada) * 100 : 0;
    const lucroPorAnimal = numeroAnimais > 0 ? margemBruta / numeroAnimais : 0;

    // Ponto de equilíbrio: custo total / arrobas produzidas
    const pontoEquilibrio = totalArrobasProduzidasAt > 0 ? custoTotalPeriodo / totalArrobasProduzidasAt : 0;

    // ── Alertas e recomendações ───────────────────────────────────────────────
    const alertas: string[] = [];
    const recomendacoes: string[] = [];

    if (ganhoPesoMedioDiario < 0.8) {
      alertas.push(`GMD baixo (${ganhoPesoMedioDiario.toFixed(2)} kg/dia). Referência Embrapa: ≥ 1,0 kg/dia para confinamento.`);
      recomendacoes.push("Revisar a dieta e o balanceamento nutricional com zootecnista.");
    }
    if (conversaoAlimentar > 8) {
      alertas.push(`Conversão alimentar alta (${conversaoAlimentar.toFixed(1)} kg ração/kg ganho). Referência: ≤ 7,0.`);
      recomendacoes.push("Avaliar qualidade e palatabilidade da ração fornecida.");
    }
    if (custoPorArroba > precoArrobaVenda * 0.9) {
      alertas.push(`Custo por @ (${fmtBRL(custoPorArroba)}) próximo ou acima do preço de venda (${fmtBRL(precoArrobaVenda)}).`);
      recomendacoes.push("Operação com margem crítica. Negociar insumos ou revisar estratégia de terminação.");
    }
    if (margemBruta < 0) {
      alertas.push("Margem bruta negativa: a operação está gerando prejuízo no período.");
    }

    const percAlimentacao = custoTotalPeriodo > 0 ? (custoAlimentarTotal / custoTotalPeriodo) * 100 : 0;
    if (percAlimentacao > 70) {
      recomendacoes.push(
        `Alimentação representa ${percAlimentacao.toFixed(0)}% do custo total. Avaliar pastagem como alternativa de redução de custo.`
      );
    }

    return {
      sistema: "corte",
      ganhoPesoTotalKg,
      ganhoPesoMedioDiario,
      totalArrobasProduzidasAt,
      custoAlimentarTotal,
      custoTotalPeriodo,
      custoPorKgGanho,
      custoPorArroba,
      conversaoAlimentar,
      totalRacaoConsumidaKg,
      receitaTotalEstimada,
      margemBruta,
      margemBrutaPerc,
      custoPorAnimal,
      lucroPorAnimal,
      viavel: margemBruta >= 0,
      pontoEquilibrio,
      detalheInsumos: detalheInsumosCorrigido,
      alertas,
      recomendacoes,
    };
  }

  /**
   * Calcula rentabilidade para pecuária leiteira.
   * Metodologia: Embrapa PSP Leite / EPAGRI
   */
  calcularLeite(entrada: EntradaLeite): ResultadoLeite {
    const {
      vacasLactacao,
      producaoTotalLitros,
      periodoDias,
      insumos,
      outrosCustos,
      precoLeiteLitro,
    } = entrada;

    // ── Produção ──────────────────────────────────────────────────────────────
    const producaoMediaDiariaVaca =
      vacasLactacao > 0 && periodoDias > 0
        ? producaoTotalLitros / (vacasLactacao * periodoDias)
        : 0;

    // ── Custos ────────────────────────────────────────────────────────────────
    const custoAlimentarTotal = insumos
      .filter((i) => ["racao", "sal_mineral", "suplemento"].includes(i.categoria))
      .reduce((s, i) => s + i.quantidadeUsada * i.custoUnitario, 0);

    const custoInsumosTotalGeral = insumos.reduce(
      (s, i) => s + i.quantidadeUsada * i.custoUnitario,
      0
    );
    const custoTotalPeriodo = custoInsumosTotalGeral + outrosCustos;

    const detalheInsumos = this.calcularDetalheInsumos(insumos, custoTotalPeriodo);

    const custoAlimentarPorLitro = producaoTotalLitros > 0 ? custoAlimentarTotal / producaoTotalLitros : 0;
    const custoPorLitro = producaoTotalLitros > 0 ? custoTotalPeriodo / producaoTotalLitros : 0; // CUP
    const custoPorVaca = vacasLactacao > 0 ? custoTotalPeriodo / vacasLactacao : 0;

    // ── Receita e margem ──────────────────────────────────────────────────────
    const receitaTotalEstimada = producaoTotalLitros * precoLeiteLitro;
    const margemBruta = receitaTotalEstimada - custoTotalPeriodo;
    const margemBrutaPerc = receitaTotalEstimada > 0 ? (margemBruta / receitaTotalEstimada) * 100 : 0;
    const lucroPorVaca = vacasLactacao > 0 ? margemBruta / vacasLactacao : 0;
    const pontoEquilibrio = producaoTotalLitros > 0 ? custoTotalPeriodo / producaoTotalLitros : 0;

    // ── Alertas e recomendações ───────────────────────────────────────────────
    const alertas: string[] = [];
    const recomendacoes: string[] = [];

    if (producaoMediaDiariaVaca < 10) {
      alertas.push(`Produtividade baixa (${producaoMediaDiariaVaca.toFixed(1)} L/vaca/dia). Referência Embrapa: ≥ 15 L/vaca/dia para sistemas semi-intensivos.`);
      recomendacoes.push("Avaliar nutrição, sanidade e genética do rebanho.");
    }
    if (custoAlimentarPorLitro > precoLeiteLitro * 0.6) {
      alertas.push(
        `Custo alimentar por litro (${fmtBRL(custoAlimentarPorLitro)}) representa mais de 60% do preço de venda. Referência: ≤ 50%.`
      );
      recomendacoes.push("Revisar a relação volumoso/concentrado na dieta para reduzir custo alimentar.");
    }
    if (custoPorLitro > precoLeiteLitro) {
      alertas.push(`CUP (${fmtBRL(custoPorLitro)}/L) acima do preço de venda (${fmtBRL(precoLeiteLitro)}/L). Operação deficitária.`);
    }
    if (margemBruta < 0) {
      alertas.push("Margem bruta negativa: a operação está gerando prejuízo no período.");
    }

    const percAlimentacao = custoTotalPeriodo > 0 ? (custoAlimentarTotal / custoTotalPeriodo) * 100 : 0;
    if (percAlimentacao > 65) {
      recomendacoes.push(
        `Alimentação representa ${percAlimentacao.toFixed(0)}% do custo total. Avaliar produção própria de volumoso (silagem/capineira).`
      );
    }

    return {
      sistema: "leite",
      producaoMediaDiariaVaca,
      producaoTotalLitros,
      custoAlimentarTotal,
      custoTotalPeriodo,
      custoAlimentarPorLitro,
      custoPorLitro,
      receitaTotalEstimada,
      margemBruta,
      margemBrutaPerc,
      custoPorVaca,
      lucroPorVaca,
      viavel: margemBruta >= 0,
      pontoEquilibrio,
      detalheInsumos,
      alertas,
      recomendacoes,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private calcularDetalheInsumos(
    insumos: EntradaCustoInsumo[],
    custoTotalPeriodo: number
  ): DetalheInsumo[] {
    return insumos
      .map((i) => {
        const custoTotal = i.quantidadeUsada * i.custoUnitario;
        return {
          nome: i.nome,
          categoria: i.categoria,
          custoTotal,
          percSobreCustoTotal: custoTotalPeriodo > 0 ? (custoTotal / custoTotalPeriodo) * 100 : 0,
          custoUnitario: i.custoUnitario,
          quantidadeUsada: i.quantidadeUsada,
          unidade: i.unidade,
        };
      })
      .sort((a, b) => b.custoTotal - a.custoTotal);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const calculadoraRentabilidade = new CalculadoraRentabilidade();

// ── Labels e helpers de UI ─────────────────────────────────────────────────────

export const SISTEMA_LABELS: Record<SistemaProducao, string> = {
  corte: "Pecuária de Corte",
  leite: "Pecuária Leiteira",
};

export function getViabilidadeColor(viavel: boolean): string {
  return viavel ? "text-green-700" : "text-red-700";
}

export function getViabilidadeBg(viavel: boolean): string {
  return viavel ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";
}

export function getMargemColor(perc: number): string {
  if (perc >= 20) return "text-green-700";
  if (perc >= 5) return "text-amber-600";
  return "text-red-700";
}

/** Referência CEPEA: cotação boi gordo SP (30/06/2026) */
export const COTACAO_REFERENCIA = {
  boiGordoSP: 340.27, // R$/@
  leiteMedioNacional: 2.85, // R$/litro — estimativa
};
