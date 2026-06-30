import { useState, useEffect } from "react";
import { Plus, ShoppingCart, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

interface Operacao {
  id: number;
  tipo: "compra" | "venda";
  produto?: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total?: number;
  data?: string;
  fornecedor_cliente?: string;
  status?: string;
  especie?: string;
}

interface Dashboard {
  total_compras?: number;
  total_vendas?: number;
  resultado?: number;
  alertas_fiscais?: number;
}

async function fetchDashboard(imovelId: number): Promise<Dashboard> {
  const res = await fetch(`${API_BASE}/compravenda/dashboard/${imovelId}`);
  if (!res.ok) return {};
  return res.json();
}

async function fetchCompras(imovelId: number): Promise<Operacao[]> {
  const res = await fetch(`${API_BASE}/compravenda/compras?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : data.items ?? []).map((x: Operacao) => ({ ...x, tipo: "compra" as const }));
}

async function fetchVendas(imovelId: number): Promise<Operacao[]> {
  const res = await fetch(`${API_BASE}/compravenda/vendas?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : data.items ?? []).map((x: Operacao) => ({ ...x, tipo: "venda" as const }));
}

export default function CompraVenda() {
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "compra" | "venda">("todos");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tipo: "venda", produto: "", quantidade: "", valor_unitario: "", data: new Date().toISOString().split("T")[0], fornecedor_cliente: "", especie: "" });
  const imovelId = getImovelId();

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const [dash, compras, vendas] = await Promise.all([
        fetchDashboard(imovelId),
        fetchCompras(imovelId),
        fetchVendas(imovelId),
      ]);
      setDashboard(dash);
      setOperacoes([...compras, ...vendas].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")));
    } catch {
      toast.error("Não foi possível carregar as operações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [imovelId]);

  const filtered = operacoes.filter((o) => filtro === "todos" || o.tipo === filtro);
  const fmt = (v?: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleCreate = async () => {
    if (!form.produto.trim()) { toast.error("Informe o produto"); return; }
    if (!imovelId) { toast.error("Selecione uma propriedade"); return; }
    setSaving(true);
    try {
      const endpoint = form.tipo === "compra" ? "/compravenda/compras" : "/compravenda/vendas";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto: form.produto,
          quantidade: form.quantidade ? Number(form.quantidade) : undefined,
          valor_unitario: form.valor_unitario ? Number(form.valor_unitario) : undefined,
          valor_total: form.quantidade && form.valor_unitario ? Number(form.quantidade) * Number(form.valor_unitario) : undefined,
          data: form.data,
          fornecedor_cliente: form.fornecedor_cliente || undefined,
          especie: form.especie || undefined,
          imovel_id: imovelId,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Erro"); }
      const nova = await res.json();
      setOperacoes((prev) => [{ ...nova, tipo: form.tipo as "compra" | "venda" }, ...prev]);
      setShowNew(false);
      setForm({ tipo: "venda", produto: "", quantidade: "", valor_unitario: "", data: new Date().toISOString().split("T")[0], fornecedor_cliente: "", especie: "" });
      toast.success(`${form.tipo === "compra" ? "Compra" : "Venda"} registrada com sucesso`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar operação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Compra e Venda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Operações de compra e venda de animais e produtos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Operação
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Vendas</p></div>
            <p className="text-2xl font-bold mt-1 text-emerald-700">{loading ? "—" : fmt(dashboard.total_vendas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Compras</p></div>
            <p className="text-2xl font-bold mt-1 text-red-600">{loading ? "—" : fmt(dashboard.total_compras)}</p>
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
            <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /><p className="text-xs text-muted-foreground uppercase tracking-wide">Alertas Fiscais</p></div>
            <p className="text-2xl font-bold mt-1 text-orange-600">{loading ? "—" : (dashboard.alertas_fiscais ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["todos", "compra", "venda"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filtro === f ? "text-white shadow-sm" : "bg-white border hover:bg-gray-50 text-gray-700"}`}
            style={filtro === f ? { background: "oklch(0.42 0.14 145)" } : undefined}
          >
            {f === "todos" ? "Todos" : f === "compra" ? "Compras" : "Vendas"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma operação encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Card key={`${o.tipo}-${o.id}`} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${o.tipo === "venda" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {o.tipo}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{o.produto}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.data && new Date(o.data).toLocaleDateString("pt-BR")}
                        {o.fornecedor_cliente && ` · ${o.fornecedor_cliente}`}
                        {o.especie && ` · ${o.especie}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${o.tipo === "venda" ? "text-emerald-700" : "text-red-600"}`}>
                      {fmt(o.valor_total)}
                    </p>
                    {o.quantidade && <p className="text-xs text-muted-foreground">{o.quantidade} un.</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Operação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="compra">Compra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Produto / Descrição *</Label>
              <Input placeholder="Ex: Ovinos, Ração, Medicamentos..." value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" placeholder="0" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor Unitário (R$)</Label>
                <Input type="number" placeholder="0,00" value={form.valor_unitario} onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Espécie</Label>
                <Input placeholder="Ex: Ovino, Bovino..." value={form.especie} onChange={(e) => setForm({ ...form, especie: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{form.tipo === "compra" ? "Fornecedor" : "Cliente"}</Label>
              <Input placeholder="Nome do fornecedor/cliente" value={form.fornecedor_cliente} onChange={(e) => setForm({ ...form, fornecedor_cliente: e.target.value })} />
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
