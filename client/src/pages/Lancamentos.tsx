import { useState, useRef } from "react";
import {
  Plus, Receipt, Search, Trash2, TrendingUp, TrendingDown,
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getProdutorId, getImovelId } from "@/lib/api";
import { trpc } from "@/lib/trpc";

const TIPO_COLORS: Record<string, string> = {
  receita: "text-emerald-700 bg-emerald-50",
  despesa: "text-red-600 bg-red-50",
  transferencia: "text-blue-600 bg-blue-50",
};

type ImportStep = "upload" | "mapeamento" | "resultado";

interface ImportResult {
  criados: number;
  erros: number;
  total: number;
  mensagem?: string;
}

export default function Lancamentos() {
  const produtorId = getProdutorId();
  const imovelId = getImovelId();

  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  // Novo lancamento
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    tipo: "receita",
    descricao: "",
    valor: "",
    data_lancamento: new Date().toISOString().split("T")[0],
    atividade: "",
  });

  // Importacao
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [mapaData, setMapaData] = useState("");
  const [mapaValor, setMapaValor] = useState("");
  const [mapaDescricao, setMapaDescricao] = useState("");
  const [mapaTipo, setMapaTipo] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC
  const { data: lancamentos = [], isLoading, refetch } = trpc.railway.lancamentos.useQuery(
    { produtorId: produtorId! },
    { enabled: !!produtorId, refetchOnWindowFocus: false },
  );

  const createMut = trpc.railway.createLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lancamento criado com sucesso");
      setShowNew(false);
      setForm({ tipo: "receita", descricao: "", valor: "", data_lancamento: new Date().toISOString().split("T")[0], atividade: "" });
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erro ao criar lancamento"),
  });

  const deleteMut = trpc.railway.deleteLancamento.useMutation({
    onSuccess: () => { toast.success("Lancamento excluido"); refetch(); },
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
  });

  const importMut = trpc.railway.importarLancamentos.useMutation({
    onSuccess: (res) => {
      setImportResult(res);
      setImportStep("resultado");
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erro na importacao"),
  });

  // Derived
  const filtered = lancamentos.filter((l) => {
    const matchSearch =
      l.descricao?.toLowerCase().includes(search.toLowerCase()) ||
      (l.atividade ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTipo = filtroTipo === "todos" || l.tipo === filtroTipo;
    return matchSearch && matchTipo;
  });

  const totalReceita = lancamentos.filter((l) => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const totalDespesa = lancamentos.filter((l) => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Handlers
  const handleCreate = () => {
    if (!produtorId) { toast.error("Sessao invalida"); return; }
    if (!form.descricao.trim()) { toast.error("Informe a descricao"); return; }
    if (!form.valor || Number(form.valor) <= 0) { toast.error("Informe um valor valido"); return; }
    createMut.mutate({
      produtorId,
      tipo: form.tipo as "receita" | "despesa",
      descricao: form.descricao,
      valor: Number(form.valor),
      data_lancamento: form.data_lancamento,
      atividade: form.atividade || undefined,
      confirmado: false,
    });
  };

  const handleDelete = (id: string) => {
    if (!produtorId) return;
    if (!confirm("Excluir este lancamento?")) return;
    deleteMut.mutate({ produtorId, lancamentoId: id });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportStep("mapeamento");
  };

  const handleConfirmarImportacao = async () => {
    if (!importFile || !produtorId || !imovelId) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      importMut.mutate({
        produtorId,
        imovelId,
        arquivo: base64,
        nomeArquivo: importFile.name,
        mapaData: mapaData || undefined,
        mapaValor: mapaValor || undefined,
        mapaDescricao: mapaDescricao || undefined,
        mapaTipo: mapaTipo || undefined,
      });
    };
    reader.readAsDataURL(importFile);
  };

  const resetImport = () => {
    setShowImport(false);
    setImportStep("upload");
    setImportFile(null);
    setImportResult(null);
    setMapaData(""); setMapaValor(""); setMapaDescricao(""); setMapaTipo("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lancamentos</h1>
          <p className="text-sm text-muted-foreground">Controle financeiro da propriedade</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importar</span>
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)} style={{ background: "oklch(0.42 0.14 145)" }} className="gap-1.5">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Receitas</span>
            </div>
            <p className="text-lg font-bold text-emerald-700">{fmt(totalReceita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Despesas</span>
            </div>
            <p className="text-lg font-bold text-red-600">{fmt(totalDespesa)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Saldo */}
      <Card className={totalReceita - totalDespesa >= 0 ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}>
        <CardContent className="p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Saldo</span>
          <span className={`text-base font-bold ${totalReceita - totalDespesa >= 0 ? "text-emerald-700" : "text-red-600"}`}>
            {fmt(totalReceita - totalDespesa)}
          </span>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lancamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum lancamento encontrado</p>
          <p className="text-sm mt-1">Crie um novo lancamento ou importe uma planilha</p>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(l.id)}
                      className="text-red-400 hover:text-red-600 w-7 h-7 p-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Novo Lancamento */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Lancamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descricao *</Label>
              <Input
                placeholder="Ex: Venda de ovinos"
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={form.data_lancamento}
                  onChange={(e) => setForm((f) => ({ ...f, data_lancamento: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <Select
                value={form.atividade || "_nenhuma"}
                onValueChange={(v) => setForm((f) => ({ ...f, atividade: v === "_nenhuma" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a atividade…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_nenhuma">Nenhuma / Geral</SelectItem>
                  <SelectItem value="pecuaria_corte">Pecuária de Corte</SelectItem>
                  <SelectItem value="pecuaria_leite">Pecuária Leiteira</SelectItem>
                  <SelectItem value="suinocultura">Suinocultura</SelectItem>
                  <SelectItem value="avicultura">Avicultura</SelectItem>
                  <SelectItem value="agricultura">Agricultura</SelectItem>
                  <SelectItem value="venda_animais">Venda de Animais</SelectItem>
                  <SelectItem value="venda_leite">Venda de Leite</SelectItem>
                  <SelectItem value="venda_graos">Venda de Grãos</SelectItem>
                  <SelectItem value="mao_de_obra">Mão de Obra</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="combustivel">Combustível</SelectItem>
                  <SelectItem value="sanidade">Sanidade Animal</SelectItem>
                  <SelectItem value="nutricao">Nutrição Animal</SelectItem>
                  <SelectItem value="reproducao">Reprodução</SelectItem>
                  <SelectItem value="impostos">Impostos / Taxas</SelectItem>
                  <SelectItem value="financiamento">Financiamento</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending} style={{ background: "oklch(0.42 0.14 145)" }}>
              {createMut.isPending ? "Salvando..." : "Criar Lancamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Importar Planilha */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) resetImport(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Importar Lancamentos
            </DialogTitle>
          </DialogHeader>

          {importStep === "upload" && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Selecione um arquivo <strong>Excel (.xlsx, .xls)</strong> ou <strong>CSV</strong> com os lancamentos financeiros.
              </p>
              <div
                className="border-2 border-dashed border-muted rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar o arquivo</p>
                <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls ou .csv</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">Colunas esperadas na planilha:</p>
                <p>data, valor, descricao, tipo (receita/despesa)</p>
                <p className="text-blue-600 mt-1">Se os nomes forem diferentes, voce podera mapea-los na proxima etapa.</p>
              </div>
            </div>
          )}

          {importStep === "mapeamento" && importFile && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-sm font-medium text-emerald-800 truncate">{importFile.name}</p>
                <Button
                  variant="ghost" size="sm"
                  className="ml-auto w-6 h-6 p-0 text-muted-foreground"
                  onClick={() => { setImportFile(null); setImportStep("upload"); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Se as colunas da sua planilha tiverem nomes diferentes, informe abaixo. Deixe em branco para deteccao automatica.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Coluna de Data</Label>
                  <Input placeholder="Ex: data_transacao" value={mapaData} onChange={(e) => setMapaData(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Coluna de Valor</Label>
                  <Input placeholder="Ex: valor_rs" value={mapaValor} onChange={(e) => setMapaValor(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Coluna de Descricao</Label>
                  <Input placeholder="Ex: historico" value={mapaDescricao} onChange={(e) => setMapaDescricao(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Coluna de Tipo</Label>
                  <Input placeholder="Ex: natureza" value={mapaTipo} onChange={(e) => setMapaTipo(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {importStep === "resultado" && importResult && (
            <div className="space-y-4 py-2">
              <div className={`rounded-xl p-4 flex items-center gap-3 ${importResult.erros === 0 ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
                {importResult.erros === 0
                  ? <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  : <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                }
                <div>
                  <p className="font-semibold text-sm">
                    {importResult.erros === 0 ? "Importacao concluida!" : "Importacao com avisos"}
                  </p>
                  {importResult.mensagem && (
                    <p className="text-xs text-muted-foreground mt-0.5">{importResult.mensagem}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{importResult.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{importResult.criados}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Criados</p>
                </div>
                <div className="rounded-lg bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{importResult.erros}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Erros</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {importStep === "upload" && (
              <Button variant="outline" onClick={resetImport}>Cancelar</Button>
            )}
            {importStep === "mapeamento" && (
              <>
                <Button variant="outline" onClick={() => setImportStep("upload")}>Voltar</Button>
                <Button onClick={handleConfirmarImportacao} disabled={importMut.isPending} style={{ background: "oklch(0.42 0.14 145)" }}>
                  {importMut.isPending ? "Importando..." : "Confirmar Importacao"}
                </Button>
              </>
            )}
            {importStep === "resultado" && (
              <Button onClick={resetImport} style={{ background: "oklch(0.42 0.14 145)" }}>
                Concluir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
