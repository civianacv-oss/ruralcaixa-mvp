import { useEffect, useState } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import {
  getOvinoAnimais, getCaprinoAnimais, getSuinoAnimais, getBovinoAnimais,
  type Animal,
} from "@/lib/api";
import { Search, Filter } from "lucide-react";

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

interface AnimalWithSpecies extends Animal {
  _species: string;
}

export default function Animais() {
  const { imovelId } = useRuralAuth();
  const [activeTab, setActiveTab] = useState<SpeciesKey>("todos");
  const [search, setSearch] = useState("");
  const [allAnimals, setAllAnimals] = useState<AnimalWithSpecies[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!imovelId) return;
    setLoading(true);
    Promise.all([
      getOvinoAnimais(imovelId).catch(() => []),
      getCaprinoAnimais(imovelId).catch(() => []),
      getSuinoAnimais(imovelId).catch(() => []),
      getBovinoAnimais(imovelId).catch(() => []),
    ]).then(([ovinos, caprinos, suinos, bovinos]) => {
      const all: AnimalWithSpecies[] = [
        ...(ovinos as Animal[]).map((a) => ({ ...a, _species: "ovinos" })),
        ...(caprinos as Animal[]).map((a) => ({ ...a, _species: "caprinos" })),
        ...(suinos as Animal[]).map((a) => ({ ...a, _species: "suinos" })),
        ...(bovinos as Animal[]).map((a) => ({ ...a, _species: "bovinos" })),
      ];
      setAllAnimals(all);
    }).finally(() => setLoading(false));
  }, [imovelId]);

  const filtered = allAnimals.filter((a) => {
    if (activeTab !== "todos" && a._species !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.brinco?.toLowerCase().includes(q) ||
        a.nome?.toLowerCase().includes(q) ||
        a.raca?.toLowerCase().includes(q) ||
        a.raca_nome?.toLowerCase().includes(q) ||
        a.lote_nome?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const speciesLabel: Record<string, string> = {
    ovinos: "Ovino", caprinos: "Caprino", suinos: "Suíno", bovinos: "Bovino",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
          Animais
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestão do rebanho por espécie</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {SPECIES_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
              activeTab === tab.key
                ? "text-white shadow-sm"
                : "bg-white text-muted-foreground hover:bg-white/80 shadow-sm"
            }`}
            style={activeTab === tab.key ? { background: "oklch(0.38 0.12 145)" } : {}}
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
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white shadow-sm border border-transparent focus:outline-none focus:ring-2 transition-all"
          style={{ "--tw-ring-color": "oklch(0.38 0.12 145 / 0.3)" } as React.CSSProperties}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.92 0.01 130)" }}>
                {["Brinco", "Nome", "Espécie", "Raça", "Sexo", "Categoria / Lote", "Peso", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-muted animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Nenhum animal encontrado
                  </td>
                </tr>
              ) : (
                filtered.map((animal) => (
                  <tr
                    key={`${animal._species}-${animal.id}`}
                    className="hover:bg-muted/30 transition-colors"
                    style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-xs" style={{ color: "oklch(0.38 0.12 145)" }}>
                      {animal.brinco}
                    </td>
                    <td className="px-4 py-3 text-foreground">{animal.nome ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "oklch(0.94 0.04 145)", color: "oklch(0.32 0.10 145)" }}>
                        {speciesLabel[animal._species]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{animal.raca_nome ?? animal.raca ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${animal.sexo === "M" ? "text-blue-600" : "text-pink-600"}`}>
                        {animal.sexo === "M" ? "Macho" : "Fêmea"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{animal.categoria ?? animal.lote_nome ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {animal.ultimo_peso ? `${animal.ultimo_peso} kg` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: STATUS_COLORS[animal.status] ?? "oklch(0.50 0.04 140)",
                          background: `${STATUS_COLORS[animal.status] ?? "oklch(0.50 0.04 140)"}18`,
                        }}
                      >
                        {animal.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t text-xs text-muted-foreground" style={{ borderColor: "oklch(0.92 0.01 130)" }}>
            {filtered.length} animal{filtered.length !== 1 ? "is" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
