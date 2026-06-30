import { useState, useEffect } from "react";
import { Plus, Calculator, RefreshCw, Trash2, Eye, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

interface Acerto {
  id: number;
  safra?: string;
  descricao?: string;
  receita_total?: number;
  despesa_total?: number;
  resultado?: number;
  data_acerto?: string;
  status?: string;
}

async function fetchAcertos(): Promise<Acerto[]> {
  const res = await fetch(`${API_BASE}/acertos-contrato/`);
  if (!res.ok) throw new Error("Erro ao buscar acertos");
  const data = await res.json();
  return Array.isArray(data) ? data : data.items ?? [];
}

export default function AcertoContrato() {
  const [acertos, setAcertos] = useState<Acerto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ safra: "", descricao: "", receita_total: "", despesa_total: "", data_acerto: "" });
  const imovelId = getImovelId();

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAcertos();
      setAcertos(data);
    } catch {
      toast.error("Não foi possível carregar os acertos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalReceita = acertos.reduce((s, a) => s + (a.receita_total ?? 0), 0);
  const totalDespesa = acertos.reduce((s, a) => s + (a.despesa_total ?? 0), 0);
  const totalResultado = totalReceita - totalDespesa;

  const handleCreate = async () => {
    if (!form.safra.trim()) { toast.error("Informe a safra"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/acertos-contrato/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safra: form.safra,
          descricao: form.descricao || undefined,
          receita_total: form.receita_total ? Number(form.receita_total) : undefined,
          despesa_total: form.despesa_total ? Number(form.despesa_total) : undefined,
          data_acerto: form.data_acerto || undefined,
          imovel_id: imovelId,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Erro"); }
      const novo = await res.json();
      setAcertos((prev) => [novo, ...prev]);
      setShowNew(false);
      setForm({ safra: "", descricao: "", receita_total: "", despesa_total: "", data_acerto: "" });
      toast.success("Acerto criado com sucesso");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar acerto");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este acerto?")) return;
    try {
      await fetch(`${API_BASE}/acertos-contrato/${id}`, { method: "DELETE" });
      setAcertos((prev) => prev.filter((a) => a.id !== id));
      toast.success("Acerto excluído");
    } catch {
      toast.error("Erro ao excluir acerto");
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Acerto de Contrato</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Fechamento de safra e resultado por contrato</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Acerto
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Receita Total</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-emerald-700">{loading ? "—" : fmt(totalReceita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Despesa Total</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{loading ? "—" : fmt(totalDespesa)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4" style={{ color: "oklch(0.42 0.14 145)" }} />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Resultado</p>
            </div>
            <p className={`text-2xl font-bold mt-1 ${totalResultado >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {loading ? "—" : fmt(totalResultado)}
            </p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : acertos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum acerto registrado</p>
          <p className="text-sm mt-1">Clique em "Novo Acerto" para registrar o fechamento de uma safra</p>
        </div>
      ) : (
        <div className="space-y-3">
          {acertos.map((a) => (
            <Card key={a.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.04 145)" }}>
                      <Calculator className="w-5 h-5" style={{ color: "oklch(0.42 0.14 145)" }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">Safra {a.safra}</p>
                      {a.descricao && <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.descricao}</p>}
                      <div className="flex gap-4 mt-1 text-xs">
                        {a.receita_total != null && <span className="text-emerald-700">Receita: {fmt(a.receita_total)}</span>}
                        {a.despesa_total != null && <span className="text-red-600">Despesa: {fmt(a.despesa_total)}</span>}
                        {a.resultado != null && (
                          <span className={`font-bold ${a.resultado >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            Resultado: {fmt(a.resultado)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} className="text-red-500 hover:text-red-700">
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
          <DialogHeader><DialogTitle>Novo Acerto de Contrato</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Safra *</Label>
              <Input placeholder="Ex: 2024/2025" value={form.safra} onChange={(e) => setForm({ ...form, safra: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input placeholder="Descrição do acerto" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Receita Total (R$)</Label>
                <Input type="number" placeholder="0,00" value={form.receita_total} onChange={(e) => setForm({ ...form, receita_total: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Despesa Total (R$)</Label>
                <Input type="number" placeholder="0,00" value={form.despesa_total} onChange={(e) => setForm({ ...form, despesa_total: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data do Acerto</Label>
              <Input type="date" value={form.data_acerto} onChange={(e) => setForm({ ...form, data_acerto: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Criar Acerto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
