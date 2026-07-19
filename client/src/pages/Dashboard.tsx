import { useState, useMemo } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Baby, Scissors, Milk } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SPECIES = [
  { key: "ovinos", label: "Ovinos", emoji: "🐑", color: "oklch(0.42 0.14 145)", chartColor: "#4ade80" },
  { key: "caprinos", label: "Caprinos", emoji: "🐐", color: "oklch(0.50 0.14 220)", chartColor: "#60a5fa" },
  { key: "suinos", label: "Suínos", emoji: "🐷", color: "oklch(0.55 0.14 340)", chartColor: "#f472b6" },
  { key: "bovinos", label: "Bovinos", emoji: "🐄", color: "oklch(0.55 0.14 60)", chartColor: "#fb923c" },
] as const;

function fmt(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="rounded-2xl p-5 bg-white shadow-sm border border-transparent hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1 truncate" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  );
}

function SpeciesCard({ species, count, loading }: { species: typeof SPECIES[number]; count: number; loading: boolean }) {
  return (
    <div className="rounded-2xl p-5 bg-white shadow-sm border border-transparent hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${species.color}15` }}>
          {species.emoji}
        </div>
        <div>
          <p className="font-semibold text-sm" style={{ color: "oklch(0.22 0.06 145)" }}>{species.label}</p>
          <p className="text-xs text-muted-foreground">Rebanho ativo</p>
        </div>
      </div>
      {loading ? (
        <div className="h-9 w-16 rounded-lg bg-muted animate-pulse" />
      ) : (
        <p className="text-4xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>{count}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { produtorId, imovelId, produtorNome } = useRuralAuth();
  const [iofcMeses, setIofcMeses] = useState(12);

  // Stable inputs for tRPC queries (avoid infinite re-render)
  const imovelInput = useMemo(() => ({ imovelId: imovelId ?? 0 }), [imovelId]);
  const produtorInput = useMemo(() => ({ produtorId: produtorId ?? 0 }), [produtorId]);

  const enabled = Boolean(produtorId && imovelId);

  // All data goes through the secure server-side proxy
  const ovinoDash = trpc.railway.ovinoDashboard.useQuery(imovelInput, { enabled });
  const resumo = trpc.railway.produtorResumo.useQuery(produtorInput, { enabled });
  const iofc = trpc.railway.iofcMensal.useQuery({ produtorId: produtorId ?? 0, meses: iofcMeses }, { enabled });

  const ovinosQ = trpc.railway.animais.useQuery({ imovelId: imovelId ?? 0, especie: "ovinos" }, { enabled });
  const caprinosQ = trpc.railway.animais.useQuery({ imovelId: imovelId ?? 0, especie: "caprinos" }, { enabled });
  const suinosQ = trpc.railway.animais.useQuery({ imovelId: imovelId ?? 0, especie: "suinos" }, { enabled });
  const bovinosQ = trpc.railway.animais.useQuery({ imovelId: imovelId ?? 0, especie: "bovinos" }, { enabled });

  const loading = ovinoDash.isLoading || resumo.isLoading;
  const animaisLoading = ovinosQ.isLoading || caprinosQ.isLoading || suinosQ.isLoading || bovinosQ.isLoading;

  const counts = {
    ovinos: (ovinosQ.data ?? []).filter((a) => a.status === "ativo").length,
    caprinos: (caprinosQ.data ?? []).filter((a) => a.status === "ativo").length,
    suinos: (suinosQ.data ?? []).filter((a) => a.status === "ativo").length,
    bovinos: (bovinosQ.data ?? []).filter((a) => a.status === "ativo").length,
  };

  const totalAnimais = Object.values(counts).reduce((s, v) => s + v, 0);
  const lucro = (resumo.data?.receita ?? 0) - (resumo.data?.despesa ?? 0);

  const pieData = SPECIES.filter((s) => counts[s.key] > 0).map((s) => ({
    name: s.label,
    value: counts[s.key],
    color: s.chartColor,
  }));

  const iofcSerie = [...(iofc.data ?? [])]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((m) => ({
      mes: new Date(m.mes + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      iofc: m.iofc !== null ? Number(m.iofc) : null,
      receita: m.receita_leite_final !== null ? Number(m.receita_leite_final) : null,
      custoRacao: Number(m.custo_racao_leite ?? 0),
    }));

  // "Mês mais recente" é o último com IOFC calculado de fato — meses sem
  // preço CEPEA ou sem lançamento de venda ficam no gráfico (com um vazio
  // na linha do IOFC), mas não viram o número em destaque.
  const iofcMesAtual = [...iofcSerie].reverse().find((m) => m.iofc !== null);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
          Bom dia, {produtorNome.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visão geral da sua propriedade rural</p>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Receitas"
          value={loading ? "..." : fmt(resumo.data?.receita ?? 0)}
          icon={TrendingUp}
          color="oklch(0.42 0.14 145)"
          sub={`${resumo.data?.total_lancamentos ?? 0} lançamentos`}
        />
        <StatCard
          label="Despesas"
          value={loading ? "..." : fmt(resumo.data?.despesa ?? 0)}
          icon={TrendingDown}
          color="oklch(0.50 0.20 25)"
          sub={`${resumo.data?.pendentes ?? 0} pendentes`}
        />
        <StatCard
          label="Resultado"
          value={loading ? "..." : fmt(lucro)}
          icon={DollarSign}
          color={lucro >= 0 ? "oklch(0.42 0.14 145)" : "oklch(0.50 0.20 25)"}
          sub="Lucro no periodo"
        />
      </div>

      {/* Species cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SPECIES.map((s) => (
          <SpeciesCard key={s.key} species={s} count={counts[s.key]} loading={animaisLoading} />
        ))}
      </div>

      {/* Charts + quick stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Pie chart */}
        <div className="lg:col-span-1 rounded-2xl p-5 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Distribuição do Rebanho</p>
          {animaisLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
            </div>
          ) : totalAnimais === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground">Nenhum animal cadastrado</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} animais`]} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <p className="text-center text-sm font-semibold mt-2" style={{ color: "oklch(0.22 0.06 145)" }}>
            {totalAnimais} animais no total
          </p>
        </div>

        {/* Quick stats */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl p-5 bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alertas (7d)</p>
            </div>
            {loading ? <div className="h-8 w-12 bg-muted rounded animate-pulse" /> : (
              <p className="text-3xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                {ovinoDash.data?.alertas_7d?.total_alertas ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Sanitários ovinos</p>
          </div>

          <div className="rounded-2xl p-5 bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Baby className="w-4 h-4 text-pink-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partos (30d)</p>
            </div>
            {loading ? <div className="h-8 w-12 bg-muted rounded animate-pulse" /> : (
              <p className="text-3xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                {ovinoDash.data?.partos_30d?.total_partos ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {ovinoDash.data?.partos_30d?.cordeiros_vivos ?? 0} crias vivas
            </p>
          </div>

          <div className="rounded-2xl p-5 bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Scissors className="w-4 h-4 text-orange-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abates (30d)</p>
            </div>
            {loading ? <div className="h-8 w-12 bg-muted rounded animate-pulse" /> : (
              <p className="text-3xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                {ovinoDash.data?.abates_30d?.total_abatidos ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {fmt(ovinoDash.data?.abates_30d?.receita_total_rs ?? 0)} receita
            </p>
          </div>
        </div>
      </div>

      {/* IOFC — Margem Leiteira (Income Over Feed Cost) */}
      {(iofc.isLoading || iofcSerie.length > 0) && (
        <div className="rounded-2xl p-5 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.95 0.05 250)" }}>
                <Milk className="w-4.5 h-4.5" style={{ color: "oklch(0.5 0.15 250)" }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "oklch(0.22 0.06 145)" }}>IOFC — Margem Leiteira</p>
                <p className="text-xs text-muted-foreground">Receita de leite menos custo de ração, por mês</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={String(iofcMeses)} onValueChange={(v) => setIofcMeses(Number(v))}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Últimos 12 meses</SelectItem>
                  <SelectItem value="24">Últimos 24 meses</SelectItem>
                  <SelectItem value="36">Últimos 36 meses</SelectItem>
                </SelectContent>
              </Select>
              {iofcMesAtual && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Mês mais recente ({iofcMesAtual.mes})</p>
                  <p className="text-xl font-bold" style={{ color: (iofcMesAtual.iofc ?? 0) >= 0 ? "oklch(0.42 0.14 145)" : "oklch(0.50 0.20 25)" }}>
                    {fmt(iofcMesAtual.iofc)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {iofc.isLoading ? (
            <div className="h-56 flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Carregando...</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={iofcSerie} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 145)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number | null, name: string) => [fmt(v), name === "iofc" ? "IOFC" : name === "receita" ? "Receita de leite" : "Custo de ração"]} />
                <Legend
                  formatter={(v) => (v === "iofc" ? "IOFC" : v === "receita" ? "Receita de leite" : "Custo de ração")}
                  iconType="circle"
                  iconSize={8}
                />
                <Line type="monotone" dataKey="receita" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="custoRacao" stroke="#f472b6" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="iofc" stroke="oklch(0.42 0.14 145)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}

          <p className="text-[11px] text-muted-foreground mt-2">
            IOFC = Receita de Leite − Custo de Ração do rebanho leiteiro. Quando não houver lançamento
            de venda de leite no período, a receita é estimada pelo volume ordenhado × preço médio CEPEA do mês.
          </p>
        </div>
      )}
    </div>
  );
}
