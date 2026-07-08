import { useState, useEffect } from "react";
import { Plus, FileSignature, Search, RefreshCw, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

interface ContratoRural {
  id: number;
  tipo: string;
  descricao?: string;
  valor?: number;
  data_inicio?: string;
  data_fim?: string;
  status?: string;
  imovel_id?: number;
}

async function fetchContratos(): Promise<ContratoRural[]> {
  const res = await fetch(`${API_BASE}/contratos-rurais`);
  if (!res.ok) throw new Error("Erro ao buscar contratos");
  return res.json();
}

async function deleteContrato(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/contratos-rurais/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Erro ao excluir contrato");
}

const TIPO_LABELS: Record<string, string> = {
  arrendamento: "Arrendamento",
  parceria: "Parceria",
  comodato: "Comodato",
  prestacao_servico: "Prestação de Serviço",
  compra_venda: "Compra e Venda",
  condominio: "Condomínio Rural",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  encerrado: "bg-gray-100 text-gray-600",
  pendente: "bg-yellow-100 text-yellow-700",
  vencido: "bg-red-100 text-red-700",
};

export default function ContratosRurais() {
  const [contratos, setContratos] = useState<ContratoRural[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tipo: "", descricao: "", valor: "", data_inicio: "", data_fim: "" });
  const imovelId = getImovelId();

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchContratos();
      setContratos(data);
    } catch {
      toast.error("Não foi possível carregar os contratos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = contratos.filter((c) =>
    c.tipo?.toLowerCase().includes(search.toLowerCase()) ||
    c.descricao?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.tipo) { toast.error("Selecione o tipo de contrato"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/contratos-rurais`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: form.tipo,
          descricao: form.descricao || undefined,
          valor: form.valor ? Number(form.valor) : undefined,
          data_inicio: form.data_inicio || undefined,
          data_fim: form.data_fim || undefined,
          imovel_id: imovelId,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Erro"); }
      const novo = await res.json();
      setContratos((prev) => [novo, ...prev]);
      setShowNew(false);
      setForm({ tipo: "", descricao: "", valor: "", data_inicio: "", data_fim: "" });
      toast.success("Contrato criado com sucesso");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar contrato");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este contrato?")) return;
    try {
      await deleteContrato(id);
      setContratos((prev) => prev.filter((c) => c.id !== id));
      toast.success("Contrato excluído");
    } catch {
      toast.error("Erro ao excluir contrato");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Contratos Rurais</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Arrendamentos, parcerias e outros contratos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Contrato
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar contrato..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: contratos.length },
          { label: "Ativos", value: contratos.filter((c) => c.status === "ativo").length },
          { label: "Pendentes", value: contratos.filter((c) => c.status === "pendente").length },
          { label: "Vencidos", value: contratos.filter((c) => c.status === "vencido").length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>{loading ? "—" : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum contrato encontrado</p>
          <p className="text-sm mt-1">Clique em "Novo Contrato" para cadastrar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.04 145)" }}>
                      <FileSignature className="w-5 h-5" style={{ color: "oklch(0.42 0.14 145)" }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{TIPO_LABELS[c.tipo] ?? c.tipo}</p>
                        {c.status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {c.status}
                          </span>
                        )}
                      </div>
                      {c.descricao && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.descricao}</p>}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {c.data_inicio && <span>Início: {new Date(c.data_inicio).toLocaleDateString("pt-BR")}</span>}
                        {c.data_fim && <span>Fim: {new Date(c.data_fim).toLocaleDateString("pt-BR")}</span>}
                        {c.valor && <span className="font-medium text-emerald-700">R$ {c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Contrato Rural</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input placeholder="Descrição do contrato" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data Início</Label>
                <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Data Fim</Label>
                <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Criar Contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
