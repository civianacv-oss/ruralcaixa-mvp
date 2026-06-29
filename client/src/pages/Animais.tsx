import { useState, useMemo } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { Search } from "lucide-react";

const SPECIES_TABS = [
  { key: "todos", label: "Todos", emoji: "🐾" },
  { key: "ovinos", label: "Ovinos", emoji: "🐑" },
  { key: "caprinos", label: "Caprinos", emoji: "🐐" },
  { key: "suinos", label: "Suínos", emoji: "🐷" },
  { key: "bovinos", label: "Bovinos", emoji: "🐄" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  ativo: "oklch(0.42 0.14 145)",
  vendido: "oklch(0.55 0.14 220)",
  morto: "oklch(0.50 0.20 25)",
  abatido: "oklch(0.55 0.14 60)",
};

type SpeciesKey = "todos" | "ovinos" | "caprinos" | "suinos" | "bovinos";
type EspecieKey = "ovinos" | "caprinos" | "suinos" | "bovinos";

export default function Animais() {
  const { imovelId } = useRuralAuth();
  const [activeTab, setActiveTab] = useState<SpeciesKey>("todos");
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
    ...(ovinosQ.data ?? []).map((a) => ({ ...a, _species: "ovinos" as EspecieKey })),
    ...(caprinosQ.data ?? []).map((a) => ({ ...a, _species: "caprinos" as EspecieKey })),
    ...(suinosQ.data ?? []).map((a) => ({ ...a, _species: "suinos" as EspecieKey })),
    ...(bovinosQ.data ?? []).map((a) => ({ ...a, _species: "bovinos" as EspecieKey })),
  ], [ovinosQ.data, caprinosQ.data, suinosQ.data, bovinosQ.data]);

  const filtered = allAnimals.filter((a) => {
    if (activeTab !== "todos" && a._species !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.brinco?.toLowerCase().includes(q) ||
        a.nome?.toLowerCase().includes(q) ||
        a.raca_nome?.toLowerCase().includes(q) ||
        a.categoria?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const speciesLabel: Record<EspecieKey, string> = {
    ovinos: "Ovino",
    caprinos: "Caprino",
    suinos: "Suíno",
    bovinos: "Bovino",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
          Animais
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestão do rebanho por espécie</p>
      </div>

      {/* Species tabs */}
      <div className="flex gap-2 flex-wrap">
        {SPECIES_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={
              activeTab === tab.key
                ? { background: "oklch(0.42 0.14 145)", color: "white" }
                : { background: "white", color: "oklch(0.40 0.06 145)", border: "1px solid oklch(0.90 0.03 145)" }
            }
          >
            <span>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por brinco, nome, raça..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">🐾</p>
            <p className="text-muted-foreground text-sm">Nenhum animal encontrado</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brinco</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espécie</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raça</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sexo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Peso (kg)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={`${a._species}-${a.id}`} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                  <td className="px-5 py-3 font-mono font-semibold text-xs" style={{ color: "oklch(0.30 0.10 145)" }}>{a.brinco}</td>
                  <td className="px-5 py-3 font-medium">{a.nome ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">
                      {speciesLabel[a._species]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{a.raca_nome ?? a.raca ?? "—"}</td>
                  <td className="px-5 py-3">{a.sexo === "M" ? "♂ Macho" : "♀ Fêmea"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{a.categoria ?? "—"}</td>
                  <td className="px-5 py-3">{a.ultimo_peso != null ? `${a.ultimo_peso} kg` : "—"}</td>
                  <td className="px-5 py-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize"
                      style={{
                        color: STATUS_COLORS[a.status] ?? "oklch(0.50 0.05 145)",
                        background: `${STATUS_COLORS[a.status] ?? "oklch(0.50 0.05 145)"}18`,
                      }}
                    >
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
            {filtered.length} animal{filtered.length !== 1 ? "is" : ""} exibido{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
