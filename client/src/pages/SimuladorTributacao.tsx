import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Calculator, TrendingDown, TrendingUp, AlertTriangle,
  CheckCircle, RefreshCw, Trash2, BarChart3, FileText,
  Calendar, DollarSign, Info
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const TIPO_PRODUCAO_OPTS = [
  { value: "in_natura", label: "In Natura (produção rural)" },
  { value: "industrializado", label: "Industrializado" },
  { value: "comercio", label: "Comércio" },
  { value: "industria", label: "Indústria" },
  { value: "servico", label: "Serviço" },
  { value: "misto", label: "Misto" },
];

const REGIME_LABELS: Record<string, string> = {
  pf_diferenciado: "PF Diferenciado (LC 214/2024)",
  pf_lucro_real: "PF Lucro Real (IRPF)",
  pj_mei: "PJ MEI",
  pj_simples_i: "PJ Simples I (Comércio)",
  pj_simples_ii: "PJ Simples II (Indústria)",
  pj_simples_iii: "PJ Simples III (Serv. Fator R≥28%)",
  pj_simples_iv: "PJ Simples IV (Construção)",
  pj_simples_v: "PJ Simples V (Serv. Fator R<28%)",
  pj_lucro_presumido: "PJ Lucro Presumido",
  pj_lucro_real: "PJ Lucro Real",
};

function formatBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function RegimeCard({ label, valor, recomendado, economia }: {
  label: string; valor: number | null; recomendado?: boolean; economia?: number;
}) {
  if (valor === null) return null;
  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-1 ${recomendado ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {recomendado && <Badge className="bg-green-600 text-white text-xs">Recomendado</Badge>}
      </div>
      <span className="text-lg font-bold">{formatBRL(valor)}</span>
      {recomendado && economia != null && economia > 0 && (
        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
          <TrendingDown className="h-3 w-3" /> Economia de {formatBRL(economia)}/ano
        </span>
      )}
    </div>
  );
}

