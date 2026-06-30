import { useState, useEffect } from "react";
import { Plus, PawPrint, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getImovelId, type Animal } from "@/lib/api";

type Especie = "ovino" | "caprino" | "suino" | "bovino";

const ESPECIES: { key: Especie; label: string; emoji: string }[] = [
  { key: "ovino", label: "Ovinos", emoji: "🐑" },
  { key: "caprino", label: "Caprinos", emoji: "🐐" },
  { key: "suino", label: "Suínos", emoji: "🐷" },
  { key: "bovino", label: "Bovinos", emoji: "🐄" },
];

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-700",
  vendido: "bg-blue-100 text-blue-700",
  morto: "bg-gray-100 text-gray-600",
  abatido: "bg-orange-100 text-orange-700",
};

async function fetchAnimais(especie: Especie, imovelId: number): Promise<Animal[]> {
  const res = await fetch(`${API_BASE}/${especie}/animais?imovel_id=${imovelId}`);
  if (!res.ok) throw new Error("Erro ao buscar animais");
  const data = await res.json();
  return Array.isArray(data) ? data : data.animais ?? data.items ?? [];
}

async function createAnimal(especie: Especie, data: Partial<Animal>): Promise<Animal> {
  const res = await fetch(`${API_BASE}/${especie}/animais`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Erro"); }
  return res.json();
}

export default function Rebanhos() {
  const [especie, setEspecie] = useState<Especie>("ovino");
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ brinco: "", nome: "", raca: "", sexo: "M", data_nascimento: "", peso_nascimento: "", categoria: "" });
  const imovelId = getImovelId();

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const data = await fetchAnimais(especie, imovelId);
      setAnimais(data);
    } catch {
      toast.error("Não foi possível carregar os animais");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [especie, imovelId]);

  const filtered = animais.filter((a) =>
    a.brinco?.toLowerCase().includes(search.toLowerCase()) ||
    a.nome?.toLowerCase().includes(search.toLowerCase()) ||
    a.raca?.toLowerCase().includes(search.toLowerCase()) ||
    a.raca_nome?.toLowerCase().includes(search.toLowerCase())
  );

  const ativos = animais.filter((a) => a.status === "ativo").length;

  const handleCreate = async () => {
    if (!form.brinco.trim()) { toast.error("Informe o brinco/identificação"); return; }
    if (!imovelId) { toast.error("Selecione uma propriedade"); return; }
    setSaving(true);
    try {
      const novo = await createAnimal(especie, {
        brinco: form.brinco,
        nome: form.nome || undefined,
        raca: form.raca || undefined,
        sexo: form.sexo as "M" | "F",
        imovel_id: imovelId,
        data_nascimento: form.data_nascimento || undefined,
        peso_nascimento: form.peso_nascimento ? Number(form.peso_nascimento) : undefined,
        categoria: form.categoria || undefined,
        status: "ativo",
      });
      setAnimais((prev) => [novo, ...prev]);
      setShowNew(false);
      setForm({ brinco: "", nome: "", raca: "", sexo: "M", data_nascimento: "", peso_nascimento: "", categoria: "" });
      toast.success("Animal cadastrado com sucesso");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar animal");
    } finally {
      setSaving(false);
    }
  };

  const especieAtual = ESPECIES.find((e) => e.key === especie)!;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Rebanhos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestão do rebanho por espécie</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Animal
          </Button>
        </div>
      </div>

      {/* Species tabs */}
      <div className="flex gap-2 flex-wrap">
        {ESPECIES.map((e) => (
          <button
            key={e.key}
            onClick={() => setEspecie(e.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              especie === e.key
                ? "text-white shadow-sm"
                : "bg-white border hover:bg-gray-50 text-gray-700"
            }`}
            style={especie === e.key ? { background: "oklch(0.42 0.14 145)" } : undefined}
          >
            <span>{e.emoji}</span>
            {e.label}
            {especie === e.key && !loading && (
              <span className="ml-1 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {ativos}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={`Buscar ${especieAtual.label.toLowerCase()} por brinco, nome ou raça...`} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: animais.length },
          { label: "Ativos", value: animais.filter((a) => a.status === "ativo").length },
          { label: "Fêmeas", value: animais.filter((a) => a.sexo === "F").length },
          { label: "Machos", value: animais.filter((a) => a.sexo === "M").length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: "oklch(0.35 0.12 145)" }}>{loading ? "—" : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PawPrint className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum animal encontrado</p>
          <p className="text-sm mt-1">Clique em "Novo Animal" para cadastrar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base" style={{ background: "oklch(0.92 0.04 145)" }}>
                      {especieAtual.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">#{a.brinco}</p>
                        {a.nome && <p className="text-sm text-muted-foreground">{a.nome}</p>}
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STATUS_COLORS[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {a.status}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{a.sexo === "M" ? "Macho" : "Fêmea"}</span>
                        {(a.raca || a.raca_nome) && <span>{a.raca_nome ?? a.raca}</span>}
                        {a.categoria && <span>{a.categoria}</span>}
                        {a.ultimo_peso && <span>{a.ultimo_peso} kg</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Animal Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Animal — {especieAtual.emoji} {especieAtual.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brinco / ID *</Label>
                <Input placeholder="Ex: 001" value={form.brinco} onChange={(e) => setForm({ ...form, brinco: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input placeholder="Opcional" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sexo *</Label>
                <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Macho</SelectItem>
                    <SelectItem value="F">Fêmea</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Raça</Label>
                <Input placeholder="Ex: Santa Inês" value={form.raca} onChange={(e) => setForm({ ...form, raca: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data Nascimento</Label>
                <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Peso Nasc. (kg)</Label>
                <Input type="number" placeholder="0.0" value={form.peso_nascimento} onChange={(e) => setForm({ ...form, peso_nascimento: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input placeholder="Ex: Matriz, Reprodutor, Cria..." value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Cadastrar Animal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
