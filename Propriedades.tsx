import { useState } from "react";
import { Plus, MapPin, Search, RefreshCw, Pencil, Trash2, Building2, AlertTriangle, Loader2, Users, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface Imovel {
  id: number;
  nome: string;
  municipio?: string;
  uf?: string;
  area_ha?: number;
  nirf?: string;
  total_produtores?: number;
}

const FORM_EMPTY = { nome: "", municipio: "", uf: "", area_ha: "", nirf: "", car: "", caepf: "" };

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function Propriedades() {
  const utils = trpc.useUtils();
  const [search, setSearch]     = useState("");
  const [showNew, setShowNew]   = useState(false);
  const [editItem, setEditItem] = useState<Imovel | null>(null);
  const [deleteItem, setDeleteItem] = useState<Imovel | null>(null);
  const [adminItem, setAdminItem] = useState<Imovel | null>(null);
  const [novoCpf, setNovoCpf] = useState("");
  const [form, setForm]         = useState({ ...FORM_EMPTY });

  const { data: imoveis = [], isLoading, error, refetch } = trpc.railway.imoveis.useQuery(undefined, {
    retry: 1,
    staleTime: 30_000,
  });

  const criarMutation = trpc.railway.criarImovel.useMutation({
    onSuccess: () => {
      toast.success("Propriedade cadastrada com sucesso!");
      utils.railway.imoveis.invalidate();
      setShowNew(false);
      setForm({ ...FORM_EMPTY });
    },
    onError: (e) => toast.error(e.message ?? "Erro ao cadastrar propriedade"),
  });

  const editarMutation = trpc.railway.editarImovel.useMutation({
    onSuccess: () => {
      toast.success("Propriedade atualizada com sucesso!");
      utils.railway.imoveis.invalidate();
      setEditItem(null);
    },
    onError: (e) => toast.error(e.message ?? "Erro ao atualizar propriedade"),
  });

  const excluirMutation = trpc.railway.excluirImovel.useMutation({
    onSuccess: () => {
      toast.success("Propriedade excluída com sucesso!");
      utils.railway.imoveis.invalidate();
      setDeleteItem(null);
    },
    onError: (e) => toast.error(e.message ?? "Erro ao excluir propriedade"),
  });

  const administradoresQuery = trpc.railway.listarAdministradores.useQuery(
    { imovelId: adminItem?.id ?? 0 },
    { enabled: !!adminItem },
  );

  const adicionarAdminMutation = trpc.railway.adicionarAdministrador.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.produtor_nome} adicionado como administrador`);
      setNovoCpf("");
      utils.railway.listarAdministradores.invalidate({ imovelId: adminItem?.id ?? 0 });
    },
    onError: (e) => toast.error(e.message ?? "Erro ao adicionar administrador"),
  });

  const removerAdminMutation = trpc.railway.removerAdministrador.useMutation({
    onSuccess: () => {
      toast.success("Administrador removido");
      utils.railway.listarAdministradores.invalidate({ imovelId: adminItem?.id ?? 0 });
    },
    onError: () => toast.error("Erro ao remover administrador"),
  });

  const handleAdicionarAdmin = () => {
    const cpfLimpo = novoCpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) { toast.error("Informe um CPF válido (11 dígitos)"); return; }
    if (!adminItem) return;
    adicionarAdminMutation.mutate({ imovelId: adminItem.id, cpf: cpfLimpo });
  };

  const handleCreate = () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da propriedade"); return; }
    criarMutation.mutate({
      nome:      form.nome.trim(),
      municipio: form.municipio.trim() || undefined,
      uf:        form.uf || undefined,
      area_ha:   form.area_ha ? Number(form.area_ha) : undefined,
      nirf:      form.nirf.trim() || undefined,
      car:       form.car.trim() || undefined,
      caepf:     form.caepf.trim() || undefined,
    });
  };

  const handleEdit = (im: Imovel) => {
    setEditItem(im);
    setForm({ nome: im.nome ?? "", municipio: im.municipio ?? "", uf: im.uf ?? "", area_ha: im.area_ha ? String(im.area_ha) : "", nirf: im.nirf ?? "", car: "", caepf: "" });
  };

  const handleUpdate = () => {
    if (!editItem) return;
    editarMutation.mutate({
      imovelId:  editItem.id,
      nome:      form.nome.trim() || undefined,
      municipio: form.municipio.trim() || undefined,
      uf:        form.uf || undefined,
      area_ha:   form.area_ha ? Number(form.area_ha) : undefined,
      nirf:      form.nirf.trim() || undefined,
      car:       form.car.trim() || undefined,
    });
  };

  const filtered = (imoveis as Imovel[]).filter((im) =>
    im.nome?.toLowerCase().includes(search.toLowerCase()) ||
    im.municipio?.toLowerCase().includes(search.toLowerCase()) ||
    im.uf?.toLowerCase().includes(search.toLowerCase())
  );

  const formFields = (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>Nome da Propriedade *</Label>
        <Input
          placeholder="Ex: Fazenda Sao Joao"
          value={form.nome}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Municipio</Label>
          <Input
            placeholder="Ex: Amparo do Serra"
            value={form.municipio}
            onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>UF</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={form.uf}
            onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))}
          >
            <option value="">Selecione...</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Area Total (ha)</Label>
          <Input
            type="number"
            placeholder="0.0"
            value={form.area_ha}
            onChange={(e) => setForm((f) => ({ ...f, area_ha: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>NIRF</Label>
          <Input
            placeholder="Numero do imovel rural"
            value={form.nirf}
            onChange={(e) => setForm((f) => ({ ...f, nirf: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>CAR</Label>
          <Input
            placeholder="Cadastro Ambiental Rural"
            value={form.car}
            onChange={(e) => setForm((f) => ({ ...f, car: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>CAEPF</Label>
          <Input
            placeholder="Cadastro de Atividade"
            value={form.caepf}
            onChange={(e) => setForm((f) => ({ ...f, caepf: e.target.value }))}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Propriedades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestao das propriedades rurais cadastradas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => { setForm({ ...FORM_EMPTY }); setShowNew(true); }} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Propriedade
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">Nao foi possivel carregar as propriedades</p>
            <p className="text-xs text-red-600 mt-0.5">{error.message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, municipio ou UF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: "oklch(0.35 0.12 145)" }}>{isLoading ? "..." : (imoveis as Imovel[]).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Area Total</p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: "oklch(0.35 0.12 145)" }}>
              {isLoading ? "..." : `${(imoveis as Imovel[]).reduce((s, im) => s + (im.area_ha ?? 0), 0).toFixed(1)} ha`}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? "Nenhuma propriedade encontrada" : "Nenhuma propriedade cadastrada"}</p>
          {!search && <p className="text-sm mt-1">Clique em Nova Propriedade para comecar</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((im) => (
            <Card key={im.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.95 0.03 145)" }}>
                      <Building2 className="w-5 h-5" style={{ color: "oklch(0.42 0.14 145)" }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{im.nome}</p>
                      {(im.municipio || im.uf) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {[im.municipio, im.uf].filter(Boolean).join(" - ")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {im.area_ha != null && im.area_ha > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{im.area_ha} ha</Badge>}
                        {im.nirf && <Badge variant="outline" className="text-[10px] h-4 px-1.5">NIRF: {im.nirf}</Badge>}
                        {im.total_produtores != null && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{im.total_produtores} produtor(es)</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50" title="Administradores" onClick={() => setAdminItem(im)}>
                      <Users className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50" title="Editar" onClick={() => handleEdit(im)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-red-500 hover:text-red-700 hover:bg-red-50" title="Excluir" onClick={() => setDeleteItem(im)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={(o) => { if (!o) setShowNew(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" />
              Nova Propriedade
            </DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={criarMutation.isPending} style={{ background: "oklch(0.42 0.14 145)" }}>
              {criarMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Cadastrar Propriedade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-500" />
              Editar - {editItem?.nome}
            </DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={editarMutation.isPending} style={{ background: "oklch(0.42 0.14 145)" }}>
              {editarMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : "Salvar Alteracoes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteItem} onOpenChange={(o) => { if (!o) setDeleteItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Excluir Propriedade
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteItem?.nome}</strong>? Essa ação não pode ser desfeita.
            Se houver lançamentos vinculados a essa propriedade, a exclusão será bloqueada.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={excluirMutation.isPending}
              onClick={() => deleteItem && excluirMutation.mutate({ imovelId: deleteItem.id })}
            >
              {excluirMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</> : "Sim, excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Administradores — acesso operacional, sem participação societária */}
      <Dialog open={!!adminItem} onOpenChange={(o) => { if (!o) { setAdminItem(null); setNovoCpf(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Administradores — {adminItem?.nome}
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground -mt-2">
            Pessoas com acesso operacional a essa propriedade, sem participação
            societária nem responsabilidade tributária. Não altera a apuração
            fiscal nem quem é o contribuinte.
          </p>

          <div className="space-y-2">
            <Label>Adicionar por CPF</Label>
            <div className="flex gap-2">
              <Input
                placeholder="000.000.000-00"
                value={novoCpf}
                onChange={(e) => setNovoCpf(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdicionarAdmin(); }}
              />
              <Button
                onClick={handleAdicionarAdmin}
                disabled={adicionarAdminMutation.isPending}
                style={{ background: "oklch(0.42 0.14 145)" }}
              >
                {adicionarAdminMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <UserPlus className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A pessoa precisa já ter um cadastro no RuralCaixa (mesmo CPF usado no login dela).
            </p>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {administradoresQuery.isLoading ? (
              <Skeleton className="h-12 rounded-lg" />
            ) : (administradoresQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum administrador ainda</p>
            ) : (
              administradoresQuery.data!.map((a) => (
                <div key={a.produtor_id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.nome}</p>
                    <p className="text-xs text-muted-foreground">CPF {a.cpf}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    title="Remover"
                    onClick={() => adminItem && removerAdminMutation.mutate({ imovelId: adminItem.id, produtorId: a.produtor_id })}
                    disabled={removerAdminMutation.isPending}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAdminItem(null); setNovoCpf(""); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