// ── Aba 1: Simulação Rápida ────────────────────────────────────────────────
function SimulacaoRapida() {
  const [form, setForm] = useState({
    faturamento_12m: "",
    folha_12m: "",
    despesas_12m: "",
    tipo_producao: "in_natura" as "in_natura" | "industrializado" | "servico" | "misto" | "comercio" | "industria",
    creditos_pis_cofins: "",
    jcp: "",
  });
  const [resultado, setResultado] = useState<Record<string, number | null> | null>(null);

  const simular = trpc.railway.simulacaoAvulsa.useMutation({
    onSuccess: (data) => {
      setResultado(data as Record<string, number | null>);
    },
    onError: (e) => toast.error("Erro na simulação: " + e.message),
  });

  const handleSubmit = () => {
    const fat = parseFloat(form.faturamento_12m.replace(/\./g, "").replace(",", "."));
    if (!fat || fat <= 0) { toast.error("Informe o faturamento anual"); return; }
    simular.mutate({
      faturamento_12m: fat,
      folha_12m: parseFloat(form.folha_12m.replace(/\./g, "").replace(",", ".")) || 0,
      despesas_12m: parseFloat(form.despesas_12m.replace(/\./g, "").replace(",", ".")) || 0,
      tipo_producao: form.tipo_producao,
      creditos_pis_cofins: parseFloat(form.creditos_pis_cofins.replace(/\./g, "").replace(",", ".")) || 0,
      jcp: parseFloat(form.jcp.replace(/\./g, "").replace(",", ".")) || 0,
    });
  };

  const recomendado = resultado ? (resultado as any).regime_recomendado as string : null;
  const economia = resultado ? (resultado as any).economia_anual as number : 0;
  const alertas = resultado ? (resultado as any).alertas as string[] : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-green-600" />
            Dados para Simulação
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Faturamento 12 meses (R$) *</Label>
            <Input placeholder="Ex: 500.000,00" value={form.faturamento_12m}
              onChange={e => setForm(f => ({ ...f, faturamento_12m: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Folha de pagamento 12 meses (R$)</Label>
            <Input placeholder="Ex: 120.000,00" value={form.folha_12m}
              onChange={e => setForm(f => ({ ...f, folha_12m: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Despesas dedutíveis 12 meses (R$)</Label>
            <Input placeholder="Ex: 200.000,00" value={form.despesas_12m}
              onChange={e => setForm(f => ({ ...f, despesas_12m: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Tipo de produção</Label>
            <Select value={form.tipo_producao} onValueChange={v => setForm(f => ({ ...f, tipo_producao: v as typeof form.tipo_producao }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_PRODUCAO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Créditos PIS/COFINS (R$) <span className="text-muted-foreground text-xs">— Lucro Real</span></Label>
            <Input placeholder="Ex: 15.000,00" value={form.creditos_pis_cofins}
              onChange={e => setForm(f => ({ ...f, creditos_pis_cofins: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>JCP — Juros s/ Capital Próprio (R$)</Label>
            <Input placeholder="Ex: 0,00" value={form.jcp}
              onChange={e => setForm(f => ({ ...f, jcp: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleSubmit} disabled={simular.isPending} className="w-full bg-green-700 hover:bg-green-800">
              {simular.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
              Simular todos os regimes
            </Button>
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <div className="space-y-4">
          {alertas.length > 0 && (
            <div className="flex flex-col gap-2">
              {alertas.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  {a}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(REGIME_LABELS).map(([key, label]) => {
              const val = (resultado as any)[key];
              if (val === undefined) return null;
              return (
                <RegimeCard
                  key={key}
                  label={label}
                  valor={val}
                  recomendado={recomendado === key}
                  economia={economia}
                />
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Simulação estimada com base nas alíquotas vigentes em 2024. Consulte um contador para decisões definitivas.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba 2: Competência Mensal ──────────────────────────────────────────────
function CompetenciaMensal({ imovelId }: { imovelId: number }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    competencia: new Date().toISOString().slice(0, 7),
    faturamento: "",
    folha_pagamento: "",
    despesas_dedutiveis: "",
    tipo_producao: "in_natura" as "in_natura" | "industrializado" | "servico" | "misto" | "comercio" | "industria",
    creditos_pis_cofins: "",
    jcp: "",
    observacao: "",
  });
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);

  const registrar = trpc.railway.registrarCompetencia.useMutation({
    onSuccess: (data) => {
      setResultado(data as Record<string, unknown>);
      toast.success("Competência registrada com sucesso!");
      utils.railway.listarCompetencias.invalidate({ imovelId });
      utils.railway.dashboardSimulador.invalidate({ imovelId });
    },
    onError: (e) => toast.error("Erro ao registrar: " + e.message),
  });

  const handleSubmit = () => {
    const fat = parseFloat(form.faturamento.replace(/\./g, "").replace(",", "."));
    if (!fat || fat <= 0) { toast.error("Informe o faturamento"); return; }
    registrar.mutate({
      imovelId,
      competencia: form.competencia,
      faturamento: fat,
      folha_pagamento: parseFloat(form.folha_pagamento.replace(/\./g, "").replace(",", ".")) || 0,
      despesas_dedutiveis: parseFloat(form.despesas_dedutiveis.replace(/\./g, "").replace(",", ".")) || 0,
      tipo_producao: form.tipo_producao,
      creditos_pis_cofins: parseFloat(form.creditos_pis_cofins.replace(/\./g, "").replace(",", ".")) || 0,
      jcp: parseFloat(form.jcp.replace(/\./g, "").replace(",", ".")) || 0,
      observacao: form.observacao || undefined,
    });
  };

  const calculo = resultado ? (resultado as any).calculo : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-green-600" />
            Registrar Competência Mensal
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Competência (Mês/Ano) *</Label>
            <Input type="month" value={form.competencia}
              onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Tipo de produção</Label>
            <Select value={form.tipo_producao} onValueChange={v => setForm(f => ({ ...f, tipo_producao: v as typeof form.tipo_producao }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_PRODUCAO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Faturamento do mês (R$) *</Label>
            <Input placeholder="Ex: 45.000,00" value={form.faturamento}
              onChange={e => setForm(f => ({ ...f, faturamento: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Folha de pagamento do mês (R$)</Label>
            <Input placeholder="Ex: 8.000,00" value={form.folha_pagamento}
              onChange={e => setForm(f => ({ ...f, folha_pagamento: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Despesas dedutíveis do mês (R$)</Label>
            <Input placeholder="Ex: 15.000,00" value={form.despesas_dedutiveis}
              onChange={e => setForm(f => ({ ...f, despesas_dedutiveis: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Créditos PIS/COFINS (R$)</Label>
            <Input placeholder="Ex: 0,00" value={form.creditos_pis_cofins}
              onChange={e => setForm(f => ({ ...f, creditos_pis_cofins: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>JCP (R$)</Label>
            <Input placeholder="Ex: 0,00" value={form.jcp}
              onChange={e => setForm(f => ({ ...f, jcp: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Observação</Label>
            <Input placeholder="Opcional" value={form.observacao}
              onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleSubmit} disabled={registrar.isPending} className="w-full bg-green-700 hover:bg-green-800">
              {registrar.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Registrar e Calcular
            </Button>
          </div>
        </CardContent>
      </Card>

      {calculo && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-green-800 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              Resultado — {form.competencia}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Faturamento 12m</div>
                <div className="font-bold">{formatBRL(calculo.faturamento_12m)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Fator R</div>
                <div className="font-bold">{calculo.fator_r_pct?.toFixed(1)}%</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Regime Recomendado</div>
                <div className="font-bold text-green-700">{REGIME_LABELS[calculo.regime_recomendado] ?? calculo.regime_recomendado}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Economia Estimada</div>
                <div className="font-bold text-green-700">{formatBRL(calculo.economia_anual)}/ano</div>
              </div>
            </div>
            {calculo.alertas?.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {calculo.alertas.map((a: string, i: number) => (
                  <div key={i} className="text-xs text-amber-700 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{a}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Aba 3: Histórico ───────────────────────────────────────────────────────
function Historico({ imovelId }: { imovelId: number }) {
  const utils = trpc.useUtils();
  const { data: competencias = [], isLoading } = trpc.railway.listarCompetencias.useQuery(
    { imovelId },
    { retry: false }
  );

  const deletar = trpc.railway.deletarCompetencia.useMutation({
    onSuccess: () => {
      toast.success("Competência removida");
      utils.railway.listarCompetencias.invalidate({ imovelId });
      utils.railway.dashboardSimulador.invalidate({ imovelId });
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando histórico...</div>;

  const rows = competencias as any[];

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>Nenhuma competência registrada ainda.</p>
        <p className="text-sm">Use a aba "Competência Mensal" para registrar o primeiro mês.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Competência</th>
              <th className="text-right p-3 font-medium">Faturamento</th>
              <th className="text-right p-3 font-medium">Folha</th>
              <th className="text-right p-3 font-medium">Despesas</th>
              <th className="text-center p-3 font-medium">Regime Rec.</th>
              <th className="text-right p-3 font-medium">Economia/ano</th>
              <th className="text-center p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                <td className="p-3 font-mono font-medium">{r.competencia?.slice(0, 7)}</td>
                <td className="p-3 text-right">{formatBRL(r.faturamento)}</td>
                <td className="p-3 text-right">{formatBRL(r.folha_pagamento)}</td>
                <td className="p-3 text-right">{formatBRL(r.despesas_dedutiveis)}</td>
                <td className="p-3 text-center">
                  {r.regime_recomendado ? (
                    <Badge variant="outline" className="text-xs border-green-500 text-green-700">
                      {REGIME_LABELS[r.regime_recomendado] ?? r.regime_recomendado}
                    </Badge>
                  ) : "—"}
                </td>
                <td className="p-3 text-right text-green-700 font-medium">{formatBRL(r.economia_anual)}</td>
                <td className="p-3 text-center">
                  <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0"
                    onClick={() => deletar.mutate({ imovelId, competencia: r.competencia?.slice(0, 7) })}
                    disabled={deletar.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Aba 4: Dashboard ───────────────────────────────────────────────────────
function DashboardSimulador({ imovelId }: { imovelId: number }) {
  const { data, isLoading } = trpc.railway.dashboardSimulador.useQuery(
    { imovelId },
    { retry: false }
  );

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando dashboard...</div>;

  const d = data as any;
  if (!d || !d.ultimo_calculo) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>Nenhum dado calculado ainda.</p>
        <p className="text-sm">Registre ao menos uma competência mensal para ver o dashboard.</p>
      </div>
    );
  }

  const ult = d.ultimo_calculo;
  const historico: any[] = (d.historico || []).slice().reverse();

  // Mapeamento de regime_recomendado para o campo numérico correspondente no histórico
  const REGIME_FIELD_MAP: Record<string, string> = {
    pf_diferenciado: "pf_diferenciado",
    pf_lucro_real: "pf_lucro_real",
    pj_simples_ii: "pj_simples_ii",
    pj_simples_iii: "pj_simples_iii",
    pj_simples_v: "pj_simples_v",
    pj_lucro_real: "pj_lucro_real",
  };
  const chartData = historico.map((h: any) => {
    const recField = REGIME_FIELD_MAP[h.regime_recomendado];
    const recValue = recField ? (h[recField] ?? 0) : 0;
    return {
      mes: h.competencia?.slice(0, 7),
      "PF Diferenciado": h.pf_diferenciado ?? 0,
      "PJ Simples II": h.pj_simples_ii ?? 0,
      "Recomendado": recValue,
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Faturamento 12m</div>
            <div className="text-xl font-bold mt-1">{formatBRL(ult.faturamento_12m)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Fator R</div>
            <div className="text-xl font-bold mt-1">{ult.fator_r_pct?.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Regime Recomendado</div>
            <div className="text-sm font-bold mt-1 text-green-700">
              {REGIME_LABELS[ult.regime_recomendado] ?? ult.regime_recomendado}
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Economia Estimada</div>
            <div className="text-xl font-bold mt-1 text-green-700">{formatBRL(ult.economia_anual)}/ano</div>
          </CardContent>
        </Card>
      </div>

      {d.alertas_ativos?.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas Ativos
          </h3>
          {d.alertas_ativos.map((row: any, i: number) => (
            <div key={i} className="text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-3">
              <span className="font-mono text-xs text-muted-foreground mr-2">{row.competencia?.slice(0, 7)}</span>
              {Array.isArray(row.alertas) ? row.alertas.join(" · ") : JSON.stringify(row.alertas)}
            </div>
          ))}
        </div>
      )}

      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-600" />
              Evolução dos Regimes (últimos 12 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="PF Diferenciado" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="PJ Simples II" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Recomendado" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Componente Principal ───────────────────────────────────────────────────
export default function SimuladorTributacao() {
  const { imovelId } = useRuralAuth();

  if (!imovelId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Selecione uma propriedade para usar o simulador.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-green-600" />
            Simulador de Regime Tributário
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare PF Diferenciado, PF Lucro Real, MEI, Simples Nacional, Lucro Presumido e Lucro Real PJ
          </p>
        </div>
        <Badge variant="outline" className="text-xs border-green-500 text-green-700">
          Base legal 2024
        </Badge>
      </div>

      <Tabs defaultValue="simulacao">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="simulacao" className="text-xs">
            <Calculator className="h-3.5 w-3.5 mr-1" />Simulação Rápida
          </TabsTrigger>
          <TabsTrigger value="mensal" className="text-xs">
            <Calendar className="h-3.5 w-3.5 mr-1" />Competência Mensal
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-1" />Histórico
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs">
            <BarChart3 className="h-3.5 w-3.5 mr-1" />Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="simulacao" className="mt-4">
          <SimulacaoRapida />
        </TabsContent>

        <TabsContent value="mensal" className="mt-4">
          <CompetenciaMensal imovelId={imovelId} />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Historico imovelId={imovelId} />
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardSimulador imovelId={imovelId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
