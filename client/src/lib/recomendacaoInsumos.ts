// ===== CALCULADORA DE RECOMENDAÇÕES DE INSUMOS =====
// Baseada em recomendações técnicas da Embrapa, Senar, UFV e EPAMIG
// Adaptada para o stack Vite + React + TypeScript (sem Prisma/Next.js)

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type TipoAnimal = "bovino_corte" | "bovino_leite" | "suino" | "ovino" | "caprino";
export type CategoriaAnimal = "bezerro" | "novilho" | "vaca" | "touro" | "matriz" | "terminacao";
export type TipoRegiao = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";
export type Estacao = "seca" | "chuvosa";
export type TipoSolo = "argiloso" | "arenoso" | "misto" | "organico";
export type FonteTecnica = "embrapa" | "senar" | "ufv" | "epamig";

export interface ConfiguracaoProducao {
  tipoAnimal: TipoAnimal;
  cabeca: number;
  categoriaAnimal: CategoriaAnimal;
  pesoMedio: number; // kg
}

export interface ConfiguracaoRegional {
  regiao: TipoRegiao;
  estacaoAtual: Estacao;
  tipoSolo: TipoSolo;
}

export interface ReferenciaTecnica {
  fonte: FonteTecnica;
  documento: string;
  ano: number;
  recomendacao: string;
}

export interface RecomendacaoInsumo {
  insumoId: number;
  nome: string;
  categoria: string;
  quantidadeIdeal: number;
  quantidadeMinima: number;
  quantidadeMaxima: number;
  quantidadeAtual: number;
  unidade: string;
  periodoDias: number;
  baseCalculo: string;
  confianca: number; // 0-1
  referencias: ReferenciaTecnica[];
  alertas: string[];
  custoEstimado: number;
  status: "ok" | "atencao" | "critico";
  percentualCobertura: number; // quantidadeAtual / quantidadeIdeal
}

export interface InsumoParaCalculo {
  id: number;
  nome: string;
  categoria: string;
  unidade: string;
  estoque_atual: number;
  preco_estimado?: number;
  custo_medio?: number;
}

// ── Calculadora ────────────────────────────────────────────────────────────────

export class CalculadoraInsumos {
  /**
   * Calcula recomendação para um insumo específico baseado na configuração de produção.
   * Baseado em: Embrapa, Senar, UFV, EPAMIG.
   */
  calcularRecomendacao(
    insumo: InsumoParaCalculo,
    configProducao: ConfiguracaoProducao,
    configRegional: ConfiguracaoRegional
  ): RecomendacaoInsumo {
    let resultado: Omit<RecomendacaoInsumo, "status" | "percentualCobertura">;

    switch (insumo.categoria) {
      case "racao":
        resultado = this.calcularRacao(insumo, configProducao);
        break;
      case "sal_mineral":
        resultado = this.calcularSalMineral(insumo, configProducao, configRegional);
        break;
      case "medicamentos":
      case "vacinas":
        resultado = this.calcularMedicamentos(insumo, configProducao);
        break;
      case "adubos":
        resultado = this.calcularGenerico(insumo, configProducao, 90);
        break;
      case "combustivel":
        resultado = this.calcularGenerico(insumo, configProducao, 30);
        break;
      default:
        resultado = this.calcularGenerico(insumo, configProducao, 30);
    }

    // Aplicar fatores regionais
    resultado = this.aplicarFatoresRegionais(resultado, configRegional);

    // Calcular status
    const percentualCobertura =
      resultado.quantidadeIdeal > 0
        ? insumo.estoque_atual / resultado.quantidadeIdeal
        : 1;

    const status: "ok" | "atencao" | "critico" =
      percentualCobertura >= 0.9
        ? "ok"
        : percentualCobertura >= 0.6
        ? "atencao"
        : "critico";

    return {
      ...resultado,
      status,
      percentualCobertura,
    };
  }

