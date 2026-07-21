import { useState, useEffect } from "react";
import { Plus, ShoppingCart, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getImovelId, getRcToken } from "@/lib/api";

interface Produto {
  id: number;
  nome: string;
  especie?: string;
  unidade: string;
  estoque_atual?: number;
}

async function fetchProdutos(imovelId: number): Promise<Produto[]> {
  const res = await fetch(`${API_BASE}/compravenda/produtos?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data.items ?? [];
}

async function criarProduto(imovelId: number, nome: string, unidade: string, especie: string): Promise<Produto | null> {
  const res = await fetch(`${API_BASE}/compravenda/produtos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imovel_id: imovelId, nome, unidade, especie: especie || undefined }),
  });
  if (!res.ok) return null;
  const criado = await res.json();
  return { id: criado.id, nome, unidade, especie };
}

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
  classificacao?: "RURAL" | "NEGOCIACAO" | "MISTA";
  valor_rural?: number;
  valor_negociacao?: number;
}

interface Dashboard {
  total_compras?: number;
  total_vendas?: number;
  resultado?: number;
  alertas_fiscais?: number;
}

interface RelatorioFiscal {
  resumo: {
    rural: { qtd_vendas?: number; valor?: number; resultado?: number };
    negociacao: { qtd_vendas?: number; valor?: number; resultado?: number };
  };
}

async function fetchRelatorioFiscal(imovelId: number): Promise<RelatorioFiscal | null> {
  const res = await fetch(`${API_BASE}/compravenda/relatorio-fiscal/${imovelId}`);
  if (!res.ok) return null;
  return res.json();
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
  const items = Array.isArray(data) ? data : data.items ?? [];
  return items.map((x: Record<string, unknown>) => ({
    ...x,
    tipo: "compra" as const,
    produto: (x.produto_nome as string) ?? (x.produto as string),
    fornecedor_cliente: x.fornecedor as string,
  }));
}

async function fetchVendas(imovelId: number): Promise<Operacao[]> {
  const res = await fetch(`${API_BASE}/compravenda/vendas?imovel_id=${imovelId}`);
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data) ? data : data.items ?? [];
  return items.map((x: Record<string, unknown>) => ({
    ...x,
    tipo: "venda" as const,
    produto: (x.produto_nome as string) ?? (x.produto as string),
    fornecedor_cliente: x.comprador as string,
  }));
}

