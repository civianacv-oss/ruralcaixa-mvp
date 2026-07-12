import { useState, useEffect, useRef } from "react";
import { Plus, PawPrint, Search, RefreshCw, Pencil, Trash2, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, LogOut, Scale, BarChart3, X } from "lucide-react";
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

  // ── Dar Baixa (venda / morte / abate / doacao / permuta) ─────────────────
  const [baixaAnimal, setBaixaAnimal] = useState<any | null>(null);
  const [baixaForm, setBaixaForm] = useState({
    tipo: "venda",
    data: new Date().toISOString().slice(0, 10),
    pesoVivoKg: "",
    pesoCarcacaKg: "",
    valorTotal: "",
    comprador: "",
    observacoes: "",
  });

  const registrarBaixa = trpc.railway.registrarBaixaAnimal.useMutation({
    onSuccess: () => {
      toast.success("Baixa registrada com sucesso");
      utils.railway.animais.invalidate();
      setBaixaAnimal(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registrar baixa"),
  });

  const abrirDialogBaixa = (a: any) => {
    setBaixaAnimal(a);
    setBaixaForm({
      tipo: "venda",
      data: new Date().toISOString().slice(0, 10),
      pesoVivoKg: "",
      pesoCarcacaKg: "",
      valorTotal: "",
      comprador: "",
      observacoes: "",
    });
  };

  const handleRegistrarBaixa = () => {
    if (!baixaAnimal || !imovelId) return;
    registrarBaixa.mutate({
      imovelId: imovelId!,
      especie: especieAtual.trpc,
      animalId: baixaAnimal.id,
      tipo: baixaForm.tipo as any,
      data: baixaForm.data,
      pesoVivoKg: baixaForm.pesoVivoKg ? Number(baixaForm.pesoVivoKg) : undefined,
      pesoCarcacaKg: baixaForm.pesoCarcacaKg ? Number(baixaForm.pesoCarcacaKg) : undefined,
      valorTotal: baixaForm.valorTotal ? Number(baixaForm.valorTotal) : undefined,
      comprador: baixaForm.comprador || undefined,
      observacoes: baixaForm.observacoes || undefined,
    });
  };

  // ── Registrar Pesagem (kg / arroba) ───────────────────────────────────
  const KG_POR_ARROBA = 15;
  const [pesagemAnimal, setPesagemAnimal] = useState<any | null>(null);
  const [pesagemForm, setPesagemForm] = useState({
    peso: "",
    unidade: "kg" as "kg" | "arroba",
    data: new Date().toISOString().slice(0, 10),
    motivo: "rotina",
    observacoes: "",
  });

  const registrarPesagem = trpc.railway.registrarPesagemAnimal.useMutation({
    onSuccess: () => {
      toast.success("Pesagem registrada com sucesso");
      utils.railway.animais.invalidate();
      setPesagemAnimal(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registrar pesagem"),
  });

  const abrirDialogPesagem = (a: any) => {
    setPesagemAnimal(a);
    setPesagemForm({
      peso: "",
      unidade: "kg",
      data: new Date().toISOString().slice(0, 10),
      motivo: "rotina",
      observacoes: "",
    });
  };

  const handleRegistrarPesagem = () => {
    if (!pesagemAnimal || !imovelId) return;
    const pesoNum = Number(pesagemForm.peso);
    if (!pesoNum || pesoNum <= 0) { toast.error("Informe um peso válido"); return; }
    const pesoKg = pesagemForm.unidade === "arroba" ? pesoNum * KG_POR_ARROBA : pesoNum;
    registrarPesagem.mutate({
      imovelId: imovelId!,
      especie: especieAtual.trpc,
      animalId: pesagemAnimal.id,
      data: pesagemForm.data,
      pesoKg,
      motivo: pesagemForm.motivo,
      observacoes: pesagemForm.observacoes || undefined,
    });
  };

  // ── Desempenho do Rebanho (bovino) ────────────────────────────────────────
  const [showDesempenho, setShowDesempenho] = useState(false);
  const [desempFiltroTipo, setDesempFiltroTipo] = useState<"todos" | "leite" | "corte">("todos");
  const [desempFiltroLote, setDesempFiltroLote] = useState<string>("todos");
  const [desempOrdem, setDesempOrdem] = useState<"score_desc" | "score_asc" | "brinco">("score_desc");
  const [desempView, setDesempView] = useState<"grade" | "cubos">("grade");
  const [desempSelecionado, setDesempSelecionado] = useState<any | null>(null);

  const { data: desempenhoData, isLoading: loadingDesempenho } = trpc.railway.desempenhoRebanho.useQuery(
    { imovelId: imovelId!, dias: 30 },
    { enabled: showDesempenho && !!imovelId }
  );

  const desempStatusOf = (score: number | null) => {
    if (score === null) return { bg: "#9ca3af", label: "Sem dado" };
    if (score >= 75) return { bg: "#0ca30c", label: "Excelente" };
    if (score >= 50) return { bg: "#fab219", label: "Bom" };
    if (score >= 30) return { bg: "#ec835a", label: "Regular" };
    return { bg: "#d03b3b", label: "Crítico" };
  };

  const desempLotes = Array.from(
    new Set((desempenhoData ?? []).map((a: any) => a.lote_nome).filter(Boolean))
  ) as string[];

  const desempFiltrado = (desempenhoData ?? [])
    .filter((a: any) => desempFiltroTipo === "todos" || a.tipo === desempFiltroTipo)
    .filter((a: any) => desempFiltroLote === "todos" || a.lote_nome === desempFiltroLote)
    .slice()
    .sort((a: any, b: any) => {
      if (desempOrdem === "score_desc") return (b.score ?? -1) - (a.score ?? -1);
      if (desempOrdem === "score_asc") return (a.score ?? 999) - (b.score ?? 999);
      return String(a.brinco).localeCompare(String(b.brinco), undefined, { numeric: true });
    });

  const desempContagem = { Excelente: 0, Bom: 0, Regular: 0, "Crítico": 0, "Sem dado": 0 };
  desempFiltrado.forEach((a: any) => {
    const label = desempStatusOf(a.score).label as keyof typeof desempContagem;
    desempContagem[label]++;
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

  // ── Lactações / Controle leiteiro (Bovino) — sem etapa de conflito, ──────
  // já que cada linha é um registro histórico aditivo, não um "animal" que
  // possa colidir por brinco.
  // Info da fase de analise (linhas ignoradas / brincos nao encontrados)
  // que precisa sobreviver ate a tela de resultado, apos a confirmacao.
  const [analisePreviaExtra, setAnalisePreviaExtra] = useState<{
    nao_encontrados?: { brinco: string }[];
    ignoradas_count?: number;
    total_planilha?: number;
  } | null>(null);

  const confirmarLactacoes = trpc.railway.confirmarImportacaoLactacoesBovino.useMutation({
    onSuccess: (data) => {
      setImportResult({ tipo: "lactacoes", ...data, ...(analisePreviaExtra ?? {}) });
      setImportStep("resultado");
      utils.railway.lactacoesBovino?.invalidate?.();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao importar lactações"),
  });

  const analisarLactacoes = trpc.railway.analisarPlanilhaLactacoesBovino.useMutation({
    onSuccess: (data) => {
      setAnalisePreviaExtra({
        nao_encontrados: data.nao_encontrados,
        ignoradas_count: data.ignoradas_count,
        total_planilha: data.total_planilha,
      });
      if (data.itens.length === 0) {
        setImportResult({ tipo: "lactacoes", criados: 0, duplicados: [], erros: [], ...data });
        setImportStep("resultado");
        return;
      }
      confirmarLactacoes.mutate({ imovelId: imovelId!, itens: data.itens });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao analisar planilha de lactações"),
  });

  const confirmarControle = trpc.railway.confirmarImportacaoControleLeiteiroBovino.useMutation({
    onSuccess: (data) => {
      setImportResult({ tipo: "controle", ...data, ...(analisePreviaExtra ?? {}) });
      setImportStep("resultado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao importar controle leiteiro"),
  });

  const analisarControle = trpc.railway.analisarPlanilhaControleLeiteiroBovino.useMutation({
    onSuccess: (data) => {
      setAnalisePreviaExtra({
        nao_encontrados: data.nao_encontrados,
        ignoradas_count: data.ignoradas_count,
        total_planilha: data.total_planilha,
      });
      if (data.itens.length === 0) {
        setImportResult({ tipo: "controle", criados: 0, duplicados: [], erros: [], ...data });
        setImportStep("resultado");
        return;
      }
      confirmarControle.mutate({ imovelId: imovelId!, itens: data.itens });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao analisar planilha de controle leiteiro"),
  });

  // ── Auto-detecção de tipo de planilha por assinatura de coluna ───────────
  const detectarTipoPlanilha = (headerRow: unknown[]): "genealogia" | "controle" | "lactacoes" | "animais" => {
    const norm = (s: unknown) =>
      String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const cols = headerRow.map(norm);
    const has = (...keys: string[]) => keys.some((k) => cols.some((c) => c.includes(k)));

    if (has("registropai", "nomepai", "registromae", "nomemae")) return "genealogia";
    if (has("numerocontrole", "ordenha1", "ordenha2")) return "controle";
    if (has("producaototalleite", "duracaolactacao", "producao305d")) return "lactacoes";
    return "animais";
  };

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

        // Auto-detecta o tipo (só relevante pra bovino; outras espécies só têm
        // o import genérico de animais por enquanto).
        const tipo = especie === "bovino" ? detectarTipoPlanilha(rawRows[headerRowIndex] || []) : "animais";

        if (tipo === "genealogia") {
          setImportIsGenealogia(true);
          analisarGenealogia.mutate({ imovelId: imovelId!, rows });
        } else if (tipo === "lactacoes") {
          setImportIsGenealogia(false);
          analisarLactacoes.mutate({ imovelId: imovelId!, rows });
        } else if (tipo === "controle") {
          setImportIsGenealogia(false);
          analisarControle.mutate({ imovelId: imovelId!, rows });
        } else {
          setImportIsGenealogia(false);
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
    setAnalisePreviaExtra(null);
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
          {especie === "bovino" && (
            <Button variant="outline" size="sm" onClick={() => setShowDesempenho(true)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              Desempenho
            </Button>
          )}
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
                    {a.status === "ativo" && (
                      <Button
                        variant="ghost" size="icon"
                        className="w-8 h-8 text-orange-600 hover:text-orange-800 hover:bg-orange-50"
                        title="Dar baixa (venda, morte, abate, doação, permuta)"
                        onClick={() => abrirDialogBaixa(a)}
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {a.status === "ativo" && (
                      <Button
                        variant="ghost" size="icon"
                        className="w-8 h-8 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                        title="Registrar pesagem"
                        onClick={() => abrirDialogPesagem(a)}
                      >
                        <Scale className="w-3.5 h-3.5" />
                      </Button>
                    )}
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

      {/* ── Dialog: Dar Baixa ──────────────────────────────────────────────── */}
      <Dialog open={baixaAnimal !== null} onOpenChange={(o) => { if (!o) setBaixaAnimal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <LogOut className="w-5 h-5" /> Dar Baixa — #{baixaAnimal?.brinco}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Tipo de baixa *</label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={baixaForm.tipo}
                onChange={(e) => setBaixaForm({ ...baixaForm, tipo: e.target.value })}
              >
                <option value="venda">Venda</option>
                <option value="abate_proprio">Abate próprio (consumo)</option>
                <option value="abate_frigorif">Abate frigorífico</option>
                <option value="morte">Morte</option>
                <option value="doacao">Doação</option>
                <option value="permuta">Permuta / Troca</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Data *</label>
              <Input
                type="date"
                value={baixaForm.data}
                onChange={(e) => setBaixaForm({ ...baixaForm, data: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium block mb-1">Peso vivo (kg)</label>
                <Input
                  type="number"
                  value={baixaForm.pesoVivoKg}
                  onChange={(e) => setBaixaForm({ ...baixaForm, pesoVivoKg: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Peso carcaça (kg)</label>
                <Input
                  type="number"
                  value={baixaForm.pesoCarcacaKg}
                  onChange={(e) => setBaixaForm({ ...baixaForm, pesoCarcacaKg: e.target.value })}
                />
              </div>
            </div>
            {(baixaForm.tipo === "venda" || baixaForm.tipo === "abate_frigorif") && (
              <div>
                <label className="text-sm font-medium block mb-1">Valor total (R$)</label>
                <Input
                  type="number"
                  value={baixaForm.valorTotal}
                  onChange={(e) => setBaixaForm({ ...baixaForm, valorTotal: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium block mb-1">
                {baixaForm.tipo === "doacao" ? "Destinatário" : baixaForm.tipo === "permuta" ? "Trocado com" : "Comprador"}
              </label>
              <Input
                value={baixaForm.comprador}
                onChange={(e) => setBaixaForm({ ...baixaForm, comprador: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Observações</label>
              <Input
                value={baixaForm.observacoes}
                onChange={(e) => setBaixaForm({ ...baixaForm, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaAnimal(null)}>Cancelar</Button>
            <Button
              onClick={handleRegistrarBaixa}
              disabled={registrarBaixa.isPending}
              style={{ background: "oklch(0.42 0.14 145)" }}
            >
              {registrarBaixa.isPending ? "Registrando..." : "Confirmar Baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Registrar Pesagem ────────────────────────────────────────── */}
      <Dialog open={pesagemAnimal !== null} onOpenChange={(o) => { if (!o) setPesagemAnimal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <Scale className="w-5 h-5" /> Registrar Pesagem — #{pesagemAnimal?.brinco}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Peso *</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={pesagemForm.peso}
                  onChange={(e) => setPesagemForm({ ...pesagemForm, peso: e.target.value })}
                  className="flex-1"
                />
                <select
                  className="border rounded-md px-2 text-sm"
                  value={pesagemForm.unidade}
                  onChange={(e) => setPesagemForm({ ...pesagemForm, unidade: e.target.value as "kg" | "arroba" })}
                >
                  <option value="kg">kg</option>
                  <option value="arroba">@ (arroba)</option>
                </select>
              </div>
              {pesagemForm.unidade === "arroba" && pesagemForm.peso && (
                <p className="text-xs text-muted-foreground mt-1">
                  = {(Number(pesagemForm.peso) * 15).toFixed(1)} kg (1 @ = 15 kg)
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Data *</label>
              <Input
                type="date"
                value={pesagemForm.data}
                onChange={(e) => setPesagemForm({ ...pesagemForm, data: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Motivo</label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={pesagemForm.motivo}
                onChange={(e) => setPesagemForm({ ...pesagemForm, motivo: e.target.value })}
              >
                <option value="rotina">Rotina</option>
                <option value="entrada_lote">Entrada de lote</option>
                <option value="nascimento">Nascimento</option>
                <option value="desmame">Desmame</option>
                <option value="pre_abate">Pré-abate</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Observações</label>
              <Input
                value={pesagemForm.observacoes}
                onChange={(e) => setPesagemForm({ ...pesagemForm, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPesagemAnimal(null)}>Cancelar</Button>
            <Button
              onClick={handleRegistrarPesagem}
              disabled={registrarPesagem.isPending}
              style={{ background: "oklch(0.42 0.14 145)" }}
            >
              {registrarPesagem.isPending ? "Registrando..." : "Salvar Pesagem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Desempenho do Rebanho ─────────────────────────────────────── */}
      <Dialog open={showDesempenho} onOpenChange={(o) => { if (!o) { setShowDesempenho(false); setDesempSelecionado(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              Desempenho do Rebanho — últimos 30 dias
            </DialogTitle>
          </DialogHeader>

          {loadingDesempenho && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="w-4 h-4 animate-spin" /> Calculando desempenho...
            </div>
          )}

          {!loadingDesempenho && desempenhoData && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-5 gap-2">
                {(["Excelente", "Bom", "Regular", "Crítico", "Sem dado"] as const).map((label) => (
                  <div key={label} className="border rounded-lg p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                    <p className="text-lg font-bold" style={{ color: desempStatusOf(label === "Excelente" ? 100 : label === "Bom" ? 60 : label === "Regular" ? 40 : label === "Crítico" ? 10 : null).bg }}>
                      {desempContagem[label]}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap items-center">
                <select className="border rounded-md p-2 text-sm" value={desempFiltroTipo} onChange={(e) => setDesempFiltroTipo(e.target.value as any)}>
                  <option value="todos">Todos os tipos</option>
                  <option value="leite">Leite</option>
                  <option value="corte">Corte</option>
                </select>
                <select className="border rounded-md p-2 text-sm" value={desempFiltroLote} onChange={(e) => setDesempFiltroLote(e.target.value)}>
                  <option value="todos">Todos os lotes</option>
                  {desempLotes.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <select className="border rounded-md p-2 text-sm" value={desempOrdem} onChange={(e) => setDesempOrdem(e.target.value as any)}>
                  <option value="score_desc">Maior desempenho</option>
                  <option value="score_asc">Menor desempenho</option>
                  <option value="brinco">Brinco</option>
                </select>
                <div className="flex gap-1 ml-auto">
                  <Button size="sm" variant={desempView === "grade" ? "default" : "outline"} onClick={() => setDesempView("grade")}>Grade</Button>
                  <Button size="sm" variant={desempView === "cubos" ? "default" : "outline"} onClick={() => setDesempView("cubos")}>Cubos</Button>
                </div>
              </div>

              {desempView === "grade" && (
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))" }}>
                  {desempFiltrado.map((a: any) => {
                    const s = desempStatusOf(a.score);
                    return (
                      <div
                        key={a.animal_id}
                        onClick={() => setDesempSelecionado(a)}
                        className="rounded-lg p-2 cursor-pointer border"
                        style={{ background: `${s.bg}22`, borderColor: `${s.bg}66` }}
                      >
                        <p className="text-xs font-medium">#{a.brinco}</p>
                        <p className="text-[10px] text-muted-foreground">{a.tipo}</p>
                        <p className="text-lg font-bold" style={{ color: s.bg }}>{a.score ?? "—"}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {desempView === "cubos" && (
                <div className="flex gap-3 flex-wrap items-end py-2">
                  {desempFiltrado.map((a: any) => {
                    const s = desempStatusOf(a.score);
                    const h = 20 + (a.score ?? 0) * 0.8;
                    return (
                      <div key={a.animal_id} onClick={() => setDesempSelecionado(a)} className="flex flex-col items-center cursor-pointer" style={{ width: 42 }}>
                        <div style={{ position: "relative", width: 42, height: h }}>
                          <div style={{ position: "absolute", width: 42, height: h, background: s.bg, opacity: 0.9, borderRadius: 2 }} />
                          <div style={{ position: "absolute", top: -8, left: 4, width: 34, height: 12, background: s.bg, opacity: 0.6, transform: "skewX(-40deg) scaleY(0.6)" }} />
                          <div style={{ position: "absolute", top: 0, right: -8, width: 10, height: h, background: s.bg, opacity: 0.45, transform: "skewY(-40deg) scaleX(0.6)" }} />
                        </div>
                        <p className="text-[10px] mt-1 text-muted-foreground">#{a.brinco}</p>
                        <p className="text-xs font-bold" style={{ color: s.bg }}>{a.score ?? "—"}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {desempSelecionado && (
                <div className="border rounded-lg p-3 bg-gray-50 relative">
                  <button className="absolute top-2 right-2" onClick={() => setDesempSelecionado(null)}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <p className="font-semibold text-sm">#{desempSelecionado.brinco} {desempSelecionado.nome}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tipo: {desempSelecionado.tipo} · Lote: {desempSelecionado.lote_nome ?? "sem lote"} · Score: {desempSelecionado.score ?? "sem dado"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Produção no período: {desempSelecionado.producao_periodo ?? "—"} {desempSelecionado.tipo === "leite" ? "L" : "kg"} ·{" "}
                    {desempSelecionado.tipo === "leite" ? "Litros/dia" : "GMD"}: {desempSelecionado.metrica_dia ?? "—"} {desempSelecionado.tipo === "leite" ? "L/dia" : "kg/dia"}
                  </p>
                </div>
              )}

              {desempFiltrado.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum animal encontrado com esses filtros.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDesempenho(false); setDesempSelecionado(null); }}>Fechar</Button>
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
                  verdade é tabela HTML (comum em exports de sistemas de genealogia)
                </p>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              

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

          {/* ETAPA 3: Resultado (animais / genealogia) */}
          {importStep === "resultado" && importResult && importResult.tipo !== "lactacoes" && importResult.tipo !== "controle" && (
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
                  {
                    label: "Erros",
                    value: Array.isArray(importResult.erros) ? importResult.erros.length : importResult.erros,
                    color: "text-red-700",
                  },
                ].map((s) => (
                  <div key={s.label} className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {Array.isArray(importResult.erros) && importResult.erros.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1 max-h-40 overflow-y-auto">
                  <p className="font-semibold mb-1">Detalhes dos erros:</p>
                  {importResult.erros.map((e: any, i: number) => (
                    <p key={i}>
                      Animal #{e.animal_id ?? e.brinco ?? "?"}
                      {e.data ? ` (${e.data})` : ""}
                      {e.data_parto ? ` (${e.data_parto})` : ""}
                      : {e.erro ?? JSON.stringify(e)}
                    </p>
                  ))}
                </div>
              )}

              {Array.isArray(importResult.nao_encontrados) && importResult.nao_encontrados.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1 max-h-40 overflow-y-auto">
                  <p className="font-semibold mb-1">
                    {importResult.nao_encontrados.length} animal(is) da planilha não encontrado(s) no rebanho (brinco não cadastrado):
                  </p>
                  <p>{importResult.nao_encontrados.map((n: any) => n.brinco).join(", ")}</p>
                </div>
              )}
            </div>
          )}

          {/* ETAPA 3 (variante): Resultado de Ordenha / Lactações — categorias claras */}
          {importStep === "resultado" && importResult && (importResult.tipo === "lactacoes" || importResult.tipo === "controle") && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <p className="font-semibold">
                  Importação de {importResult.tipo === "lactacoes" ? "lactações" : "controle leiteiro"} concluída!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Linhas na planilha",
                    value: importResult.total_planilha ?? importResult.total ?? "—",
                    color: "text-gray-700",
                    hint: "Total de linhas do arquivo original",
                  },
                  {
                    label: "Criados",
                    value: importResult.criados ?? 0,
                    color: "text-emerald-700",
                    hint: "Novos registros salvos com sucesso",
                  },
                  {
                    label: "Já existiam",
                    value: Array.isArray(importResult.duplicados) ? importResult.duplicados.length : 0,
                    color: "text-blue-700",
                    hint: "Duplicados — mesmo animal e data já importados antes",
                  },
                  {
                    label: "Não encontrados",
                    value: Array.isArray(importResult.nao_encontrados) ? importResult.nao_encontrados.length : 0,
                    color: "text-amber-700",
                    hint: "Brinco da planilha não existe no rebanho",
                  },
                  {
                    label: "Ignorados",
                    value: importResult.ignoradas_count ?? 0,
                    color: "text-amber-700",
                    hint: "Linha sem data ou identificação válida",
                  },
                  {
                    label: "Erros inesperados",
                    value: Array.isArray(importResult.erros) ? importResult.erros.length : 0,
                    color: "text-red-700",
                    hint: "Problema técnico — vale revisar",
                  },
                ].map((s) => (
                  <div key={s.label} className="border rounded-lg p-3" title={s.hint}>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.hint}</p>
                  </div>
                ))}
              </div>

              {Array.isArray(importResult.duplicados) && importResult.duplicados.length > 0 && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1 max-h-32 overflow-y-auto">
                  <p className="font-semibold mb-1">
                    {importResult.duplicados.length} registro(s) já existente(s) (não é erro, só não duplicamos):
                  </p>
                  {importResult.duplicados.map((d: any, i: number) => (
                    <p key={i}>
                      Animal #{d.animal_id} — {d.data ?? d.data_parto} — {d.motivo}
                    </p>
                  ))}
                </div>
              )}

              {Array.isArray(importResult.nao_encontrados) && importResult.nao_encontrados.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1 max-h-32 overflow-y-auto">
                  <p className="font-semibold mb-1">
                    Brinco(s) da planilha sem cadastro no rebanho (importe/cadastre o animal antes):
                  </p>
                  <p>{importResult.nao_encontrados.map((n: any) => n.brinco).join(", ")}</p>
                </div>
              )}

              {Array.isArray(importResult.erros) && importResult.erros.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1 max-h-32 overflow-y-auto">
                  <p className="font-semibold mb-1">Erros inesperados (não são duplicatas — vale investigar):</p>
                  {importResult.erros.map((e: any, i: number) => (
                    <p key={i}>
                      Animal #{e.animal_id ?? "?"} ({e.data ?? e.data_parto ?? "—"}): {e.erro ?? JSON.stringify(e)}
                    </p>
                  ))}
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
