import { useState, useEffect, useRef } from "react";
import { Plus, PawPrint, Search, RefreshCw, Pencil, Trash2, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import * as XLSX from "xlsx";

type EspecieTRPC = "ovinos" | "caprinos" | "suinos" | "bovinos";
type Especie = "ovino" | "caprino" | "suino" | "bovino";

const ESPECIES: { key: Especie; trpc: EspecieTRPC; label: string; emoji: string }[] = [
  { key: "ovino",   trpc: "ovinos",   label: "Ovinos",   emoji: "🐑" },
  { key: "caprino", trpc: "caprinos", label: "Caprinos", emoji: "🐐" },
  { key: "suino",   trpc: "suinos",   label: "Suínos",   emoji: "🐷" },
  { key: "bovino",  trpc: "bovinos",  label: "Bovinos",  emoji: "🐄" },
];

const STATUS_COLORS: Record<string, string> = {
  ativo:   "bg-emerald-100 text-emerald-700",
  vendido: "bg-blue-100 text-blue-700",
  morto:   "bg-gray-100 text-gray-600",
  abatido: "bg-orange-100 text-orange-700",
};

const FORM_EMPTY = {
  brinco: "", nome: "", raca: "", sexo: "M",
  data_nascimento: "", peso_nascimento: "", categoria: "",
  aptidao_manejo: "corte",
};

type ImportStep = "upload" | "conflitos" | "resultado";

export default function Rebanhos() {
  const { imovelId } = useRuralAuth();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Espécie inicial via URL ───────────────────────────────────────────────
  const initialEspecie = (): Especie => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("especie") as Especie | null;
    return ESPECIES.find((x) => x.key === e) ? e! : "ovino";
  };
  const [especie, setEspecie] = useState<Especie>(initialEspecie);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("especie") as Especie | null;
    if (e && ESPECIES.find((x) => x.key === e)) setEspecie(e);
  }, [window.location.search]);

  const [search, setSearch] = useState("");

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const [showNew,    setShowNew]    = useState(false);
  const [editAnimal, setEditAnimal] = useState<any | null>(null);
  const [deleteId,   setDeleteId]   = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [producaoAnimalId, setProducaoAnimalId] = useState<number | null>(null);

  // ── Formulário (novo / editar) ────────────────────────────────────────────
  const [form, setForm] = useState({ ...FORM_EMPTY });

  // ── Importação ────────────────────────────────────────────────────────────
  const [importStep,      setImportStep]      = useState<ImportStep>("upload");
  const [importPreview,   setImportPreview]   = useState<any | null>(null);
  const [conflitosDecisoes, setConflitosDecisoes] = useState<Record<string, "atualizar" | "ignorar">>({});
  const [importResult,    setImportResult]    = useState<any | null>(null);

  const especieAtual = ESPECIES.find((e) => e.key === especie)!;

  // ── Queries & Mutations ───────────────────────────────────────────────────
  const { data: animais = [], isLoading: loading, error, refetch } = trpc.railway.animais.useQuery(
    { imovelId: imovelId!, especie: especieAtual.trpc },
    { enabled: !!imovelId, retry: 1 }
  );

  const createAnimal = trpc.railway.createAnimal.useMutation({
    onSuccess: () => {
      toast.success("Animal cadastrado com sucesso");
      utils.railway.animais.invalidate();
      setShowNew(false);
      setForm({ ...FORM_EMPTY });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao cadastrar animal"),
  });

  const updateAnimal = trpc.railway.updateAnimal.useMutation({
    onSuccess: () => {
      toast.success("Animal atualizado com sucesso");
      utils.railway.animais.invalidate();
      setEditAnimal(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar animal"),
  });

  const deleteAnimal = trpc.railway.deleteAnimal.useMutation({
    onSuccess: () => {
      toast.success("Animal removido com sucesso");
      utils.railway.animais.invalidate();
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover animal"),
  });

  // Produção integrada com Insumos (GMD/custo por kg, ou litros/dia e custo/litro) — todas as espécies
  const { data: producaoInsumos, isLoading: loadingProducao } = trpc.railway.producaoInsumosAnimal.useQuery(
    { imovelId: imovelId!, animalId: producaoAnimalId!, especie: especieAtual.trpc, dias: 30 },
    { enabled: !!imovelId && !!producaoAnimalId }
  );

  const analisarPlanilha = trpc.railway.analisarPlanilhaAnimais.useMutation({
    onSuccess: (data) => {
      setImportPreview(data);
      const dec: Record<string, "atualizar" | "ignorar"> = {};
      data.conflitos.forEach((c: any) => { dec[c.brinco] = "ignorar"; });
      setConflitosDecisoes(dec);
      setImportStep(data.conflitos.length > 0 ? "conflitos" : "resultado");
      if (data.conflitos.length === 0) handleConfirmarImportacao(data.rows_novas, []);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao analisar planilha"),
  });

  const confirmarImportacao = trpc.railway.confirmarImportacaoAnimais.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      setImportStep("resultado");
      utils.railway.animais.invalidate();
      if (importIsGenealogia && imovelId) {
        relinkGenealogia.mutate({ imovelId });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao importar animais"),
  });

  // ── Genealogia (Bovino) ──────────────────────────────────────────────────
  const [importIsGenealogia, setImportIsGenealogia] = useState(false);

  const analisarGenealogia = trpc.railway.analisarPlanilhaGenealogiaBovino.useMutation({
    onSuccess: (data) => {
      setImportPreview(data);
      const dec: Record<string, "atualizar" | "ignorar"> = {};
      data.conflitos.forEach((c: any) => { dec[c.brinco] = "ignorar"; });
      setConflitosDecisoes(dec);
      setImportStep(data.conflitos.length > 0 ? "conflitos" : "resultado");
      if (data.conflitos.length === 0) handleConfirmarImportacao(data.rows_novas, []);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao analisar planilha de genealogia"),
  });

  const relinkGenealogia = trpc.railway.relinkGenealogiaBovino.useMutation({
    onSuccess: (data) => {
      if (data.pais_linkados > 0 || data.maes_linkadas > 0) {
        toast.success(`Genealogia: ${data.pais_linkados} pai(s) e ${data.maes_linkadas} mãe(s) linkados ao rebanho`);
      }
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = () => {
    if (!form.brinco.trim()) { toast.error("Informe o brinco/identificação"); return; }
    if (!imovelId) { toast.error("Selecione uma propriedade"); return; }
    if (especie === "bovino" && !form.categoria.trim()) { toast.error("Informe a categoria do bovino"); return; }
    createAnimal.mutate({
      imovelId: imovelId!,
      especie: especieAtual.trpc,
      brinco: form.brinco,
      nome: form.nome || undefined,
      raca: form.raca || undefined,
      sexo: form.sexo as "M" | "F",
      data_nascimento: form.data_nascimento || undefined,
      peso_nascimento: form.peso_nascimento ? Number(form.peso_nascimento) : undefined,
      categoria: form.categoria || undefined,
      ...(especie === "bovino" ? { aptidao_manejo: form.aptidao_manejo } : {}),
    } as any);
  };

  const handleEdit = (a: any) => {
    setEditAnimal(a);
    setForm({
      brinco: a.brinco ?? "",
      nome: a.nome ?? "",
      raca: a.raca ?? a.raca_nome ?? "",
      sexo: a.sexo ?? "M",
      data_nascimento: a.data_nascimento ?? "",
      peso_nascimento: a.peso_nascimento ? String(a.peso_nascimento) : "",
      categoria: a.categoria ?? "",
      aptidao_manejo: a.aptidao_manejo ?? "corte",
    });
  };

  const handleUpdate = () => {
    if (!editAnimal || !imovelId) return;
    updateAnimal.mutate({
      animalId: editAnimal.id,
      imovelId: imovelId!,
      especie: especieAtual.trpc,
      brinco: form.brinco || undefined,
      nome: form.nome || undefined,
      raca: form.raca || undefined,
      sexo: form.sexo as "M" | "F",
    });
  };

  const HEADER_HINTS = ["brinco", "id", "identificacao", "numero", "tag"];

  // Sinais de coluna que só existem em exports de genealogia — se a
  // planilha tiver pelo menos um desses (além da coluna de identificação
  // padrão), tratamos como genealogia em vez de import genérico.
  const GENEALOGIA_HINTS = [
    "registropai", "registromae", "nomepai", "nomemae",
    "composicaoracial", "datanascimentodia", "datanascimentomes", "datanascimentoano",
  ];

  const detectarGenealogia = (rows: any[]): boolean => {
    if (rows.length === 0) return false;
    const normalize = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const colunas = Object.keys(rows[0]).map(normalize);
    return GENEALOGIA_HINTS.some((hint) => colunas.some((c) => c.includes(hint)));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !imovelId) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Detecta a linha real de cabeçalho (pula linhas de metadados tipo
        // "Gerado em...", "Fazenda...", etc. antes do cabeçalho verdadeiro).
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 }) as unknown[][];
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
          const rowVals = (rawRows[i] || []).map((v) =>
            String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          );
          if (rowVals.some((v) => HEADER_HINTS.some((h) => v === h || v.includes(h)))) {
            headerRowIndex = i;
            break;
          }
        }

        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", range: headerRowIndex });
        if (rows.length === 0) { toast.error('Planilha vazia ou sem coluna de identificação reconhecível.'); return; }

        const ehGenealogia = especie === "bovino" && detectarGenealogia(rows);
        setImportIsGenealogia(ehGenealogia);

        if (ehGenealogia) {
          toast.info("Planilha de genealogia detectada — usando importador de pedigree.");
          analisarGenealogia.mutate({ imovelId: imovelId!, rows });
        } else {
          analisarPlanilha.mutate({ imovelId: imovelId!, especie: especieAtual.trpc, rows });
        }
      } catch {
        toast.error("Erro ao ler o arquivo. Verifique se é um Excel válido.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleConfirmarImportacao = (rows_novas: any[], conflitos: any[]) => {
    if (!imovelId) return;
    const decisoes = conflitos.map((c: any) => ({
      brinco: c.brinco,
      existente_id: c.existente_id,
      acao: conflitosDecisoes[c.brinco] ?? "ignorar",
      dados: c.parsed,
    }));
    confirmarImportacao.mutate({
      imovelId: imovelId!,
      especie: especieAtual.trpc,
      rows_novas,
      conflitos_decisoes: decisoes,
    });
  };

  const resetImport = () => {
    setImportStep("upload");
    setImportPreview(null);
    setConflitosDecisoes({});
    setImportResult(null);
    setShowImport(false);
    setImportIsGenealogia(false);
  };

  const filtered = (animais as any[]).filter((a) =>
    a.brinco?.toLowerCase().includes(search.toLowerCase()) ||
    a.nome?.toLowerCase().includes(search.toLowerCase()) ||
    (a.raca ?? a.raca_nome ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const ativos = (animais as any[]).filter((a) => a.status === "ativo").length;

  // ── Formulário reutilizável ───────────────────────────────────────────────
  // FormFields removido — JSX inline nos dialogs abaixo

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>Rebanhos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestão do rebanho por espécie</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setImportIsGenealogia(false); setImportStep("upload"); setImportPreview(null); setImportResult(null); setShowImport(true); }}>
            <Upload className="w-4 h-4 mr-2" />
            Importar Planilha
          </Button>
          <Button size="sm" onClick={() => { setForm({ ...FORM_EMPTY }); setShowNew(true); }} style={{ background: "oklch(0.42 0.14 145)" }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Animal
          </Button>
        </div>
      </div>

      {/* Erro de conexão */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Não foi possível carregar o rebanho. Verifique sua conexão.</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      {/* Abas de espécie */}
      <div className="flex gap-2 flex-wrap">
        {ESPECIES.map((e) => (
          <button
            key={e.key}
            onClick={() => setEspecie(e.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              especie === e.key ? "text-white shadow-sm" : "bg-white border hover:bg-gray-50 text-gray-700"
            }`}
            style={especie === e.key ? { background: "oklch(0.42 0.14 145)" } : undefined}
          >
            <span>{e.emoji}</span>
            {e.label}
            {especie === e.key && !loading && (
              <span className="ml-1 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{ativos}</span>
            )}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={`Buscar ${especieAtual.label.toLowerCase()} por brinco, nome ou raça...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total",  value: (animais as any[]).length },
          { label: "Ativos", value: ativos },
          { label: "Fêmeas", value: (animais as any[]).filter((a) => a.sexo === "F").length },
          { label: "Machos", value: (animais as any[]).filter((a) => a.sexo === "M").length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: "oklch(0.35 0.12 145)" }}>
                {loading ? "—" : s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PawPrint className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum animal encontrado</p>
          <p className="text-sm mt-1">Clique em "Novo Animal" ou "Importar Planilha" para cadastrar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a: any) => (
            <Card key={a.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg" style={{ background: "oklch(0.92 0.04 145)" }}>
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
                      <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>{a.sexo === "M" ? "Macho" : "Fêmea"}</span>
                        {(a.raca || a.raca_nome) && <span>{a.raca_nome ?? a.raca}</span>}
                        {a.categoria && <span>{a.categoria}</span>}
                        {a.ultimo_peso && <span>{a.ultimo_peso} kg</span>}
                      </div>
                    </div>
                  </div>
                  {/* Botões de ação */}
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      className="w-8 h-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
                      title="Produção × Insumos (GMD/custo)"
                      onClick={() => setProducaoAnimalId(a.id)}
                    >
                      📈
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="w-8 h-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      title="Editar animal"
                      onClick={() => handleEdit(a)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="w-8 h-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Excluir animal"
                      onClick={() => setDeleteId(a.id)}
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

      {/* ── Dialog: Novo Animal ─────────────────────────────────────────────── */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Animal — {especieAtual.emoji} {especieAtual.label}</DialogTitle>
          </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Brinco / ID *</Label>
              <Input placeholder="Ex: 001" value={form.brinco} onChange={(e) => setForm((f) => ({ ...f, brinco: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Opcional" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sexo *</Label>
              <Select value={form.sexo} onValueChange={(v) => setForm((f) => ({ ...f, sexo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Macho</SelectItem>
                  <SelectItem value="F">Fêmea</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Raça</Label>
              <Input placeholder="Ex: Santa Inês" value={form.raca} onChange={(e) => setForm((f) => ({ ...f, raca: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data Nascimento</Label>
              <Input type="date" value={form.data_nascimento} onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Peso Nasc. (kg)</Label>
              <Input type="number" placeholder="0.0" value={form.peso_nascimento} onChange={(e) => setForm((f) => ({ ...f, peso_nascimento: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria{especie === "bovino" ? " *" : ""}</Label>
            {especie === "bovino" ? (
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {["novilho","novilha","matriz","reprodutor","bezerro","bezerra","touro","vaca","boi"].map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Ex: Matriz, Reprodutor, Cria..." value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
            )}
          </div>
          {especie === "bovino" && (
            <div className="space-y-1.5">
              <Label>Aptidão de Manejo *</Label>
              <Select value={form.aptidao_manejo} onValueChange={(v) => setForm((f) => ({ ...f, aptidao_manejo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corte">Corte</SelectItem>
                  <SelectItem value="leite">Leite</SelectItem>
                  <SelectItem value="dupla">Dupla Aptidão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createAnimal.isPending} style={{ background: "oklch(0.42 0.14 145)" }}>
              {createAnimal.isPending ? "Salvando..." : "Cadastrar Animal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar Animal ───────────────────────────────────────────── */}
      <Dialog open={!!editAnimal} onOpenChange={(o) => { if (!o) setEditAnimal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Animal — #{editAnimal?.brinco}</DialogTitle>
          </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Brinco / ID *</Label>
              <Input placeholder="Ex: 001" value={form.brinco} onChange={(e) => setForm((f) => ({ ...f, brinco: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Opcional" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sexo *</Label>
              <Select value={form.sexo} onValueChange={(v) => setForm((f) => ({ ...f, sexo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Macho</SelectItem>
                  <SelectItem value="F">Fêmea</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Raça</Label>
              <Input placeholder="Ex: Santa Inês" value={form.raca} onChange={(e) => setForm((f) => ({ ...f, raca: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data Nascimento</Label>
              <Input type="date" value={form.data_nascimento} onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Peso Nasc. (kg)</Label>
              <Input type="number" placeholder="0.0" value={form.peso_nascimento} onChange={(e) => setForm((f) => ({ ...f, peso_nascimento: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria{especie === "bovino" ? " *" : ""}</Label>
            {especie === "bovino" ? (
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {["novilho","novilha","matriz","reprodutor","bezerro","bezerra","touro","vaca","boi"].map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Ex: Matriz, Reprodutor, Cria..." value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
            )}
          </div>
          {especie === "bovino" && (
            <div className="space-y-1.5">
              <Label>Aptidão de Manejo *</Label>
              <Select value={form.aptidao_manejo} onValueChange={(v) => setForm((f) => ({ ...f, aptidao_manejo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corte">Corte</SelectItem>
                  <SelectItem value="leite">Leite</SelectItem>
                  <SelectItem value="dupla">Dupla Aptidão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAnimal(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={updateAnimal.isPending} style={{ background: "oklch(0.42 0.14 145)" }}>
              {updateAnimal.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar Exclusão ──────────────────────────────────────── */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /> Excluir Animal
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja excluir este animal? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteAnimal.isPending}
              onClick={() => {
                if (!deleteId || !imovelId) return;
                deleteAnimal.mutate({ animalId: deleteId, imovelId: imovelId!, especie: especieAtual.trpc });
              }}
            >
              {deleteAnimal.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Produção × Insumos (GMD/custo por kg, ou litros/dia e custo/litro) ──── */}
      <Dialog open={producaoAnimalId !== null} onOpenChange={(o) => { if (!o) setProducaoAnimalId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Produção × Insumos — últimos 30 dias</DialogTitle>
          </DialogHeader>
          {loadingProducao ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : !producaoInsumos ? (
            <p className="text-sm text-muted-foreground py-4">Sem dados de produção para este animal ainda.</p>
          ) : producaoInsumos.tipo === "leite" ? (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Litros/dia</p>
                <p className="text-xl font-bold mt-0.5" style={{ color: "oklch(0.35 0.12 145)" }}>
                  {producaoInsumos.litros_dia ?? "—"}
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Custo/litro</p>
                <p className="text-xl font-bold mt-0.5">
                  {producaoInsumos.custo_por_litro != null ? `R$ ${producaoInsumos.custo_por_litro.toFixed(2)}` : "—"}
                </p>
              </div>
              <div className="col-span-2 border rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Custo de insumos no período</p>
                <p className="text-lg font-semibold mt-0.5">R$ {producaoInsumos.custo_insumos_periodo.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">GMD</p>
                <p className="text-xl font-bold mt-0.5" style={{ color: "oklch(0.35 0.12 145)" }}>
                  {producaoInsumos.gmd_kg_dia != null ? `${producaoInsumos.gmd_kg_dia} kg/dia` : "—"}
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Custo/kg de ganho</p>
                <p className="text-xl font-bold mt-0.5">
                  {producaoInsumos.custo_por_kg_ganho != null ? `R$ ${producaoInsumos.custo_por_kg_ganho.toFixed(2)}` : "—"}
                </p>
              </div>
              <div className="col-span-2 border rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Custo de insumos no período</p>
                <p className="text-lg font-semibold mt-0.5">R$ {producaoInsumos.custo_insumos_periodo.toFixed(2)}</p>
              </div>
              {producaoInsumos.aviso && (
                <div className="col-span-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {producaoInsumos.aviso}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProducaoAnimalId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Importar Planilha ───────────────────────────────────────── */}
      <Dialog open={showImport} onOpenChange={(o) => { if (!o) resetImport(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              {importIsGenealogia
                ? "Importar Genealogia — 🐄 Bovino"
                : `Importar Planilha — ${especieAtual.emoji} ${especieAtual.label}`}
            </DialogTitle>
          </DialogHeader>

          {/* Indicador de etapas */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {[
              { id: "upload",    label: "1. Upload" },
              { id: "conflitos", label: "2. Conflitos" },
              { id: "resultado", label: "3. Resultado" },
            ].map((s, i) => (
              <span key={s.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">›</span>}
                <span className={importStep === s.id ? "font-semibold text-emerald-700" : ""}>{s.label}</span>
              </span>
            ))}
          </div>

          {/* ETAPA 1: Upload */}
          {importStep === "upload" && (
            <div className="space-y-4 py-2">
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                style={{ borderColor: "oklch(0.80 0.04 145)" }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="font-medium text-sm">Clique para selecionar o arquivo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos aceitos: .xlsx, .xls, .csv — inclusive .xls que na
                  verdade é tabela HTML (comum em exports de sistemas de genealogia).
                  {especie === "bovino" && " Planilhas de genealogia são detectadas automaticamente."}
                </p>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.html" className="hidden" onChange={handleFileChange} />

              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
                {importIsGenealogia ? (
                  <>
                    <p className="font-semibold">Colunas de genealogia reconhecidas automaticamente:</p>
                    <p><strong>Identificador/Brinco</strong> (obrigatório) · Nome Animal · Sexo · Raça · Composição
                      Racial · Data Nascimento (Dia/Mês/Ano separados ou coluna única) · Registro/Nome do Pai ·
                      Registro/Nome da Mãe</p>
                    <p className="text-blue-500">
                      Pai/mãe que já estiverem no rebanho são linkados automaticamente depois da importação;
                      os que não estiverem ficam guardados como texto (nada se perde).
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Colunas reconhecidas automaticamente:</p>
                    <p><strong>Brinco/ID</strong> (obrigatório) · Nome · Raça · Sexo (M/F) · Data Nascimento · Peso · Categoria{especie === "bovino" ? " · Aptidão de Manejo" : ""}</p>
                  </>
                )}
              </div>

              {(analisarPlanilha.isPending || analisarGenealogia.isPending) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analisando planilha...
                </div>
              )}
            </div>
          )}

          {/* ETAPA 2: Conflitos */}
          {importStep === "conflitos" && importPreview && (
            <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">⚠️ {importPreview.conflitos.length} animal(is) já cadastrado(s)</p>
                <p className="text-xs">Escolha o que fazer com cada um. A decisão padrão é <strong>Ignorar</strong>.</p>
              </div>

              <div className="flex gap-2 text-xs">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => {
                    const dec: Record<string, "atualizar" | "ignorar"> = {};
                    importPreview.conflitos.forEach((c: any) => { dec[c.brinco] = "atualizar"; });
                    setConflitosDecisoes(dec);
                  }}>
                  Atualizar todos
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => {
                    const dec: Record<string, "atualizar" | "ignorar"> = {};
                    importPreview.conflitos.forEach((c: any) => { dec[c.brinco] = "ignorar"; });
                    setConflitosDecisoes(dec);
                  }}>
                  Ignorar todos
                </Button>
              </div>

              {importPreview.conflitos.map((c: any) => (
                <div key={c.brinco} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">#{c.brinco} {c.existente?.nome ? `— ${c.existente.nome}` : ""}</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setConflitosDecisoes((d) => ({ ...d, [c.brinco]: "atualizar" }))}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${conflitosDecisoes[c.brinco] === "atualizar" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-blue-50"}`}
                      >
                        Atualizar
                      </button>
                      <button
                        onClick={() => setConflitosDecisoes((d) => ({ ...d, [c.brinco]: "ignorar" }))}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${conflitosDecisoes[c.brinco] === "ignorar" ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                    <span>Atual: {c.existente?.sexo === "M" ? "Macho" : "Fêmea"} · {c.existente?.raca_nome ?? c.existente?.raca ?? "—"} · {c.existente?.status}</span>
                    <span>Planilha: {c.parsed.sexo === "M" ? "Macho" : "Fêmea"} · {c.parsed.raca ?? "—"} · {c.parsed.categoria ?? "—"}</span>
                  </div>
                </div>
              ))}

              {importPreview.rows_novas.length > 0 && (
                <p className="text-xs text-emerald-700 font-medium">
                  + {importPreview.rows_novas.length} animal(is) novo(s) serão criados
                </p>
              )}
            </div>
          )}

          {/* ETAPA 3: Resultado */}
          {importStep === "resultado" && importResult && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <p className="font-semibold">Importação concluída!</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total",     value: importResult.total,      color: "text-gray-700" },
                  { label: "Criados",   value: importResult.criados,    color: "text-emerald-700" },
                  { label: "Atualizados", value: importResult.atualizados, color: "text-blue-700" },
                  { label: "Ignorados", value: importResult.ignorados,  color: "text-amber-700" },
                  { label: "Erros",     value: importResult.erros,      color: "text-red-700" },
                ].map((s) => (
                  <div key={s.label} className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              {importResult.erros_detalhe && importResult.erros_detalhe.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">Detalhe dos erros (até 10):</p>
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-40 overflow-y-auto">
                    {importResult.erros_detalhe.map((msg: string, i: number) => (
                      <li key={i} className="font-mono">{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {importStep === "conflitos" && (
              <>
                <Button variant="outline" onClick={() => { setImportStep("upload"); setImportPreview(null); }}>Voltar</Button>
                <Button
                  onClick={() => handleConfirmarImportacao(importPreview.rows_novas, importPreview.conflitos)}
                  disabled={confirmarImportacao.isPending}
                  style={{ background: "oklch(0.42 0.14 145)" }}
                >
                  {confirmarImportacao.isPending ? "Importando..." : "Confirmar Importação"}
                </Button>
              </>
            )}
            {importStep === "resultado" && (
              <Button onClick={resetImport} style={{ background: "oklch(0.42 0.14 145)" }}>Fechar</Button>
            )}
            {importStep === "upload" && (
              <Button variant="outline" onClick={resetImport}>Cancelar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
