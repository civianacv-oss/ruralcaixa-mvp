import { useState } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  HeartPulse, AlertTriangle, Calendar, Plus, Trash2, Pencil,
  Clock, CheckCircle2, Search, Upload, FileSpreadsheet, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type EspecieSaude = "ovinos" | "caprinos" | "suinos" | "bovinos";

const ESPECIES: { value: EspecieSaude; label: string; emoji: string }[] = [
  { value: "ovinos", label: "Ovinos", emoji: "🐑" },
  { value: "caprinos", label: "Caprinos", emoji: "🐐" },
  { value: "suinos", label: "Suínos", emoji: "🐷" },
  { value: "bovinos", label: "Bovinos", emoji: "🐄" },
];

const CATEGORIA_COLORS: Record<string, string> = {
  vacina: "text-emerald-700 bg-emerald-50",
  vermifugo: "text-purple-700 bg-purple-50",
  vermifugacao: "text-purple-700 bg-purple-50",
  medicamento: "text-blue-700 bg-blue-50",
  exame: "text-amber-700 bg-amber-50",
  tratamento: "text-red-700 bg-red-50",
};

export default function Saude() {
  const { imovelId } = useRuralAuth();
  const imovelIdSafe = imovelId ?? 0;
  const enabled = !!imovelId;

  const [especie, setEspecie] = useState<EspecieSaude>("ovinos");
  const [aba, setAba] = useState<"historico" | "calendario">("historico");
  const [search, setSearch] = useState("");

  // Novo registro
  const [showNew, setShowNew] = useState(false);
  const [formInsumoId, setFormInsumoId] = useState("");
  const [formAnimalId, setFormAnimalId] = useState("");
  const [formData, setFormData] = useState(new Date().toISOString().slice(0, 10));
  const [formDose, setFormDose] = useState("");
  const [formVia, setFormVia] = useState("");
  const [formResponsavel, setFormResponsavel] = useState("");
  const [formObs, setFormObs] = useState("");

  // Importação
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  // Confirmação de exclusão
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Edição de registro
  const [editId, setEditId] = useState<number | null>(null);
  const [editDose, setEditDose] = useState("");
  const [editVia, setEditVia] = useState("");
  const [editResponsavel, setEditResponsavel] = useState("");
  const [editObs, setEditObs] = useState("");
  const [editData, setEditData] = useState("");

  const utils = trpc.useUtils();

  const historicoQ = trpc.railway.sanitario.useQuery(
    { imovelId: imovelIdSafe, especie },
    { enabled, refetchOnWindowFocus: false },
  );

  const calendarioQ = trpc.railway.sanitarioCalendario.useQuery(
    { imovelId: imovelIdSafe, especie },
    { enabled, refetchOnWindowFocus: false },
  );

  const insumosQ = trpc.railway.sanitarioInsumos.useQuery(
    { imovelId: imovelIdSafe, especie },
    { enabled: enabled && showNew, refetchOnWindowFocus: false },
  );

  const createMut = trpc.railway.createSanitario.useMutation({
    onSuccess: () => {
      toast.success("Registro sanitário criado!");
      utils.railway.sanitario.invalidate();
      utils.railway.sanitarioCalendario.invalidate();
      resetForm();
      setShowNew(false);
    },
    onError: (e) => toast.error(e.message || "Erro ao criar registro"),
  });

  const updateMut = trpc.railway.updateSanitario.useMutation({
    onSuccess: () => {
      toast.success("Registro atualizado!");
      utils.railway.sanitario.invalidate();
      utils.railway.sanitarioCalendario.invalidate();
      setEditId(null);
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar registro"),
  });

  const deleteMut = trpc.railway.deleteSanitario.useMutation({
    onSuccess: () => {
      toast.success("Registro excluído");
      utils.railway.sanitario.invalidate();
      setConfirmDeleteId(null);
    },
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
  });

  const historico = (historicoQ.data ?? []) as any[];
  const calendario = calendarioQ.data as any;
  const insumos = (insumosQ.data ?? []) as any[];

  const filteredHistorico = historico.filter((r) => {
    const q = search.toLowerCase();
    return (
      (r.nome_comercial ?? "").toLowerCase().includes(q) ||
      (r.animal_brinco ?? "").toLowerCase().includes(q) ||
      (r.categoria ?? "").toLowerCase().includes(q) ||
      (r.responsavel_nome ?? "").toLowerCase().includes(q)
    );
  });

  const vencidos = historico.filter((r) => {
    if (!r.reforco_previsto) return false;
    return new Date(r.reforco_previsto) < new Date();
  }).length;

  const proximos7 = (() => {
    if (!calendario) return 0;
    const now = new Date();
    const in7 = new Date(); in7.setDate(now.getDate() + 7);
    const items = [
      ...(calendario.reforcos_pendentes ?? []),
      ...(calendario.tarefas_sanitarias ?? []),
    ];
    return items.filter((r: any) => {
      if (!r.data_prevista) return false;
      const d = new Date(r.data_prevista);
      return d >= now && d <= in7;
    }).length;
  })();

  function resetForm() {
    setFormInsumoId(""); setFormAnimalId("");
    setFormData(new Date().toISOString().slice(0, 10));
    setFormDose(""); setFormVia(""); setFormResponsavel(""); setFormObs("");
  }

  function openEdit(r: any) {
    setEditId(r.id);
    setEditData(r.data_aplicacao?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setEditDose(r.dose_ml ? String(r.dose_ml) : "");
    setEditVia(r.via ?? "");
    setEditResponsavel(r.responsavel_nome ?? "");
    setEditObs(r.observacoes ?? "");
  }

  function handleUpdate() {
    if (!imovelId || !editId) return;
    updateMut.mutate({
      imovelId,
      especie,
      sanitarioId: editId,
      data_aplicacao: editData,
      dose_ml: editDose ? Number(editDose) : undefined,
      via: editVia || undefined,
      responsavel_nome: editResponsavel || undefined,
      observacoes: editObs || undefined,
    });
  }

  function handleCreate() {
    if (!imovelId) { toast.error("Sessão inválida"); return; }
    if (!formInsumoId) { toast.error("Selecione o produto/insumo"); return; }
    createMut.mutate({
      imovelId,
      especie,
      insumo_id: Number(formInsumoId),
      animal_id: formAnimalId ? Number(formAnimalId) : undefined,
      data_aplicacao: formData,
      dose_ml: formDose ? Number(formDose) : undefined,
      via: formVia || undefined,
      responsavel_nome: formResponsavel || undefined,
      observacoes: formObs || undefined,
    });
  }

  const especieAtual = ESPECIES.find((e) => e.value === especie)!;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-red-500" />
            Saúde Animal
          </h1>
          <p className="text-sm text-muted-foreground">Controle sanitário por espécie</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importar</span>
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }} className="gap-1.5 text-white">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Registro</span>
          </Button>
        </div>
      </div>

      {/* Seletor de espécie */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ESPECIES.map((e) => (
          <button
            key={e.value}
            onClick={() => setEspecie(e.value)}
            className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors " +
              (especie === e.value ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/80")}
            style={especie === e.value ? { background: "oklch(0.42 0.14 145)" } : {}}
          >
            <span>{e.emoji}</span>
            {e.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{historicoQ.isLoading ? "—" : historico.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{historicoQ.isLoading ? "—" : vencidos}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Reforços
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{calendarioQ.isLoading ? "—" : proximos7}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> 7 dias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        <button
          onClick={() => setAba("historico")}
          className={"flex-1 py-1.5 rounded-md text-sm font-medium transition-colors " +
            (aba === "historico" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground")}
        >
          Histórico
        </button>
        <button
          onClick={() => setAba("calendario")}
          className={"flex-1 py-1.5 rounded-md text-sm font-medium transition-colors " +
            (aba === "calendario" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground")}
        >
          Calendário
        </button>
      </div>

      {/* Aba Histórico */}
      {aba === "historico" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto, animal, responsável..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {historicoQ.isError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Erro ao carregar histórico.
              <Button variant="ghost" size="sm" onClick={() => historicoQ.refetch()} className="ml-auto">
                Tentar novamente
              </Button>
            </div>
          )}

          {historicoQ.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : filteredHistorico.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <HeartPulse className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">Nenhum registro sanitário</p>
              <p className="text-sm mt-1">Clique em "Novo Registro" para adicionar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistorico.map((r) => (
                <Card key={r.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={"text-[10px] font-bold uppercase px-2 py-0.5 rounded-full " + (CATEGORIA_COLORS[r.categoria] ?? "bg-gray-100 text-gray-600")}>
                            {r.categoria}
                          </span>
                          {r.animal_brinco && (
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                              #{r.animal_brinco}
                            </span>
                          )}
                          {r.carencia_ativa && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              Carência ativa
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium mt-1">{r.nome_comercial}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.data_aplicacao).toLocaleDateString("pt-BR")}
                          {r.dose_ml ? ` · ${r.dose_ml} mL` : ""}
                          {r.via ? ` · ${r.via}` : ""}
                          {r.responsavel_nome ? ` · ${r.responsavel_nome}` : ""}
                        </p>
                        {r.reforco_previsto && (
                          <p className={"text-xs mt-0.5 " + (new Date(r.reforco_previsto) < new Date() ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                            {new Date(r.reforco_previsto) < new Date() ? "⚠ " : ""}
                            Reforço: {new Date(r.reforco_previsto).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(r)}
                          className="text-blue-400 hover:text-blue-600 w-7 h-7 p-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(r.id)}
                          className="text-red-400 hover:text-red-600 w-7 h-7 p-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aba Calendário */}
      {aba === "calendario" && (
        <div className="space-y-3">
          {calendarioQ.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : (
            <>
              {(calendario?.reforcos_pendentes ?? []).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Reforços Pendentes
                  </h3>
                  {(calendario.reforcos_pendentes as any[]).map((r: any, i: number) => (
                    <Card key={i} className="border-amber-200 bg-amber-50/40">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{r.nome_comercial}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.animal_brinco ? `#${r.animal_brinco} · ` : ""}{r.responsavel_nome ?? "—"}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-amber-700">
                            {new Date(r.data_prevista).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {(calendario?.tarefas_sanitarias ?? []).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" /> Próximas Tarefas
                  </h3>
                  {(calendario.tarefas_sanitarias as any[]).map((r: any, i: number) => (
                    <Card key={i} className="border-blue-200 bg-blue-50/40">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{r.nome_comercial}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.animal_brinco ? `#${r.animal_brinco} · ` : ""}{r.lote_nome ?? ""}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-blue-700">
                            {new Date(r.data_prevista).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {(calendario?.reforcos_pendentes ?? []).length === 0 && (calendario?.tarefas_sanitarias ?? []).length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-500" />
                  <p className="font-medium">Nenhum evento pendente</p>
                  <p className="text-sm mt-1">Todos os registros estão em dia para {especieAtual.label}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Dialog: Novo Registro */}
      <Dialog open={showNew} onOpenChange={(v) => { if (!v) { resetForm(); setShowNew(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Registro Sanitário — {especieAtual.emoji} {especieAtual.label}</DialogTitle>
            <DialogDescription>Registre vacina, vermífugo, medicamento ou tratamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Espécie *</Label>
              <Select value={especie} onValueChange={(v) => setEspecie(v as EspecieSaude)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESPECIES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.emoji} {e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Produto / Insumo *</Label>
              {insumosQ.isLoading ? (
                <Skeleton className="h-9 rounded-md" />
              ) : insumos.length > 0 ? (
                <Select value={formInsumoId} onValueChange={setFormInsumoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o produto..." /></SelectTrigger>
                  <SelectContent>
                    {insumos.map((ins: any) => (
                      <SelectItem key={ins.id} value={String(ins.id)}>
                        {ins.nome_comercial} ({ins.categoria})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="ID do insumo (ex: 1)"
                  value={formInsumoId}
                  onChange={(e) => setFormInsumoId(e.target.value)}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ID do Animal</Label>
                <Input
                  placeholder="Ex: 1"
                  value={formAnimalId}
                  onChange={(e) => setFormAnimalId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data Aplicação *</Label>
                <Input
                  type="date"
                  value={formData}
                  onChange={(e) => setFormData(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dose (mL)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 2.0"
                  value={formDose}
                  onChange={(e) => setFormDose(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Via</Label>
                <Select value={formVia} onValueChange={setFormVia}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SC">SC (Subcutânea)</SelectItem>
                    <SelectItem value="IM">IM (Intramuscular)</SelectItem>
                    <SelectItem value="IV">IV (Intravenosa)</SelectItem>
                    <SelectItem value="VO">VO (Via Oral)</SelectItem>
                    <SelectItem value="Topica">Tópica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Input
                placeholder="Nome do veterinário ou responsável"
                value={formResponsavel}
                onChange={(e) => setFormResponsavel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input
                placeholder="Observações adicionais..."
                value={formObs}
                onChange={(e) => setFormObs(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowNew(false); }}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending} style={{ background: "oklch(0.42 0.14 145)" }} className="text-white">
              {createMut.isPending ? "Salvando..." : "Criar Registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Registro */}
      <Dialog open={editId !== null} onOpenChange={(v) => { if (!v) setEditId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Registro Sanitário</DialogTitle>
            <DialogDescription>Atualize os dados do registro selecionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Data Aplicação *</Label>
              <Input
                type="date"
                value={editData}
                onChange={(e) => setEditData(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dose (mL)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 2.0"
                  value={editDose}
                  onChange={(e) => setEditDose(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Via</Label>
                <Select value={editVia} onValueChange={setEditVia}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SC">SC (Subcutânea)</SelectItem>
                    <SelectItem value="IM">IM (Intramuscular)</SelectItem>
                    <SelectItem value="IV">IV (Intravenosa)</SelectItem>
                    <SelectItem value="VO">VO (Via Oral)</SelectItem>
                    <SelectItem value="Topica">Tópica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Input
                placeholder="Nome do veterinário ou responsável"
                value={editResponsavel}
                onChange={(e) => setEditResponsavel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input
                placeholder="Observações adicionais..."
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={updateMut.isPending} style={{ background: "oklch(0.42 0.14 145)" }} className="text-white">
              {updateMut.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir registro?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (confirmDeleteId && imovelId) {
                  deleteMut.mutate({ imovelId, especie, sanitarioId: confirmDeleteId });
                }
              }}
            >
              {deleteMut.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Importar Planilha */}
      <Dialog open={showImport} onOpenChange={(v) => { if (!v) { setShowImport(false); setImportFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Importar Registros Sanitários
            </DialogTitle>
            <DialogDescription>
              Selecione um arquivo Excel ou CSV com os registros sanitários.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div
              className="border-2 border-dashed border-muted rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 transition-colors"
              onClick={() => document.getElementById("saude-file-input")?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              {importFile ? (
                <p className="text-sm font-medium text-emerald-700">{importFile.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Clique para selecionar o arquivo</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls ou .csv</p>
                </>
              )}
              <input
                id="saude-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Colunas esperadas:</p>
              <p>especie, produto_id, data_aplicacao, dose_ml, animal_id, responsavel</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>A importação em lote de registros sanitários estará disponível em breve. Use o cadastro manual por enquanto.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportFile(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