  // ── Ração ──────────────────────────────────────────────────────────────────
  // Embrapa: Tabela de Exigências Nutricionais; BR-CORTE/BR-LEITE
  private calcularRacao(
    insumo: InsumoParaCalculo,
    config: ConfiguracaoProducao
  ): Omit<RecomendacaoInsumo, "status" | "percentualCobertura"> {
    // Consumo médio diário: % do peso vivo (Embrapa)
    const consumoBase: Record<TipoAnimal, number> = {
      bovino_corte: 2.5,
      bovino_leite: 3.0,
      suino: 4.0,
      ovino: 3.5,
      caprino: 3.0,
    };

    const percConsumo = consumoBase[config.tipoAnimal] ?? 2.5;
    const consumoDiarioAnimal = (config.pesoMedio * percConsumo) / 100; // kg
    const fatorCategoria = this.obterFatorCategoria(config.categoriaAnimal);
    const consumoTotalDiario = consumoDiarioAnimal * config.cabeca * fatorCategoria;

    const periodoDias = 30;
    const quantidadeIdeal = consumoTotalDiario * periodoDias;

    const precoUnit = insumo.custo_medio ?? insumo.preco_estimado ?? 0;

    return {
      insumoId: insumo.id,
      nome: insumo.nome,
      categoria: insumo.categoria,
      quantidadeIdeal,
      quantidadeMinima: quantidadeIdeal * 0.7,
      quantidadeMaxima: quantidadeIdeal * 1.3,
      quantidadeAtual: insumo.estoque_atual,
      unidade: "kg",
      periodoDias,
      baseCalculo: `${config.cabeca} animais × ${percConsumo}% PV (${config.pesoMedio} kg) × ${periodoDias} dias`,
      confianca: 0.85,
      referencias: [
        { fonte: "embrapa", documento: "Tabela de Exigências Nutricionais", ano: 2024, recomendacao: "NRC adaptado" },
        { fonte: "ufv", documento: "Sistema BR-CORTE/BR-LEITE", ano: 2023, recomendacao: "Padrão nacional" },
      ],
      alertas: [],
      custoEstimado: quantidadeIdeal * precoUnit,
    };
  }

  // ── Sal Mineral ────────────────────────────────────────────────────────────
  // Embrapa: Recomendações Regionais de Suplementação Mineral; EPAMIG
  private calcularSalMineral(
    insumo: InsumoParaCalculo,
    config: ConfiguracaoProducao,
    configRegional: ConfiguracaoRegional
  ): Omit<RecomendacaoInsumo, "status" | "percentualCobertura"> {
    // Consumo base por espécie (g/dia) — Embrapa
    const consumoBase: Record<TipoAnimal, number> = {
      bovino_corte: 80,
      bovino_leite: 120,
      suino: 20,
      ovino: 15,
      caprino: 12,
    };

    const consumoDiario = consumoBase[config.tipoAnimal] ?? 80; // g/animal/dia
    const fatorRegional = this.obterFatorRegionalSalMineral(configRegional);
    const consumoTotalDiario = ((consumoDiario * config.cabeca) / 1000) * fatorRegional; // kg/dia

    const periodoDias = 60;
    const quantidadeIdeal = consumoTotalDiario * periodoDias;

    const precoUnit = insumo.custo_medio ?? insumo.preco_estimado ?? 0;

    return {
      insumoId: insumo.id,
      nome: insumo.nome,
      categoria: insumo.categoria,
      quantidadeIdeal,
      quantidadeMinima: quantidadeIdeal * 0.6,
      quantidadeMaxima: quantidadeIdeal * 1.2,
      quantidadeAtual: insumo.estoque_atual,
      unidade: "kg",
      periodoDias,
      baseCalculo: `${config.cabeca} animais × ${consumoDiario}g/dia × fator regional (${configRegional.regiao}/${configRegional.estacaoAtual})`,
      confianca: 0.9,
      referencias: [
        { fonte: "embrapa", documento: "Recomendação de Suplementação Mineral", ano: 2024, recomendacao: "NRC" },
        { fonte: "epamig", documento: "Análise de Pastagem e Solo", ano: 2023, recomendacao: "Regional" },
      ],
      alertas: [],
      custoEstimado: quantidadeIdeal * precoUnit,
    };
  }

