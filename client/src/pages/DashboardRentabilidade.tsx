/**
 * DashboardRentabilidade — Painel interativo de análise de rentabilidade de insumos
 * Rota: /insumos/dashboard-rentabilidade
 *
 * Funcionalidades:
 * - Configuração rápida do rebanho e período
 * - 4 KPI cards com indicadores-chave
 * - Gauge de viabilidade econômica
 * - Pizza interativa de composição de custos
 * - Radar de eficiência vs. benchmark Embrapa
 * - ComposedChart comparativo de múltiplos períodos
 * - Simulador de cenários (preço de venda / custo)
 * - Tabela de detalhamento por insumo com sparkline
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  BarChart3,
  RefreshCw,
  Download,
  Loader2,
  Info,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import {
  CalculadoraRentabilidade,
  type EntradaCorte,
  type EntradaLeite,
  type ResultadoCorte,
  type ResultadoLeite,
  type EntradaCustoInsumo,
} from "@/lib/rentabilidadeInsumos";
import { fmtBRL } from "@/lib/custoCalculo";
import { PizzaCustos } from "@/components/rentabilidade/PizzaCustos";
import { GraficoComparativo, type PontoPeriodo } from "@/components/rentabilidade/GraficoComparativo";
import { RadarEficiencia, type DadoRadar } from "@/components/rentabilidade/RadarEficiencia";

// ── Presets de período ────────────────────────────────────────────────────────
const PERIODOS_PRESET = [
  { label: "Mensal (30 dias)",      dias: 30,  rotulo: () => {
    const d = new Date(); return `${d.toLocaleString("pt-BR",{month:"short"}).replace(".","")}'${String(d.getFullYear()).slice(2)}`;
  }},
  { label: "Bimestral (60 dias)",  dias: 60,  rotulo: () => "Bimestral" },
  { label: "Trimestral (90 dias)", dias: 90,  rotulo: () => "Trimestral" },
  { label: "Semestral (180 dias)", dias: 180, rotulo: () => "Semestral" },
  { label: "Anual (365 dias)",     dias: 365, rotulo: () => "Anual" },
  { label: "Personalizado",        dias: 0,   rotulo: () => "" },
] as const;

// ── Constantes de referência Embrapa ──────────────────────────────────────────
const REF_GMD_CONFINAMENTO = 1.2;      // kg/dia — Embrapa BR-CORTE
const REF_CA_CONFINAMENTO = 6.5;       // kg ração/kg ganho
const REF_MARGEM_MINIMA = 15;          // % mínima de margem bruta
const REF_LITROS_VACA_DIA = 22;        // L/vaca/dia — Embrapa PSP Leite
const PRECO_ARROBA_REF = 340.27;       // CEPEA 30/06/2026
const PRECO_LEITE_REF = 2.85;          // Média nacional jun/2026

const calc = new CalculadoraRentabilidade();

// ── Tipos internos ─────────────────────────────────────────────────────────────
interface FormCorte {
  numeroAnimais: number;
  pesoInicial: number;
  pesoFinal: number;
  periodoDias: number;
  outrosCustos: number;
  precoArroba: number;
  rendimentoCarcaca: number;
}

interface FormLeite {
  vacasLactacao: number;
  producaoTotalLitros: number;
  periodoDias: number;
  outrosCustos: number;
  precoLeite: number;
}

interface InsumoSelecionado {
  id: number;
  nome: string;
  categoria: string;
  unidade: string;
  custoMedio: number;
  estoqueAtual: number;
  quantidadeUsada: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function kpiVariacao(atual: number, anterior: number): { delta: number; positivo: boolean } {
  if (anterior === 0) return { delta: 0, positivo: true };
  const delta = ((atual - anterior) / Math.abs(anterior)) * 100;
  return { delta, positivo: delta >= 0 };
}

function corMargem(perc: number) {
  if (perc >= 20) return "text-green-600";
  if (perc >= 5) return "text-yellow-600";
  return "text-red-600";
}

// ── Componente KPI Card ────────────────────────────────────────────────────────
function KpiCard({
  titulo,
  valor,
  subtitulo,
  icone: Icone,
  corIcone,
  variacao,
  badge,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  icone: React.ElementType;
  corIcone: string;
  variacao?: { delta: number; positivo: boolean };
  badge?: { texto: string; cor: string };
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium truncate">{titulo}</p>
            <p className="text-2xl font-bold mt-1 leading-none">{valor}</p>
            {subtitulo && (
              <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>
            )}
            {variacao && (
              <div
                className={`flex items-center gap-0.5 mt-1.5 text-xs font-medium ${
                  variacao.positivo ? "text-green-600" : "text-red-600"
                }`}
              >
                {variacao.positivo ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(variacao.delta).toFixed(1)}% vs período anterior
              </div>
            )}
          </div>
          <div className={`p-2 rounded-lg bg-opacity-10 ${corIcone} shrink-0`}>
            <Icone className={`h-5 w-5 ${corIcone}`} />
          </div>
        </div>
        {badge && (
          <Badge
            className={`mt-2 text-xs ${badge.cor}`}
            variant="outline"
          >
            {badge.texto}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

// ── Simulador de Cenários ─────────────────────────────────────────────────────
function SimuladorCenarios({
  resultado,
  sistema,
  precoBase,
  onPrecoChange,
}: {
  resultado: ResultadoCorte | ResultadoLeite | null;
  sistema: "corte" | "leite";
  precoBase: number;
  onPrecoChange: (v: number) => void;
}) {
  const [variacaoCusto, setVariacaoCusto] = useState(0); // %

  if (!resultado) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Configure o rebanho e calcule para ver o simulador.
      </div>
    );
  }

  // Gerar curva de sensibilidade: preço de venda variando ±30%
  const pontos = Array.from({ length: 13 }, (_, i) => {
    const fatorPreco = 0.7 + i * 0.05; // 70% a 130% do preço base
    const precoSim = precoBase * fatorPreco;
    const fatorCusto = 1 + variacaoCusto / 100;
    const custoSim = resultado.custoTotalPeriodo * fatorCusto;

    let receita: number;
    let label: string;

    if (sistema === "corte") {
      const r = resultado as ResultadoCorte;
      receita = r.totalArrobasProduzidasAt * precoSim;
      label = `R$${precoSim.toFixed(0)}/@`;
    } else {
      const r = resultado as ResultadoLeite;
      receita = r.producaoTotalLitros * precoSim;
      label = `R$${precoSim.toFixed(2)}/L`;
    }

    const margem = receita - custoSim;
    const margemPerc = receita > 0 ? (margem / receita) * 100 : 0;

    return { label, margem, margemPerc, receita, custo: custoSim };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-border rounded-lg shadow p-2 text-xs">
        <p className="font-semibold mb-1">{label}</p>
        <div className="flex justify-between gap-3">
          <span>Margem Bruta:</span>
          <span className={payload[0].value >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
            {fmtBRL(payload[0].value)}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Margem %:</span>
          <span className={payload[1]?.value >= 0 ? "text-green-600" : "text-red-600"}>
            {payload[1]?.value?.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">
            Variação de custo dos insumos: {variacaoCusto > 0 ? "+" : ""}{variacaoCusto}%
          </Label>
          <Slider
            value={[variacaoCusto]}
            onValueChange={([v]) => setVariacaoCusto(v)}
            min={-30}
            max={50}
            step={5}
            className="mt-2"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Preço base: {sistema === "corte" ? `${fmtBRL(precoBase)}/@` : `${fmtBRL(precoBase)}/L`}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={pontos} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="gradMargem" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={1} />
          <YAxis
            tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" label={{ value: "Equilíbrio", fontSize: 10, fill: "#ef4444" }} />
          <Area
            type="monotone"
            dataKey="margem"
            name="Margem Bruta"
            stroke="#2563eb"
            fill="url(#gradMargem)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground text-center">
        Sensibilidade da margem bruta ao preço de venda (custo {variacaoCusto > 0 ? "+" : ""}{variacaoCusto}%)
      </p>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function DashboardRentabilidade() {
  const { imovelId, produtorId } = useRuralAuth();
  const [sistema, setSistema] = useState<"corte" | "leite">("corte");
  const [resultado, setResultado] = useState<ResultadoCorte | ResultadoLeite | null>(null);
  const [historico, setHistorico] = useState<PontoPeriodo[]>([]);
  const [labelPeriodo, setLabelPeriodo] = useState("Jul/26");
  const [presetPeriodo, setPresetPeriodo] = useState<string>("Mensal (30 dias)");
  const [dadosIntegrados, setDadosIntegrados] = useState(false);

  // Buscar dados do rebanho para pré-preenchimento
  const { data: bovinosData, isLoading: loadingBovinos } = trpc.railway.animais.useQuery(
    { imovelId: imovelId ?? 0, especie: "bovinos" },
    { enabled: !!imovelId }
  );
  const { data: ovinosData } = trpc.railway.animais.useQuery(
    { imovelId: imovelId ?? 0, especie: "ovinos" },
    { enabled: !!imovelId }
  );
  const { data: caprinosData } = trpc.railway.animais.useQuery(
    { imovelId: imovelId ?? 0, especie: "caprinos" },
    { enabled: !!imovelId }
  );
  const { data: suinosData } = trpc.railway.animais.useQuery(
    { imovelId: imovelId ?? 0, especie: "suinos" },
    { enabled: !!imovelId }
  );

  // Calcular totais do rebanho integrado
  const rebanhoIntegrado = useMemo(() => {
    const bovinos = (bovinosData as any[]) ?? [];
    const ovinos = (ovinosData as any[]) ?? [];
    const caprinos = (caprinosData as any[]) ?? [];
    const suinos = (suinosData as any[]) ?? [];
    const ativos = (arr: any[]) => arr.filter((a) => a.status === "ativo" || a.status === "Ativo" || !a.status);
    const totalCorte = ativos(bovinos).length + ativos(ovinos).length + ativos(caprinos).length + ativos(suinos).length;
    const pesoMedioCorte = (() => {
      const todos = [...ativos(bovinos), ...ativos(ovinos), ...ativos(caprinos), ...ativos(suinos)];
      const comPeso = todos.filter((a) => a.ultimo_peso && a.ultimo_peso > 0);
      if (comPeso.length === 0) return 0;
      return Math.round(comPeso.reduce((s, a) => s + a.ultimo_peso, 0) / comPeso.length);
    })();
    const especiesPrincipal = [
      { nome: "Bovinos", qtd: ativos(bovinos).length },
      { nome: "Ovinos", qtd: ativos(ovinos).length },
      { nome: "Caprinos", qtd: ativos(caprinos).length },
      { nome: "Suínos", qtd: ativos(suinos).length },
    ].filter((e) => e.qtd > 0);
    return { totalCorte, pesoMedioCorte, especiesPrincipal };
  }, [bovinosData, ovinosData, caprinosData, suinosData]);

  // Pré-preencher formulário com dados do sistema quando carregados
  useEffect(() => {
    if (dadosIntegrados) return;
    if (rebanhoIntegrado.totalCorte > 0) {
      setFormCorte((p) => ({
        ...p,
        numeroAnimais: rebanhoIntegrado.totalCorte,
        ...(rebanhoIntegrado.pesoMedioCorte > 0 ? { pesoInicial: rebanhoIntegrado.pesoMedioCorte } : {}),
      }));
      setDadosIntegrados(true);
    }
  }, [rebanhoIntegrado, dadosIntegrados]);

  // Aplicar preset de período
  const aplicarPreset = useCallback((label: string) => {
    setPresetPeriodo(label);
    const preset = PERIODOS_PRESET.find((p) => p.label === label);
    if (!preset || preset.dias === 0) return; // Personalizado: não altera
    const dias = preset.dias;
    const rotulo = preset.rotulo();
    setLabelPeriodo(rotulo);
    setFormCorte((p) => ({ ...p, periodoDias: dias }));
    setFormLeite((p) => ({ ...p, periodoDias: dias }));
  }, []);

  // Formulário Corte
  const [formCorte, setFormCorte] = useState<FormCorte>({
    numeroAnimais: 50,
    pesoInicial: 280,
    pesoFinal: 450,
    periodoDias: 90,
    outrosCustos: 3000,
    precoArroba: PRECO_ARROBA_REF,
    rendimentoCarcaca: 52,
  });

  // Formulário Leite
  const [formLeite, setFormLeite] = useState<FormLeite>({
    vacasLactacao: 30,
    producaoTotalLitros: 18000,
    periodoDias: 30,
    outrosCustos: 2000,
    precoLeite: PRECO_LEITE_REF,
  });

  // Insumos selecionados do estoque
  const [insumosSelecionados, setInsumosSelecionados] = useState<InsumoSelecionado[]>([]);

  // Buscar insumos do estoque
  const { data: insumosData, isLoading: loadingInsumos } = trpc.railway.insumos.useQuery(
    { imovelId: imovelId ?? 0 },
    { enabled: !!imovelId }
  );
  const insumosEstoque = (insumosData as any[]) ?? [];

  // Buscar lançamentos para pré-preencher preço de venda
  const { data: lancamentosData } = trpc.railway.lancamentos.useQuery(
    { produtorId: produtorId ?? 0 },
    { enabled: !!produtorId }
  );

  // Extrair preço de venda do último lançamento de receita de venda de animais
  const precoVendaIntegrado = useMemo(() => {
    const lancamentos = (lancamentosData as any[]) ?? [];
    const vendasAnimais = lancamentos
      .filter((l: any) =>
        l.tipo === "receita" &&
        (l.atividade === "venda_animais" ||
          (l.descricao ?? "").toLowerCase().includes("venda") &&
          ((l.descricao ?? "").toLowerCase().includes("animal") ||
           (l.descricao ?? "").toLowerCase().includes("boi") ||
           (l.descricao ?? "").toLowerCase().includes("ovino") ||
           (l.descricao ?? "").toLowerCase().includes("arroba")))
      )
      .sort((a: any, b: any) =>
        new Date(b.data_lancamento).getTime() - new Date(a.data_lancamento).getTime()
      );
    if (vendasAnimais.length === 0) return null;
    // Tenta extrair preco_venda do campo motivo (formato: preco_venda:340.27)
    const ultimo = vendasAnimais[0];
    const match = (ultimo.descricao ?? "").match(/preco_venda:(\d+[.,]?\d*)/);
    if (match) return Number(match[1].replace(",", "."));
    return null;
  }, [lancamentosData]);

  // Extrair quantidade consumida por insumo das movimentações com motivo consumo_rebanho
  const consumosPorInsumo = useMemo(() => {
    // Parseia observações das movimentações do estoque para extrair consumos
    // Formato: "motivo:consumo_rebanho | atividade:pecuaria_corte"
    const mapa: Record<number, number> = {};
    insumosEstoque.forEach((ins: any) => {
      if (!ins.movimentacoes) return;
      const consumoTotal = (ins.movimentacoes as any[])
        .filter((m: any) =>
          (m.observacao ?? "").includes("motivo:consumo_rebanho") &&
          ["uso", "perda", "ajuste_negativo"].includes(m.tipo)
        )
        .reduce((s: number, m: any) => s + (m.quantidade ?? 0), 0);
      if (consumoTotal > 0) mapa[ins.id] = consumoTotal;
    });
    return mapa;
  }, [insumosEstoque]);

  // Pré-preencher preço de venda quando lançamentos carregarem
  useEffect(() => {
    if (precoVendaIntegrado && precoVendaIntegrado > 0) {
      setFormCorte((p) => ({ ...p, precoArroba: precoVendaIntegrado }));
    }
  }, [precoVendaIntegrado]);

  // Adicionar todos os insumos com custo médio de uma vez
  const adicionarTodosInsumos = useCallback(() => {
    const comCusto = insumosEstoque.filter(
      (i: any) => (i.custo_medio ?? 0) > 0 && !insumosSelecionados.some((s) => s.id === i.id)
    );
    if (comCusto.length === 0) return;
    setInsumosSelecionados((prev) => [
      ...prev,
      ...comCusto.map((i: any) => ({
        id: i.id,
        nome: i.nome,
        categoria: i.categoria ?? "outros",
        unidade: i.unidade ?? "kg",
        custoMedio: i.custo_medio ?? 0,
        estoqueAtual: i.estoque_atual ?? 0,
        quantidadeUsada: 0,
      })),
    ]);
  }, [insumosEstoque, insumosSelecionados]);

  // Adicionar insumo à lista
  const adicionarInsumo = useCallback((id: number) => {
    const insumo = insumosEstoque.find((i: any) => i.id === id);
    if (!insumo || insumosSelecionados.some((s) => s.id === id)) return;
    setInsumosSelecionados((prev) => [
      ...prev,
      {
        id: insumo.id,
        nome: insumo.nome,
        categoria: insumo.categoria ?? "outros",
        unidade: insumo.unidade ?? "kg",
        custoMedio: insumo.custo_medio ?? 0,
        estoqueAtual: insumo.estoque_atual ?? 0,
        quantidadeUsada: 0,
      },
    ]);
  }, [insumosEstoque, insumosSelecionados]);

  const removerInsumo = (id: number) =>
    setInsumosSelecionados((prev) => prev.filter((i) => i.id !== id));

  const atualizarQtd = (id: number, qtd: number) =>
    setInsumosSelecionados((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantidadeUsada: qtd } : i))
    );

  // Calcular
  const calcular = useCallback(() => {
    const insumosEntrada: EntradaCustoInsumo[] = insumosSelecionados
      .filter((i) => i.quantidadeUsada > 0)
      .map((i) => ({
        nome: i.nome,
        categoria: i.categoria,
        quantidadeUsada: i.quantidadeUsada,
        unidade: i.unidade,
        custoUnitario: i.custoMedio,
      }));

    let res: ResultadoCorte | ResultadoLeite;

    if (sistema === "corte") {
      const entrada: EntradaCorte = {
        sistema: "corte",
        numeroAnimais: formCorte.numeroAnimais,
        pesoInicialMedio: formCorte.pesoInicial,
        pesoFinalMedio: formCorte.pesoFinal,
        periodoDias: formCorte.periodoDias,
        insumos: insumosEntrada,
        outrosCustos: formCorte.outrosCustos,
        precoArrobaVenda: formCorte.precoArroba,
        rendimentoCarcaca: formCorte.rendimentoCarcaca,
      };
      res = calc.calcularCorte(entrada);
    } else {
      const entrada: EntradaLeite = {
        sistema: "leite",
        vacasLactacao: formLeite.vacasLactacao,
        producaoTotalLitros: formLeite.producaoTotalLitros,
        periodoDias: formLeite.periodoDias,
        insumos: insumosEntrada,
        outrosCustos: formLeite.outrosCustos,
        precoLeiteLitro: formLeite.precoLeite,
      };
      res = calc.calcularLeite(entrada);
    }

    setResultado(res);

    // Adicionar ao histórico
    const ponto: PontoPeriodo = {
      periodo: labelPeriodo,
      custoTotal: res.custoTotalPeriodo,
      receita: res.receitaTotalEstimada,
      margemBruta: res.margemBruta,
      margemPerc: res.margemBrutaPerc,
      indicadorPrincipal:
        sistema === "corte"
          ? (res as ResultadoCorte).ganhoPesoMedioDiario
          : (res as ResultadoLeite).producaoMediaDiariaVaca,
      labelIndicador: sistema === "corte" ? "GMD (kg/dia)" : "L/vaca/dia",
    };
    setHistorico((prev) => {
      const idx = prev.findIndex((p) => p.periodo === labelPeriodo);
      if (idx >= 0) {
        const novo = [...prev];
        novo[idx] = ponto;
        return novo;
      }
      return [...prev, ponto].slice(-12); // manter últimos 12 períodos
    });
  }, [sistema, formCorte, formLeite, insumosSelecionados, labelPeriodo]);

  // Dados derivados para visualizações
  const dadosRadar = useMemo((): DadoRadar[] => {
    if (!resultado) return [];

    if (resultado.sistema === "corte") {
      const r = resultado as ResultadoCorte;
      return [
        {
          indicador: "GMD",
          atual: Math.min(100, (r.ganhoPesoMedioDiario / REF_GMD_CONFINAMENTO) * 100),
          referencia: 100,
        },
        {
          indicador: "Conv. Alimentar",
          // CA: menor é melhor — inverter
          atual: Math.min(100, (REF_CA_CONFINAMENTO / Math.max(r.conversaoAlimentar, 0.1)) * 100),
          referencia: 100,
        },
        {
          indicador: "Margem Bruta",
          atual: Math.min(100, Math.max(0, (r.margemBrutaPerc / REF_MARGEM_MINIMA) * 100)),
          referencia: 100,
        },
        {
          indicador: "Custo/@",
          // Custo/@ menor que preço de venda é melhor
          atual: Math.min(100, Math.max(0, (1 - r.custoPorArroba / r.receitaTotalEstimada * r.totalArrobasProduzidasAt) * 100 + 50)),
          referencia: 100,
        },
        {
          indicador: "Lucro/Animal",
          atual: Math.min(100, Math.max(0, r.lucroPorAnimal > 0 ? 80 : 20)),
          referencia: 80,
        },
      ];
    } else {
      const r = resultado as ResultadoLeite;
      return [
        {
          indicador: "Produtividade",
          atual: Math.min(100, (r.producaoMediaDiariaVaca / REF_LITROS_VACA_DIA) * 100),
          referencia: 100,
        },
        {
          indicador: "Custo Alim./L",
          // menor é melhor
          atual: Math.min(100, Math.max(0, (1 - r.custoAlimentarPorLitro / r.custoPorLitro) * 100 + 50)),
          referencia: 100,
        },
        {
          indicador: "Margem Bruta",
          atual: Math.min(100, Math.max(0, (r.margemBrutaPerc / REF_MARGEM_MINIMA) * 100)),
          referencia: 100,
        },
        {
          indicador: "Lucro/Vaca",
          atual: Math.min(100, Math.max(0, r.lucroPorVaca > 0 ? 80 : 20)),
          referencia: 80,
        },
        {
          indicador: "CUP/Litro",
          atual: Math.min(100, Math.max(0, (1 - r.custoPorLitro / (formLeite.precoLeite * 1.5)) * 100)),
          referencia: 100,
        },
      ];
    }
  }, [resultado, formLeite.precoLeite]);

  const precoBase =
    sistema === "corte" ? formCorte.precoArroba : formLeite.precoLeite;

  const periodoAnterior = historico.length >= 2 ? historico[historico.length - 2] : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/insumos">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Insumos
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-none">Painel de Rentabilidade</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Análise interativa — Metodologia Embrapa BR-CORTE / PSP Leite
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button
              className={`px-3 py-1.5 font-medium transition-colors ${
                sistema === "corte"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              onClick={() => { setSistema("corte"); setResultado(null); }}
            >
              Corte
            </button>
            <button
              className={`px-3 py-1.5 font-medium transition-colors ${
                sistema === "leite"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              onClick={() => { setSistema("leite"); setResultado(null); }}
            >
              Leite
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-screen-2xl mx-auto">
        {/* Layout principal: sidebar de configuração + área de resultados */}
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">

          {/* ── Painel de configuração ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Configuração do Período
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Banner de integração com o sistema */}
                {rebanhoIntegrado.totalCorte > 0 && (
                  <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary flex items-start gap-2">
                    <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div>
                      <strong>Dados integrados do sistema:</strong>{" "}
                      {rebanhoIntegrado.especiesPrincipal.map((e) => `${e.nome}: ${e.qtd}`).join(" · ")}
                      {rebanhoIntegrado.pesoMedioCorte > 0 && (
                        <span> · Peso médio: {rebanhoIntegrado.pesoMedioCorte} kg</span>
                      )}
                      {precoVendaIntegrado && precoVendaIntegrado > 0 && (
                        <span> · Preço venda: R$ {precoVendaIntegrado.toFixed(2)}/@</span>
                      )}
                      <span className="block mt-0.5 text-primary/70">
                        Campos pré-preenchidos com dados reais do sistema. Ajuste se necessário.
                      </span>
                    </div>
                  </div>
                )}
                {loadingBovinos && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Carregando dados do rebanho…
                  </div>
                )}

                {/* Seletor de período predefinido */}
                <div>
                  <Label className="text-xs">Período de análise</Label>
                  <Select value={presetPeriodo} onValueChange={aplicarPreset}>
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue placeholder="Selecione o período…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODOS_PRESET.map((p) => (
                        <SelectItem key={p.label} value={p.label}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Rótulo do período</Label>
                    <Input
                      value={labelPeriodo}
                      onChange={(e) => setLabelPeriodo(e.target.value)}
                      className="h-8 text-sm mt-1"
                      placeholder="Ex: Jul/26"
                    />
                  </div>
                  {sistema === "corte" ? (
                    <div>
                      <Label className="text-xs">Duração (dias)</Label>
                      <Input
                        type="number"
                        value={formCorte.periodoDias}
                        onChange={(e) => {
                          setPresetPeriodo("Personalizado");
                          setFormCorte((p) => ({ ...p, periodoDias: +e.target.value }));
                        }}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs">Duração (dias)</Label>
                      <Input
                        type="number"
                        value={formLeite.periodoDias}
                        onChange={(e) => {
                          setPresetPeriodo("Personalizado");
                          setFormLeite((p) => ({ ...p, periodoDias: +e.target.value }));
                        }}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                  )}
                </div>

                {/* Informativo de produção total para leite */}
                {sistema === "leite" && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                    <strong>Produção total (L):</strong> informe o total de litros produzidos
                    nos <strong>{formLeite.periodoDias} dias</strong> do período selecionado.
                    {formLeite.vacasLactacao > 0 && formLeite.periodoDias > 0 && (
                      <span className="block mt-0.5 text-blue-600">
                        Equivale a ≈ {(formLeite.producaoTotalLitros / formLeite.vacasLactacao / formLeite.periodoDias).toFixed(1)} L/vaca/dia
                        com {formLeite.vacasLactacao} vacas.
                      </span>
                    )}
                  </div>
                )}

                {/* Informativo de peso para corte */}
                {sistema === "corte" && (
                  <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                    <strong>Pesos inicial e final:</strong> pesos médios do lote no início
                    e ao final dos <strong>{formCorte.periodoDias} dias</strong>.
                    {formCorte.periodoDias > 0 && formCorte.pesoFinal > formCorte.pesoInicial && (
                      <span className="block mt-0.5 text-green-600">
                        GMD estimado: {((formCorte.pesoFinal - formCorte.pesoInicial) / formCorte.periodoDias).toFixed(2)} kg/dia
                      </span>
                    )}
                  </div>
                )}

                {sistema === "corte" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Nº animais</Label>
                        <Input
                          type="number"
                          value={formCorte.numeroAnimais}
                          onChange={(e) =>
                            setFormCorte((p) => ({ ...p, numeroAnimais: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Peso inicial (kg)</Label>
                        <Input
                          type="number"
                          value={formCorte.pesoInicial}
                          onChange={(e) =>
                            setFormCorte((p) => ({ ...p, pesoInicial: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Peso final (kg)</Label>
                        <Input
                          type="number"
                          value={formCorte.pesoFinal}
                          onChange={(e) =>
                            setFormCorte((p) => ({ ...p, pesoFinal: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Rend. carcaça (%)</Label>
                        <Input
                          type="number"
                          value={formCorte.rendimentoCarcaca}
                          onChange={(e) =>
                            setFormCorte((p) => ({ ...p, rendimentoCarcaca: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Preço @ venda (R$)</Label>
                        <Input
                          type="number"
                          value={formCorte.precoArroba}
                          onChange={(e) =>
                            setFormCorte((p) => ({ ...p, precoArroba: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Outros custos (R$)</Label>
                        <Input
                          type="number"
                          value={formCorte.outrosCustos}
                          onChange={(e) =>
                            setFormCorte((p) => ({ ...p, outrosCustos: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Vacas em lactação</Label>
                        <Input
                          type="number"
                          value={formLeite.vacasLactacao}
                          onChange={(e) =>
                            setFormLeite((p) => ({ ...p, vacasLactacao: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Produção total (L)</Label>
                        <Input
                          type="number"
                          value={formLeite.producaoTotalLitros}
                          onChange={(e) =>
                            setFormLeite((p) => ({ ...p, producaoTotalLitros: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Preço leite (R$/L)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formLeite.precoLeite}
                          onChange={(e) =>
                            setFormLeite((p) => ({ ...p, precoLeite: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Outros custos (R$)</Label>
                        <Input
                          type="number"
                          value={formLeite.outrosCustos}
                          onChange={(e) =>
                            setFormLeite((p) => ({ ...p, outrosCustos: +e.target.value }))
                          }
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Seleção de insumos */}
            <Card>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Insumos do Período</CardTitle>
                  {insumosEstoque.filter((i: any) => (i.custo_medio ?? 0) > 0 && !insumosSelecionados.some((s) => s.id === i.id)).length > 0 && (
                    <button
                      onClick={adicionarTodosInsumos}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Zap className="h-3 w-3" /> Adicionar todos
                    </button>
                  )}
                </div>
                {insumosEstoque.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {insumosEstoque.length} insumos no estoque — custo médio ponderado integrado
                  </p>
                )}
                {loadingInsumos && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Carregando estoque…
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <Select onValueChange={(v) => adicionarInsumo(+v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Adicionar insumo do estoque…" />
                  </SelectTrigger>
                  <SelectContent>
                    {insumosEstoque
                      .filter((i: any) => !insumosSelecionados.some((s) => s.id === i.id))
                      .map((i: any) => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          {i.nome} — {fmtBRL(i.custo_medio ?? 0)}/{i.unidade ?? "un"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {insumosSelecionados.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Nenhum insumo adicionado. Selecione acima.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {insumosSelecionados.map((ins) => (
                      <div key={ins.id} className="flex items-center gap-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{ins.nome}</p>
                          <p className="text-muted-foreground">
                            {fmtBRL(ins.custoMedio)}/{ins.unidade}
                          </p>
                        </div>
                        <Input
                          type="number"
                          value={ins.quantidadeUsada || ""}
                          onChange={(e) => atualizarQtd(ins.id, +e.target.value)}
                          placeholder="Qtd"
                          className="h-7 w-20 text-xs"
                        />
                        <span className="text-muted-foreground w-6">{ins.unidade}</span>
                        <button
                          onClick={() => removerInsumo(ins.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Button onClick={calcular} className="w-full h-8 text-sm gap-1.5 mt-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Calcular
                </Button>
              </CardContent>
            </Card>

            {/* Cotações de referência */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs font-semibold text-blue-800 mb-1">
                  Cotações de Referência — CEPEA/Scot (30/06/2026)
                </p>
                <div className="text-xs text-blue-700 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Boi Gordo SP:</span>
                    <span className="font-bold">R$ 340,27/@</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Leite médio nacional:</span>
                    <span className="font-bold">R$ 2,85/L</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Área de resultados ── */}
          <div className="space-y-4">
            {/* KPI Cards */}
            {resultado ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {resultado.sistema === "corte" ? (
                    <>
                      <KpiCard
                        titulo="Margem Bruta"
                        valor={fmtBRL((resultado as ResultadoCorte).margemBruta)}
                        subtitulo={`${(resultado as ResultadoCorte).margemBrutaPerc.toFixed(1)}% da receita`}
                        icone={DollarSign}
                        corIcone={
                          (resultado as ResultadoCorte).margemBruta >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                        variacao={
                          periodoAnterior
                            ? kpiVariacao(
                                (resultado as ResultadoCorte).margemBruta,
                                periodoAnterior.margemBruta
                              )
                            : undefined
                        }
                        badge={
                          (resultado as ResultadoCorte).viavel
                            ? { texto: "Viável", cor: "border-green-500 text-green-700" }
                            : { texto: "Inviável", cor: "border-red-500 text-red-700" }
                        }
                      />
                      <KpiCard
                        titulo="GMD"
                        valor={`${(resultado as ResultadoCorte).ganhoPesoMedioDiario.toFixed(2)} kg/dia`}
                        subtitulo={`Ref. Embrapa: ≥ ${REF_GMD_CONFINAMENTO} kg/dia`}
                        icone={Activity}
                        corIcone={
                          (resultado as ResultadoCorte).ganhoPesoMedioDiario >= REF_GMD_CONFINAMENTO
                            ? "text-green-600"
                            : "text-yellow-600"
                        }
                      />
                      <KpiCard
                        titulo="Custo por @"
                        valor={fmtBRL((resultado as ResultadoCorte).custoPorArroba)}
                        subtitulo={`Ponto equilíbrio: ${fmtBRL((resultado as ResultadoCorte).pontoEquilibrio)}/@`}
                        icone={TrendingUp}
                        corIcone="text-blue-600"
                      />
                      <KpiCard
                        titulo="Lucro por Animal"
                        valor={fmtBRL((resultado as ResultadoCorte).lucroPorAnimal)}
                        subtitulo={`${formCorte.numeroAnimais} animais`}
                        icone={
                          (resultado as ResultadoCorte).lucroPorAnimal >= 0
                            ? CheckCircle2
                            : AlertTriangle
                        }
                        corIcone={
                          (resultado as ResultadoCorte).lucroPorAnimal >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      />
                    </>
                  ) : (
                    <>
                      <KpiCard
                        titulo="Margem Bruta"
                        valor={fmtBRL((resultado as ResultadoLeite).margemBruta)}
                        subtitulo={`${(resultado as ResultadoLeite).margemBrutaPerc.toFixed(1)}% da receita`}
                        icone={DollarSign}
                        corIcone={
                          (resultado as ResultadoLeite).margemBruta >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                        badge={
                          (resultado as ResultadoLeite).viavel
                            ? { texto: "Viável", cor: "border-green-500 text-green-700" }
                            : { texto: "Inviável", cor: "border-red-500 text-red-700" }
                        }
                      />
                      <KpiCard
                        titulo="Produtividade"
                        valor={`${(resultado as ResultadoLeite).producaoMediaDiariaVaca.toFixed(1)} L/vaca/dia`}
                        subtitulo={`Ref. Embrapa: ≥ ${REF_LITROS_VACA_DIA} L/vaca/dia`}
                        icone={Activity}
                        corIcone={
                          (resultado as ResultadoLeite).producaoMediaDiariaVaca >= REF_LITROS_VACA_DIA
                            ? "text-green-600"
                            : "text-yellow-600"
                        }
                      />
                      <KpiCard
                        titulo="CUP / Litro"
                        valor={fmtBRL((resultado as ResultadoLeite).custoPorLitro)}
                        subtitulo={`Ponto equilíbrio: ${fmtBRL((resultado as ResultadoLeite).pontoEquilibrio)}/L`}
                        icone={TrendingUp}
                        corIcone="text-blue-600"
                      />
                      <KpiCard
                        titulo="Lucro por Vaca"
                        valor={fmtBRL((resultado as ResultadoLeite).lucroPorVaca)}
                        subtitulo={`${formLeite.vacasLactacao} vacas em lactação`}
                        icone={
                          (resultado as ResultadoLeite).lucroPorVaca >= 0
                            ? CheckCircle2
                            : AlertTriangle
                        }
                        corIcone={
                          (resultado as ResultadoLeite).lucroPorVaca >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      />
                    </>
                  )}
                </div>

                {/* Tabs de visualizações */}
                <Tabs defaultValue="composicao">
                  <TabsList className="h-8 text-xs">
                    <TabsTrigger value="composicao" className="text-xs">Composição</TabsTrigger>
                    <TabsTrigger value="radar" className="text-xs">Eficiência</TabsTrigger>
                    <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>
                    <TabsTrigger value="simulador" className="text-xs">Simulador</TabsTrigger>
                    <TabsTrigger value="detalhes" className="text-xs">Detalhes</TabsTrigger>
                  </TabsList>

                  {/* Composição de custos */}
                  <TabsContent value="composicao">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <PizzaCustos
                            detalheInsumos={resultado.detalheInsumos}
                            outrosCustos={
                              sistema === "corte"
                                ? formCorte.outrosCustos
                                : formLeite.outrosCustos
                            }
                            titulo="Composição dos Custos do Período"
                          />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4 space-y-3">
                          <p className="text-sm font-semibold">Resumo Financeiro</p>
                          {[
                            {
                              label: "Receita Total",
                              valor: resultado.receitaTotalEstimada,
                              cor: "text-green-600",
                            },
                            {
                              label: "Custo de Insumos",
                              valor: resultado.custoAlimentarTotal,
                              cor: "text-red-500",
                            },
                            {
                              label: "Outros Custos",
                              valor:
                                sistema === "corte"
                                  ? formCorte.outrosCustos
                                  : formLeite.outrosCustos,
                              cor: "text-orange-500",
                            },
                            {
                              label: "Custo Total",
                              valor: resultado.custoTotalPeriodo,
                              cor: "text-red-600",
                              negrito: true,
                            },
                            {
                              label: "Margem Bruta",
                              valor: resultado.margemBruta,
                              cor: resultado.margemBruta >= 0 ? "text-green-600" : "text-red-600",
                              negrito: true,
                            },
                          ].map((item) => (
                            <div key={item.label} className="flex justify-between items-center text-sm">
                              <span className={item.negrito ? "font-semibold" : "text-muted-foreground"}>
                                {item.label}
                              </span>
                              <span className={`font-${item.negrito ? "bold" : "medium"} ${item.cor}`}>
                                {fmtBRL(item.valor)}
                              </span>
                            </div>
                          ))}
                          <div className="pt-2 border-t">
                            <div className="flex justify-between items-center text-sm mb-1">
                              <span className="text-muted-foreground">Margem Bruta %</span>
                              <span className={`font-bold text-base ${corMargem(resultado.margemBrutaPerc)}`}>
                                {resultado.margemBrutaPerc.toFixed(1)}%
                              </span>
                            </div>
                            <Progress
                              value={Math.max(0, Math.min(100, resultado.margemBrutaPerc))}
                              className="h-2"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* Radar de eficiência */}
                  <TabsContent value="radar">
                    <Card>
                      <CardContent className="pt-4">
                        <RadarEficiencia
                          dados={dadosRadar}
                          titulo="Perfil de Eficiência vs. Benchmark Embrapa"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Histórico comparativo */}
                  <TabsContent value="historico">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm font-semibold mb-3">
                          Comparativo de Períodos ({historico.length} período{historico.length !== 1 ? "s" : ""})
                        </p>
                        <GraficoComparativo dados={historico} sistema={sistema} />
                        {historico.length < 2 && (
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            Calcule mais períodos para ver o comparativo histórico.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Simulador de cenários */}
                  <TabsContent value="simulador">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm font-semibold mb-3">
                          Simulador de Sensibilidade ao Preço
                        </p>
                        <SimuladorCenarios
                          resultado={resultado}
                          sistema={sistema}
                          precoBase={precoBase}
                          onPrecoChange={() => {}}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Detalhes por insumo */}
                  <TabsContent value="detalhes">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm font-semibold mb-3">Detalhamento por Insumo</p>
                        {resultado.detalheInsumos.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            Nenhum insumo com quantidade informada.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Insumo</TableHead>
                                <TableHead className="text-xs">Categoria</TableHead>
                                <TableHead className="text-xs text-right">Qtd Usada</TableHead>
                                <TableHead className="text-xs text-right">Custo Unit.</TableHead>
                                <TableHead className="text-xs text-right">Custo Total</TableHead>
                                <TableHead className="text-xs">% do Custo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {resultado.detalheInsumos
                                .sort((a, b) => b.custoTotal - a.custoTotal)
                                .map((d, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs font-medium">{d.nome}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground capitalize">
                                      {d.categoria.replace("_", " ")}
                                    </TableCell>
                                    <TableCell className="text-xs text-right">
                                      {d.quantidadeUsada.toFixed(1)} {d.unidade}
                                    </TableCell>
                                    <TableCell className="text-xs text-right">
                                      {fmtBRL(d.custoUnitario)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-semibold">
                                      {fmtBRL(d.custoTotal)}
                                    </TableCell>
                                    <TableCell className="text-xs w-32">
                                      <div className="flex items-center gap-1.5">
                                        <Progress
                                          value={d.percSobreCustoTotal}
                                          className="h-1.5 flex-1"
                                        />
                                        <span className="text-muted-foreground w-8 text-right">
                                          {d.percSobreCustoTotal.toFixed(0)}%
                                        </span>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>

                {/* Alertas e recomendações */}
                {(resultado.alertas.length > 0 || resultado.recomendacoes.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {resultado.alertas.length > 0 && (
                      <Card className="border-red-200 bg-red-50">
                        <CardContent className="pt-3 pb-3">
                          <p className="text-xs font-semibold text-red-800 flex items-center gap-1 mb-2">
                            <AlertTriangle className="h-3.5 w-3.5" /> Alertas
                          </p>
                          <ul className="space-y-1">
                            {resultado.alertas.map((a, i) => (
                              <li key={i} className="text-xs text-red-700 flex gap-1.5">
                                <span className="shrink-0">•</span> {a}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    {resultado.recomendacoes.length > 0 && (
                      <Card className="border-blue-200 bg-blue-50">
                        <CardContent className="pt-3 pb-3">
                          <p className="text-xs font-semibold text-blue-800 flex items-center gap-1 mb-2">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Recomendações
                          </p>
                          <ul className="space-y-1">
                            {resultado.recomendacoes.map((r, i) => (
                              <li key={i} className="text-xs text-blue-700 flex gap-1.5">
                                <span className="shrink-0">•</span> {r}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Estado vazio */
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                  <BarChart3 className="h-12 w-12 text-muted-foreground/40" />
                  <p className="text-base font-semibold text-muted-foreground">
                    Configure o rebanho e clique em Calcular
                  </p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Adicione os insumos consumidos no período, informe os dados do rebanho
                    e clique em <strong>Calcular</strong> para ver o dashboard completo.
                  </p>
                  <Button onClick={calcular} className="gap-1.5 mt-2">
                    <RefreshCw className="h-4 w-4" /> Calcular agora
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Rodapé de fontes */}
        <div className="text-xs text-muted-foreground border-t pt-3 flex flex-wrap gap-x-4 gap-y-1">
          <span>Fontes técnicas:</span>
          <span>Embrapa BR-CORTE (Confinamento)</span>
          <span>·</span>
          <span>Embrapa PSP Leite</span>
          <span>·</span>
          <span>EPAGRI (CUP)</span>
          <span>·</span>
          <span>CEPEA/Esalq — Boi Gordo SP</span>
          <span>·</span>
          <span>Scot Consultoria</span>
        </div>
      </div>
    </div>
  );
}
