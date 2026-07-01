import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CustoChart } from "@/components/insumos/CustoChart";
import { RelatorioCustoCategoria } from "@/components/insumos/RelatorioCustoCategoria";
import { fmtBRL, calcularValorTotalEstoque } from "@/lib/custoCalculo";
import {
  Banknote,
  TrendingUp,
  Package,
  AlertTriangle,
  RefreshCw,
  BarChart2,
  DollarSign,
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";

export default function AnaliseCustos() {
  const { imovelId } = useRuralAuth();
  const [insumoSelecionado, setInsumoSelecionado] = useState<number | undefined>(undefined);

  // ── Lista de insumos ──────────────────────────────────────────────────────
  const { data: insumos = [], isLoading: loadingInsumos, refetch } = trpc.railway.insumos.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );

  // ── Detalhe do insumo selecionado (movimentações para o gráfico) ──────────
  const { data: detalheInsumo, isLoading: loadingDetalhe } = trpc.railway.insumoDetalhe.useQuery(
    { imovelId: imovelId!, insumoId: insumoSelecionado! },
    { enabled: !!imovelId && !!insumoSelecionado }
  );

  const movimentacoesDetalhe: any[] = (detalheInsumo as any)?.movimentacoes ?? [];

  // ── Estatísticas ──────────────────────────────────────────────────────────
  const insumosComCusto = (insumos as any[]).filter((i) => (i.custo_medio ?? i.preco_estimado) != null && (i.custo_medio ?? i.preco_estimado) > 0);

  const valorTotalEstoque = (insumos as any[]).reduce((acc, i) => {
    const vt = i.valor_total_estoque ?? calcularValorTotalEstoque(
      Number(i.estoque_atual ?? 0),
      i.custo_medio ?? i.preco_estimado ?? null
    );
    return acc + (vt || 0);
  }, 0);

  const custoMedioGeral = insumosComCusto.length > 0
    ? insumosComCusto.reduce((acc: number, i: any) => acc + (i.custo_medio ?? i.preco_estimado ?? 0), 0) / insumosComCusto.length
    : 0;

  const insumosSemCusto = (insumos as any[]).length - insumosComCusto.length;

  const loading = loadingInsumos;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/insumos">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Insumos
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-green-700" /> Análise de Custos
            </h1>
            <p className="text-sm text-muted-foreground">Acompanhamento de custos de insumos</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {/* Cards de estatísticas */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Banknote className="h-3 w-3 text-emerald-600" /> Total em Estoque
              </p>
              <p className="text-xl font-bold text-emerald-700 tabular-nums">{fmtBRL(valorTotalEstoque)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{insumosComCusto.length} com custo</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-blue-600" /> Custo Médio Geral
              </p>
              <p className="text-xl font-bold text-blue-700 tabular-nums">{fmtBRL(custoMedioGeral)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">por unidade</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Package className="h-3 w-3" /> Insumos
              </p>
              <p className="text-xl font-bold">{(insumos as any[]).length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{insumosSemCusto} sem custo</p>
            </CardContent>
          </Card>

          <Card className={insumosSemCusto > 0 ? "border-amber-200 bg-amber-50" : ""}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-600" /> Sem Custo
              </p>
              <p className="text-xl font-bold text-amber-700 tabular-nums">{insumosSemCusto}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(insumos as any[]).length > 0 ? `${((insumosSemCusto / (insumos as any[]).length) * 100).toFixed(0)}% do total` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico de evolução de custos */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-700" /> Evolução do Custo por Compra
            </CardTitle>
            {(insumos as any[]).length > 0 && (
              <Select
                value={insumoSelecionado?.toString() ?? ""}
                onValueChange={(v) => setInsumoSelecionado(Number(v))}
              >
                <SelectTrigger className="w-52 h-7 text-xs">
                  <SelectValue placeholder="Selecione um insumo..." />
                </SelectTrigger>
                <SelectContent>
                  {[...(insumos as any[])]
                    .sort((a, b) => a.nome.localeCompare(b.nome))
                    .map((i: any) => (
                      <SelectItem key={i.id} value={i.id.toString()}>{i.nome}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!insumoSelecionado ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
              Selecione um insumo para visualizar a evolução do custo
            </div>
          ) : loadingDetalhe ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <CustoChart movimentacoes={movimentacoesDetalhe} />
          )}
        </CardContent>
      </Card>

      {/* Relatório por categoria */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-700" /> Custo por Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <RelatorioCustoCategoria insumos={insumos} />
          )}
        </CardContent>
      </Card>

      {/* Top 10 insumos por valor em estoque */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Banknote className="h-4 w-4 text-green-700" /> Top 10 — Maior Valor em Estoque
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground uppercase">#</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground uppercase">Insumo</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground uppercase hidden sm:table-cell">Estoque</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground uppercase hidden sm:table-cell">Custo Médio</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground uppercase">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...insumos]
                    .map((i: any) => ({
                      ...i,
                      _valorTotal: i.valor_total_estoque ?? calcularValorTotalEstoque(
                        Number(i.estoque_atual ?? 0),
                        i.custo_medio ?? i.preco_estimado ?? null
                      ),
                    }))
                    .filter((i) => i._valorTotal > 0)
                    .sort((a, b) => b._valorTotal - a._valorTotal)
                    .slice(0, 10)
                    .map((i, idx) => (
                      <tr key={i.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium">
                          <div>{i.nome}</div>
                          <div className="text-xs text-muted-foreground">{i.categoria}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground hidden sm:table-cell">
                          {Number(i.estoque_atual ?? 0).toFixed(1)} {i.unidade}
                        </td>
                        <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                          {fmtBRL(i.custo_medio ?? i.preco_estimado ?? null)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                          {fmtBRL(i._valorTotal)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {insumos.filter((i: any) => (i.valor_total_estoque ?? 0) > 0 || ((i.custo_medio ?? i.preco_estimado ?? 0) > 0 && (i.estoque_atual ?? 0) > 0)).length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum insumo com custo cadastrado. Registre o valor unitário nas movimentações de compra.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
