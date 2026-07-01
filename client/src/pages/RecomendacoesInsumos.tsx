import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Info,
  BookOpen,
  TrendingUp,
  Package,
  RefreshCw,
} from "lucide-react";
import {
  calculadora,
  type ConfiguracaoProducao,
  type ConfiguracaoRegional,
  type RecomendacaoInsumo,
  type TipoAnimal,
  type CategoriaAnimal,
  type TipoRegiao,
  type Estacao,
  type TipoSolo,
  TIPO_ANIMAL_LABELS,
  CATEGORIA_ANIMAL_LABELS,
  REGIAO_LABELS,
  FONTE_LABELS,
  getStatusColor,
  getStatusBg,
  getStatusLabel,
} from "@/lib/recomendacaoInsumos";
import { fmtBRL } from "@/lib/custoCalculo";
import { GraficoRecomendacoes } from "@/components/insumos/GraficoRecomendacoes";

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_PRODUCAO: ConfiguracaoProducao = {
  tipoAnimal: "bovino_corte",
  cabeca: 50,
  categoriaAnimal: "vaca",
  pesoMedio: 400,
};

const DEFAULT_REGIONAL: ConfiguracaoRegional = {
  regiao: "Centro-Oeste",
  estacaoAtual: "seca",
  tipoSolo: "misto",
};

// ── Componente principal ───────────────────────────────────────────────────────

