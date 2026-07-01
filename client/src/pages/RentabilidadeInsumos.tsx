import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Scale,
  Beef,
  Milk,
  AlertTriangle,
  CheckCircle2,
  Info,
  BarChart2,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  calculadoraRentabilidade,
  type EntradaCorte,
  type EntradaLeite,
  type EntradaCustoInsumo,
  type ResultadoCorte,
  type ResultadoLeite,
  type DetalheInsumo,
  SISTEMA_LABELS,
  COTACAO_REFERENCIA,
  getMargemColor,
  getViabilidadeBg,
  getViabilidadeColor,
} from "@/lib/rentabilidadeInsumos";
import { fmtBRL } from "@/lib/custoCalculo";

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_CORTE: Omit<EntradaCorte, "insumos" | "sistema"> = {
  numeroAnimais: 50,
  pesoInicialMedio: 300,
  pesoFinalMedio: 480,
  periodoDias: 90,
  outrosCustos: 5000,
  precoArrobaVenda: COTACAO_REFERENCIA.boiGordoSP,
  rendimentoCarcaca: 52,
};

const DEFAULT_LEITE: Omit<EntradaLeite, "insumos" | "sistema"> = {
  vacasLactacao: 30,
  producaoTotalLitros: 18000,
  periodoDias: 30,
  outrosCustos: 3000,
  precoLeiteLitro: COTACAO_REFERENCIA.leiteMedioNacional,
};

// ── Tooltip customizado ────────────────────────────────────────────────────────

const TooltipInsumo = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as DetalheInsumo;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs max-w-xs">
      <p className="font-semibold text-sm mb-1">{d.nome}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Custo total:</span>
          <span className="font-bold">{fmtBRL(d.custoTotal)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">% do custo:</span>
          <span className="font-medium">{d.percSobreCustoTotal.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Qtd. usada:</span>
          <span className="font-medium">
            {d.quantidadeUsada.toFixed(1)} {d.unidade}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Custo unitário:</span>
          <span className="font-medium">{fmtBRL(d.custoUnitario)}</span>
        </div>
      </div>
    </div>
  );
};

// ── Componente principal ───────────────────────────────────────────────────────

