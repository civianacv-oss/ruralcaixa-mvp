import { useState, useEffect } from "react";
import { Plus, RefreshCw, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

interface AcaiDashboard {
  producao_total_kg?: number;
  receita_total?: number;
  despesa_total?: number;
  resultado?: number;
  area_ha?: number;
  produtividade_kg_ha?: number;
}

interface AcaiInsumo {
  id: number;
  descricao: string;
  quantidade?: number;
  valor?: number;
  data?: string;
}

async function fetchDashboard(imovelId: number): Promise<AcaiDashboard> {
  const res = await fetch(`${API_BASE}/acai/dashboard/${imovelId}`);
  if (!res.ok) return {};
  return res.json();
}

async function fetchInsumos(): Promise<AcaiInsumo[]> {
  const res = await fetch(`${API_BASE}/acai/insumos`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.items ?? [];
}

export default function CultivoAcai() {
  const [dashboard, setDashboard] = useState<AcaiDashboard>({});
  const [insumos, setInsumos] = useState<AcaiInsumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ descricao: "", quantidade: "", valor: "", data: new Date().toISOString().split("T")[0] });
  const imovelId = getImovelId();

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const [dash, ins] = await Promise.all([fetchDashboard(imovelId), fetchInsumos()]);
      setDashboard(dash);
      setInsumos(ins);
    } catch {
      toast.error("Não foi possível carregar os dados do cultivo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [imovelId]);

  const fmt = (v?: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error("Informe a descrição do insumo"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/acai/insumos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: form.descricao,
          quantidade: form.quantidade ? Number(form.quantidade) : undefined,
          valor: form.valor ? Number(form.valor) : undefined,
          data: form.data,
          imovel_id: imovelId,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Erro"); }
      const novo = await res.json();
      setInsumos((prev) => [novo, ...prev]);
      setShowNew(false);
      setForm({ descricao: "", quantidade: "", valor: "", data: new Date().toISOString().split("T")[0] });
      toast.success("Insumo registrado com sucesso");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar insumo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Cultivo de Açaí</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Produção, insumos e resultado do açaizal</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Registrar Insumo
          </Button>
        </div>
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Receita</p></div>
            <p className="text-2xl font-bold mt-1 text-emerald-700">{loading ? "—" : fmt(dashboard.receita_total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Despesa</p></div>
            <p className="text-2xl font-bold mt-1 text-red-600">{loading ? "—" : fmt(dashboard.despesa_total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Resultado</p>
            <p className={`text-2xl font-bold mt-1 ${(dashboard.resultado ?? 0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {loading ? "—" : fmt(dashboard.resultado)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Produção Total</p>
            <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>
              {loading ? "—" : `${(dashboard.producao_total_kg ?? 0).toLocaleString("pt-BR")} kg`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Área</p>
            <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>
              {loading ? "—" : `${dashboard.area_ha ?? 0} ha`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4" style={{ color: "oklch(0.42 0.14 145)" }} /><p className="text-xs text-muted-foreground uppercase tracking-wide">Produtividade</p></div>
            <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>
              {loading ? "—" : `${(dashboard.produtividade_kg_ha ?? 0).toLocaleString("pt-BR")} kg/ha`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Insumos */}
      <div>
        <h2 className="text-base font-semibold mb-3" style={{ color: "oklch(0.22 0.06 145)" }}>Insumos Registrados</h2>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : insumos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
            <p className="font-medium">Nenhum insumo registrado</p>
            <p className="text-sm mt-1">Clique em "Registrar Insumo" para adicionar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {insumos.map((ins) => (
              <Card key={ins.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ins.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {ins.data && new Date(ins.data).toLocaleDateString("pt-BR")}
                        {ins.quantidade && ` · ${ins.quantidade} un.`}
                      </p>
                    </div>
                    {ins.valor && (
                      <p className="text-sm font-bold text-red-600 shrink-0">
                        {ins.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Insumo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Adubo, Defensivo, Mão de obra..." value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" placeholder="0" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
