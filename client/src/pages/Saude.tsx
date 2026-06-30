import { useState, useMemo } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { HeartPulse, AlertTriangle, Calendar, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

type EspecieSaude = "ovinos" | "caprinos" | "bovinos";

const TYPE_LABELS: Record<string, string> = {
  vacina: "Vacina", medicamento: "Medicamento", exame: "Exame", tratamento: "Tratamento",
};
const TYPE_COLORS: Record<string, string> = {
  vacina: "oklch(0.42 0.14 145)", medicamento: "oklch(0.50 0.14 220)", exame: "oklch(0.55 0.14 60)", tratamento: "oklch(0.55 0.14 340)",
};

// ─── Sanitário Form Modal ─────────────────────────────────────────────────────

function SanitarioModal({
  open, onClose, imovelId, onSuccess
}: {
  open: boolean; onClose: () => void; imovelId: number; onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const [especie, setEspecie] = useState<EspecieSaude>("ovinos");
  const [tipo, setTipo] = useState("vacina");
  const [descricao, setDescricao] = useState("");
  const [dataAplicacao, setDataAplicacao] = useState(new Date().toISOString().slice(0, 10));
  const [responsavel, setResponsavel] = useState("");
  const [doseMl, setDoseMl] = useState("");
  const [obs, setObs] = useState("");

  const mutation = trpc.railway.createSanitario.useMutation({
    onSuccess: () => {
      toast.success("Registro sanitário criado!");
      utils.railway.sanitario.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) { toast.error("Descrição é obrigatória."); return; }
    mutation.mutate({
      imovelId, especie, tipo, descricao,
      data_aplicacao: dataAplicacao,
      responsavel_nome: responsavel || undefined,
      dose_ml: doseMl ? Number(doseMl) : undefined,
      observacoes: obs || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Registro Sanitário</DialogTitle>
          <DialogDescription>Registre vacina, medicamento, exame ou tratamento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Espécie *</Label>
              <Select value={especie} onValueChange={(v) => setEspecie(v as EspecieSaude)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ovinos">Ovinos</SelectItem>
                  <SelectItem value="caprinos">Caprinos</SelectItem>
                  <SelectItem value="bovinos">Bovinos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacina">Vacina</SelectItem>
                  <SelectItem value="medicamento">Medicamento</SelectItem>
                  <SelectItem value="exame">Exame</SelectItem>
                  <SelectItem value="tratamento">Tratamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição *</Label>
            <Input id="descricao" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Vacinação contra febre aftosa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dataAplicacao">Data de Aplicação *</Label>
              <Input id="dataAplicacao" type="date" value={dataAplicacao} onChange={e => setDataAplicacao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doseMl">Dose (ml)</Label>
              <Input id="doseMl" type="number" step="0.1" min="0" value={doseMl} onChange={e => setDoseMl(e.target.value)} placeholder="0.0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="responsavel">Responsável / Veterinário</Label>
            <Input id="responsavel" value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Opcional" />
          </div>
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

export default function Saude() {
  const { imovelId } = useRuralAuth();
  const [showCreate, setShowCreate] = useState(false);
  const enabled = Boolean(imovelId);
  const imovelIdSafe = imovelId ?? 0;

  const ovinosQ = trpc.railway.sanitario.useQuery({ imovelId: imovelIdSafe, especie: "ovinos" }, { enabled });
  const caprinosQ = trpc.railway.sanitario.useQuery({ imovelId: imovelIdSafe, especie: "caprinos" }, { enabled });
  const bovinosQ = trpc.railway.sanitario.useQuery({ imovelId: imovelIdSafe, especie: "bovinos" }, { enabled });

  const loading = ovinosQ.isLoading || caprinosQ.isLoading || bovinosQ.isLoading;

  const records = useMemo(() => [
    ...(ovinosQ.data ?? []).map((r) => ({ ...r, _species: "ovinos" })),
    ...(caprinosQ.data ?? []).map((r) => ({ ...r, _species: "caprinos" })),
    ...(bovinosQ.data ?? []).map((r) => ({ ...r, _species: "bovinos" })),
  ], [ovinosQ.data, caprinosQ.data, bovinosQ.data]);

  const speciesLabel: Record<string, string> = { ovinos: "Ovinos", caprinos: "Caprinos", suinos: "Suínos", bovinos: "Bovinos" };

  function isOverdue(date?: string) {
    if (!date) return false;
    return new Date(date) < new Date();
  }

  if (!imovelId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Selecione uma propriedade para visualizar os registros sanitários.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
            Saúde do Rebanho
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Próximos eventos sanitários e alertas</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 text-white" style={{ background: "oklch(0.45 0.14 145)" }}>
          <Plus className="w-4 h-4" /> Novo registro
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <HeartPulse className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total de Alertas</span>
          </div>
          <p className="text-4xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>{loading ? "—" : records.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vencidos</span>
          </div>
          <p className="text-4xl font-bold text-amber-600">{loading ? "—" : records.filter((r) => isOverdue(r.proxima_data)).length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximos 7 dias</span>
          </div>
          <p className="text-4xl font-bold text-blue-600">
            {loading ? "—" : records.filter((r) => {
              if (!r.proxima_data) return false;
              const d = new Date(r.proxima_data);
              const now = new Date();
              const in7 = new Date(); in7.setDate(now.getDate() + 7);
              return d >= now && d <= in7;
            }).length}
          </p>
        </div>
      </div>

      {/* Records table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b" style={{ borderColor: "oklch(0.92 0.01 130)" }}>
          <h3 className="font-semibold text-sm" style={{ color: "oklch(0.22 0.06 145)" }}>Próximos Eventos Sanitários</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.92 0.01 130)" }}>
                {["Espécie", "Tipo", "Descrição", "Produto / Dose", "Próxima Data", "Veterinário"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" style={{ width: "70%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <HeartPulse className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">Nenhum evento sanitário encontrado</p>
                    <p className="text-sm mt-1">Clique em "Novo registro" para adicionar o primeiro.</p>
                  </td>
                </tr>
              ) : (
                records.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors" style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "oklch(0.94 0.02 145)", color: "oklch(0.38 0.10 145)" }}>
                        {speciesLabel[r._species] ?? r._species}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: TYPE_COLORS[r.tipo] ?? "oklch(0.50 0.04 140)", background: `${TYPE_COLORS[r.tipo] ?? "oklch(0.50 0.04 140)"}18` }}>
                        {TYPE_LABELS[r.tipo] ?? r.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{r.descricao}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.produto ?? "—"}{r.dose ? ` · ${r.dose}` : ""}</td>
                    <td className="px-4 py-3">
                      {r.proxima_data ? (
                        <span className={`text-xs font-semibold ${isOverdue(r.proxima_data) ? "text-red-600" : "text-foreground"}`}>
                          {isOverdue(r.proxima_data) && "⚠ "}
                          {new Date(r.proxima_data).toLocaleDateString("pt-BR")}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.veterinario ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showCreate && imovelId && (
        <SanitarioModal open onClose={() => setShowCreate(false)} imovelId={imovelId} onSuccess={() => {}} />
      )}
    </div>
  );
}