export default function RentabilidadeInsumos() {
  const { imovelId } = useRuralAuth();

  const { data: insumosRaw = [], isLoading } = trpc.railway.insumos.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );

  const insumos = insumosRaw as any[];

  const [sistema, setSistema] = useState<"corte" | "leite">("corte");
  const [corteForm, setCorteForm] = useState(DEFAULT_CORTE);
  const [leiteForm, setLeiteForm] = useState(DEFAULT_LEITE);
  const [calculado, setCalculado] = useState(false);

  // ── Mapeamento insumos → EntradaCustoInsumo ──────────────────────────────────
  // Usa quantidadeUsada = estoque_atual como proxy do consumo no período
  // (o usuário pode ajustar via outrosCustos para custos não mapeados)
  const insumosEntrada: EntradaCustoInsumo[] = useMemo(
    () =>
      insumos
        .filter((i: any) => Number(i.estoque_atual ?? 0) > 0)
        .map((i: any) => ({
          nome: i.nome,
          categoria: i.categoria ?? "outros",
          quantidadeUsada: Number(i.estoque_atual ?? 0),
          unidade: i.unidade ?? "un",
          custoUnitario: Number(i.custo_medio ?? i.preco_estimado ?? 0),
        })),
    [insumos]
  );

  // ── Cálculo ──────────────────────────────────────────────────────────────────

  const resultadoCorte: ResultadoCorte | null = useMemo(() => {
    if (!calculado || sistema !== "corte") return null;
    return calculadoraRentabilidade.calcularCorte({
      sistema: "corte",
      ...corteForm,
      insumos: insumosEntrada,
    });
  }, [calculado, sistema, corteForm, insumosEntrada]);

  const resultadoLeite: ResultadoLeite | null = useMemo(() => {
    if (!calculado || sistema !== "leite") return null;
    return calculadoraRentabilidade.calcularLeite({
      sistema: "leite",
      ...leiteForm,
      insumos: insumosEntrada,
    });
  }, [calculado, sistema, leiteForm, insumosEntrada]);

  const resultado = sistema === "corte" ? resultadoCorte : resultadoLeite;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCalcular() {
    setCalculado(true);
  }

  function handleRecalcular() {
    setCalculado(false);
    setTimeout(() => setCalculado(true), 50);
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderFormCorte() {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Nº de Animais</Label>
          <Input
            type="number" min={1}
            value={corteForm.numeroAnimais}
            onChange={(e) => setCorteForm((p) => ({ ...p, numeroAnimais: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Peso Inicial Médio (kg)</Label>
          <Input
            type="number" min={1}
            value={corteForm.pesoInicialMedio}
            onChange={(e) => setCorteForm((p) => ({ ...p, pesoInicialMedio: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Peso Final Médio (kg)</Label>
          <Input
            type="number" min={1}
            value={corteForm.pesoFinalMedio}
            onChange={(e) => setCorteForm((p) => ({ ...p, pesoFinalMedio: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Período (dias)</Label>
          <Input
            type="number" min={1}
            value={corteForm.periodoDias}
            onChange={(e) => setCorteForm((p) => ({ ...p, periodoDias: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Preço da Arroba (R$/@)</Label>
          <Input
            type="number" min={0} step={0.01}
            value={corteForm.precoArrobaVenda}
            onChange={(e) => setCorteForm((p) => ({ ...p, precoArrobaVenda: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Rendimento de Carcaça (%)</Label>
          <Input
            type="number" min={40} max={65}
            value={corteForm.rendimentoCarcaca}
            onChange={(e) => setCorteForm((p) => ({ ...p, rendimentoCarcaca: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Outros Custos do Período (R$)</Label>
          <Input
            type="number" min={0} step={100}
            value={corteForm.outrosCustos}
            onChange={(e) => setCorteForm((p) => ({ ...p, outrosCustos: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button className="w-full h-9 gap-1.5" onClick={handleCalcular} disabled={isLoading}>
            <BarChart2 className="h-4 w-4" />
            {calculado ? "Atualizar" : "Calcular"}
          </Button>
        </div>
      </div>
    );
  }

  function renderFormLeite() {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Vacas em Lactação</Label>
          <Input
            type="number" min={1}
            value={leiteForm.vacasLactacao}
            onChange={(e) => setLeiteForm((p) => ({ ...p, vacasLactacao: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Produção Total (litros)</Label>
          <Input
            type="number" min={1}
            value={leiteForm.producaoTotalLitros}
            onChange={(e) => setLeiteForm((p) => ({ ...p, producaoTotalLitros: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Período (dias)</Label>
          <Input
            type="number" min={1}
            value={leiteForm.periodoDias}
            onChange={(e) => setLeiteForm((p) => ({ ...p, periodoDias: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Preço do Leite (R$/litro)</Label>
          <Input
            type="number" min={0} step={0.01}
            value={leiteForm.precoLeiteLitro}
            onChange={(e) => setLeiteForm((p) => ({ ...p, precoLeiteLitro: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Outros Custos do Período (R$)</Label>
          <Input
            type="number" min={0} step={100}
            value={leiteForm.outrosCustos}
            onChange={(e) => setLeiteForm((p) => ({ ...p, outrosCustos: Number(e.target.value) }))}
            className="h-9 text-sm"
          />
        </div>
        <div className="flex items-end col-span-2">
          <Button className="w-full h-9 gap-1.5" onClick={handleCalcular} disabled={isLoading}>
            <BarChart2 className="h-4 w-4" />
            {calculado ? "Atualizar" : "Calcular"}
          </Button>
        </div>
      </div>
    );
  }

  function renderResultadoCorte(r: ResultadoCorte) {
    return (
      <div className="space-y-6">
        {/* Alertas */}
        {r.alertas.length > 0 && (
          <div className="space-y-2">
            {r.alertas.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span className="text-red-700">{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* Cards principais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={`border ${getViabilidadeBg(r.viavel)}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                {r.viavel
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <AlertTriangle className="h-4 w-4 text-red-600" />}
                <span className={`text-xs font-medium ${getViabilidadeColor(r.viavel)}`}>
                  {r.viavel ? "Operação Viável" : "Operação Deficitária"}
                </span>
              </div>
              <p className={`text-2xl font-bold ${getMargemColor(r.margemBrutaPerc)}`}>
                {r.margemBrutaPerc.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">margem bruta</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Custo por @</span>
              </div>
              <p className="text-2xl font-bold">{fmtBRL(r.custoPorArroba)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                PE: {fmtBRL(r.pontoEquilibrio)}/@ · Venda: {fmtBRL(corteForm.precoArrobaVenda)}/@
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">GMD</span>
              </div>
              <p className="text-2xl font-bold">{r.ganhoPesoMedioDiario.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                kg/animal/dia · CA: {r.conversaoAlimentar.toFixed(1)} kg/kg
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Margem Bruta</span>
              </div>
              <p className={`text-2xl font-bold ${getMargemColor(r.margemBrutaPerc)}`}>
                {fmtBRL(r.margemBruta)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtBRL(r.lucroPorAnimal)}/animal
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Resumo financeiro */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumo Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["Receita estimada", fmtBRL(r.receitaTotalEstimada), "text-green-700"],
                ["Custo de insumos", fmtBRL(r.custoTotalPeriodo - corteForm.outrosCustos), ""],
                ["Outros custos", fmtBRL(corteForm.outrosCustos), ""],
                ["Custo total", fmtBRL(r.custoTotalPeriodo), "font-bold"],
                ["Margem bruta", fmtBRL(r.margemBruta), r.margemBruta >= 0 ? "font-bold text-green-700" : "font-bold text-red-700"],
              ].map(([label, valor, cls]) => (
                <div key={label as string} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={cls as string}>{valor}</span>
                </div>
              ))}
              <Separator />
              {[
                ["Arrobas produzidas", `${r.totalArrobasProduzidasAt.toFixed(1)} @`],
                ["Ganho de peso total", `${r.ganhoPesoTotalKg.toFixed(0)} kg`],
                ["Custo por kg ganho", fmtBRL(r.custoPorKgGanho)],
                ["Custo por animal", fmtBRL(r.custoPorAnimal)],
                ["Ponto de equilíbrio", `${fmtBRL(r.pontoEquilibrio)}/@`],
              ].map(([label, valor]) => (
                <div key={label as string} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{valor}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Gráfico de composição de custos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Composição dos Custos por Insumo</CardTitle>
            </CardHeader>
            <CardContent>
              {r.detalheInsumos.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={r.detalheInsumos.slice(0, 8).map((d) => ({
                      ...d,
                      nomeAbrev: d.nome.length > 14 ? d.nome.slice(0, 12) + "…" : d.nome,
                    }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 50 }}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="nomeAbrev" tick={{ fontSize: 9, fill: "#6b7280" }} angle={-35} textAnchor="end" interval={0} tickLine={false} />
                    <YAxis tickFormatter={(v) => fmtBRL(v).replace("R$\u00a0", "R$")} tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipInsumo />} />
                    <Bar dataKey="custoTotal" radius={[3, 3, 0, 0]}>
                      {r.detalheInsumos.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={`hsl(${220 + i * 18}, 65%, ${52 - i * 4}%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                  Nenhum insumo com custo registrado.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabela de insumos */}
        {r.detalheInsumos.length > 0 && renderTabelaInsumos(r.detalheInsumos)}

        {/* Recomendações */}
        {r.recomendacoes.length > 0 && renderRecomendacoes(r.recomendacoes)}
      </div>
    );
  }

  function renderResultadoLeite(r: ResultadoLeite) {
    return (
      <div className="space-y-6">
        {/* Alertas */}
        {r.alertas.length > 0 && (
          <div className="space-y-2">
            {r.alertas.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span className="text-red-700">{a}</span>
              </div>
            ))}
          </div>
        )}

        {/* Cards principais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={`border ${getViabilidadeBg(r.viavel)}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                {r.viavel
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <AlertTriangle className="h-4 w-4 text-red-600" />}
                <span className={`text-xs font-medium ${getViabilidadeColor(r.viavel)}`}>
                  {r.viavel ? "Operação Viável" : "Operação Deficitária"}
                </span>
              </div>
              <p className={`text-2xl font-bold ${getMargemColor(r.margemBrutaPerc)}`}>
                {r.margemBrutaPerc.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">margem bruta</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Milk className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">CUP por Litro</span>
              </div>
              <p className="text-2xl font-bold">{fmtBRL(r.custoPorLitro)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Alimentar: {fmtBRL(r.custoAlimentarPorLitro)}/L · PE: {fmtBRL(r.pontoEquilibrio)}/L
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Produtividade</span>
              </div>
              <p className="text-2xl font-bold">{r.producaoMediaDiariaVaca.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                L/vaca/dia · Total: {r.producaoTotalLitros.toLocaleString("pt-BR")} L
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Margem Bruta</span>
              </div>
              <p className={`text-2xl font-bold ${getMargemColor(r.margemBrutaPerc)}`}>
                {fmtBRL(r.margemBruta)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtBRL(r.lucroPorVaca)}/vaca
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Resumo financeiro */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumo Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["Receita estimada", fmtBRL(r.receitaTotalEstimada), "text-green-700"],
                ["Custo de insumos", fmtBRL(r.custoTotalPeriodo - leiteForm.outrosCustos), ""],
                ["Outros custos", fmtBRL(leiteForm.outrosCustos), ""],
                ["Custo total", fmtBRL(r.custoTotalPeriodo), "font-bold"],
                ["Margem bruta", fmtBRL(r.margemBruta), r.margemBruta >= 0 ? "font-bold text-green-700" : "font-bold text-red-700"],
              ].map(([label, valor, cls]) => (
                <div key={label as string} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={cls as string}>{valor}</span>
                </div>
              ))}
              <Separator />
              {[
                ["Custo alimentar/litro", fmtBRL(r.custoAlimentarPorLitro)],
                ["CUP total/litro", fmtBRL(r.custoPorLitro)],
                ["Custo por vaca", fmtBRL(r.custoPorVaca)],
                ["Ponto de equilíbrio", `${fmtBRL(r.pontoEquilibrio)}/L`],
              ].map(([label, valor]) => (
                <div key={label as string} className="flex justify-between items-center">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{valor}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Gráfico */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Composição dos Custos por Insumo</CardTitle>
            </CardHeader>
            <CardContent>
              {r.detalheInsumos.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={r.detalheInsumos.slice(0, 8).map((d) => ({
                      ...d,
                      nomeAbrev: d.nome.length > 14 ? d.nome.slice(0, 12) + "…" : d.nome,
                    }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 50 }}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="nomeAbrev" tick={{ fontSize: 9, fill: "#6b7280" }} angle={-35} textAnchor="end" interval={0} tickLine={false} />
                    <YAxis tickFormatter={(v) => fmtBRL(v).replace("R$\u00a0", "R$")} tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipInsumo />} />
                    <Bar dataKey="custoTotal" radius={[3, 3, 0, 0]}>
                      {r.detalheInsumos.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={`hsl(${160 + i * 20}, 60%, ${48 - i * 3}%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                  Nenhum insumo com custo registrado.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {r.detalheInsumos.length > 0 && renderTabelaInsumos(r.detalheInsumos)}
        {r.recomendacoes.length > 0 && renderRecomendacoes(r.recomendacoes)}
      </div>
    );
  }

  function renderTabelaInsumos(detalhe: DetalheInsumo[]) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Detalhamento de Custos por Insumo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["Insumo", "Qtd. Usada", "Custo Unit.", "Custo Total", "% do Custo", "Participação"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide first:text-left last:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalhe.map((d) => (
                  <tr key={d.nome} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{d.nome}</div>
                      <div className="text-xs text-muted-foreground capitalize">{d.categoria.replace(/_/g, " ")}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {d.quantidadeUsada.toFixed(1)} <span className="text-xs text-muted-foreground">{d.unidade}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">{fmtBRL(d.custoUnitario)}</td>
                    <td className="px-4 py-2.5 text-right font-bold">{fmtBRL(d.custoTotal)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{d.percSobreCustoTotal.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 w-32">
                      <Progress value={Math.min(d.percSobreCustoTotal, 100)} className="h-1.5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderRecomendacoes(recs: string[]) {
    return (
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
            <Info className="h-4 w-4" /> Recomendações Técnicas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recs.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-blue-700">
              <span className="shrink-0 mt-0.5 font-bold">{i + 1}.</span>
              <span>{r}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // ── JSX principal ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/insumos">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Insumos
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Rentabilidade de Insumos
            </h1>
            <p className="text-sm text-muted-foreground">
              Custo Unitário de Produção (CUP) · Metodologia Embrapa / EPAGRI / CEPEA
            </p>
          </div>
        </div>
        {calculado && (
          <Button variant="outline" size="sm" onClick={handleRecalcular} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Recalcular
          </Button>
        )}
      </div>

      {/* Cotação de referência */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Cotação de referência CEPEA/Scot (30/06/2026): Boi Gordo SP —{" "}
        <strong>{fmtBRL(COTACAO_REFERENCIA.boiGordoSP)}/@</strong> · Leite médio nacional —{" "}
        <strong>{fmtBRL(COTACAO_REFERENCIA.leiteMedioNacional)}/L</strong>. Ajuste os preços de venda conforme sua região.
      </div>

      {/* Configuração */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Configuração da Análise</CardTitle>
            <div className="flex gap-1.5">
              <Button
                variant={sistema === "corte" ? "default" : "outline"}
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => { setSistema("corte"); setCalculado(false); }}
              >
                <Beef className="h-3.5 w-3.5" /> Corte
              </Button>
              <Button
                variant={sistema === "leite" ? "default" : "outline"}
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => { setSistema("leite"); setCalculado(false); }}
              >
                <Milk className="h-3.5 w-3.5" /> Leite
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sistema === "corte" ? renderFormCorte() : renderFormLeite()}

          {insumos.length === 0 && !isLoading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Nenhum insumo cadastrado com estoque. Os custos de insumos serão zero. Cadastre insumos na página de Insumos.
            </div>
          )}

          {isLoading && (
            <div className="mt-3">
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultados */}
      {calculado && resultado && (
        <>
          {sistema === "corte" && resultadoCorte && renderResultadoCorte(resultadoCorte)}
          {sistema === "leite" && resultadoLeite && renderResultadoLeite(resultadoLeite)}
        </>
      )}

      {/* Estado vazio */}
      {!calculado && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <TrendingUp className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-semibold text-muted-foreground">
            Selecione o sistema de produção e clique em Calcular
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            A análise calcula o Custo Unitário de Produção (CUP), Ganho Médio Diário (GMD),
            Conversão Alimentar (CA) e Margem Bruta, comparando com as cotações de mercado CEPEA/Scot.
          </p>
        </div>
      )}

      {/* Fontes */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Metodologia e Fontes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {[
              { fonte: "Embrapa", desc: "PSP Leite · BR-CORTE · Tabela de Exigências Nutricionais" },
              { fonte: "EPAGRI", desc: "Custo de Produção por Unidade · Análise de Viabilidade" },
              { fonte: "CEPEA/Esalq", desc: "Cotação do Boi Gordo · Índices de Preço do Leite" },
              { fonte: "Scot Consultoria", desc: "Referência de preço da arroba por estado" },
            ].map((f) => (
              <div key={f.fonte} className="rounded-lg border bg-background p-3 space-y-1">
                <p className="font-semibold text-sm">{f.fonte}</p>
                <p className="text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Os cálculos são estimativas baseadas em metodologias técnicas publicadas. Os valores de cotação são referências e devem ser ajustados conforme o preço praticado na sua região. Consulte um engenheiro agrônomo ou zootecnista para análise específica.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