  // ── Medicamentos / Vacinas ─────────────────────────────────────────────────
  // Embrapa: Calendário Sanitário; UFV: Programa Sanitário
  private calcularMedicamentos(
    insumo: InsumoParaCalculo,
    config: ConfiguracaoProducao
  ): Omit<RecomendacaoInsumo, "status" | "percentualCobertura"> {
    // Dosagem base por animal (mL ou unidade) ajustada por peso
    const dosagemBase = this.obterDosagemMedicamento(insumo.nome);
    const dosePorAnimal = dosagemBase * (config.pesoMedio / 100);
    const aplicacoes = this.obterNumeroAplicacoesSanitarias(insumo.nome);
    const quantidadeTotal = dosePorAnimal * config.cabeca * aplicacoes;

    const precoUnit = insumo.custo_medio ?? insumo.preco_estimado ?? 0;

    return {
      insumoId: insumo.id,
      nome: insumo.nome,
      categoria: insumo.categoria,
      quantidadeIdeal: quantidadeTotal,
      quantidadeMinima: quantidadeTotal * 0.8,
      quantidadeMaxima: quantidadeTotal * 1.2,
      quantidadeAtual: insumo.estoque_atual,
      unidade: insumo.unidade,
      periodoDias: 90,
      baseCalculo: `${dosePorAnimal.toFixed(1)} dose × ${config.cabeca} animais × ${aplicacoes} aplicações`,
      confianca: 0.85,
      referencias: [
        { fonte: "embrapa", documento: "Calendário Sanitário", ano: 2024, recomendacao: "Padrão" },
        { fonte: "ufv", documento: "Programa Sanitário", ano: 2023, recomendacao: "Recomendado" },
      ],
      alertas: [],
      custoEstimado: quantidadeTotal * precoUnit,
    };
  }

