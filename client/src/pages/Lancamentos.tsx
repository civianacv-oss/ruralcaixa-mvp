import { useState, useEffect } from "react";
import { Plus, Receipt, Search, RefreshCw, Trash2, TrendingUp, TrendingDown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getProdutorId, getImovelId, getLancamentos, createLancamento, deleteLancamento, type Lancamento } from "@/lib/api";

const TIPO_COLORS: Record<string, string> = {
  receita: "text-emerald-700 bg-emerald-50",
  despesa: "text-red-600 bg-red-50",
  transferencia: "text-blue-600 bg-blue-50",
};

export default function Lancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tipo: "receita", descricao: "", valor: "", data_lancamento: new Date().toISOString().split("T")[0], atividade: "" });
  const produtorId = getProdutorId();
  const imovelId = getImovelId();

  const load = async () => {
    if (!produtorId) return;
    setLoading(true);
    try {
      const data = await getLancamentos(produtorId);
      setLancamentos(data);
    } catch {
      toast.error("Não foi possível carregar os lançamentos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [produtorId]);

  const filtered = lancamentos.filter((l) => {
    const matchSearch = l.descricao?.toLowerCase().includes(search.toLowerCase()) || l.atividade?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filtroTipo === "todos" || l.tipo === filtroTipo;
    return matchSearch && matchTipo;
  });

  const totalReceita = lancamentos.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const totalDespesa = lancamentos.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (!form.valor || Number(form.valor) <= 0) { toast.error("Informe um valor válido"); return; }
    setSaving(true);
    try {
      const novo = await createLancamento({
        tipo: form.tipo,
        descricao: form.descricao,
        valor: Number(form.valor),
        data_lancamento: form.data_lancamento,
        atividade: form.atividade || undefined,
        confirmado: false,
      });
      setLancamentos((prev) => [novo, ...prev]);
      setShowNew(false);
      setForm({ tipo: "receita", descricao: "", valor: "", data_lancamento: new Date().toISOString().split("T")[0], atividade: "" });
      toast.success("Lançamento criado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar lançamento");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      await deleteLancamento(id);
      setLancamentos((prev) => prev.filter((l) => l.id !== id));
      toast.success("Lançamento excluído");
    } catch {
      toast.error("Erro ao excluir lançamento");
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Lançamentos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Receitas e despesas da propriedade</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Receitas</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-emerald-700">{loading ? "—" : fmt(totalReceita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Despesas</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{loading ? "—" : fmt(totalDespesa)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Resultado</p>
            <p className={`text-2xl font-bold mt-1 ${totalReceita - totalDespesa >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {loading ? "—" : fmt(totalReceita - totalDespesa)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar lançamento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="receita">Receitas</SelectItem>
            <SelectItem value="despesa">Despesas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum lançamento encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => (
            <Card key={l.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${TIPO_COLORS[l.tipo] ?? "bg-gray-100 text-gray-600"}`}>
                      {l.tipo}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{l.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(l.data_lancamento).toLocaleDateString("pt-BR")}
                        {l.atividade && ` · ${l.atividade}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-bold ${l.tipo === "receita" ? "text-emerald-700" : "text-red-600"}`}>
                      {l.tipo === "despesa" ? "-" : "+"}{fmt(l.valor)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(l.id)} className="text-red-400 hover:text-red-600 w-7 h-7 p-0">
                      <Trash2 className="w-3.5 h-3.5" />
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
          <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Venda de ovinos" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input type="number" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={form.data_lancamento} onChange={(e) => setForm({ ...form, data_lancamento: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <Input placeholder="Ex: Pecuária, Agricultura..." value={form.atividade} onChange={(e) => setForm({ ...form, atividade: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Criar Lançamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
