import { useState, useEffect } from "react";
import { Plus, MapPin, Search, RefreshCw, Building2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { API_BASE } from "@/lib/api";

interface Propriedade {
  id: number;
  nome: string;
  municipio?: string;
  uf?: string;
  area_ha?: number;
  car?: string;
  caepf?: string;
  cnpj?: string;
  status?: string;
}

async function fetchPropriedades(): Promise<Propriedade[]> {
  const res = await fetch(`${API_BASE}/propriedades`);
  if (!res.ok) throw new Error("Erro ao buscar propriedades");
  return res.json();
}

async function createPropriedade(data: Partial<Propriedade>): Promise<Propriedade> {
  const res = await fetch(`${API_BASE}/propriedades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Erro ao criar propriedade");
  }
  return res.json();
}

export default function Propriedades() {
  const [propriedades, setPropriedades] = useState<Propriedade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nome: "", municipio: "", uf: "", area_ha: "", car: "", caepf: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPropriedades();
      setPropriedades(data);
    } catch {
      toast.error("Não foi possível carregar as propriedades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = propriedades.filter((p) =>
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.municipio?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da propriedade"); return; }
    setSaving(true);
    try {
      const nova = await createPropriedade({
        nome: form.nome,
        municipio: form.municipio || undefined,
        uf: form.uf || undefined,
        area_ha: form.area_ha ? Number(form.area_ha) : undefined,
        car: form.car || undefined,
        caepf: form.caepf || undefined,
      });
      setPropriedades((prev) => [nova, ...prev]);
      setShowNew(false);
      setForm({ nome: "", municipio: "", uf: "", area_ha: "", car: "", caepf: "" });
      toast.success("Propriedade criada com sucesso");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar propriedade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Propriedades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Imóveis rurais cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Propriedade
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou município..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: propriedades.length },
          { label: "Com CAR", value: propriedades.filter((p) => p.car).length },
          { label: "Com CAEPF", value: propriedades.filter((p) => p.caepf).length },
          { label: "Com CNPJ", value: propriedades.filter((p) => p.cnpj).length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>{loading ? "—" : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma propriedade encontrada</p>
          <p className="text-sm mt-1">Clique em "Nova Propriedade" para cadastrar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.04 145)" }}>
                      <Building2 className="w-5 h-5" style={{ color: "oklch(0.42 0.14 145)" }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{p.nome}</p>
                      {(p.municipio || p.uf) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {[p.municipio, p.uf].filter(Boolean).join(" — ")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.area_ha && <Badge variant="secondary" className="text-xs">{p.area_ha} ha</Badge>}
                        {p.car && <Badge variant="outline" className="text-xs">CAR</Badge>}
                        {p.caepf && <Badge variant="outline" className="text-xs">CAEPF</Badge>}
                        {p.cnpj && <Badge variant="outline" className="text-xs">CNPJ</Badge>}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Propriedade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="Ex: Fazenda São João" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Município</Label>
                <Input placeholder="Ex: Santarém" value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Input placeholder="PA" maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Área (ha)</Label>
              <Input type="number" placeholder="Ex: 150.5" value={form.area_ha} onChange={(e) => setForm({ ...form, area_ha: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CAR</Label>
                <Input placeholder="Código CAR" value={form.car} onChange={(e) => setForm({ ...form, car: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CAEPF</Label>
                <Input placeholder="Número CAEPF" value={form.caepf} onChange={(e) => setForm({ ...form, caepf: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Criar Propriedade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
