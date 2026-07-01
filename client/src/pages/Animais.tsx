import { useState, useMemo } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search, Plus, Pencil, Trash2, ChevronDown, X, Loader2, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

type Especie = "ovinos" | "caprinos" | "suinos" | "bovinos";

interface Animal {
  id: number;
  imovel_id: number;
  brinco: string;
  nome?: string;
  raca?: string;
  raca_nome?: string;
  sexo: "M" | "F";
  status: string;
  data_nascimento?: string;
  peso_nascimento?: number;
  ultimo_peso?: number;
  lote_nome?: string;
  categoria?: string;
  observacoes?: string;
  _species?: Especie;
}

const ESPECIES: { value: Especie; label: string; color: string }[] = [
  { value: "ovinos", label: "Ovinos", color: "oklch(0.50 0.14 250)" },
  { value: "caprinos", label: "Caprinos", color: "oklch(0.48 0.14 145)" },
  { value: "suinos", label: "Suínos", color: "oklch(0.55 0.14 20)" },
  { value: "bovinos", label: "Bovinos", color: "oklch(0.50 0.12 60)" },
];

const STATUS_COLORS: Record<string, string> = {
  ativo: "oklch(0.42 0.14 145)",
  vendido: "oklch(0.50 0.14 220)",
  morto: "oklch(0.45 0.18 25)",
  abatido: "oklch(0.50 0.14 60)",
  transferido: "oklch(0.50 0.12 200)",
};

// ─── Animal Form Modal ────────────────────────────────────────────────────────

