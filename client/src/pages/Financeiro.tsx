import { useState } from "react";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, DollarSign, Search, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const TIPO_COLORS: Record<string, string> = {
  receita: "oklch(0.42 0.14 145)",
  despesa: "oklch(0.50 0.20 25)",
  investimento: "oklch(0.50 0.14 220)",
  custo: "oklch(0.55 0.14 60)",
};

interface Lancamento {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  confirmado: boolean;
  atividade?: string;
  produto?: string;
}

// ─── Lançamento Form Modal ────────────────────────────────────────────────────

function LancamentoModal({
  open, onClose, produtorId, lancamento, onSuccess
}: {
  open: boolean; onClose: () => void; produtorId: number;
  lancamento?: Lancamento; onSuccess: () => void;
}) {
  const isEdit = !!lancamento;
  const utils = trpc.useUtils();
  const [tipo, setTipo] = useState<"receita" | "despesa">(lancamento?.tipo === "receita" ? "receita" : "despesa");
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? "");
  const [valor, setValor] = useState(lancamento?.valor ? String(lancamento.valor) : "");
  const [data, setData] = useState(lancamento?.data_lancamento?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [atividade, setAtividade] = useState(lancamento?.atividade ?? "");
  const [confirmado, setConfirmado] = useState(lancamento?.confirmado ?? false);

  const createMutation = trpc.railway.createLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento criado!");
      utils.railway.lancamentos.invalidate();
      utils.railway.produtorResumo.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.railway.updateLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento atualizado!");
      utils.railway.lancamentos.invalidate();
      utils.railway.produtorResumo.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) { toast.error("Descrição é obrigatória."); return; }
    if (!valor || Number(valor) <= 0) { toast.error("Valor deve ser maior que zero."); return; }
    if (isEdit && lancamento) {
      updateMutation.mutate({ lancamentoId: lancamento.id, produtorId, tipo, descricao, valor: Number(valor), data_lancamento: data, confirmado });
    } else {
      createMutation.mutate({ produtorId, tipo, descricao, valor: Number(valor), data_lancamento: data, confirmado, atividade: atividade || undefined });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
          <DialogDescription>{isEdit ? "Atualize os dados do lançamento." : "Registre uma receita ou despesa."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "receita" | "despesa")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data">Data *</Label>
              <Input id="data" type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição *</Label>
            <Input id="descricao" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Venda de borregos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor (R$) *</Label>
              <Input id="valor" type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="atividade">Atividade</Label>
              <Input id="atividade" value={atividade} onChange={e => setAtividade(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="confirmado" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} className="rounded" />
            <Label htmlFor="confirmado" className="cursor-pointer">Lançamento confirmado</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="text-white" style={{ background: "oklch(0.45 0.14 145)" }}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Registrar lançamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Financeiro() {
  const { produtorId } = useRuralAuth();
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [showCreate, setShowCreate] = useState(false);
  const [editLancamento, setEditLancamento] = useState<Lancamento | null>(null);
  const [deleteLancamento, setDeleteLancamento] = useState<Lancamento | null>(null);

  const enabled = Boolean(produtorId);
  const produtorIdSafe = produtorId ?? 0;

  const lancamentosQ = trpc.railway.lancamentos.useQuery({ produtorId: produtorIdSafe }, { enabled });
  const resumoQ = trpc.railway.produtorResumo.useQuery({ produtorId: produtorIdSafe }, { enabled });

  const loading = lancamentosQ.isLoading || resumoQ.isLoading;
  const lancamentos = (lancamentosQ.data ?? []) as Lancamento[];
  const resumo = resumoQ.data ?? null;
  const utils = trpc.useUtils();

  const deleteMutation = trpc.railway.deleteLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento excluído!");
      utils.railway.lancamentos.invalidate();
      utils.railway.produtorResumo.invalidate();
      setDeleteLancamento(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = lancamentos.filter((l) => {
    if (filterTipo !== "todos" && l.tipo !== filterTipo) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.descricao?.toLowerCase().includes(q) || l.atividade?.toLowerCase().includes(q);
    }
    return true;
  });

  const lucro = (resumo?.receita ?? 0) - (resumo?.despesa ?? 0);

  const monthlyMap: Record<string, { receita: number; despesa: number }> = {};
  for (const l of lancamentos) {
    const month = l.data_lancamento?.slice(0, 7) ?? "—";
    if (!monthlyMap[month]) monthlyMap[month] = { receita: 0, despesa: 0 };
    if (l.tipo === "receita") monthlyMap[month].receita += l.valor;
    else monthlyMap[month].despesa += l.valor;
  }
  const chartData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, v]) => ({
      month: new Date(month + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      Receitas: v.receita,
      Despesas: v.despesa,
    }));

  const tipos = ["todos", ...Array.from(new Set(lancamentos.map((l) => l.tipo)))];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.18 0.04 145)" }}>
            Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Receitas, despesas e resultado da propriedade</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 text-white" style={{ background: "oklch(0.45 0.14 145)" }}>
          <Plus className="w-4 h-4" /> Novo lançamento
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receitas</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{loading ? "—" : fmt(resumo?.receita ?? 0)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Despesas</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{loading ? "—" : fmt(resumo?.despesa ?? 0)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultado</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: lucro >= 0 ? "oklch(0.42 0.14 145)" : "oklch(0.50 0.20 25)" }}>
            {loading ? "—" : fmt(lucro)}
          </p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Fluxo Financeiro (últimos 6 meses)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 130)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }} />
              <Legend iconType="circle" iconSize={8} />
              <Bar dataKey="Receitas" fill="#4ade80" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar lançamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white shadow-sm border border-transparent focus:outline-none focus:ring-2 transition-all"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {tipos.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTipo(t)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${filterTipo === t ? "text-white shadow-sm" : "bg-white text-muted-foreground shadow-sm"}`}
              style={filterTipo === t ? { background: "oklch(0.38 0.12 145)" } : {}}
            >
              {t === "todos" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.92 0.01 130)" }}>
                {["Data", "Tipo", "Descrição", "Atividade", "Valor", "Status", "Ações"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" style={{ width: "70%" }} /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Nenhum lançamento encontrado
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30 transition-colors" style={{ borderBottom: "1px solid oklch(0.95 0.005 130)" }}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {l.data_lancamento ? new Date(l.data_lancamento).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: TIPO_COLORS[l.tipo] ?? "oklch(0.50 0.04 140)", background: `${TIPO_COLORS[l.tipo] ?? "oklch(0.50 0.04 140)"}18` }}>
                        {l.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{l.descricao}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{l.atividade ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: l.tipo === "receita" ? "oklch(0.42 0.14 145)" : "oklch(0.50 0.20 25)" }}>
                      {fmt(l.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${l.confirmado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {l.confirmado ? "Confirmado" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditLancamento(l)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => setDeleteLancamento(l)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t text-xs text-muted-foreground" style={{ borderColor: "oklch(0.92 0.01 130)" }}>
            {filtered.length} lançamento{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && produtorId && (
        <LancamentoModal open onClose={() => setShowCreate(false)} produtorId={produtorId} onSuccess={() => utils.railway.lancamentos.invalidate()} />
      )}
      {editLancamento && produtorId && (
        <LancamentoModal open onClose={() => setEditLancamento(null)} produtorId={produtorId} lancamento={editLancamento} onSuccess={() => utils.railway.lancamentos.invalidate()} />
      )}

      <AlertDialog open={!!deleteLancamento} onOpenChange={(v) => !v && setDeleteLancamento(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteLancamento?.descricao}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={deleteMutation.isPending}
              onClick={() => produtorId && deleteLancamento && deleteMutation.mutate({ produtorId, lancamentoId: deleteLancamento.id })}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
