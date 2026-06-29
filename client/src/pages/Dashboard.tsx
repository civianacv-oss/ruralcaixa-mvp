import { useEffect, useState } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import {
  getOvinoDashboard,
  getProdutorResumo,
  getOvinoAnimais,
  getCaprinoAnimais,
  getSuinoAnimais,
  getBovinoAnimais,
  type OvinoDashboard,
  type ProdutorResumo,
} from "@/lib/api";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Baby, Scissors } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const SPECIES = [
  { key: "ovinos", label: "Ovinos", emoji: "🐑", color: "oklch(0.42 0.14 145)", chartColor: "#4ade80" },
  { key: "caprinos", label: "Caprinos", emoji: "🐐", color: "oklch(0.50 0.14 220)", chartColor: "#60a5fa" },
  { key: "suinos", label: "Suínos", emoji: "🐷", color: "oklch(0.55 0.14 340)", chartColor: "#f472b6" },
  { key: "bovinos", label: "Bovinos", emoji: "🐄", color: "oklch(0.55 0.14 60)", chartColor: "#fb923c" },
] as const;

function fmt(v: number) {
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
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl"
          style={{ background: `${species.color}15` }}
        >
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
  const [ovinoDash, setOvinoDash] = useState<OvinoDashboard | null>(null);
  const [resumo, setResumo] = useState<ProdutorResumo | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ ovinos: 0, caprinos: 0, suinos: 0, bovinos: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!produtorId || !imovelId) return;
    setLoading(true);
    Promise.all([
      getOvinoDashboard(imovelId).catch(() => null),
      getProdutorResumo(produtorId).catch(() => null),
      getOvinoAnimais(imovelId).catch(() => []),
      getCaprinoAnimais(imovelId).catch(() => []),
      getSuinoAnimais(imovelId).catch(() => []),
      getBovinoAnimais(imovelId).catch(() => []),
    ]).then(([dash, res, ovinos, caprinos, suinos, bovinos]) => {
      setOvinoDash(dash);
      setResumo(res);
      setCounts({
        ovinos: (ovinos as { status: string }[]).filter((a) => a.status === "ativo").length,
        caprinos: (caprinos as { status: string }[]).filter((a) => a.status === "ativo").length,
        suinos: (suinos as { status: string }[]).filter((a) => a.status === "ativo").length,
        bovinos: (bovinos as { status: string }[]).filter((a) => a.status === "ativo").length,
      });
    }).finally(() => setLoading(false));
  }, [produtorId, imovelId]);

  const totalAnimais = Object.values(counts).reduce((s, v) => s + v, 0);
  const lucro = (resumo?.receita ?? 0) - (resumo?.despesa ?? 0);

  const pieData = SPECIES.filter((s) => counts[s.key] > 0).map((s) => ({
    name: s.label,
    value: counts[s.key],
    color: s.chartColor,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}
        >
          Bom dia, {produtorNome.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Visão geral da sua propriedade rural
        </p>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Receitas"
          value={fmt(resumo?.receita ?? 0)}
          icon={TrendingUp}
          color="oklch(0.42 0.14 145)"
          sub={`${resumo?.total_lancamentos ?? 0} lançamentos`}
        />
        <StatCard
          label="Despesas"
          value={fmt(resumo?.despesa ?? 0)}
          icon={TrendingDown}
          color="oklch(0.50 0.20 25)"
          sub={`${resumo?.pendentes ?? 0} pendentes`}
        />
        <StatCard
          label="Resultado"
          value={fmt(lucro)}
          icon={DollarSign}
          color={lucro >= 0 ? "oklch(0.42 0.14 145)" : "oklch(0.50 0.20 25)"}
          sub={lucro >= 0 ? "Lucro no período" : "Prejuízo no período"}
        />
      </div>

      {/* Herd summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SPECIES.map((s) => (
          <SpeciesCard key={s.key} species={s} count={counts[s.key]} loading={loading} />
        ))}
      </div>

      {/* Bottom row: chart + ovino stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Distribuição do Rebanho
          </h3>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-36 h-36 rounded-full bg-muted animate-pulse" />
            </div>
          ) : pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Nenhum animal cadastrado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v} animais`, n]} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <p className="text-center text-sm font-semibold mt-2" style={{ color: "oklch(0.22 0.06 145)" }}>
            {totalAnimais} animais no total
          </p>
        </div>

        {/* Ovino highlights */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alertas (7d)</span>
            </div>
            {loading ? (
              <div className="h-9 w-12 rounded bg-muted animate-pulse" />
            ) : (
              <p className="text-4xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                {ovinoDash?.alertas_7d?.total_alertas ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Sanitários ovinos</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Baby className="w-4 h-4 text-pink-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partos (30d)</span>
            </div>
            {loading ? (
              <div className="h-9 w-12 rounded bg-muted animate-pulse" />
            ) : (
              <p className="text-4xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                {ovinoDash?.partos_30d?.total_partos ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {ovinoDash?.partos_30d?.cordeiros_vivos ?? 0} crias vivas
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Scissors className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abates (30d)</span>
            </div>
            {loading ? (
              <div className="h-9 w-12 rounded bg-muted animate-pulse" />
            ) : (
              <p className="text-4xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                {ovinoDash?.abates_30d?.total_abatidos ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {fmt(ovinoDash?.abates_30d?.receita_total_rs ?? 0)} receita
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