function AnimalFormModal({
  open, onClose, imovelId, especie, animal, onSuccess
}: {
  open: boolean; onClose: () => void; imovelId: number;
  especie: Especie; animal?: Animal; onSuccess: () => void;
}) {
  const isEdit = !!animal;
  const utils = trpc.useUtils();

  const [brinco, setBrinco] = useState(animal?.brinco ?? "");
  const [nome, setNome] = useState(animal?.nome ?? "");
  const [raca, setRaca] = useState(animal?.raca ?? "");
  const [sexo, setSexo] = useState<"M" | "F">(animal?.sexo ?? "M");
  const [dataNasc, setDataNasc] = useState(animal?.data_nascimento?.slice(0, 10) ?? "");
  const [peso, setPeso] = useState(animal?.peso_nascimento ? String(animal.peso_nascimento) : "");
  const [obs, setObs] = useState(animal?.observacoes ?? "");

  const racasQuery = trpc.railway.racas.useQuery({ especie }, { enabled: open });

  const createMutation = trpc.railway.createAnimal.useMutation({
    onSuccess: () => {
      toast.success("Animal cadastrado com sucesso!");
      utils.railway.animais.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.railway.updateAnimal.useMutation({
    onSuccess: () => {
      toast.success("Animal atualizado!");
      utils.railway.animais.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brinco.trim()) { toast.error("Brinco é obrigatório."); return; }
    if (isEdit && animal) {
      updateMutation.mutate({
        animalId: animal.id, imovelId, especie,
        brinco, nome: nome || undefined, raca: raca || undefined,
        sexo, observacoes: obs || undefined,
      });
    } else {
      createMutation.mutate({
        imovelId, especie, brinco,
        nome: nome || undefined, raca: raca || undefined, sexo,
        data_nascimento: dataNasc || undefined,
        peso_nascimento: peso ? Number(peso) : undefined,
        observacoes: obs || undefined,
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Animal" : "Novo Animal"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize os dados do animal." : `Cadastre um novo ${especie.slice(0, -1)}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brinco">Brinco / ID *</Label>
              <Input id="brinco" value={brinco} onChange={e => setBrinco(e.target.value)} placeholder="Ex: OV-001" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sexo *</Label>
              <Select value={sexo} onValueChange={(v) => setSexo(v as "M" | "F")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Macho</SelectItem>
                  <SelectItem value="F">Fêmea</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Raça</Label>
              <Select value={raca} onValueChange={setRaca}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">— Não informada —</SelectItem>
                  {racasQuery.data?.map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dataNasc">Data de Nascimento</Label>
                <Input id="dataNasc" type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="peso">Peso ao Nascer (kg)</Label>
                <Input id="peso" type="number" step="0.1" min="0" value={peso} onChange={e => setPeso(e.target.value)} placeholder="0.0" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Input id="obs" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="text-white" style={{ background: "oklch(0.45 0.14 145)" }}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Cadastrar animal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Modal ─────────────────────────────────────────────────────────────

function StatusModal({
  open, onClose, animal, imovelId, especie, onSuccess
}: {
  open: boolean; onClose: () => void; animal: Animal;
  imovelId: number; especie: Especie; onSuccess: () => void;
}) {
  const [status, setStatus] = useState(animal.status);
  const [motivo, setMotivo] = useState("");
  const [pesoSaida, setPesoSaida] = useState("");
  const [rendimentoCarcaca, setRendimentoCarcaca] = useState("52");
  const [precoVenda, setPrecoVenda] = useState("");
  const utils = trpc.useUtils();

  const mutation = trpc.railway.updateAnimalStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.railway.animais.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const isVendidoOuAbatido = status === "vendido" || status === "abatido";

  const buildMotivo = () => {
    const partes: string[] = [];
    if (motivo) partes.push(motivo);
    if (pesoSaida) partes.push(`peso_saida:${pesoSaida}kg`);
    if (isVendidoOuAbatido && rendimentoCarcaca) partes.push(`rendimento:${rendimentoCarcaca}%`);
    if (precoVenda) partes.push(`preco_venda:${precoVenda}`);
    return partes.join(" | ") || undefined;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar Status</DialogTitle>
          <DialogDescription>
            Animal: <strong>{animal.brinco}</strong>{animal.nome ? ` — ${animal.nome}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Novo status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="vendido">Vendido</SelectItem>
                <SelectItem value="abatido">Abatido</SelectItem>
                <SelectItem value="morto">Morto</SelectItem>
                <SelectItem value="transferido">Transferido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isVendidoOuAbatido && (
            <>
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Preencha os dados de saída para integração automática com o Painel de Rentabilidade.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Peso de saída (kg)</Label>
                  <Input
                    type="number" min="0" step="0.1"
                    value={pesoSaida}
                    onChange={e => setPesoSaida(e.target.value)}
                    placeholder="Ex: 480"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rendimento carcaça (%)</Label>
                  <Input
                    type="number" min="0" max="100" step="0.1"
                    value={rendimentoCarcaca}
                    onChange={e => setRendimentoCarcaca(e.target.value)}
                    placeholder="52"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Preço de venda (R$/@)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={precoVenda}
                  onChange={e => setPrecoVenda(e.target.value)}
                  placeholder="Ex: 340,27"
                />
              </div>
              {pesoSaida && animal.ultimo_peso && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 space-y-0.5">
                  <p className="font-semibold">Resumo de saída</p>
                  <p>Ganho: <strong>{(Number(pesoSaida) - Number(animal.ultimo_peso)).toFixed(1)} kg</strong></p>
                  {rendimentoCarcaca && (
                    <p>Arrobas: <strong>{((Number(pesoSaida) * (Number(rendimentoCarcaca) / 100)) / 15).toFixed(2)} @</strong></p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo / Observação</Label>
            <Input id="motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ animalId: animal.id, imovelId, especie, status, motivo: buildMotivo() })}
            className="text-white"
            style={{ background: "oklch(0.45 0.14 145)" }}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Animais() {
  const { imovelId } = useRuralAuth();
  const [especie, setEspecie] = useState<Especie>("ovinos");
  const [search, setSearch] = useState("");
  const [sexFilter, setSexFilter] = useState(" ");
  const [statusFilter, setStatusFilter] = useState(" ");

  const [showCreate, setShowCreate] = useState(false);
  const [editAnimal, setEditAnimal] = useState<Animal | null>(null);
  const [statusAnimal, setStatusAnimal] = useState<Animal | null>(null);
  const [deleteAnimal, setDeleteAnimal] = useState<Animal | null>(null);

  const imovelIdSafe = imovelId ?? 0;
  const enabled = Boolean(imovelId);

  const ovinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "ovinos" }, { enabled: enabled && especie === "ovinos" });
  const caprinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "caprinos" }, { enabled: enabled && especie === "caprinos" });
  const suinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "suinos" }, { enabled: enabled && especie === "suinos" });
  const bovinosQ = trpc.railway.animais.useQuery({ imovelId: imovelIdSafe, especie: "bovinos" }, { enabled: enabled && especie === "bovinos" });

  const queryMap = { ovinos: ovinosQ, caprinos: caprinosQ, suinos: suinosQ, bovinos: bovinosQ };
  const currentQuery = queryMap[especie];
  const allAnimals = (currentQuery.data ?? []) as Animal[];

  const filtered = useMemo(() => allAnimals.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.brinco.toLowerCase().includes(q) || (a.nome ?? "").toLowerCase().includes(q) || (a.raca_nome ?? a.raca ?? "").toLowerCase().includes(q);
    const matchSex = sexFilter.trim() === "" || a.sexo === sexFilter;
    const matchStatus = statusFilter.trim() === "" || a.status === statusFilter;
    return matchSearch && matchSex && matchStatus;
  }), [allAnimals, search, sexFilter, statusFilter]);

  const especieInfo = ESPECIES.find(e => e.value === especie)!;
  const utils = trpc.useUtils();

  if (!imovelId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Selecione uma propriedade para visualizar os animais.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.06 145)" }}>
            Animais
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestão do rebanho por espécie</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 text-white" style={{ background: "oklch(0.45 0.14 145)" }}>
          <Plus className="w-4 h-4" /> Novo animal
        </Button>
      </div>

      {/* Species tabs */}
      <div className="flex gap-2 flex-wrap">
        {ESPECIES.map(e => (
          <button
            key={e.value}
            onClick={() => { setEspecie(e.value); setSearch(""); setSexFilter(" "); setStatusFilter(" "); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
            style={
              especie === e.value
                ? { background: e.color, color: "white", boxShadow: `0 4px 12px ${e.color}55` }
                : { background: "white", color: "oklch(0.40 0.06 145)", border: "1px solid oklch(0.88 0.02 145)" }
            }
          >
            {e.label}
            {especie === e.value && (
              <span className="bg-white/25 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                {allAnimals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por brinco, nome ou raça..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <Select value={sexFilter} onValueChange={setSexFilter}>
          <SelectTrigger className="w-32">
            <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sexo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">Todos</SelectItem>
            <SelectItem value="M">Macho</SelectItem>
            <SelectItem value="F">Fêmea</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="vendido">Vendido</SelectItem>
            <SelectItem value="morto">Morto</SelectItem>
            <SelectItem value="transferido">Transferido</SelectItem>
          </SelectContent>
        </Select>
        {(search || sexFilter.trim() || statusFilter.trim()) && (
          <button onClick={() => { setSearch(""); setSexFilter(" "); setStatusFilter(" "); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid oklch(0.88 0.02 145)", background: "white", boxShadow: "0 2px 12px oklch(0.22 0.06 145 / 0.06)" }}>
        {currentQuery.isLoading ? (
          <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando animais...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <p className="font-medium">Nenhum animal encontrado</p>
            <p className="text-sm mt-1">
              {allAnimals.length === 0
                ? `Clique em "Novo animal" para cadastrar o primeiro ${especie.slice(0, -1)}.`
                : "Tente ajustar os filtros de busca."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "oklch(0.96 0.008 145)", borderBottom: "1px solid oklch(0.88 0.02 145)" }}>
                  {["Brinco", "Nome", "Espécie", "Raça", "Sexo", "Categoria", "Peso (kg)", "Status", "Ações"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "oklch(0.42 0.08 145)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={a.id} className="transition-colors hover:bg-muted/30" style={{ borderBottom: i < filtered.length - 1 ? "1px solid oklch(0.93 0.01 145)" : "none" }}>
                    <td className="px-4 py-3 font-mono font-semibold text-xs" style={{ color: "oklch(0.30 0.08 145)" }}>{a.brinco}</td>
                    <td className="px-4 py-3 font-medium">{a.nome ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${especieInfo.color}22`, color: especieInfo.color }}>
                        {especieInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.raca_nome ?? a.raca ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.sexo === "M" ? "Macho" : "Fêmea"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.categoria ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.ultimo_peso ?? a.peso_nascimento ?? "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setStatusAnimal(a)}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
                        style={{ background: `${STATUS_COLORS[a.status] ?? "oklch(0.50 0.08 200)"}22`, color: STATUS_COLORS[a.status] ?? "oklch(0.50 0.08 200)" }}
                        title="Clique para alterar status"
                      >
                        {a.status}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditAnimal(a)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => setDeleteAnimal(a)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors" title="Remover">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t text-xs text-muted-foreground" style={{ borderColor: "oklch(0.93 0.01 145)" }}>
              {filtered.length} animal{filtered.length !== 1 ? "is" : ""} exibido{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <AnimalFormModal open onClose={() => setShowCreate(false)} imovelId={imovelId} especie={especie} onSuccess={() => utils.railway.animais.invalidate()} />
      )}
      {editAnimal && (
        <AnimalFormModal open onClose={() => setEditAnimal(null)} imovelId={imovelId} especie={especie} animal={editAnimal} onSuccess={() => utils.railway.animais.invalidate()} />
      )}
      {statusAnimal && (
        <StatusModal open onClose={() => setStatusAnimal(null)} animal={statusAnimal} imovelId={imovelId} especie={especie} onSuccess={() => utils.railway.animais.invalidate()} />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteAnimal} onOpenChange={(v) => !v && setDeleteAnimal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover animal</AlertDialogTitle>
            <AlertDialogDescription>
              A API não suporta exclusão direta de animais. Para remover <strong>{deleteAnimal?.brinco}</strong>, altere seu status para <em>Morto</em> ou <em>Vendido</em> usando o botão de status na tabela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Entendido</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setStatusAnimal(deleteAnimal!); setDeleteAnimal(null); }}
              className="text-white"
              style={{ background: "oklch(0.45 0.14 145)" }}
            >
              Alterar status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