export default function CompraVenda() {
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [fiscal, setFiscal] = useState<RelatorioFiscal | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "compra" | "venda">("todos");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [novoProduto, setNovoProduto] = useState(false);
  const [baixandoRelatorio, setBaixandoRelatorio] = useState(false);
  const [form, setForm] = useState({
    tipo: "venda",
    produto_id: "",
    produto_nome_novo: "",
    unidade_novo: "cab",
    especie_novo: "",
    quantidade: "",
    valor_unitario: "",
    data: new Date().toISOString().split("T")[0],
    contraparte: "",
    regime: "pasto",
  });
  const imovelId = getImovelId();

  const baixarGanhoCapital = async () => {
    if (!imovelId) { toast.error("Selecione uma propriedade"); return; }
    setBaixandoRelatorio(true);
    try {
      const token = getRcToken();
      const ano = new Date().getFullYear();
      const res = await fetch(
        `${API_BASE}/compravenda/relatorio-ganho-capital/${imovelId}?ano=${ano}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) {
        if (res.status === 401) {
          toast.error("Sessão expirou. Faça login novamente pra baixar o relatório.");
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail ?? "Erro ao gerar o relatório");
        }
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ganho_capital_${ano}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Relatório baixado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao baixar o relatório");
    } finally {
      setBaixandoRelatorio(false);
    }
  };

  const load = async () => {
    if (!imovelId) return;
    setLoading(true);
    try {
      const [dash, compras, vendas, rel, prods] = await Promise.all([
        fetchDashboard(imovelId),
        fetchCompras(imovelId),
        fetchVendas(imovelId),
        fetchRelatorioFiscal(imovelId),
        fetchProdutos(imovelId),
      ]);
      setDashboard(dash);
      setFiscal(rel);
      setProdutos(prods);
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

  const resetForm = () => setForm({
    tipo: "venda",
    produto_id: "",
    produto_nome_novo: "",
    unidade_novo: "cab",
    especie_novo: "",
    quantidade: "",
    valor_unitario: "",
    data: new Date().toISOString().split("T")[0],
    contraparte: "",
    regime: "pasto",
  });

  const handleCreate = async () => {
    if (!imovelId) { toast.error("Selecione uma propriedade"); return; }
    setSaving(true);
    try {
      let produtoId = form.produto_id ? Number(form.produto_id) : null;

      // Se o usuário optou por cadastrar um produto novo na hora, cria primeiro.
      if (novoProduto) {
        if (!form.produto_nome_novo.trim()) { toast.error("Informe o nome do novo produto"); setSaving(false); return; }
        const criado = await criarProduto(imovelId, form.produto_nome_novo, form.unidade_novo, form.especie_novo);
        if (!criado) throw new Error("Não foi possível cadastrar o produto");
        produtoId = criado.id;
        setProdutos((prev) => [...prev, criado]);
      }

      if (!produtoId) { toast.error("Selecione um produto"); setSaving(false); return; }
      if (!form.quantidade || !form.valor_unitario) { toast.error("Informe quantidade e valor unitário"); setSaving(false); return; }

      const endpoint = form.tipo === "compra" ? "/compravenda/compras" : "/compravenda/vendas";
      const payload =
        form.tipo === "compra"
          ? {
              imovel_id: imovelId,
              produto_id: produtoId,
              data_compra: form.data,
              quantidade: Number(form.quantidade),
              valor_unitario: Number(form.valor_unitario),
              fornecedor: form.contraparte || undefined,
              regime: form.regime,
            }
          : {
              imovel_id: imovelId,
              produto_id: produtoId,
              data_venda: form.data,
              quantidade: Number(form.quantidade),
              valor_unitario: Number(form.valor_unitario),
              comprador: form.contraparte || undefined,
            };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Erro"); }
      const nova = await res.json();

      if (form.tipo === "venda" && nova.aviso) {
        toast.warning(nova.aviso);
      }

      await load(); // recarrega tudo (o relatório fiscal e o estoque mudaram)
      setShowNew(false);
      setNovoProduto(false);
      resetForm();
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
          <Button variant="outline" size="sm" onClick={baixarGanhoCapital} disabled={baixandoRelatorio}>
            <FileDown className={`w-4 h-4 mr-2 ${baixandoRelatorio ? "animate-pulse" : ""}`} />
            {baixandoRelatorio ? "Gerando..." : "Ganho de Capital (Excel)"}
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

      {fiscal && (fiscal.resumo.rural.qtd_vendas || fiscal.resumo.negociacao.qtd_vendas) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-emerald-700 uppercase tracking-wide font-medium">
                Rural — entra no Livro Caixa
              </p>
              <p className="text-xl font-bold mt-1 text-emerald-800">{fmt(fiscal.resumo.rural.valor)}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {fiscal.resumo.rural.qtd_vendas ?? 0} venda(s) · resultado {fmt(fiscal.resumo.rural.resultado)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-amber-700 uppercase tracking-wide font-medium">
                Negociação — fora do Livro Caixa (declarar na DAA)
              </p>
              <p className="text-xl font-bold mt-1 text-amber-800">{fmt(fiscal.resumo.negociacao.valor)}</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {fiscal.resumo.negociacao.qtd_vendas ?? 0} venda(s) · resultado {fmt(fiscal.resumo.negociacao.resultado)}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

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
                  <div className="text-right shrink-0 flex items-center gap-2">
                    {o.tipo === "venda" && o.classificacao && (
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          o.classificacao === "RURAL"
                            ? "bg-emerald-100 text-emerald-700"
                            : o.classificacao === "NEGOCIACAO"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                        title={
                          o.classificacao === "NEGOCIACAO"
                            ? "Fora do Livro Caixa Rural — declarar na DAA"
                            : o.classificacao === "MISTA"
                            ? `Parte rural (${fmt(o.valor_rural)}) + parte negociação (${fmt(o.valor_negociacao)})`
                            : "Lançado no Livro Caixa Rural"
                        }
                      >
                        {o.classificacao}
                      </span>
                    )}
                    <div>
                      <p className={`text-sm font-bold ${o.tipo === "venda" ? "text-emerald-700" : "text-red-600"}`}>
                        {fmt(o.valor_total)}
                      </p>
                      {o.quantidade && <p className="text-xs text-muted-foreground">{o.quantidade} un.</p>}
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
              <div className="flex items-center justify-between">
                <Label>Produto *</Label>
                <button
                  type="button"
                  className="text-xs text-emerald-700 underline"
                  onClick={() => setNovoProduto((v) => !v)}
                >
                  {novoProduto ? "Escolher produto existente" : "+ Cadastrar novo produto"}
                </button>
              </div>

              {!novoProduto ? (
                <Select value={form.produto_id} onValueChange={(v) => setForm({ ...form, produto_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                  <SelectContent>
                    {produtos.length === 0 ? (
                      <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                        Nenhum produto cadastrado ainda. Use "+ Cadastrar novo produto" acima.
                      </div>
                    ) : (
                      produtos.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.nome} {p.especie ? `(${p.especie})` : ""} — {p.unidade}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Nome (ex: Bezerro Nelore)"
                    className="col-span-2"
                    value={form.produto_nome_novo}
                    onChange={(e) => setForm({ ...form, produto_nome_novo: e.target.value })}
                  />
                  <Input
                    placeholder="Espécie (ex: bovino)"
                    value={form.especie_novo}
                    onChange={(e) => setForm({ ...form, especie_novo: e.target.value })}
                  />
                  <Select value={form.unidade_novo} onValueChange={(v) => setForm({ ...form, unidade_novo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cab">cabeça(s)</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="arroba">arroba</SelectItem>
                      <SelectItem value="saca">saca</SelectItem>
                      <SelectItem value="un">unidade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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
              {form.tipo === "compra" ? (
                <div className="space-y-1.5">
                  <Label>Regime</Label>
                  <Select value={form.regime} onValueChange={(v) => setForm({ ...form, regime: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pasto">Pasto (prazo fiscal: 138 dias)</SelectItem>
                      <SelectItem value="confinamento">Confinamento (prazo fiscal: 52 dias)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Cliente</Label>
                  <Input placeholder="Nome do cliente" value={form.contraparte} onChange={(e) => setForm({ ...form, contraparte: e.target.value })} />
                </div>
              )}
            </div>
            {form.tipo === "compra" && (
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Input placeholder="Nome do fornecedor" value={form.contraparte} onChange={(e) => setForm({ ...form, contraparte: e.target.value })} />
              </div>
            )}
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
