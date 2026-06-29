import { useState, useEffect } from "react";
import { Plus, Sprout, RefreshCw, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

interface Safra {
  id: number;
  cultura: string;
  area_ha?: number;
  data_plantio?: string;
  data_colheita_prevista?: string;
  data_colheita_real?: string;
  producao_kg?: number;
  status?: string;
}

interface Cultura {
  id: number;
  nome: string;
}

async function fetchSafras(imovelId: number): Promise<Safra[]> {
  const res = await fetch(`${API_BASE}/agricultura/imoveis/${imovelId}/safras`);
  if (!res.ok) throw new Error("Erro ao buscar safras");
  const data = await res.json();
  return Array.isArray(data) ? data : data.safras ?? data.items ?? [];
}

async function fetchCulturas(): Promise<Cultura[]> {
  const res = await fetch(`${API_BASE}/agricultura/culturas`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.culturas ?? [];
}

const STATUS_COLORS: Record<string, string> = {
  plantado: "bg-emerald-100 text-emerald-700",
  em_crescimento: "bg-blue-100 text-blue-700",
  colhido: "bg-yellow-100 text-yellow-700",
  perdido: "bg-red-100 text-red-700",
};

export default function Agricultura() {
  const [safras, setSafras] = useState<Safra[]>([]);
  const [culturas, setCulturas] = useState<Cultura[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ cultura: "", area_ha: "", data_plantio: "", data_colheita_prevista: "" });
  const imovelId = getImovelId();

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const [s, c] = await Promise.all([fetchSafras(imovelId), fetchCulturas()]);
      setSafras(s);
      setCulturas(c);
    } catch {
      toast.error("Não foi possível carregar as safras");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [imovelId]);

  const totalArea = safras.reduce((s, x) => s + (x.area_ha ?? 0), 0);
  const ativas = safras.filter((s) => s.status === "plantado" || s.status === "em_crescimento").length;

  const handleCreate = async () => {
    if (!form.cultura.trim()) { toast.error("Informe a cultura"); return; }
    if (!imovelId) { toast.error("Selecione uma propriedade"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/agricultura/imoveis/${imovelId}/safras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cultura: form.cultura,
          area_ha: form.area_ha ? Number(form.area_ha) : undefined,
          data_plantio: form.data_plantio || undefined,
          data_colheita_prevista: form.data_colheita_prevista || undefined,
          imovel_id: imovelId,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Erro"); }
      const nova = await res.json();
      setSafras((prev) => [nova, ...prev]);
      setShowNew(false);
      setForm({ cultura: "", area_ha: "", data_plantio: "", data_colheita_prevista: "" });
      toast.success("Safra criada com sucesso");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar safra");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Agricultura</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Culturas, safras e produção agrícola</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Safra
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Safras", value: safras.length },
          { label: "Ativas", value: ativas },
          { label: "Área Total", value: loading ? "—" : `${totalArea.toFixed(1)} ha` },
          { label: "Colhidas", value: safras.filter((s) => s.status === "colhido").length },
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
      ) : safras.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Sprout className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma safra cadastrada</p>
          <p className="text-sm mt-1">Clique em "Nova Safra" para registrar uma cultura</p>
        </div>
      ) : (
        <div className="space-y-3">
          {safras.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.04 145)" }}>
                    <Leaf className="w-5 h-5" style={{ color: "oklch(0.42 0.14 145)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{s.cultura}</p>
                      {s.status && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {s.status.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-1 text-xs text-muted-foreground">
                      {s.area_ha && <span>{s.area_ha} ha</span>}
                      {s.data_plantio && <span>Plantio: {new Date(s.data_plantio).toLocaleDateString("pt-BR")}</span>}
                      {s.data_colheita_prevista && <span>Colheita prev.: {new Date(s.data_colheita_prevista).toLocaleDateString("pt-BR")}</span>}
                      {s.producao_kg && <span className="font-medium text-emerald-700">{s.producao_kg.toLocaleString("pt-BR")} kg</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Safra</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Cultura *</Label>
              {culturas.length > 0 ? (
                <Select value={form.cultura} onValueChange={(v) => setForm({ ...form, cultura: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a cultura" /></SelectTrigger>
                  <SelectContent>
                    {culturas.map((c) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
                    <SelectItem value="outro">Outra cultura</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Ex: Soja, Milho, Feijão..." value={form.cultura} onChange={(e) => setForm({ ...form, cultura: e.target.value })} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Área (ha)</Label>
              <Input type="number" placeholder="0.0" value={form.area_ha} onChange={(e) => setForm({ ...form, area_ha: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data Plantio</Label>
                <Input type="date" value={form.data_plantio} onChange={(e) => setForm({ ...form, data_plantio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Colheita Prevista</Label>
                <Input type="date" value={form.data_colheita_prevista} onChange={(e) => setForm({ ...form, data_colheita_prevista: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Criar Safra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
