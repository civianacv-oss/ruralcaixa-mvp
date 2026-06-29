import { useMemo } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { Baby, Calendar } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  cobertura: "Cobertura", gestacao: "Gestação", parto: "Parto", aborto: "Aborto",
};

export default function Reproducao() {
  const { imovelId } = useRuralAuth();
  const enabled = Boolean(imovelId);
  const imovelIdSafe = imovelId ?? 0;

  // All queries go through the secure server-side proxy
  const ovinosQ = trpc.railway.reproducao.useQuery({ imovelId: imovelIdSafe, especie: "ovinos" }, { enabled });
  const caprinosQ = trpc.railway.reproducao.useQuery({ imovelId: imovelIdSafe, especie: "caprinos" }, { enabled });
  const bovinosQ = trpc.railway.reproducao.useQuery({ imovelId: imovelIdSafe, especie: "bovinos" }, { enabled });

  const loading = ovinosQ.isLoading || caprinosQ.isLoading || bovinosQ.isLoading;

  type ReproRecord = NonNullable<typeof ovinosQ.data>[number] & { _species: string };

  const records = useMemo((): ReproRecord[] => [
    ...(ovinosQ.data ?? []).map((r) => ({ ...r, _species: "ovinos" })),
    ...(caprinosQ.data ?? []).map((r) => ({ ...r, _species: "caprinos" })),
    ...(bovinosQ.data ?? []).map((r) => ({ ...r, _species: "bovinos" })),
  ], [ovinosQ.data, caprinosQ.data, bovinosQ.data]);

  const speciesEmoji: Record<string, string> = { ovinos: "🐑", caprinos: "🐐", suinos: "🐷", bovinos: "🐄" };

  function daysUntil(date?: string) {
    if (!date) return null;
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    return diff;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
          Controle Reprodutivo
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Fêmeas prenhas e eventos reprodutivos</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Baby className="w-4 h-4 text-pink-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Prenhas</span>
          </div>
          <p className="text-4xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>{loading ? "—" : records.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partos em 30 dias</span>
          </div>
          <p className="text-4xl font-bold text-blue-600">
            {loading ? "—" : records.filter((r) => {
              const d = daysUntil(r.data_parto_previsto ?? undefined);
              return d !== null && d >= 0 && d <= 30;
            }).length}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Baby className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Partos Atrasados</span>
          </div>
          <p className="text-4xl font-bold text-amber-600">
            {loading ? "—" : records.filter((r) => {
              const d = daysUntil(r.data_parto_previsto ?? undefined);
              return d !== null && d < 0;
            }).length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: "oklch(0.92 0.01 130)" }}>
          <h3 className="font-semibold text-sm" style={{ color: "oklch(0.22 0.06 145)" }}>Fêmeas Prenhas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.92 0.01 130)" }}>
                {["Espécie", "Fêmea ID", "Tipo", "Data Evento", "Parto Previsto", "Dias Restantes", "Crias Vivas", "Obs."].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" style={{ width: "70%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Baby className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Nenhum registro reprodutivo encontrado
                  </td>
                </tr>
              ) : (
                records.map((r, i) => {
                  const days = daysUntil(r.data_parto_previsto ?? undefined);
                  return (
                    <tr key={i} className="hover:bg-muted/30 transition-colors" style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                      <td className="px-4 py-3">{speciesEmoji[r._species]}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: "oklch(0.38 0.12 145)" }}>#{r.femea_id}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">
                          {TYPE_LABELS[r.tipo] ?? r.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.data ? new Date(r.data).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3">{r.data_parto_previsto ? new Date(r.data_parto_previsto).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3">
                        {days !== null ? (
                          <span className={`text-xs font-bold ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-600" : "text-foreground"}`}>
                            {days < 0 ? `${Math.abs(days)}d atrasado` : days === 0 ? "Hoje" : `${days}d`}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.crias_vivas ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[150px] truncate">{r.observacoes ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
