import { useState, useMemo } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Baby, Calendar, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

type EspecieRepro = "ovinos" | "caprinos" | "bovinos";

const TYPE_LABELS: Record<string, string> = {
  cobertura: "Cobertura", gestacao: "Gestação", parto: "Parto", aborto: "Aborto",
};

// ─── Reprodução Form Modal ────────────────────────────────────────────────────

function ReproducaoModal({
  open, onClose, imovelId, onSuccess
}: {
  open: boolean; onClose: () => void; imovelId: number; onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const [especie, setEspecie] = useState<EspecieRepro>("ovinos");
  const [tipo, setTipo] = useState("cobertura");
  const [dataEvento, setDataEvento] = useState(new Date().toISOString().slice(0, 10));
  const [matrizId, setMatrizId] = useState("");
  const [reprodutorId, setReprodutorId] = useState("");
  const [criasVivas, setCriasVivas] = useState("");
  const [obs, setObs] = useState("");

  const mutation = trpc.railway.createReproducao.useMutation({
    onSuccess: () => {
      toast.success("Registro reprodutivo criado!");
      utils.railway.reproducao.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      imovelId, especie, tipo,
      data_evento: dataEvento,
      matriz_id: matrizId ? Number(matrizId) : undefined,
      reprodutor_id: reprodutorId ? Number(reprodutorId) : undefined,
      cordeiros_vivos: criasVivas ? Number(criasVivas) : undefined,
      observacoes: obs || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Registro Reprodutivo</DialogTitle>
          <DialogDescription>Registre cobertura, gestação, parto ou aborto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Espécie *</Label>
              <Select value={especie} onValueChange={(v) => setEspecie(v as EspecieRepro)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ovinos">Ovinos</SelectItem>
                  <SelectItem value="caprinos">Caprinos</SelectItem>
                  <SelectItem value="bovinos">Bovinos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Evento *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cobertura">Cobertura</SelectItem>
                  <SelectItem value="gestacao">Gestação</SelectItem>
                  <SelectItem value="parto">Parto</SelectItem>
                  <SelectItem value="aborto">Aborto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dataEvento">Data do Evento *</Label>
            <Input id="dataEvento" type="date" value={dataEvento} onChange={e => setDataEvento(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="matrizId">ID da Matriz (fêmea)</Label>
              <Input id="matrizId" type="number" value={matrizId} onChange={e => setMatrizId(e.target.value)} placeholder="ID do animal" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reprodutorId">ID do Reprodutor (macho)</Label>
              <Input id="reprodutorId" type="number" value={reprodutorId} onChange={e => setReprodutorId(e.target.value)} placeholder="ID do animal" />
            </div>
          </div>
          {(tipo === "parto") && (
            <div className="space-y-1.5">
              <Label htmlFor="criasVivas">Crias Vivas</Label>
              <Input id="criasVivas" type="number" min="0" value={criasVivas} onChange={e => setCriasVivas(e.target.value)} placeholder="0" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Input id="obs" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending} className="text-white" style={{ background: "oklch(0.45 0.14 145)" }}>
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Reproducao() {
  const { imovelId } = useRuralAuth();
  const [showCreate, setShowCreate] = useState(false);
  const enabled = Boolean(imovelId);
  const imovelIdSafe = imovelId ?? 0;

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

  const speciesLabel: Record<string, string> = { ovinos: "Ovinos", caprinos: "Caprinos", bovinos: "Bovinos" };

  function daysUntil(date?: string) {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  }

  if (!imovelId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Selecione uma propriedade para visualizar os registros reprodutivos.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
            Controle Reprodutivo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Fêmeas prenhas e eventos reprodutivos</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 text-white" style={{ background: "oklch(0.45 0.14 145)" }}>
          <Plus className="w-4 h-4" /> Novo registro
        </Button>
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
            <Baby className="w-4 h-4 text-amber-500" />
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
                    <p className="font-medium">Nenhum registro reprodutivo encontrado</p>
                    <p className="text-sm mt-1">Clique em "Novo registro" para adicionar o primeiro.</p>
                  </td>
                </tr>
              ) : (
                records.map((r, i) => {
                  const days = daysUntil(r.data_parto_previsto ?? undefined);
                  return (
                    <tr key={i} className="hover:bg-muted/30 transition-colors" style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "oklch(0.94 0.02 145)", color: "oklch(0.38 0.10 145)" }}>
                          {speciesLabel[r._species] ?? r._species}
                        </span>
                      </td>
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

      {/* Modal */}
      {showCreate && imovelId && (
        <ReproducaoModal open onClose={() => setShowCreate(false)} imovelId={imovelId} onSuccess={() => {}} />
      )}
    </div>
  );
}