export default function RecomendacoesInsumos() {
  const { imovelId } = useRuralAuth();

  const { data: insumosRaw = [], isLoading } = trpc.railway.insumos.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );

  const insumos = insumosRaw as any[];

  const [configProducao, setConfigProducao] =
    useState<ConfiguracaoProducao>(DEFAULT_PRODUCAO);
  const [configRegional, setConfigRegional] =
    useState<ConfiguracaoRegional>(DEFAULT_REGIONAL);
  const [calculado, setCalculado] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "critico" | "atencao" | "ok">("todos");

  // ── Cálculo ──────────────────────────────────────────────────────────────────

  const recomendacoes: RecomendacaoInsumo[] = useMemo(() => {
    if (!calculado || insumos.length === 0) return [];
    return insumos
      .filter((ins: any) => ins.estoque_atual !== undefined)
      .map((ins: any) =>
        calculadora.calcularRecomendacao(
          {
            id: ins.id,
            nome: ins.nome,
            categoria: ins.categoria,
            unidade: ins.unidade,
            estoque_atual: Number(ins.estoque_atual ?? 0),
            preco_estimado: ins.preco_estimado ? Number(ins.preco_estimado) : undefined,
            custo_medio: ins.custo_medio ? Number(ins.custo_medio) : undefined,
          },
          configProducao,
          configRegional
        )
      );
  }, [calculado, insumos, configProducao, configRegional]);

  // ── Estatísticas ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const criticos = recomendacoes.filter((r) => r.status === "critico").length;
    const atencao = recomendacoes.filter((r) => r.status === "atencao").length;
    const ok = recomendacoes.filter((r) => r.status === "ok").length;
    const custoTotal = recomendacoes.reduce((s, r) => s + r.custoEstimado, 0);
    return { criticos, atencao, ok, custoTotal };
  }, [recomendacoes]);

  // ── Filtro ───────────────────────────────────────────────────────────────────

  const recomendacoesFiltradas = useMemo(() => {
    if (filtroStatus === "todos") return recomendacoes;
    return recomendacoes.filter((r) => r.status === filtroStatus);
  }, [recomendacoes, filtroStatus]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleCalcular() {
    setCalculado(true);
  }

  function handleRecalcular() {
    setCalculado(false);
    setTimeout(() => setCalculado(true), 50);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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
              <Calculator className="h-6 w-6 text-primary" />
              Recomendações de Insumos
            </h1>
            <p className="text-sm text-muted-foreground">
              Cálculo baseado em Embrapa · Senar · UFV · EPAMIG
            </p>
          </div>
        </div>
        {calculado && (
          <Button variant="outline" size="sm" onClick={handleRecalcular} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Recalcular
          </Button>
        )}
      </div>

      {/* Configuração */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Configuração do Rebanho e Região
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Tipo de animal */}
            <div className="space-y-1.5">
              <Label className="text-xs">Espécie</Label>
              <Select
                value={configProducao.tipoAnimal}
                onValueChange={(v) =>
                  setConfigProducao((p) => ({ ...p, tipoAnimal: v as TipoAnimal }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_ANIMAL_LABELS) as TipoAnimal[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TIPO_ANIMAL_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={configProducao.categoriaAnimal}
                onValueChange={(v) =>
                  setConfigProducao((p) => ({ ...p, categoriaAnimal: v as CategoriaAnimal }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORIA_ANIMAL_LABELS) as CategoriaAnimal[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CATEGORIA_ANIMAL_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Número de cabeças */}
            <div className="space-y-1.5">
              <Label className="text-xs">Nº de Cabeças</Label>
              <Input
                type="number"
                min={1}
                max={99999}
                value={configProducao.cabeca}
                onChange={(e) =>
                  setConfigProducao((p) => ({
                    ...p,
                    cabeca: Math.max(1, Number(e.target.value)),
                  }))
                }
                className="h-9 text-sm"
              />
            </div>

            {/* Peso médio */}
            <div className="space-y-1.5">
              <Label className="text-xs">Peso Médio (kg)</Label>
              <Input
                type="number"
                min={1}
                max={9999}
                value={configProducao.pesoMedio}
                onChange={(e) =>
                  setConfigProducao((p) => ({
                    ...p,
                    pesoMedio: Math.max(1, Number(e.target.value)),
                  }))
                }
                className="h-9 text-sm"
              />
            </div>

            {/* Região */}
            <div className="space-y-1.5">
              <Label className="text-xs">Região</Label>
              <Select
                value={configRegional.regiao}
                onValueChange={(v) =>
                  setConfigRegional((p) => ({ ...p, regiao: v as TipoRegiao }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REGIAO_LABELS) as TipoRegiao[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {REGIAO_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estação */}
            <div className="space-y-1.5">
              <Label className="text-xs">Estação Atual</Label>
              <Select
                value={configRegional.estacaoAtual}
                onValueChange={(v) =>
                  setConfigRegional((p) => ({ ...p, estacaoAtual: v as Estacao }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seca">Seca</SelectItem>
                  <SelectItem value="chuvosa">Chuvosa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de solo */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Solo</Label>
              <Select
                value={configRegional.tipoSolo}
                onValueChange={(v) =>
                  setConfigRegional((p) => ({ ...p, tipoSolo: v as TipoSolo }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="argiloso">Argiloso</SelectItem>
                  <SelectItem value="arenoso">Arenoso</SelectItem>
                  <SelectItem value="misto">Misto</SelectItem>
                  <SelectItem value="organico">Orgânico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botão calcular */}
            <div className="flex items-end">
              <Button
                className="w-full h-9 gap-1.5"
                onClick={handleCalcular}
                disabled={isLoading || insumos.length === 0}
              >
                <Calculator className="h-4 w-4" />
                {calculado ? "Atualizar" : "Calcular"}
              </Button>
            </div>
          </div>

          {insumos.length === 0 && !isLoading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0" />
              Nenhum insumo cadastrado. Cadastre insumos na página de Insumos para usar a calculadora.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {/* Resultados */}
      {calculado && recomendacoes.length > 0 && (
        <>
          {/* Cards de estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-medium text-red-700">Críticos</span>
                </div>
                <p className="text-3xl font-bold text-red-700">{stats.criticos}</p>
                <p className="text-xs text-red-600 mt-0.5">insumos abaixo de 60%</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">Atenção</span>
                </div>
                <p className="text-3xl font-bold text-amber-700">{stats.atencao}</p>
                <p className="text-xs text-amber-600 mt-0.5">insumos entre 60–90%</p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700">OK</span>
                </div>
                <p className="text-3xl font-bold text-green-700">{stats.ok}</p>
                <p className="text-xs text-green-600 mt-0.5">insumos acima de 90%</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Custo p/ Repor</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{fmtBRL(stats.custoTotal)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">estimativa para nível ideal</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Cobertura de Estoque vs. Recomendação (%)
                <span className="text-xs font-normal text-muted-foreground">
                  — ordenado por criticidade
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GraficoRecomendacoes recomendacoes={recomendacoes} />
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-green-600" /> OK ≥ 90%
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> Atenção 60–90%
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-600" /> Crítico &lt; 60%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Tabela detalhada */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold">
                  Detalhamento por Insumo
                </CardTitle>
                <div className="flex gap-1.5">
                  {(["todos", "critico", "atencao", "ok"] as const).map((s) => (
                    <Button
                      key={s}
                      variant={filtroStatus === s ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setFiltroStatus(s)}
                    >
                      {s === "todos"
                        ? `Todos (${recomendacoes.length})`
                        : s === "critico"
                        ? `Crítico (${stats.criticos})`
                        : s === "atencao"
                        ? `Atenção (${stats.atencao})`
                        : `OK (${stats.ok})`}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Insumo
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Atual
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Recomendado
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Mínimo
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Cobertura
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Status
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Custo Estimado
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Base de Cálculo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recomendacoesFiltradas
                      .sort((a, b) => a.percentualCobertura - b.percentualCobertura)
                      .map((rec) => (
                        <tr
                          key={rec.insumoId}
                          className="border-b hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{rec.nome}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {rec.categoria.replace(/_/g, " ")}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {rec.quantidadeAtual.toFixed(1)}{" "}
                            <span className="text-xs text-muted-foreground">{rec.unidade}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-green-700">
                            {rec.quantidadeIdeal.toFixed(1)}{" "}
                            <span className="text-xs text-muted-foreground">{rec.unidade}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-amber-600">
                            {rec.quantidadeMinima.toFixed(1)}{" "}
                            <span className="text-xs text-muted-foreground">{rec.unidade}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    rec.status === "ok"
                                      ? "bg-green-500"
                                      : rec.status === "atencao"
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(rec.percentualCobertura * 100, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className={`text-xs font-bold ${getStatusColor(rec.status)}`}>
                                {(rec.percentualCobertura * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getStatusBg(rec.status)} ${getStatusColor(rec.status)} border`}
                            >
                              {getStatusLabel(rec.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {rec.custoEstimado > 0 ? fmtBRL(rec.custoEstimado) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px]">
                            <span title={rec.baseCalculo}>
                              {rec.baseCalculo.length > 50
                                ? rec.baseCalculo.slice(0, 48) + "…"
                                : rec.baseCalculo}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {recomendacoesFiltradas.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum insumo com status "{filtroStatus}".
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fontes técnicas */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> Fontes Técnicas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["embrapa", "senar", "ufv", "epamig"] as const).map((fonte) => (
                  <div
                    key={fonte}
                    className="rounded-lg border bg-background p-3 text-xs space-y-1"
                  >
                    <p className="font-semibold text-sm">{FONTE_LABELS[fonte]}</p>
                    {fonte === "embrapa" && (
                      <p className="text-muted-foreground">
                        Tabela de Exigências Nutricionais · Recomendação de Suplementação Mineral · Calendário Sanitário
                      </p>
                    )}
                    {fonte === "senar" && (
                      <p className="text-muted-foreground">
                        Boas Práticas de Gestão de Insumos · Boas Práticas Agrícolas
                      </p>
                    )}
                    {fonte === "ufv" && (
                      <p className="text-muted-foreground">
                        Sistema BR-CORTE · BR-LEITE · Programa Sanitário
                      </p>
                    )}
                    {fonte === "epamig" && (
                      <p className="text-muted-foreground">
                        Análise de Pastagem e Solo · Fatores Regionais
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Os cálculos são estimativas baseadas em recomendações técnicas. Consulte um agrônomo ou zootecnista para ajustes específicos à sua propriedade.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* Estado vazio */}
      {!calculado && !isLoading && insumos.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Calculator className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-semibold text-muted-foreground">
            Configure o rebanho e clique em Calcular
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            A calculadora compara o estoque atual de cada insumo com a quantidade recomendada
            pelas normas técnicas da Embrapa, Senar e UFV para o seu tipo de rebanho e região.
          </p>
        </div>
      )}
    </div>
  );
}
