import { useState } from "react";
import { RefreshCw, BookOpen, Plus, Trash2, TrendingUp, TrendingDown, Scale, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getImovelId } from "@/lib/api";

interface Lancamento {
  id: number;
  imovel_id: number;
  ano_base: number;
  data_lancamento: string;
  tipo: "receita" | "despesa";
  categoria: string;
  descricao: string;
  valor: number;
  origem: string;
  deducao_irpf: boolean;
  documento?: string;
  observacoes?: string;
}

interface Apuracao {
  ano_base?: number;
  receita_bruta?: number;
  despesas_dedutiveis?: number;
  resultado_real?: number;
  base_presumida_20pct?: number;
  recomendacao_regime?: string;
  economia_regime_real?: number;
}

interface FechamentoLinha {
  tipo: "receita" | "despesa";
  categoria: string;
  total: number;
  fechado_em: string;
}

interface Fechamento {
  fechado: boolean;
  fechado_em?: string;
  receitas?: number;
  despesas?: number;
  saldo?: number;
  linhas: FechamentoLinha[];
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CATEGORIAS = [
  "venda_producao", "arrendamento", "funrural", "insumos",
  "mao_de_obra", "manutencao", "combustivel", "financiamento", "outros",
];

export default function LivroCaixa() {
  const anoAtual = new Date().getFullYear();
  const [anoBase, setAnoBase] = useState(anoAtual);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [showFechamento, setShowFechamento] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const imovelId = getImovelId();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    data_lancamento: "",
    tipo: "receita" as "receita" | "despesa",
    categoria: "",
    descricao: "",
    valor: "",
    deducao_irpf: true,
  });

  const lancamentosQuery = trpc.railway.livroCaixaLancamentos.useQuery(
    { imovelId: imovelId!, anoBase },
    { enabled: !!imovelId },
  );
  const apuracaoQuery = trpc.railway.livroCaixaApuracao.useQuery(
    { imovelId: imovelId!, anoBase },
    { enabled: !!imovelId },
  );
  const fechamentoQuery = trpc.railway.fechamentoLivroCaixa.useQuery(
    { imovelId: imovelId!, anoBase, mes },
    { enabled: !!imovelId },
  );

  const lancamentos = (lancamentosQuery.data ?? []) as Lancamento[];
  const apuracao = (apuracaoQuery.data ?? {}) as Apuracao;
  const fechamento = (fechamentoQuery.data ?? { fechado: false, linhas: [] }) as Fechamento;
  const loading = lancamentosQuery.isLoading || apuracaoQuery.isLoading;

  function invalidateAll() {
    utils.railway.livroCaixaLancamentos.invalidate({ imovelId: imovelId!, anoBase });
    utils.railway.livroCaixaApuracao.invalidate({ imovelId: imovelId!, anoBase });
    utils.railway.fechamentoLivroCaixa.invalidate({ imovelId: imovelId!, anoBase, mes });
  }

  const criarLancamento = trpc.railway.criarLancamentoLivroCaixa.useMutation({
    onSuccess: () => {
      toast.success("Lançamento criado com sucesso");
      setShowNew(false);
      setForm({ data_lancamento: "", tipo: "receita", categoria: "", descricao: "", valor: "", deducao_irpf: true });
      invalidateAll();
    },
    onError: (e) => toast.error(e.message || "Erro ao criar lançamento"),
  });

  const excluirLancamento = trpc.railway.excluirLancamentoLivroCaixa.useMutation({
    onSuccess: () => {
      toast.success("Lançamento excluído");
      invalidateAll();
    },
    onError: () => toast.error("Erro ao excluir lançamento"),
  });

  const fecharMes = trpc.railway.fecharMesLivroCaixa.useMutation({
    onSuccess: (resultado) => {
      if (resultado.linhas === 0) {
        toast.error(resultado.aviso || "Nenhum lançamento encontrado nesse mês.");
        return;
      }
      toast.success(`Mês fechado: ${resultado.linhas} categoria(s) consolidada(s)`);
      utils.railway.fechamentoLivroCaixa.invalidate({ imovelId: imovelId!, anoBase, mes });
      setShowFechamento(true);
    },
    onError: () => toast.error("Erro ao fechar o mês"),
  });

  const reabrirMes = trpc.railway.reabrirMesLivroCaixa.useMutation({
    onSuccess: () => {
      toast.success("Mês reaberto para retificação");
      utils.railway.fechamentoLivroCaixa.invalidate({ imovelId: imovelId!, anoBase, mes });
      setShowFechamento(false);
    },
    onError: () => toast.error("Erro ao reabrir o mês"),
  });

  const fmt = (v?: number) =>
    (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleFecharMes = () => {
    if (!imovelId) return;
    fecharMes.mutate({ imovelId, anoBase, mes });
  };

  const handleReabrirMes = () => {
    if (!imovelId) return;
    if (!confirm(`Reabrir ${MESES[mes - 1]}/${anoBase}? O resumo consolidado será apagado — você pode corrigir os lançamentos e fechar de novo depois.`)) return;
    reabrirMes.mutate({ imovelId, anoBase, mes });
  };

  const handleCreate = () => {
    if (!imovelId) return;
    if (!form.data_lancamento) { toast.error("Informe a data do lançamento"); return; }
    if (!form.categoria) { toast.error("Selecione a categoria"); return; }
    if (!form.descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (!form.valor || Number(form.valor) <= 0) { toast.error("Informe um valor válido"); return; }

    criarLancamento.mutate({
      imovelId,
      anoBase,
      dataLancamento: form.data_lancamento,
      tipo: form.tipo,
      categoria: form.categoria,
      descricao: form.descricao,
      valor: Number(form.valor),
      deducaoIrpf: form.deducao_irpf,
    });
  };

  const handleDelete = (id: number) => {
    if (!imovelId) return;
    if (!confirm("Excluir este lançamento?")) return;
    excluirLancamento.mutate({ imovelId, id });
  };

  const fechando = fecharMes.isPending || reabrirMes.isPending;
  const saving = criarLancamento.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Livro Caixa</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Escrituração de receitas e despesas para apuração do Imposto de Renda (regime de caixa)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((nome, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(anoBase)} onValueChange={(v) => setAnoBase(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3].map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={invalidateAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fechamento.fechado ? handleReabrirMes : handleFecharMes}
            disabled={fechando}
          >
            <Lock className="w-4 h-4 mr-2" />
            {fechando ? "Processando..." : fechamento.fechado ? "Reabrir Mês" : "Fechar Mês"}
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      {fechamento.fechado && (
        <Card className="border-blue-200 bg-blue-50 cursor-pointer" onClick={() => setShowFechamento(true)}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-700" />
              <p className="text-sm text-blue-900">
                <strong>{MESES[mes - 1]}/{anoBase}</strong> fechado em{" "}
                {new Date(fechamento.fechado_em!).toLocaleDateString("pt-BR")} — saldo consolidado{" "}
                <strong>{fmt(fechamento.saldo)}</strong>
              </p>
            </div>
            <span className="text-xs text-blue-700 underline">Ver detalhes</span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Receita Bruta", value: apuracao.receita_bruta, icon: <TrendingUp className="w-4 h-4 text-emerald-600" /> },
          { label: "Despesas Dedutíveis", value: apuracao.despesas_dedutiveis, icon: <TrendingDown className="w-4 h-4 text-red-500" /> },
          { label: "Resultado Real", value: apuracao.resultado_real, icon: <Scale className="w-4 h-4" style={{ color: "oklch(0.42 0.14 145)" }} /> },
          { label: "Base Presumida (20%)", value: apuracao.base_presumida_20pct, icon: <BookOpen className="w-4 h-4 text-blue-500" /> },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                {s.icon}
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              </div>
              <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.35 0.12 145)" }}>
                {loading ? "—" : fmt(s.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {apuracao.recomendacao_regime && (apuracao.economia_regime_real ?? 0) > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-700" />
              <p className="text-sm text-emerald-800 font-medium">Recomendação de Regime</p>
            </div>
            <p className="text-sm text-emerald-900">
              O <strong>{apuracao.recomendacao_regime === "resultado_real" ? "Resultado Real" : "Lucro Presumido (20%)"}</strong> é
              mais vantajoso este ano, com economia estimada de <strong>{fmt(apuracao.economia_regime_real)}</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : lancamentos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum lançamento em {anoBase}</p>
          <p className="text-sm mt-1">Clique em "Novo Lançamento" para começar a escriturar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lancamentos.map((l) => (
            <Card key={l.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: l.tipo === "receita" ? "oklch(0.92 0.05 150)" : "oklch(0.93 0.05 25)" }}
                    >
                      {l.tipo === "receita"
                        ? <TrendingUp className="w-4 h-4 text-emerald-700" />
                        : <TrendingDown className="w-4 h-4 text-red-600" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm truncate">{l.descricao}</p>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {l.categoria.replace(/_/g, " ")}
                        </span>
                        {l.origem !== "manual" && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            {l.origem}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(l.data_lancamento + "T00:00:00").toLocaleDateString("pt-BR")}
                        {!l.deducao_irpf && " · não dedutível"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className={`text-sm font-bold ${l.tipo === "receita" ? "text-emerald-700" : "text-red-600"}`}>
                      {l.tipo === "despesa" ? "− " : "+ "}{fmt(l.valor)}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(l.id)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
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
          <DialogHeader>
            <DialogTitle>Novo Lançamento — Livro Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "receita" | "despesa" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={form.data_lancamento}
                  onChange={(e) => setForm({ ...form, data_lancamento: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Venda de 20 sacos de soja" value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input type="number" min={0} step="0.01" placeholder="0,00" value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.deducao_irpf}
                onChange={(e) => setForm({ ...form, deducao_irpf: e.target.checked })} />
              Entra como dedução na apuração do IRPF
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: "oklch(0.42 0.14 145)" }}>
              {saving ? "Salvando..." : "Criar Lançamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFechamento} onOpenChange={setShowFechamento}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fechamento — {MESES[mes - 1]}/{anoBase}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Receitas</p>
                  <p className="text-lg font-bold text-emerald-700">{fmt(fechamento.receitas)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Despesas</p>
                  <p className="text-lg font-bold text-red-600">{fmt(fechamento.despesas)}</p>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {fechamento.linhas.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground">{l.categoria.replace(/_/g, " ")}</span>
                  <span className={l.tipo === "receita" ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
                    {l.tipo === "despesa" ? "− " : "+ "}{fmt(l.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFechamento(false)}>Fechar</Button>
            <Button variant="destructive" onClick={handleReabrirMes} disabled={fechando}>
              {fechando ? "Reabrindo..." : "Reabrir para retificação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
