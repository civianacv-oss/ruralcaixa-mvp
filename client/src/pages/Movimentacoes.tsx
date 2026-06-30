import { useState, useMemo } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { ArrowLeftRight, Search } from "lucide-react";

const SPECIES_TABS = [
  { key: "todos", label: "Todos", emoji: "🐾" },
  { key: "ovinos", label: "Ovinos", emoji: "🐑" },
  { key: "caprinos", label: "Caprinos", emoji: "🐐" },
  { key: "suinos", label: "Suínos", emoji: "🐷" },
  { key: "bovinos", label: "Bovinos", emoji: "🐄" },
] as const;

const STATUS_ALL = ["todos", "ativo", "vendido", "morto", "abatido"];

export default function Movimentacoes() {
  const { imovelId } = useRuralAuth();
  const [activeTab, setActiveTab] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");

  const enabled = Boolean(imovelId);
  const imovelIdSafe = imovelId ?? 0;

  // All queries go through the secure server-side proxy
  const ovinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "ovinos" }, { enabled });
  const caprinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "caprinos" }, { enabled });
  const suinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "suinos" }, { enabled });
  const bovinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "bovinos" }, { enabled });

  const loading = ovinosQ.isLoading || caprinosQ.isLoading || suinosQ.isLoading || bovinosQ.isLoading;

  const allAnimals = useMemo(() => [
    ...(ovinosQ.data ?? []).map((a) => ({ ...a, _species: "ovinos" })),
    ...(caprinosQ.data ?? []).map((a) => ({ ...a, _species: "caprinos" })),
    ...(suinosQ.data ?? []).map((a) => ({ ...a, _species: "suinos" })),
    ...(bovinosQ.data ?? []).map((a) => ({ ...a, _species: "bovinos" })),
  ], [ovinosQ.data, caprinosQ.data, suinosQ.data, bovinosQ.data]);

  const filtered = allAnimals.filter((a) => {
    if (activeTab !== "todos" && a._species !== activeTab) return false;
    if (statusFilter !== "todos" && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.brinco?.toLowerCase().includes(q) || a.nome?.toLowerCase().includes(q);
    }
    return true;
  });

  const speciesLabel: Record<string, string> = { ovinos: "Ovino", caprinos: "Caprino", suinos: "Suíno", bovinos: "Bovino" };
  const speciesEmoji: Record<string, string> = { ovinos: "🐑", caprinos: "🐐", suinos: "🐷", bovinos: "🐄" };

  const STATUS_COLORS: Record<string, string> = {
    ativo: "oklch(0.42 0.14 145)", vendido: "oklch(0.50 0.14 220)", morto: "oklch(0.50 0.20 25)", abatido: "oklch(0.55 0.14 60)",
  };

  // Count by status
  const statusCounts = allAnimals.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
          Movimentações
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Histórico de entradas, saídas e status dos animais</p>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">{status}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: STATUS_COLORS[status] ?? "oklch(0.22 0.06 145)" }}>{count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Species tabs */}
        <div className="flex gap-2 flex-wrap">
          {SPECIES_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${activeTab === tab.key ? "text-white shadow-sm" : "bg-white text-muted-foreground hover:bg-white/80 shadow-sm"}`}
              style={activeTab === tab.key ? { background: "oklch(0.38 0.12 145)" } : {}}
            >
              <span>{tab.emoji}</span>{tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por brinco ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white shadow-sm border border-transparent focus:outline-none focus:ring-2 transition-all"
            />
          </div>
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {STATUS_ALL.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all capitalize ${statusFilter === s ? "text-white shadow-sm" : "bg-white text-muted-foreground shadow-sm"}`}
                style={statusFilter === s ? { background: STATUS_COLORS[s] ?? "oklch(0.38 0.12 145)" } : {}}
              >
                {s === "todos" ? "Todos" : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.92 0.01 130)" }}>
                {["Brinco", "Espécie", "Nome", "Sexo", "Raça", "Lote / Categoria", "Peso Atual", "Status", "Atualizado em"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" style={{ width: "70%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Nenhuma movimentação encontrada
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr key={`${a._species}-${a.id}`} className="hover:bg-muted/30 transition-colors" style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    <td className="px-4 py-3 font-mono font-semibold text-xs" style={{ color: "oklch(0.38 0.12 145)" }}>{a.brinco}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs">{speciesEmoji[a._species]} {speciesLabel[a._species]}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{a.nome ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${a.sexo === "M" ? "text-blue-600" : "text-pink-600"}`}>
                        {a.sexo === "M" ? "Macho" : "Fêmea"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.raca_nome ?? a.raca ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{a.categoria ?? a.lote_nome ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.ultimo_peso ? `${a.ultimo_peso} kg` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: STATUS_COLORS[a.status] ?? "oklch(0.50 0.04 140)", background: `${STATUS_COLORS[a.status] ?? "oklch(0.50 0.04 140)"}18` }}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {a.data_nascimento ? new Date(a.data_nascimento).toLocaleDateString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t text-xs text-muted-foreground" style={{ borderColor: "oklch(0.92 0.01 130)" }}>
            {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