  // ── Genérico ───────────────────────────────────────────────────────────────
  private calcularGenerico(
    insumo: InsumoParaCalculo,
    config: ConfiguracaoProducao,
    periodoDias: number
  ): Omit<RecomendacaoInsumo, "status" | "percentualCobertura"> {
    // Estimativa baseada no estoque mínimo ideal (2× o mínimo cadastrado)
    // ou 1 unidade por cabeça por período como fallback
    const quantidadeIdeal = Math.max(
      insumo.estoque_atual * 1.5,
      config.cabeca * 0.1 * periodoDias
    );

    const precoUnit = insumo.custo_medio ?? insumo.preco_estimado ?? 0;

    return {
      insumoId: insumo.id,
      nome: insumo.nome,
      categoria: insumo.categoria,
      quantidadeIdeal,
      quantidadeMinima: quantidadeIdeal * 0.7,
      quantidadeMaxima: quantidadeIdeal * 1.5,
      quantidadeAtual: insumo.estoque_atual,
      unidade: insumo.unidade,
      periodoDias,
      baseCalculo: `Estimativa baseada em ${config.cabeca} animais × ${periodoDias} dias`,
      confianca: 0.6,
      referencias: [
        { fonte: "senar", documento: "Boas Práticas de Gestão de Insumos", ano: 2024, recomendacao: "Padrão" },
      ],
      alertas: ["Categoria sem regra específica — recomendação estimada"],
      custoEstimado: quantidadeIdeal * precoUnit,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private obterFatorCategoria(categoria: CategoriaAnimal): number {
    const fatores: Record<CategoriaAnimal, number> = {
      bezerro: 0.6,
      novilho: 0.8,
      vaca: 1.0,
      touro: 1.1,
      matriz: 0.9,
      terminacao: 1.0,
    };
    return fatores[categoria] ?? 1.0;
  }

  private obterFatorRegionalSalMineral(config: ConfiguracaoRegional): number {
    const fatores: Record<TipoRegiao, Record<Estacao, number>> = {
      Norte: { seca: 1.3, chuvosa: 1.0 },
      Nordeste: { seca: 1.4, chuvosa: 1.0 },
      "Centro-Oeste": { seca: 1.2, chuvosa: 0.9 },
      Sudeste: { seca: 1.1, chuvosa: 0.9 },
      Sul: { seca: 1.0, chuvosa: 0.8 },
    };
    return fatores[config.regiao]?.[config.estacaoAtual] ?? 1.0;
  }

  private obterDosagemMedicamento(nome: string): number {
    const n = nome.toLowerCase();
    if (n.includes("iver") || n.includes("vermif")) return 1.0; // mL/100kg
    if (n.includes("vacin")) return 2.0; // doses fixas
    if (n.includes("antibio")) return 1.5;
    if (n.includes("carrapaticida") || n.includes("banheiro")) return 0.5;
    return 1.0;
  }

  private obterNumeroAplicacoesSanitarias(nome: string): number {
    const n = nome.toLowerCase();
    if (n.includes("febre aftosa")) return 2;
    if (n.includes("brucel")) return 1;
    if (n.includes("vacin")) return 2;
    if (n.includes("vermif") || n.includes("iver")) return 3;
    if (n.includes("carrapaticida")) return 4;
    return 2;
  }

  private aplicarFatoresRegionais(
    resultado: Omit<RecomendacaoInsumo, "status" | "percentualCobertura">,
    config: ConfiguracaoRegional
  ): Omit<RecomendacaoInsumo, "status" | "percentualCobertura"> {
    // Ajuste por bioma/estação para categorias sensíveis
    const categoriasSensiveis = ["racao", "sal_mineral", "medicamentos", "vacinas"];
    if (!categoriasSensiveis.includes(resultado.categoria)) return resultado;

    let fator = 1.0;
    if (config.regiao === "Nordeste" && config.estacaoAtual === "seca") fator = 1.15;
    else if (config.regiao === "Norte" && config.estacaoAtual === "chuvosa") fator = 0.95;
    else if (config.regiao === "Sul" && config.estacaoAtual === "seca") fator = 1.05;

    if (fator === 1.0) return resultado;

    return {
      ...resultado,
      quantidadeIdeal: resultado.quantidadeIdeal * fator,
      quantidadeMinima: resultado.quantidadeMinima * fator,
      quantidadeMaxima: resultado.quantidadeMaxima * fator,
      custoEstimado: resultado.custoEstimado * fator,
      alertas:
        fator > 1
          ? [...resultado.alertas, `Ajuste regional +${((fator - 1) * 100).toFixed(0)}% para ${config.regiao} (${config.estacaoAtual})`]
          : resultado.alertas,
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const calculadora = new CalculadoraInsumos();

// ── Labels e helpers de UI ─────────────────────────────────────────────────────

export const TIPO_ANIMAL_LABELS: Record<TipoAnimal, string> = {
  bovino_corte: "Bovino de Corte",
  bovino_leite: "Bovino de Leite",
  suino: "Suíno",
  ovino: "Ovino",
  caprino: "Caprino",
};

export const CATEGORIA_ANIMAL_LABELS: Record<CategoriaAnimal, string> = {
  bezerro: "Bezerro(a)",
  novilho: "Novilho(a)",
  vaca: "Vaca",
  touro: "Touro",
  matriz: "Matriz",
  terminacao: "Terminação",
};

export const REGIAO_LABELS: Record<TipoRegiao, string> = {
  Norte: "Norte",
  Nordeste: "Nordeste",
  "Centro-Oeste": "Centro-Oeste",
  Sudeste: "Sudeste",
  Sul: "Sul",
};

export const FONTE_LABELS: Record<FonteTecnica, string> = {
  embrapa: "Embrapa",
  senar: "Senar",
  ufv: "UFV",
  epamig: "EPAMIG",
};

export function getStatusColor(status: "ok" | "atencao" | "critico"): string {
  if (status === "critico") return "text-red-700";
  if (status === "atencao") return "text-amber-600";
  return "text-green-700";
}

export function getStatusBg(status: "ok" | "atencao" | "critico"): string {
  if (status === "critico") return "bg-red-50 border-red-200";
  if (status === "atencao") return "bg-amber-50 border-amber-200";
  return "bg-green-50 border-green-200";
}

export function getStatusLabel(status: "ok" | "atencao" | "critico"): string {
  if (status === "critico") return "Crítico";
  if (status === "atencao") return "Atenção";
  return "OK";
}
