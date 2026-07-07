import { useState, useMemo } from "react";
import { fmtBRL, calcularNovoCustoMedio, calcularValorTotalEstoque } from "@/lib/custoCalculo";
import { trpc } from "@/lib/trpc";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import {
  Package,
  AlertTriangle,
  Plus,
  ShoppingCart,
  Truck,
  CheckCircle,
  Send,
  Users,
  History,
  ArrowDownCircle,
  ArrowUpCircle,
  Info,
  Zap,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ChevronsUpDown,
  Hash,
  Trash2,
  Pencil,
  Search,
  Filter,
  MoreVertical,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  BarChart2,
  Calculator,
  RefreshCw,
  ShoppingBag,
  UserX,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  DollarSign,
  TrendingUp,
  Banknote,
  LayoutDashboard,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  critico: "bg-red-100 text-red-700 border-red-200",
  baixo: "bg-orange-100 text-orange-700 border-orange-200",
  atencao: "bg-yellow-100 text-yellow-700 border-yellow-200",
  ok: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  critico: "Urgente",
  baixo: "Atenção",
  atencao: "Atenção",
  ok: "OK",
};

const STATUS_ICONS: Record<string, string> = {
  critico: "🟥",
  baixo: "🟧",
  atencao: "🟡",
  ok: "🟢",
};

const PEDIDO_STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-blue-100 text-blue-700",
  enviado: "bg-purple-100 text-purple-700",
  recebido: "bg-green-100 text-green-700",
  cancelado: "bg-gray-100 text-gray-500",
};

const TIPO_MOVIM_LABELS: Record<string, string> = {
  compra: "Compra",
  producao_propria: "Produção própria",
  doacao: "Doação",
  ajuste_positivo: "Ajuste +",
  uso: "Uso",
  venda: "Venda",
  perda: "Perda",
  ajuste_negativo: "Ajuste -",
};

const TIPO_MOVIM_ICONS: Record<string, React.ReactNode> = {
  compra: <ArrowDownCircle className="h-4 w-4 text-green-600" />,
  producao_propria: <ArrowDownCircle className="h-4 w-4 text-blue-600" />,
  doacao: <ArrowDownCircle className="h-4 w-4 text-purple-600" />,
  ajuste_positivo: <ArrowDownCircle className="h-4 w-4 text-teal-600" />,
  uso: <ArrowUpCircle className="h-4 w-4 text-orange-600" />,
  venda: <ArrowUpCircle className="h-4 w-4 text-red-600" />,
  perda: <ArrowUpCircle className="h-4 w-4 text-red-500" />,
  ajuste_negativo: <ArrowUpCircle className="h-4 w-4 text-gray-500" />,
};

// ── Gerar relatório XLSX dos itens ignorados/falhos na importação ─────────────
type ImportResultItem = { nome: string; codigo?: string; ok: boolean; action?: string; error?: string };

function gerarRelatorioIgnorados(
  results: ImportResultItem[],
  nomeArquivo = "relatorio_importacao"
) {
  const wb = XLSX.utils.book_new();
  const agora = new Date();
  const dataStr = agora.toLocaleDateString("pt-BR");
  const horaStr = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // ── Aba 1: Resumo ──────────────────────────────────────────────────────────
  const rCriados   = results.filter(r => r.ok && r.action === "criado");
  const rAtualizados = results.filter(r => r.ok && r.action === "atualizado");
  const rIgnorados = results.filter(r => r.ok && r.action === "ignorado");
  const rFalhas    = results.filter(r => !r.ok);

  const resumoData = [
    ["Relatório de Importação de Insumos"],
    [`Gerado em: ${dataStr} às ${horaStr}`],
    [""],
    ["Categoria", "Quantidade", "Descrição"],
    ["Total processado", results.length, "Todos os itens da planilha"],
    ["Importados (Novos)", rCriados.length, "Insumos criados com sucesso"],
    ["Importados (Estoque+)", rAtualizados.length, "Estoque somado com sucesso"],
    ["Ignorados", rIgnorados.length, "Valor zero no arquivo — não alterados"],
    ["Falhas", rFalhas.length, "Erro na API durante a importação"],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  wsResumo["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 42 }];
  wsResumo["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // ── Aba 2: Ignorados (valor zero) ─────────────────────────────────────────
  if (rIgnorados.length > 0) {
    const ignoradosData = [
      ["Código", "Nome do Insumo", "Motivo"],
      ...rIgnorados.map(r => [
        r.codigo ?? "",
        r.nome,
        "Valor zero no arquivo — nenhuma alteração realizada",
      ]),
    ];
    const wsIgnorados = XLSX.utils.aoa_to_sheet(ignoradosData);
    wsIgnorados["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, wsIgnorados, "Ignorados");
  }

  // ── Aba 3: Falhas (erro na API) ───────────────────────────────────────────
  if (rFalhas.length > 0) {
    const falhasData = [
      ["Código", "Nome do Insumo", "Erro Detalhado", "Ação Recomendada"],
      ...rFalhas.map(r => [
        r.codigo ?? "",
        r.nome,
        r.error ?? "Erro desconhecido",
        "Verificar manualmente e registrar movimentação no sistema",
      ]),
    ];
    const wsFalhas = XLSX.utils.aoa_to_sheet(falhasData);
    wsFalhas["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 56 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, wsFalhas, "Falhas");
  }

  // ── Aba 4: Importados com sucesso ─────────────────────────────────────────
  if ((rCriados.length + rAtualizados.length) > 0) {
    const sucessoData = [
      ["Código", "Nome do Insumo", "Resultado"],
      ...[...rCriados, ...rAtualizados].map(r => [
        r.codigo ?? "",
        r.nome,
        r.action === "criado" ? "Novo insumo criado" : "Estoque somado (ajuste positivo)",
      ]),
    ];
    const wsSucesso = XLSX.utils.aoa_to_sheet(sucessoData);
    wsSucesso["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, wsSucesso, "Importados");
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const dataFormatada = agora.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${nomeArquivo}_${dataFormatada}.xlsx`);
}

export default function Insumos() {
  const { imovelId } = useRuralAuth();
  const utils = trpc.useUtils();

  // ── Catálogo local (sempre disponível, independente do Railway) ───────────────────────
  const [nomeSearch, setNomeSearch] = useState("");
  const [nomePopoverOpen, setNomePopoverOpen] = useState(false);
  const { data: catalogSuggestions = [] } = trpc.railway.buscarCatalogInsumos.useQuery(
    { imovelId: imovelId!, query: nomeSearch },
    { enabled: !!imovelId && nomeSearch.length >= 2, retry: false }
  );
  const { data: catalogList = [] } = trpc.railway.listarCatalogInsumos.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );
  const upsertCatalog = trpc.railway.upsertCatalogInsumo.useMutation({
    onSuccess: (item) => {
      utils.railway.listarCatalogInsumos.invalidate();
      utils.railway.buscarCatalogInsumos.invalidate();
      toast.success(`Insumo salvo no catálogo com código ${item.codigo}`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Queries Railway (retry:false para não logar erros 404 enquanto backend não deployado) ────────────
  const { data: insumos = [], isLoading: loadingInsumos } = trpc.railway.insumos.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );
  const { data: alertas = [], isLoading: loadingAlertas } = trpc.railway.insumosAlertas.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );
  const { data: fornecedores = [], isLoading: loadingFornecedores } = trpc.railway.fornecedores.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );
  const { data: pedidos = [], isLoading: loadingPedidos } = trpc.railway.pedidosCompra.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );

  // Detalhe do insumo selecionado (histórico)
  const [selectedInsumoId, setSelectedInsumoId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: insumoDetalhe, isLoading: loadingDetalhe } = trpc.railway.insumoDetalhe.useQuery(
    { imovelId: imovelId!, insumoId: selectedInsumoId! },
    { enabled: !!imovelId && !!selectedInsumoId && historyOpen, retry: false }
  );

  // Resumo de compras/consumo do mês (cards do topo da tela)
  const { data: resumoMovimentacoes } = trpc.railway.resumoMovimentacoesInsumos.useQuery(
    { imovelId: imovelId! },
    { enabled: !!imovelId, retry: false }
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createInsumo = trpc.railway.createInsumo.useMutation({
    onSuccess: () => {
      toast.success("Insumo cadastrado com sucesso");
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      setOpenNovoInsumo(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarInsumo = trpc.railway.atualizarInsumo.useMutation({
    onSuccess: () => {
      toast.success("Insumo atualizado com sucesso");
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      setOpenNovoInsumo(false);
      setEditingInsumoId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Cria (se necessário) e vincula um fornecedor a um insumo específico, a partir
  // do atalho rápido exibido quando o insumo está "Sem fornecedor" na listagem.
  const vincularFornecedorMutation = trpc.railway.atualizarInsumo.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor vinculado ao insumo");
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      setVincularFornecedorInsumo(null);
      setVincularFornecedorSelecao("");
      setVincularFornecedorNovoNome("");
    },
    onError: (e) => toast.error(e.message),
  });

  const criarFornecedorParaVincular = trpc.railway.createFornecedor.useMutation({
    onSuccess: (novo: any) => {
      utils.railway.fornecedores.invalidate();
      if (vincularFornecedorInsumo) {
        vincularFornecedorMutation.mutate({
          imovelId: imovelId!,
          insumoId: vincularFornecedorInsumo.id,
          nome: vincularFornecedorInsumo.nome,
          categoria: vincularFornecedorInsumo.categoria,
          unidade: vincularFornecedorInsumo.unidade,
          origem: vincularFornecedorInsumo.origem,
          estoque_minimo: vincularFornecedorInsumo.estoque_minimo ?? 0,
          estoque_ideal: vincularFornecedorInsumo.estoque_ideal ?? 0,
          preco_estimado: vincularFornecedorInsumo.preco_estimado,
          fornecedor_id: novo.id,
          reposicao_modo: vincularFornecedorInsumo.reposicao_modo ?? "manual",
          lead_time_dias: vincularFornecedorInsumo.lead_time_dias ?? 7,
        });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleEditInsumo = (ins: any) => {
    setEditingInsumoId(ins.id);
    setNovoInsumo({
      nome: ins.nome ?? "",
      categoria: ins.categoria ?? "outros",
      unidade: ins.unidade ?? "unidade",
      origem: (ins.origem ?? "comprado") as "comprado" | "proprio" | "doacao",
      estoque_atual: ins.estoque_atual ?? 0,
      estoque_minimo: ins.estoque_minimo ?? 0,
      estoque_ideal: ins.estoque_ideal ?? 0,
      preco_estimado: ins.preco_estimado != null ? String(ins.preco_estimado) : "",
      lead_time_dias: ins.lead_time_dias ?? 7,
      reposicao_modo: (ins.reposicao_modo ?? "manual") as "manual" | "automatico",
      fornecedor_id: ins.fornecedor_id ?? "",
    });
    setOpenNovoInsumo(true);
  };

  const confirmarVincularFornecedor = () => {
    if (!vincularFornecedorInsumo) return;
    if (vincularFornecedorSelecao === "novo") {
      if (!vincularFornecedorNovoNome.trim()) { toast.error("Informe o nome do fornecedor"); return; }
      criarFornecedorParaVincular.mutate({ imovelId: imovelId!, nome: vincularFornecedorNovoNome.trim() });
      return;
    }
    if (!vincularFornecedorSelecao) { toast.error("Selecione um fornecedor"); return; }
    vincularFornecedorMutation.mutate({
      imovelId: imovelId!,
      insumoId: vincularFornecedorInsumo.id,
      nome: vincularFornecedorInsumo.nome,
      categoria: vincularFornecedorInsumo.categoria,
      unidade: vincularFornecedorInsumo.unidade,
      origem: vincularFornecedorInsumo.origem,
      estoque_minimo: vincularFornecedorInsumo.estoque_minimo ?? 0,
      estoque_ideal: vincularFornecedorInsumo.estoque_ideal ?? 0,
      preco_estimado: vincularFornecedorInsumo.preco_estimado,
      fornecedor_id: Number(vincularFornecedorSelecao),
      reposicao_modo: vincularFornecedorInsumo.reposicao_modo ?? "manual",
      lead_time_dias: vincularFornecedorInsumo.lead_time_dias ?? 7,
    });
  };

  const movimentar = trpc.railway.movimentarInsumo.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada");
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      if (historyOpen && selectedInsumoId) utils.railway.insumoDetalhe.invalidate();
      setOpenMovim(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const createFornecedor = trpc.railway.createFornecedor.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor cadastrado");
      utils.railway.fornecedores.invalidate();
      setOpenNovoFornecedor(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateFornecedor = trpc.railway.updateFornecedor.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor atualizado");
      utils.railway.fornecedores.invalidate();
      utils.railway.insumos.invalidate();
      setOpenNovoFornecedor(false);
      setEditingFornecedorId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteFornecedor = trpc.railway.deleteFornecedor.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor excluído com sucesso");
      utils.railway.fornecedores.invalidate();
      utils.railway.insumos.invalidate();
      setConfirmDeleteFornecedorId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const createPedido = trpc.railway.createPedidoCompra.useMutation({
    onSuccess: () => {
      toast.success("Pedido de compra criado");
      utils.railway.pedidosCompra.invalidate();
      setOpenNovoPedido(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const aprovarPedido = trpc.railway.aprovarPedidoCompra.useMutation({
    onSuccess: () => {
      toast.success("Pedido aprovado");
      utils.railway.pedidosCompra.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const enviarPedido = trpc.railway.enviarPedidoCompra.useMutation({
    onSuccess: (data) => {
      toast.success(data.enviado_telegram ? "Pedido enviado via Telegram" : "Pedido marcado como enviado");
      utils.railway.pedidosCompra.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteInsumo = trpc.railway.deleteInsumo.useMutation({
    onSuccess: () => {
      toast.success("Insumo excluído com sucesso");
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      setConfirmDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const limparDuplicados = trpc.railway.limparDuplicadosInsumos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.removidos} duplicata(s) removida(s) com sucesso!`);
      utils.railway.insumos.invalidate();
      utils.railway.insumosAlertas.invalidate();
      setOpenLimparDuplicados(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Dialog states ────────────────────────────────────────────────────────────
  const [openNovoInsumo, setOpenNovoInsumo] = useState(false);
  const [openMovim, setOpenMovim] = useState(false);
  const [openNovoFornecedor, setOpenNovoFornecedor] = useState(false);
  const [openNovoPedido, setOpenNovoPedido] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [openLimparDuplicados, setOpenLimparDuplicados] = useState(false);
  const [movimInsumoId, setMovimInsumoId] = useState<number | null>(null);

  // ── Importação de planilha (3 etapas: upload → de-para → resultado) ────────────────────────────────────────────────────
  const [openImport, setOpenImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<"upload" | "depara" | "conflitos" | "resultado">("upload");
  const [importPreview, setImportPreview] = useState<{
    rows: any[];
    rows_novas?: any[];
    conflitos?: { nome: string; linha: number; estoque_planilha: number; estoque_atual: number; insumo_id: number; unidade: string }[];
    unmapped: { nome: string; linha: number }[];
    catalog: any[];
    total: number;
    total_original?: number;
    duplicatas_removidas?: number;
    linhas_sem_nome?: number;
    linhas_zeradas?: { nome: string; linha: number }[];
  } | null>(null);
  const [importMappings, setImportMappings] = useState<Record<string, string>>({});
  // Decisões de conflito: { [nome]: "adicionar" | "ignorar" }
  const [conflitosDecisoes, setConflitosDecisoes] = useState<Record<string, "adicionar" | "ignorar">>({});
  const [importResult, setImportResult] = useState<{ total: number; success: number; errors: number; criados?: number; atualizados?: number; results: { nome: string; ok: boolean; error?: string; codigo?: string; action?: string }[] } | null>(null);

  const analisarPlanilha = trpc.railway.analisarPlanilhaInsumos.useMutation({
    onSuccess: (data: any) => {
      setImportPreview(data);
      const initial: Record<string, string> = {};
      data.unmapped.forEach((u: { nome: string }) => { initial[u.nome] = u.nome; });
      setImportMappings(initial);
      // Se houver conflitos (insumos já existentes), ir para etapa de resolução
      if (data.conflitos && data.conflitos.length > 0) {
        const decisoesIniciais: Record<string, "adicionar" | "ignorar"> = {};
        data.conflitos.forEach((c: { nome: string; estoque_planilha: number; estoque_atual: number }) => {
          if (c.estoque_planilha === 0) {
            // Valor zero no arquivo → rejeitar automaticamente
            decisoesIniciais[c.nome] = "ignorar";
          } else if (c.estoque_planilha > c.estoque_atual) {
            // Arquivo tem mais que o sistema → aceitar automaticamente
            decisoesIniciais[c.nome] = "adicionar";
          } else {
            // Igual ou menor → deixar o usuário decidir (padrão: adicionar para não perder dado)
            decisoesIniciais[c.nome] = "adicionar";
          }
        });
        setConflitosDecisoes(decisoesIniciais);
        setImportStep("conflitos");
      } else {
        setImportStep("depara");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmarImportacao = trpc.railway.confirmarImportacaoInsumos.useMutation({
    onSuccess: (data: any) => {
      setImportResult(data);
      setImportStep("resultado");
      if (data.success > 0) {
        utils.railway.insumos.invalidate();
        utils.railway.insumosAlertas.invalidate();
        utils.railway.listarCatalogInsumos.invalidate();
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleAnalisar = async () => {
    if (!importFile || !imovelId) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      analisarPlanilha.mutate({ imovelId, fileBase64: base64, fileName: importFile.name });
    };
    reader.readAsDataURL(importFile);
  };

  const handleConfirmarImportacao = () => {
    if (!importPreview || !imovelId) return;
    confirmarImportacao.mutate({
      imovelId,
      rows: importPreview.rows,
      mappings: importMappings,
      conflitos_decisoes: conflitosDecisoes,
    });
  };

  const resetImport = () => {
    setImportFile(null);
    setImportStep("upload");
    setImportPreview(null);
    setImportMappings({});
    setConflitosDecisoes({});
    setImportResult(null);
  };

  const downloadTemplate = () => {
    const headers = ["nome", "categoria", "unidade", "origem", "estoque_atual", "estoque_minimo", "estoque_ideal", "preco_estimado", "fornecedor", "reposicao_modo", "lead_time_dias"];
    const example = ["Ração ovinos", "racao", "kg", "comprado", "100", "20", "150", "3.50", "Agropecuária Central", "manual", "7"];
    const csv = [headers.join(","), example.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "modelo_insumos.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Form states ──────────────────────────────────────────────────────────────
  const [novoInsumo, setNovoInsumo] = useState({
    nome: "", categoria: "outros", unidade: "unidade", origem: "comprado" as "comprado" | "proprio" | "doacao",
    estoque_atual: 0, estoque_minimo: 0, estoque_ideal: 0, preco_estimado: "", lead_time_dias: 7,
    reposicao_modo: "manual" as "manual" | "automatico", fornecedor_id: "" as string | number,
  });
  // ID do insumo em edição (null = o dialog está criando um novo insumo)
  const [editingInsumoId, setEditingInsumoId] = useState<number | null>(null);
  // Insumo-alvo do atalho rápido "vincular fornecedor" na listagem
  const [vincularFornecedorInsumo, setVincularFornecedorInsumo] = useState<any | null>(null);
  const [vincularFornecedorSelecao, setVincularFornecedorSelecao] = useState<string>("");
  const [vincularFornecedorNovoNome, setVincularFornecedorNovoNome] = useState("");

  const [movimForm, setMovimForm] = useState({
    tipo: "uso" as "compra" | "producao_propria" | "doacao" | "ajuste_positivo" | "uso" | "venda" | "perda" | "ajuste_negativo",
    quantidade: 0, custo_unitario: "", observacao: "",
    motivo_saida: "" as "" | "consumo_rebanho" | "perda" | "vencimento" | "transferencia" | "venda" | "ajuste" | "outro",
    atividade: "" as "" | "pecuaria_corte" | "pecuaria_leite" | "suinocultura" | "avicultura" | "agricultura" | "geral",
    lote_destino: "",
  });

  const [novoFornecedor, setNovoFornecedor] = useState({
    nome: "", cnpj_cpf: "", whatsapp: "", telegram: "", email: "",
    prazo_entrega_dias: 7, forma_pagamento: "a_vista",
  });
  // ID do fornecedor em edição (null = formulário está criando um novo)
  const [editingFornecedorId, setEditingFornecedorId] = useState<number | null>(null);
  const [confirmDeleteFornecedorId, setConfirmDeleteFornecedorId] = useState<number | null>(null);

  const [novoPedido, setNovoPedido] = useState({
    insumo_id: 0, fornecedor_id: "", quantidade: 0, preco_estimado: "", data_entrega_desejada: "", observacao: "",
  });

  // ── Fase 1: Busca, filtros e agrupamento ─────────────────────────────────────
  const [buscaTexto, setBuscaTexto] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "critico" | "baixo" | "atencao" | "ok">("todos");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroSemFornecedor, setFiltroSemFornecedor] = useState(false);
  const [agruparCategoria, setAgruparCategoria] = useState(false);
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Set<string>>(new Set());
  // Toggle de visualização
  const [viewMode, setViewMode] = useState<"tabela" | "cards">("tabela");
  // Paginação (modo cards)
  const [pagina, setPagina] = useState(1);
  const ITENS_POR_PAGINA = 12;
  // Ordenação (modo cards)
  const [ordenarPor, setOrdenarPor] = useState<"nome" | "estoque" | "status">("nome");
  const [ordemDesc, setOrdemDesc] = useState(false);

  if (!imovelId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Selecione uma propriedade para ver os insumos.
      </div>
    );
  }

  const alertasCriticos = alertas.filter((a: any) => a.status_estoque === "critico").length;
  const alertasBaixos = alertas.filter((a: any) => a.status_estoque === "baixo").length;
  const alertasAtencao = alertas.filter((a: any) => a.status_estoque === "atencao").length;
  const pedidosPendentes = pedidos.filter((p: any) => p.status === "pendente").length;

  // Métricas dinâmicas
  const abaixoMinimo = insumos.filter((i: any) => {
    const atual = Number(i.estoque_atual ?? 0);
    const min = Number(i.estoque_minimo ?? 0);
    return min > 0 && atual < min;
  }).length;

  const semFornecedor = insumos.filter((i: any) => !i.fornecedor_nome && !i.fornecedor_id).length;

  // Dias médios de cobertura: estoque_atual / consumo_medio_diario (se disponível) ou estimativa
  const diasCobertura = (() => {
    const comConsumo = insumos.filter((i: any) => i.consumo_medio_diario > 0);
    if (comConsumo.length === 0) return null;
    const media = comConsumo.reduce((acc: number, i: any) => {
      return acc + (Number(i.estoque_atual) / Number(i.consumo_medio_diario));
    }, 0) / comConsumo.length;
    return Math.round(media);
  })();

  // Detectar se o backend de insumos ainda não foi deployado (404 = endpoint não existe)
  const backendPendente = !loadingInsumos && insumos.length === 0 && !loadingAlertas && alertas.length === 0;

  // ── Métricas de custo ──────────────────────────────────────────────────────
  const valorTotalEstoque = insumos.reduce((acc: number, i: any) => {
    const vt = i.valor_total_estoque ?? calcularValorTotalEstoque(Number(i.estoque_atual ?? 0), i.custo_medio ?? i.preco_estimado ?? null);
    return acc + (vt || 0);
  }, 0);

  const insumosComCusto = insumos.filter((i: any) => (i.custo_medio ?? i.preco_estimado) != null && (i.custo_medio ?? i.preco_estimado) > 0);
  const custoMedioGeral = insumosComCusto.length > 0
    ? insumosComCusto.reduce((acc: number, i: any) => acc + (i.custo_medio ?? i.preco_estimado ?? 0), 0) / insumosComCusto.length
    : 0;

  // ── Fase 1: Funções auxiliares ───────────────────────────────────────────
  // Padronizar exibição de estoque (unidade consistente)
  const fmtEstoque = (valor: number, unidade: string) => {
    const u = (unidade ?? "").toLowerCase().trim();
    const v = Number(valor ?? 0);
    // Normalizar variações de unidade
    const uNorm = u === "ton" || u === "tonelada" || u === "toneladas" ? "t"
      : u === "litro" || u === "litros" ? "L"
      : u === "unidade" || u === "unidades" ? "un"
      : u === "kg" || u === "quilo" || u === "quilos" ? "kg"
      : u;
    const vFmt = Number.isInteger(v) ? v.toString() : v.toFixed(1).replace(/\.0$/, "");
    return `${vFmt} ${uNorm}`;
  };

  // Filtrar insumos
  const insumosFiltrados = insumos.filter((ins: any) => {
    const textoMatch = !buscaTexto || [
      ins.nome, ins.categoria, ins.fornecedor_nome
    ].some(f => f?.toLowerCase().includes(buscaTexto.toLowerCase()));
    const statusMatch = filtroStatus === "todos" || ins.status_estoque === filtroStatus;
    const catMatch = filtroCategoria === "todas" || ins.categoria === filtroCategoria;
    const fornecedorMatch = !filtroSemFornecedor || (!ins.fornecedor_nome && !ins.fornecedor_id);
    return textoMatch && statusMatch && catMatch && fornecedorMatch;
  });

  // Categorias únicas para filtro
  const categoriasUnicas = Array.from(new Set(insumos.map((i: any) => i.categoria).filter(Boolean))) as string[];

  // Agrupar por categoria
  const insumosAgrupados: Record<string, any[]> = {};
  if (agruparCategoria) {
    insumosFiltrados.forEach((ins: any) => {
      const cat = ins.categoria ?? "outros";
      if (!insumosAgrupados[cat]) insumosAgrupados[cat] = [];
      insumosAgrupados[cat].push(ins);
    });
  }

  // Ordenação (modo cards)
  const STATUS_ORDER_MAP: Record<string, number> = { critico: 0, baixo: 1, atencao: 2, ok: 3 };
  const insumosFiltradosOrdenados = useMemo(() => {
    return [...insumosFiltrados].sort((a: any, b: any) => {
      let cmp = 0;
      if (ordenarPor === "nome") cmp = (a.nome ?? "").localeCompare(b.nome ?? "");
      else if (ordenarPor === "estoque") cmp = (a.estoque_atual ?? 0) - (b.estoque_atual ?? 0);
      else if (ordenarPor === "status") {
        cmp = (STATUS_ORDER_MAP[a.status_estoque] ?? 9) - (STATUS_ORDER_MAP[b.status_estoque] ?? 9);
      }
      return ordemDesc ? -cmp : cmp;
    });
  }, [insumosFiltrados, ordenarPor, ordemDesc]);

  // Paginação (modo cards)
  const totalPaginas = Math.ceil(insumosFiltradosOrdenados.length / ITENS_POR_PAGINA);
  const insumosPaginados = insumosFiltradosOrdenados.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA);

  // Exportar CSV
  function exportarCSV() {
    const headers = ["Código", "Nome", "Categoria", "Unidade", "Estoque Atual", "Mínimo", "Ideal", "Fornecedor", "Status", "Preço Unit."];
    const rows = insumosFiltrados.map((i: any) => [
      i.codigo ?? "",
      `"${i.nome ?? ""}"`
      , i.categoria ?? "",
      i.unidade ?? "",
      i.estoque_atual ?? 0,
      i.estoque_minimo ?? 0,
      i.estoque_ideal ?? 0,
      i.fornecedor_nome ? `"${i.fornecedor_nome}"` : "",
      i.status_estoque ?? "",
      i.preco_estimado ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r: any[]) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `insumos_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Insumos
            {alertas.length > 0 && (
              <Badge variant="destructive" className="text-xs">{alertas.length}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Gestão de estoque, fornecedores e pedidos de compra</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/insumos/analise-custos">
            <Button variant="outline" size="sm" className="gap-1.5">
              <BarChart2 className="h-4 w-4" /> Análise de Custos
            </Button>
          </Link>
          <Link href="/insumos/recomendacoes">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Calculator className="h-4 w-4" /> Recomendações
            </Button>
          </Link>
          <Link href="/insumos/rentabilidade">
            <Button variant="outline" size="sm" className="gap-1.5">
              <TrendingUp className="h-4 w-4" /> Rentabilidade
            </Button>
          </Link>
          <Link href="/insumos/dashboard-rentabilidade">
            <Button variant="outline" size="sm" className="gap-1.5 bg-primary/5 border-primary/30 hover:bg-primary/10">
              <LayoutDashboard className="h-4 w-4 text-primary" /> Painel de Rentabilidade
            </Button>
          </Link>
          <Dialog open={openImport} onOpenChange={(v) => { setOpenImport(v); if (!v) resetImport(); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-1" /> Importar Planilha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" /> Importar Insumos de Planilha
              </DialogTitle>
              {/* Indicador de etapas */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span className={importStep === "upload" ? "font-semibold text-primary" : ""}>1. Upload</span>
                <span>→</span>
                {importPreview?.conflitos && importPreview.conflitos.length > 0 && (
                  <>
                    <span className={importStep === "conflitos" ? "font-semibold text-amber-600" : ""}>2. Conflitos</span>
                    <span>→</span>
                  </>
                )}
                <span className={importStep === "depara" ? "font-semibold text-primary" : ""}>3. De-Para</span>
                <span>→</span>
                <span className={importStep === "resultado" ? "font-semibold text-primary" : ""}>4. Resultado</span>
              </div>
            </DialogHeader>

            {/* ETAPA 1: Upload */}
            {importStep === "upload" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed p-4 text-center bg-muted/30">
                  <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">Selecione um arquivo Excel (.xlsx) ou CSV</p>
                  <p className="text-xs text-muted-foreground mb-3">Máximo de 500 linhas por importação</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    id="import-file"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                  <label htmlFor="import-file">
                    <Button variant="outline" size="sm" asChild>
                      <span className="cursor-pointer"><Upload className="h-4 w-4 mr-1" /> Escolher arquivo</span>
                    </Button>
                  </label>
                  {importFile && (
                    <p className="text-sm text-emerald-700 font-medium mt-2">✓ {importFile.name}</p>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-semibold mb-2">Colunas aceitas na planilha:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <span><strong>nome</strong> (obrigatório)</span>
                    <span>categoria</span>
                    <span>unidade</span>
                    <span>origem</span>
                    <span>estoque_atual</span>
                    <span>estoque_minimo</span>
                    <span>estoque_ideal</span>
                    <span>preco_estimado</span>
                    <span>reposicao_modo</span>
                    <span>lead_time_dias</span>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={downloadTemplate}>
                    <Download className="h-3 w-3 mr-1" /> Baixar modelo CSV
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setOpenImport(false)}>Cancelar</Button>
                  <Button
                    className="flex-1"
                    disabled={!importFile || analisarPlanilha.isPending}
                    onClick={handleAnalisar}
                  >
                    {analisarPlanilha.isPending ? "Analisando..." : "Analisar Planilha →"}
                  </Button>
                </div>
              </div>
            )}

                        {/* ETAPA 2: Resolução de Conflitos */}
            {importStep === "conflitos" && importPreview && importPreview.conflitos && (() => {
              const conflitosComValor = importPreview.conflitos.filter(c => c.estoque_planilha > 0);
              const conflitosZerados = importPreview.conflitos.filter(c => c.estoque_planilha === 0);
              const conflitosIguais = conflitosComValor.filter(c => c.estoque_planilha === c.estoque_atual);
              const conflitosAcima = conflitosComValor.filter(c => c.estoque_planilha > c.estoque_atual);
              return (
              <div className="space-y-4">
                {/* Resumo */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                  <p className="text-sm font-semibold text-amber-800">
                    ⚠️ {importPreview.conflitos.length} insumo(s) já existem no sistema
                  </p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs">
                    {conflitosAcima.length > 0 && (
                      <span className="text-emerald-700 font-medium">✅ {conflitosAcima.length} serão atualizados automaticamente (arquivo &gt; sistema)</span>
                    )}
                    {conflitosIguais.length > 0 && (
                      <span className="text-blue-700 font-medium">🔄 {conflitosIguais.length} com valor igual — confirme abaixo</span>
                    )}
                    {conflitosZerados.length > 0 && (
                      <span className="text-gray-500 font-medium">❌ {conflitosZerados.length} rejeitados automaticamente (valor zero)</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {/* Botões de seleção em massa apenas para os que têm valor */}
                  {conflitosComValor.length > 0 && (
                    <div className="flex gap-2 pb-2 border-b">
                      <Button
                        variant="outline" size="sm" className="text-xs h-7"
                        onClick={() => {
                          const todas: Record<string, "adicionar" | "ignorar"> = { ...conflitosDecisoes };
                          conflitosComValor.forEach(c => { todas[c.nome] = "adicionar"; });
                          setConflitosDecisoes(todas);
                        }}
                      >
                        Aceitar todos com valor
                      </Button>
                      <Button
                        variant="outline" size="sm" className="text-xs h-7"
                        onClick={() => {
                          const todas: Record<string, "adicionar" | "ignorar"> = { ...conflitosDecisoes };
                          conflitosComValor.forEach(c => { todas[c.nome] = "ignorar"; });
                          setConflitosDecisoes(todas);
                        }}
                      >
                        Ignorar todos
                      </Button>
                    </div>
                  )}
                  {importPreview.conflitos.map((c) => {
                    const isZero = c.estoque_planilha === 0;
                    const isIgual = !isZero && c.estoque_planilha === c.estoque_atual;
                    const isAcima = !isZero && c.estoque_planilha > c.estoque_atual;
                    return (
                    <div
                      key={c.nome}
                      className={`rounded-lg border p-3 ${
                        isZero ? "bg-gray-50 border-gray-200 opacity-60" :
                        isIgual ? "bg-blue-50 border-blue-200" :
                        isAcima ? "bg-emerald-50 border-emerald-200" :
                        "bg-white border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{c.nome}</p>
                            {isZero && <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">Rejeitado</span>}
                            {isIgual && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Valor igual</span>}
                            {isAcima && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Arquivo maior</span>}
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                            <span>Sistema: <strong>{c.estoque_atual} {c.unidade}</strong></span>
                            {!isZero && (
                              <span className={isAcima ? "text-emerald-700 font-medium" : "text-blue-700 font-medium"}>
                                Arquivo: {c.estoque_planilha} {c.unidade}
                              </span>
                            )}
                            {isZero && <span className="text-gray-400">Arquivo: 0 {c.unidade} — será ignorado</span>}
                          </div>
                          {conflitosDecisoes[c.nome] === "adicionar" && !isZero && (
                            <p className="text-xs text-emerald-700 mt-1 font-medium">
                              → Novo estoque: {(c.estoque_atual + c.estoque_planilha).toFixed(2)} {c.unidade}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            disabled={isZero}
                            onClick={() => !isZero && setConflitosDecisoes(prev => ({ ...prev, [c.nome]: "adicionar" }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              isZero ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" :
                              conflitosDecisoes[c.nome] === "adicionar"
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"
                            }`}
                          >
                            + Aceitar
                          </button>
                          <button
                            onClick={() => setConflitosDecisoes(prev => ({ ...prev, [c.nome]: "ignorar" }))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              conflitosDecisoes[c.nome] === "ignorar"
                                ? "bg-gray-700 text-white border-gray-700"
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                            }`}
                          >
                            Ignorar
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setImportStep("upload")}>← Voltar</Button>
                  <Button
                    className="flex-1"
                    onClick={() => setImportStep("depara")}
                  >
                    Continuar →
                  </Button>
                </div>
              </div>
              );
            })()}
            {/* ETAPA 3: De-Para */}
            {importStep === "depara" && importPreview && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{importPreview.total} insumos únicos encontrados</p>
                    <p className="text-xs text-muted-foreground">{importPreview.unmapped.length} nome(s) não encontrado(s) no catálogo</p>
                  </div>
                  {importPreview.unmapped.length === 0 && (
                    <Badge className="bg-green-100 text-green-700 border-green-200">Todos mapeados ✓</Badge>
                  )}
                </div>

                {/* Aviso de duplicatas removidas */}
                {(importPreview.duplicatas_removidas ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                    <span className="text-amber-600 text-base mt-0.5">⚠️</span>
                    <div>
                      <p className="text-xs font-semibold text-amber-800">
                        {importPreview.duplicatas_removidas} linha(s) duplicada(s) removida(s) automaticamente
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        A planilha continha nomes repetidos. Apenas a primeira ocorrência de cada insumo foi mantida.
                      </p>
                    </div>
                  </div>
                )}

                {/* Aviso de valores zerados */}
                {(importPreview.linhas_zeradas?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
                    <span className="text-blue-600 text-base mt-0.5">ℹ️</span>
                    <div>
                      <p className="text-xs font-semibold text-blue-800">
                        {importPreview.linhas_zeradas!.length} insumo(s) com estoque e preço zerados
                      </p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Esses insumos serão cadastrados com estoque zero. Você pode registrar movimentações após a importação.
                      </p>
                    </div>
                  </div>
                )}

                {importPreview.unmapped.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Mapeamento de nomes não reconhecidos
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Para cada nome da planilha que não existe no catálogo, escolha um insumo existente (de-para) ou deixe como está para criar um novo.
                    </p>
                    {importPreview.unmapped.map((u) => (
                      <div key={u.nome} className="flex items-center gap-3 rounded-lg border p-2 bg-background">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.nome}</p>
                          <p className="text-xs text-muted-foreground">Linha {u.linha} da planilha</p>
                        </div>
                        <span className="text-muted-foreground text-xs shrink-0">→</span>
                        <Select
                          value={importMappings[u.nome] ?? u.nome}
                          onValueChange={(v) => setImportMappings(prev => ({ ...prev, [u.nome]: v }))}
                        >
                          <SelectTrigger className="w-52 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={u.nome}>
                              <span className="flex items-center gap-1">
                                <Plus className="h-3 w-3" /> Criar novo: {u.nome}
                              </span>
                            </SelectItem>
                            {importPreview.catalog.map((c: any) => (
                              <SelectItem key={c.id} value={c.nome}>
                                <span className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span>
                                  {c.nome}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-green-800">Todos os nomes foram reconhecidos no catálogo!</p>
                    <p className="text-xs text-green-700 mt-1">Clique em Confirmar para importar os dados.</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setImportStep("upload")}>← Voltar</Button>
                  <Button
                    className="flex-1"
                    disabled={confirmarImportacao.isPending}
                    onClick={handleConfirmarImportacao}
                  >
                    {confirmarImportacao.isPending ? "Importando..." : `Confirmar Importação (${importPreview.total})`}
                  </Button>
                </div>
              </div>
            )}

            {/* ETAPA 4: Resultado */}
            {importStep === "resultado" && importResult && (() => {
                // Separar resultados por categoria
                const rCriados = importResult.results.filter(r => r.ok && r.action === "criado");
                const rAtualizados = importResult.results.filter(r => r.ok && r.action === "atualizado");
                const rIgnorados = importResult.results.filter(r => r.ok && r.action === "ignorado");
                const rFalhas = importResult.results.filter(r => !r.ok);
                return (
                  <div className="space-y-4">
                    {/* Cards de resumo */}
                    <div className="grid grid-cols-5 gap-2 text-center">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-2xl font-bold">{importResult.total}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                        <p className="text-2xl font-bold text-emerald-700">{rCriados.length}</p>
                        <p className="text-xs text-emerald-600">Criados</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                        <p className="text-2xl font-bold text-blue-700">{rAtualizados.length}</p>
                        <p className="text-xs text-blue-600">Estoque +</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <p className="text-2xl font-bold text-gray-600">{rIgnorados.length}</p>
                        <p className="text-xs text-gray-500">Ignorados</p>
                      </div>
                      <div className={`rounded-lg p-3 ${rFalhas.length > 0 ? "bg-red-50 border border-red-200" : "bg-muted/40"}`}>
                        <p className={`text-2xl font-bold ${rFalhas.length > 0 ? "text-red-700" : "text-muted-foreground"}`}>{rFalhas.length}</p>
                        <p className={`text-xs ${rFalhas.length > 0 ? "text-red-600" : "text-muted-foreground"}`}>Erros</p>
                      </div>
                    </div>

                    {/* Itens criados ou com estoque atualizado */}
                    {(rCriados.length + rAtualizados.length) > 0 && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-3 max-h-48 overflow-y-auto">
                        <p className="text-xs font-semibold text-green-700 mb-2">✅ Importados com sucesso ({rCriados.length + rAtualizados.length}):</p>
                        {[...rCriados, ...rAtualizados].map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-green-700 mb-1">
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                            <span className="font-mono text-muted-foreground text-[10px]">{r.codigo}</span>
                            <span className="font-medium flex-1 truncate">{r.nome}</span>
                            <Badge variant="outline" className={`text-xs h-4 px-1 shrink-0 ${
                              r.action === "criado" ? "border-emerald-400 text-emerald-700" : "border-blue-400 text-blue-700"
                            }`}>
                              {r.action === "criado" ? "Novo" : "Estoque +"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Itens ignorados intencionalmente (valor zero) */}
                    {rIgnorados.length > 0 && (
                      <details className="rounded-lg border border-gray-200 bg-gray-50">
                        <summary className="cursor-pointer p-3 text-xs font-semibold text-gray-600 select-none">
                          ⏭️ Ignorados — valor zero no arquivo ({rIgnorados.length})
                        </summary>
                        <div className="px-3 pb-3 max-h-36 overflow-y-auto">
                          {rIgnorados.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                              <span className="font-mono text-[10px]">{r.codigo}</span>
                              <span className="flex-1 truncate">{r.nome}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Itens com falha na API — erro específico por item */}
                    {rFalhas.length > 0 && (
                      <div className="rounded-lg border border-red-300 bg-red-50 p-3 max-h-48 overflow-y-auto">
                        <p className="text-xs font-semibold text-red-700 mb-2">❌ Falhas na importação ({rFalhas.length}) — verifique os detalhes:</p>
                        {rFalhas.map((r, i) => (
                          <div key={i} className="mb-2 last:mb-0">
                            <div className="flex items-start gap-2 text-xs">
                              <XCircle className="h-3 w-3 shrink-0 mt-0.5 text-red-600" />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-red-800">
                                  <span className="font-mono text-[10px] text-red-500 mr-1">{r.codigo}</span>
                                  {r.nome}
                                </p>
                                <p className="text-red-600 mt-0.5 break-words">{r.error ?? "Erro desconhecido"}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Botões de ação */}
                    <div className="flex gap-2">
                      {(rIgnorados.length > 0 || rFalhas.length > 0) && (
                        <Button
                          variant="outline"
                          className="flex-1 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            gerarRelatorioIgnorados(
                              importResult.results,
                              "relatorio_importacao_insumos"
                            );
                            toast.success("Relatório baixado com sucesso!");
                          }}
                        >
                          <Download className="h-4 w-4" />
                          Baixar Relatório XLSX
                        </Button>
                      )}
                      <Button
                        className={rIgnorados.length > 0 || rFalhas.length > 0 ? "flex-1" : "w-full"}
                        onClick={() => { setOpenImport(false); resetImport(); }}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>
                );
            })()}
          </DialogContent>
          </Dialog>
        </div>
      </div>
      {/* Banner: backend pendente de deploy */}
      {backendPendente && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-800 text-sm">Módulo aguardando deploy do backend</p>
            <p className="text-xs text-blue-700 mt-1">
              Os endpoints de insumos, fornecedores e pedidos de compra ainda não estão disponíveis na API Railway.
              Assim que o <strong>insumos.py</strong> for deployado, este módulo funcionará automaticamente sem nenhuma alteração.
            </p>
          </div>
        </div>
      )}

      {/* ── Resumo operacional dinâmico ── */}
      {!backendPendente && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card 1: Total */}
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Package className="h-3 w-3" /> Total de insumos
            </p>
            <p className="text-2xl font-bold">{insumos.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{insumos.filter((i: any) => i.status_estoque === "ok").length} em estoque OK</p>
          </div>

          {/* Card 2: Abaixo do mínimo */}
          <div className={`rounded-lg border p-3 cursor-pointer transition-colors ${abaixoMinimo > 0 ? "bg-red-50 border-red-200 hover:bg-red-100" : "bg-card"}`}
            onClick={() => { if (abaixoMinimo > 0) setFiltroStatus("critico"); }}
          >
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Abaixo do mínimo
            </p>
            <p className={`text-2xl font-bold ${abaixoMinimo > 0 ? "text-red-600" : ""}`}>{abaixoMinimo}</p>
            {abaixoMinimo > 0
              ? <p className="text-xs text-red-500 mt-0.5">Clique para filtrar</p>
              : <p className="text-xs text-green-600 mt-0.5">Tudo em dia ✓</p>
            }
          </div>

          {/* Card 3: Dias de cobertura ou sem fornecedor */}
          <div className={`rounded-lg border p-3 cursor-pointer transition-colors ${semFornecedor > 0 ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : "bg-card"}`}
            onClick={() => { if (semFornecedor > 0) setFiltroSemFornecedor(v => !v); }}
          >
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <UserX className="h-3 w-3" /> Sem fornecedor
            </p>
            <p className={`text-2xl font-bold ${semFornecedor > 0 ? "text-amber-600" : ""}`}>{semFornecedor}</p>
            {semFornecedor > 0
              ? <p className="text-xs text-amber-600 mt-0.5">Clique para filtrar</p>
              : <p className="text-xs text-muted-foreground mt-0.5">Todos cadastrados</p>
            }
          </div>

          {/* Card 4: Pedidos pendentes ou dias cobertura */}
          <div className={`rounded-lg border p-3 ${pedidosPendentes > 0 ? "bg-blue-50 border-blue-200" : "bg-card"}`}>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ShoppingCart className="h-3 w-3" /> Pedidos pendentes
            </p>
            <p className={`text-2xl font-bold ${pedidosPendentes > 0 ? "text-blue-600" : ""}`}>{pedidosPendentes}</p>
            {diasCobertura !== null
              ? <p className="text-xs text-muted-foreground mt-0.5">~{diasCobertura} dias cobertura</p>
              : <p className="text-xs text-muted-foreground mt-0.5">Sem consumo registrado</p>
            }
          </div>
        </div>
      )}

      {/* ── Cards de custo ── */}
      {!backendPendente && (valorTotalEstoque > 0 || custoMedioGeral > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Valor total do estoque */}
          <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Banknote className="h-3 w-3 text-emerald-600" /> Valor total em estoque
            </p>
            <p className="text-xl font-bold text-emerald-700 tabular-nums">{fmtBRL(valorTotalEstoque)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{insumosComCusto.length} insumos com custo</p>
          </div>

          {/* Compras do mês */}
          <div className="rounded-lg border bg-sky-50 border-sky-200 p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ArrowDownCircle className="h-3 w-3 text-sky-600" /> Compras no mês
            </p>
            <p className="text-xl font-bold text-sky-700 tabular-nums">{fmtBRL(resumoMovimentacoes?.compras_mes ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{resumoMovimentacoes?.qtd_compras ?? 0} entrada(s)</p>
          </div>

          {/* Consumo do mês */}
          <div className="rounded-lg border bg-orange-50 border-orange-200 p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ArrowUpCircle className="h-3 w-3 text-orange-600" /> Consumo no mês
            </p>
            <p className="text-xl font-bold text-orange-700 tabular-nums">{fmtBRL(resumoMovimentacoes?.consumo_mes ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{resumoMovimentacoes?.qtd_usos ?? 0} saída(s)</p>
          </div>

          {/* Custo médio geral */}
          <div className="rounded-lg border bg-blue-50 border-blue-200 p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-blue-600" /> Custo médio geral
            </p>
            <p className="text-xl font-bold text-blue-700 tabular-nums">{fmtBRL(custoMedioGeral)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">por unidade (média ponderada)</p>
          </div>

          {/* Insumos sem custo cadastrado */}
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Sem custo cadastrado
            </p>
            <p className="text-xl font-bold">{insumos.length - insumosComCusto.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">registre o preço na movimentação</p>
          </div>
        </div>
      )}

      {/* Alertas críticos colapsados */}
      {alertasCriticos > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="font-semibold text-red-800 text-sm">{alertasCriticos} crítico(s) · {alertasBaixos} baixo(s) · {alertasAtencao} em atenção</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alertas.slice(0, 10).map((a: any) => (
              <button
                key={a.id}
                className={`text-xs px-2 py-0.5 rounded border font-medium cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLORS[a.status_estoque ?? "atencao"]}`}
                onClick={() => { setSelectedInsumoId(a.id); setHistoryOpen(true); }}
              >
                {a.nome}
              </button>
            ))}
            {alertas.length > 10 && <span className="text-xs text-muted-foreground self-center">+{alertas.length - 10} mais</span>}
          </div>
        </div>
      )}

      <Tabs defaultValue="estoque">
        <TabsList className="mb-4">
          <TabsTrigger value="estoque" className="flex items-center gap-1">
            <Package className="h-4 w-4" /> Estoque
            {alertas.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-xs">{alertas.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="fornecedores" className="flex items-center gap-1">
            <Users className="h-4 w-4" /> Fornecedores
          </TabsTrigger>
          <TabsTrigger value="pedidos" className="flex items-center gap-1">
            <ShoppingCart className="h-4 w-4" /> Pedidos de Compra
          </TabsTrigger>
        </TabsList>

        {/* ── ABA ESTOQUE ── */}
        <TabsContent value="estoque">
          {/* ── Barra de busca + filtros (Fase 1) ── */}
          <div className="space-y-2 mb-4">
            {/* Linha 1: busca + botões de ação */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 text-sm"
                  placeholder="Buscar insumo, categoria ou fornecedor..."
                  value={buscaTexto}
                  onChange={e => setBuscaTexto(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                onClick={() => setOpenNovoPedido(true)}
              >
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Novo Pedido</span>
              </Button>
              <Button
                variant="outline" size="sm"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={() => setOpenLimparDuplicados(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Limpar Duplicados
              </Button>
              <Dialog open={openNovoInsumo} onOpenChange={(o) => { setOpenNovoInsumo(o); if (!o) setEditingInsumoId(null); }}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingInsumoId(null);
                    setNovoInsumo({ nome: "", categoria: "outros", unidade: "unidade", origem: "comprado", estoque_atual: 0, estoque_minimo: 0, estoque_ideal: 0, preco_estimado: "", lead_time_dias: 7, reposicao_modo: "manual", fornecedor_id: "" });
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Novo Insumo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editingInsumoId ? "Editar Insumo" : "Cadastrar Insumo"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome *</Label>
                    <Popover open={nomePopoverOpen} onOpenChange={setNomePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          {novoInsumo.nome || "Buscar ou criar insumo..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Pesquisar insumo..."
                            value={nomeSearch}
                            onValueChange={setNomeSearch}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <button
                                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent"
                                onClick={() => {
                                  setNovoInsumo(p => ({ ...p, nome: nomeSearch }));
                                  setNomePopoverOpen(false);
                                }}
                              >
                                + Criar novo: <strong>{nomeSearch}</strong>
                              </button>
                            </CommandEmpty>
                            {catalogSuggestions.length > 0 && (
                              <CommandGroup heading="Catálogo desta fazenda">
                                {catalogSuggestions.map((item: any) => (
                                  <CommandItem
                                    key={item.id}
                                    value={item.nome}
                                    onSelect={() => {
                                      setNovoInsumo(p => ({
                                        ...p,
                                        nome: item.nome,
                                        categoria: item.categoria ?? p.categoria,
                                        unidade: item.unidade ?? p.unidade,
                                      }));
                                      setNomeSearch(item.nome);
                                      setNomePopoverOpen(false);
                                    }}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Hash className="h-3 w-3 text-muted-foreground" />
                                      <span className="font-mono text-xs text-muted-foreground">{item.codigo}</span>
                                      {item.nome}
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground mt-1">Digite para buscar no catálogo ou criar um novo insumo</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Categoria</Label>
                      <Select value={novoInsumo.categoria} onValueChange={v => setNovoInsumo(p => ({ ...p, categoria: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["racao", "vacina", "medicamento", "mineral", "semen", "equipamento", "outros"].map(c => (
                            <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Unidade</Label>
                      <Select value={novoInsumo.unidade} onValueChange={v => setNovoInsumo(p => ({ ...p, unidade: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["kg", "g", "L", "mL", "unidade", "saco", "dose", "frasco"].map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Estoque atual</Label>
                      <Input type="number" min="0" value={novoInsumo.estoque_atual} onChange={e => setNovoInsumo(p => ({ ...p, estoque_atual: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Estoque mínimo</Label>
                      <Input type="number" min="0" value={novoInsumo.estoque_minimo} onChange={e => setNovoInsumo(p => ({ ...p, estoque_minimo: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Estoque ideal</Label>
                      <Input type="number" min="0" value={novoInsumo.estoque_ideal} onChange={e => setNovoInsumo(p => ({ ...p, estoque_ideal: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Preço estimado (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={novoInsumo.preco_estimado} onChange={e => setNovoInsumo(p => ({ ...p, preco_estimado: e.target.value }))} placeholder="0,00" />
                    </div>
                    <div>
                      <Label>Origem</Label>
                      <Select value={novoInsumo.origem} onValueChange={v => setNovoInsumo(p => ({ ...p, origem: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comprado">Comprado</SelectItem>
                          <SelectItem value="proprio">Próprio</SelectItem>
                          <SelectItem value="doacao">Doação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Fornecedor</Label>
                    <Select
                      value={novoInsumo.fornecedor_id ? String(novoInsumo.fornecedor_id) : "none"}
                      onValueChange={v => setNovoInsumo(p => ({ ...p, fornecedor_id: v === "none" ? "" : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Sem fornecedor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem fornecedor</SelectItem>
                        {(fornecedores as any[]).map(f => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Reposição automática — destaque visual */}
                  <div className={`rounded-lg border p-3 transition-all ${novoInsumo.reposicao_modo === "automatico" ? "border-emerald-300 bg-emerald-50" : "border-border bg-muted/30"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className={`h-4 w-4 ${novoInsumo.reposicao_modo === "automatico" ? "text-emerald-600" : "text-muted-foreground"}`} />
                        <Label className={novoInsumo.reposicao_modo === "automatico" ? "text-emerald-800 font-semibold" : ""}>
                          Reposição automática
                        </Label>
                      </div>
                      <Select value={novoInsumo.reposicao_modo} onValueChange={v => setNovoInsumo(p => ({ ...p, reposicao_modo: v as any }))}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="automatico">Automático</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {novoInsumo.reposicao_modo === "automatico" ? (
                      <p className="text-xs text-emerald-700">
                        Quando o estoque cair abaixo do mínimo, um pedido de compra será gerado automaticamente para o fornecedor padrão.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No modo manual, você receberá apenas um alerta quando o estoque estiver baixo.
                      </p>
                    )}
                    {novoInsumo.reposicao_modo === "automatico" && (
                      <div className="mt-2">
                        <Label className="text-xs text-emerald-700">Lead time (dias até entrega)</Label>
                        <Input
                          type="number" min="1" className="h-8 text-xs mt-1"
                          value={novoInsumo.lead_time_dias}
                          onChange={e => setNovoInsumo(p => ({ ...p, lead_time_dias: Number(e.target.value) }))}
                        />
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    disabled={!novoInsumo.nome || createInsumo.isPending || upsertCatalog.isPending || atualizarInsumo.isPending}
                    onClick={() => {
                      if (editingInsumoId) {
                        atualizarInsumo.mutate({
                          imovelId: imovelId!,
                          insumoId: editingInsumoId,
                          nome: novoInsumo.nome,
                          categoria: novoInsumo.categoria,
                          unidade: novoInsumo.unidade,
                          origem: novoInsumo.origem,
                          estoque_minimo: novoInsumo.estoque_minimo,
                          estoque_ideal: novoInsumo.estoque_ideal,
                          preco_estimado: novoInsumo.preco_estimado ? Number(novoInsumo.preco_estimado) : undefined,
                          fornecedor_id: novoInsumo.fornecedor_id ? Number(novoInsumo.fornecedor_id) : undefined,
                          reposicao_modo: novoInsumo.reposicao_modo,
                          lead_time_dias: novoInsumo.lead_time_dias,
                        });
                        return;
                      }
                      // Salvar no catálogo local primeiro (cria ou atualiza)
                      upsertCatalog.mutate({
                        imovelId: imovelId!,
                        nome: novoInsumo.nome,
                        categoria: novoInsumo.categoria,
                        unidade: novoInsumo.unidade,
                      });
                      // Tentar criar na API Railway
                      createInsumo.mutate({
                        imovelId: imovelId!,
                        nome: novoInsumo.nome,
                        categoria: novoInsumo.categoria,
                        unidade: novoInsumo.unidade,
                        origem: novoInsumo.origem,
                        estoque_atual: novoInsumo.estoque_atual,
                        estoque_minimo: novoInsumo.estoque_minimo,
                        estoque_ideal: novoInsumo.estoque_ideal,
                        preco_estimado: novoInsumo.preco_estimado ? Number(novoInsumo.preco_estimado) : undefined,
                        fornecedor_id: novoInsumo.fornecedor_id ? Number(novoInsumo.fornecedor_id) : undefined,
                        reposicao_modo: novoInsumo.reposicao_modo,
                        lead_time_dias: novoInsumo.lead_time_dias,
                      });
                    }}
                  >
                    {createInsumo.isPending || upsertCatalog.isPending || atualizarInsumo.isPending
                      ? "Salvando..."
                      : editingInsumoId ? "Salvar Alterações" : "Cadastrar Insumo"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>{/* fim linha 1 */}

            {/* Linha 2: filtros de status + categoria + agrupamento */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Filtros rápidos de status */}
              {(["todos", "critico", "baixo", "atencao", "ok"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                    filtroStatus === s
                      ? s === "critico" ? "bg-red-600 text-white border-red-600"
                        : s === "baixo" ? "bg-orange-500 text-white border-orange-500"
                        : s === "atencao" ? "bg-yellow-500 text-white border-yellow-500"
                        : s === "ok" ? "bg-green-600 text-white border-green-600"
                        : "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {s === "todos" ? "Todos" : s === "critico" ? "Crítico" : s === "baixo" ? "Baixo" : s === "atencao" ? "Atenção" : "OK"}
                  {s !== "todos" && (
                    <span className="ml-1 opacity-75">
                      ({insumos.filter((i: any) => i.status_estoque === s).length})
                    </span>
                  )}
                </button>
              ))}

              {/* Filtro por categoria */}
              {categoriasUnicas.length > 0 && (
                <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                  <SelectTrigger className="h-7 text-xs w-auto min-w-[120px] border-dashed">
                    <Filter className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as categorias</SelectItem>
                    {categoriasUnicas.map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Toggle agrupamento (só visível em modo tabela) */}
              {viewMode === "tabela" && (
                <button
                  onClick={() => setAgruparCategoria(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all flex items-center gap-1 ${
                    agruparCategoria
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <BarChart2 className="h-3 w-3" /> Agrupar
                </button>
              )}

              {/* Ordenação (só visível em modo cards) */}
              {viewMode === "cards" && (
                <div className="flex items-center gap-1">
                  <select
                    value={ordenarPor}
                    onChange={e => { setOrdenarPor(e.target.value as any); setPagina(1); }}
                    className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground"
                  >
                    <option value="nome">Nome</option>
                    <option value="estoque">Estoque</option>
                    <option value="status">Status</option>
                  </select>
                  <button
                    onClick={() => setOrdemDesc(v => !v)}
                    className="text-xs px-2 py-1 rounded-md border border-border bg-background text-muted-foreground hover:bg-muted"
                    title={ordemDesc ? "Decrescente" : "Crescente"}
                  >
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Toggle Tabela / Cards */}
              <div className="flex items-center border border-border rounded-md overflow-hidden ml-auto">
                <button
                  onClick={() => setViewMode("tabela")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-all ${
                    viewMode === "tabela"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  title="Visualização em tabela"
                >
                  <LayoutList className="h-3 w-3" /> Tabela
                </button>
                <button
                  onClick={() => { setViewMode("cards"); setPagina(1); }}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-all ${
                    viewMode === "cards"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  title="Visualização em cards"
                >
                  <LayoutGrid className="h-3 w-3" /> Cards
                </button>
              </div>

              {/* Pill: Sem fornecedor */}
              {semFornecedor > 0 && (
                <button
                  onClick={() => setFiltroSemFornecedor(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all flex items-center gap-1 ${
                    filtroSemFornecedor
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                  }`}
                >
                  <UserX className="h-3 w-3" /> Sem fornecedor ({semFornecedor})
                </button>
              )}

              {/* Contador de resultados */}
              {(buscaTexto || filtroStatus !== "todos" || filtroCategoria !== "todas" || filtroSemFornecedor) && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {insumosFiltrados.length} de {insumos.length} insumos
                  <button
                    className="ml-2 underline hover:text-foreground"
                    onClick={() => { setBuscaTexto(""); setFiltroStatus("todos"); setFiltroCategoria("todas"); setFiltroSemFornecedor(false); }}
                  >
                    Limpar filtros
                  </button>
                </span>
              )}
            </div>{/* fim linha 2 */}
          </div>{/* fim space-y-2 */}

          {loadingInsumos ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : insumos.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum insumo cadastrado.</p>
            </div>
          ) : insumosFiltrados.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhum insumo encontrado com os filtros aplicados.</p>
              <button className="text-sm text-primary underline mt-2" onClick={() => { setBuscaTexto(""); setFiltroStatus("todos"); setFiltroCategoria("todas"); }}>Limpar filtros</button>
            </div>
          ) : viewMode === "cards" ? (
            /* ===== MODO CARDS ===== */
            <div>
              {/* Grade de cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {insumosPaginados.map((ins: any) => {
                  const st = ins.status_estoque ?? "ok";
                  const progresso = ins.estoque_ideal > 0
                    ? Math.min(100, Math.round((ins.estoque_atual / ins.estoque_ideal) * 100))
                    : ins.estoque_minimo > 0
                      ? Math.min(100, Math.round((ins.estoque_atual / ins.estoque_minimo) * 100))
                      : 100;
                  const corBarra = st === "critico" ? "bg-red-500" : st === "baixo" || st === "atencao" ? "bg-orange-400" : "bg-green-500";
                  return (
                    <div key={ins.id} className={`relative bg-card rounded-xl border p-4 flex flex-col gap-3 hover:shadow-md transition-shadow ${
                      st === "critico" ? "border-red-200" : st === "baixo" || st === "atencao" ? "border-orange-200" : "border-border"
                    }`}>
                      {/* Badge status */}
                      <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[st]}`}>
                        {STATUS_LABELS[st]}
                      </span>

                      {/* Nome e categoria */}
                      <div className="pr-16">
                        {ins.codigo && <div className="text-[10px] font-mono text-muted-foreground mb-0.5">{ins.codigo}</div>}
                        <div className="font-semibold text-sm text-foreground leading-tight">{ins.nome}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {ins.categoria}
                          {ins.fornecedor_nome && <span className="ml-1">· 🏭 {ins.fornecedor_nome}</span>}
                        </div>
                      </div>

                      {/* Barra de progresso */}
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>Estoque</span>
                          <span>{progresso}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${corBarra}`} style={{ width: `${progresso}%` }} />
                        </div>
                      </div>

                      {/* Valores */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {[{label: "Atual", val: fmtEstoque(ins.estoque_atual, ins.unidade), color: st === "critico" ? "text-red-600" : st === "baixo" || st === "atencao" ? "text-orange-600" : "text-green-700"},
                          {label: "Mínimo", val: ins.estoque_minimo ?? 0, color: "text-foreground"},
                          {label: "Ideal", val: ins.estoque_ideal ?? 0, color: "text-foreground"}].map(({label, val, color}) => (
                          <div key={label} className="bg-muted/50 rounded-lg p-2 text-center">
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
                            <div className={`text-sm font-bold ${color}`}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Fornecedor ausente */}
                      {!ins.fornecedor_nome && (
                        <button
                          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                          onClick={() => setVincularFornecedorInsumo(ins)}
                        >
                          <AlertTriangle className="h-3 w-3" /> Cadastrar fornecedor
                        </button>
                      )}

                      {/* Botões */}
                      <div className="flex gap-1.5 mt-auto">
                        <button
                          className="flex-1 text-xs py-1.5 rounded-lg border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors font-medium"
                          onClick={() => { setMovimInsumoId(ins.id); setOpenMovim(true); }}
                        >📊 Movimentar</button>
                        {(st === "critico" || st === "baixo" || st === "atencao") && (
                          <button
                            className="flex-1 text-xs py-1.5 rounded-lg border border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white transition-colors font-medium"
                            onClick={() => { setNovoPedido(p => ({ ...p, insumo_id: ins.id })); setOpenNovoPedido(true); }}
                          >🛒 Pedido</button>
                        )}
                        <button
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-blue-500 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-colors"
                          onClick={() => handleEditInsumo(ins)}
                          title="Editar"
                        ><Pencil className="h-3 w-3" /></button>
                        <button
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                          onClick={() => setConfirmDeleteId(ins.id)}
                        ><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Paginação */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-6 flex-wrap">
                  <button
                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                    disabled={pagina === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background disabled:opacity-40 hover:bg-muted"
                  >←</button>
                  {Array.from({ length: Math.min(totalPaginas, 7) }, (_, i) => {
                    const num = totalPaginas <= 7 ? i + 1 : pagina <= 4 ? i + 1 : pagina >= totalPaginas - 3 ? totalPaginas - 6 + i : pagina - 3 + i;
                    return (
                      <button key={num} onClick={() => setPagina(num)}
                        className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                          pagina === num ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background hover:bg-muted"
                        }`}
                      >{num}</button>
                    );
                  })}
                  <button
                    onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                    disabled={pagina === totalPaginas}
                    className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background disabled:opacity-40 hover:bg-muted"
                  >→</button>
                  <span className="text-xs text-muted-foreground ml-2">
                    {insumosFiltradosOrdenados.length} itens · Pág. {pagina} de {totalPaginas}
                  </span>
                </div>
              )}

              {/* Botão Exportar CSV */}
              <div className="flex justify-end mt-4">
                <button
                  onClick={exportarCSV}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Download className="h-3 w-3" /> Exportar CSV ({insumosFiltrados.length})
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              {/* Cabeçalho fixo com scroll */}
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[220px] max-w-[220px]">Nome</TableHead>
                      <TableHead className="w-[90px] text-right hidden lg:table-cell">Inicial</TableHead>
                      <TableHead className="w-[90px] text-right hidden lg:table-cell">Entradas</TableHead>
                      <TableHead className="w-[90px] text-right hidden lg:table-cell">Saídas</TableHead>
                      <TableHead className="w-[100px] text-right">Estoque</TableHead>
                      <TableHead className="w-[80px] text-right hidden sm:table-cell">Mínimo</TableHead>
                      <TableHead className="w-[100px] text-right hidden xl:table-cell">Valor</TableHead>
                      <TableHead className="w-[90px]">Status</TableHead>
                      <TableHead className="w-[140px] hidden md:table-cell">Fornecedor</TableHead>
                      <TableHead className="w-[120px] text-right">Ação</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agruparCategoria
                      ? Object.entries(insumosAgrupados).sort(([a], [b]) => a.localeCompare(b)).map(([cat, lista]) => {
                          const expandida = categoriasExpandidas.has(cat);
                          const criticosGrupo = lista.filter((i: any) => i.status_estoque === "critico").length;
                          return (
                            <>
                              {/* Header do grupo */}
                              <TableRow
                                key={`grp-${cat}`}
                                className="bg-muted/60 hover:bg-muted cursor-pointer"
                                onClick={() => setCategoriasExpandidas(prev => {
                                  const next = new Set(prev);
                                  if (next.has(cat)) next.delete(cat); else next.add(cat);
                                  return next;
                                })}
                              >
                                <TableCell colSpan={11}>
                                  <div className="flex items-center gap-2">
                                    {expandida ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    <span className="font-semibold capitalize">{cat}</span>
                                    <span className="text-xs text-muted-foreground">({lista.length} itens)</span>
                                    {criticosGrupo > 0 && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">{criticosGrupo} urgente(s)</span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                              {/* Linhas do grupo (colapsáveis) */}
                              {expandida && lista.map((ins: any) => {
                                const catalogEntry = catalogList.find((c: any) => c.nome.toLowerCase() === ins.nome?.toLowerCase());
                                const isCritico = ins.status_estoque === "critico";
                                const isBaixo = ins.status_estoque === "baixo" || ins.status_estoque === "atencao";
                                return (
                                  <TableRow key={ins.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setSelectedInsumoId(ins.id); setHistoryOpen(true); }}>
                                    {/* Coluna 1: Código + Nome */}
                                    <TableCell className="max-w-[260px]">
                                      <div className="flex flex-col gap-0.5">
                                        {catalogEntry && (
                                          <span className="font-mono text-[10px] text-muted-foreground">{catalogEntry.codigo}</span>
                                        )}
                                        <span className="font-medium text-sm flex items-center gap-1.5 truncate" title={ins.nome}>
                                          <span className="text-sm leading-none shrink-0">{STATUS_ICONS[ins.status_estoque ?? "ok"]}</span>
                                          <span className="truncate">{ins.nome}</span>
                                        </span>
                                      </div>
                                    </TableCell>
                                    {/* Colunas: Inicial / Entradas / Saídas do mês (só telas grandes) */}
                                    <TableCell className="text-right hidden lg:table-cell">
                                      <span className="text-xs text-muted-foreground tabular-nums">
                                        {fmtEstoque(ins.estoque_inicial_mes ?? 0, ins.unidade)}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right hidden lg:table-cell">
                                      <span className="text-xs text-green-600 font-medium tabular-nums">
                                        {(ins.entradas_mes ?? 0) > 0 ? `+${fmtEstoque(ins.entradas_mes, ins.unidade)}` : "—"}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right hidden lg:table-cell">
                                      <span className="text-xs text-red-600 font-medium tabular-nums">
                                        {(ins.saidas_mes ?? 0) > 0 ? `-${fmtEstoque(ins.saidas_mes, ins.unidade)}` : "—"}
                                      </span>
                                    </TableCell>
                                    {/* Coluna 2: Estoque Atual */}
                                    <TableCell className="text-right">
                                      <span className={`font-semibold tabular-nums ${
                                        isCritico ? "text-red-600" : isBaixo ? "text-orange-600" : "text-foreground"
                                      }`}>
                                        {fmtEstoque(ins.estoque_atual, ins.unidade)}
                                      </span>
                                    </TableCell>
                                    {/* Coluna 3: Mínimo */}
                                    <TableCell className="text-right hidden sm:table-cell">
                                      <span className="text-sm text-muted-foreground tabular-nums">
                                        {fmtEstoque(ins.estoque_minimo, ins.unidade)}
                                      </span>
                                    </TableCell>
                                    {/* Coluna: Valor em estoque (custo médio × estoque atual) */}
                                    <TableCell className="text-right hidden xl:table-cell">
                                      <span className="text-xs text-muted-foreground tabular-nums">
                                        {(ins.custo_medio ?? ins.preco_estimado)
                                          ? fmtBRL(Number(ins.estoque_atual ?? 0) * Number(ins.custo_medio ?? ins.preco_estimado ?? 0))
                                          : "—"}
                                      </span>
                                    </TableCell>
                                    {/* Coluna 4: Status Real */}
                                    <TableCell>
                                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[ins.status_estoque ?? "ok"]}`}>
                                        {STATUS_LABELS[ins.status_estoque ?? "ok"]}
                                      </span>
                                    </TableCell>
                                    {/* Coluna 5: Fornecedor */}
                                    <TableCell className="hidden md:table-cell">
                                      {ins.fornecedor_nome ? (
                                        <span className="text-sm text-muted-foreground">{ins.fornecedor_nome}</span>
                                      ) : (
                                        <button
                                          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                                          onClick={(e) => { e.stopPropagation(); setVincularFornecedorInsumo(ins); }}
                                        >
                                          <AlertTriangle className="h-3 w-3" />
                                          <span>Cadastrar</span>
                                        </button>
                                      )}
                                    </TableCell>
                                    {/* Coluna 6: Ação direta */}
                                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-1">
                                        {isCritico && (
                                          <button
                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                                            onClick={() => { setNovoPedido(p => ({ ...p, insumo_id: ins.id })); setOpenNovoPedido(true); }}
                                          >
                                            Fazer Pedido
                                          </button>
                                        )}
                                        {isBaixo && !isCritico && (
                                          <button
                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                                            onClick={() => { setMovimInsumoId(ins.id); setOpenMovim(true); }}
                                          >
                                            Reabastecer
                                          </button>
                                        )}
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                              <MoreVertical className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => { setSelectedInsumoId(ins.id); setHistoryOpen(true); }}>
                                              <History className="h-4 w-4 mr-2" /> Histórico
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => { setMovimInsumoId(ins.id); setOpenMovim(true); }}>
                                              <Plus className="h-4 w-4 mr-2" /> Movimentar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleEditInsumo(ins)}>
                                              <Pencil className="h-4 w-4 mr-2" /> Editar
                                            </DropdownMenuItem>
                                            {(isCritico || isBaixo) && (
                                              <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                  className="text-emerald-700 font-medium"
                                                  onClick={() => { setNovoPedido(p => ({ ...p, insumo_id: ins.id })); setOpenNovoPedido(true); }}
                                                >
                                                  <ShoppingBag className="h-4 w-4 mr-2" /> Fazer Pedido
                                                </DropdownMenuItem>
                                              </>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDeleteId(ins.id)}>
                                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </>
                          );
                        })
                      : insumosFiltrados.map((ins: any) => {
                          const catalogEntry = catalogList.find((c: any) => c.nome.toLowerCase() === ins.nome?.toLowerCase());
                          const isCritico = ins.status_estoque === "critico";
                          const isBaixo = ins.status_estoque === "baixo" || ins.status_estoque === "atencao";
                          return (
                            <TableRow key={ins.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setSelectedInsumoId(ins.id); setHistoryOpen(true); }}>
                              {/* Coluna 1: Código + Nome */}
                              <TableCell className="max-w-[220px]">
                                <div className="flex flex-col gap-0.5">
                                  {catalogEntry && (
                                    <span className="font-mono text-[10px] text-muted-foreground">{catalogEntry.codigo}</span>
                                  )}
                                  <span className="font-medium text-sm flex items-center gap-1.5 truncate" title={ins.nome}>
                                    <span className="text-sm leading-none shrink-0">{STATUS_ICONS[ins.status_estoque ?? "ok"]}</span>
                                    <span className="truncate">{ins.nome}</span>
                                  </span>
                                </div>
                              </TableCell>
                              {/* Colunas: Inicial / Entradas / Saídas do mês (só telas grandes) */}
                              <TableCell className="text-right hidden lg:table-cell">
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {fmtEstoque(ins.estoque_inicial_mes ?? 0, ins.unidade)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right hidden lg:table-cell">
                                <span className="text-xs text-green-600 font-medium tabular-nums">
                                  {(ins.entradas_mes ?? 0) > 0 ? `+${fmtEstoque(ins.entradas_mes, ins.unidade)}` : "—"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right hidden lg:table-cell">
                                <span className="text-xs text-red-600 font-medium tabular-nums">
                                  {(ins.saidas_mes ?? 0) > 0 ? `-${fmtEstoque(ins.saidas_mes, ins.unidade)}` : "—"}
                                </span>
                              </TableCell>
                              {/* Coluna 2: Estoque Atual */}
                              <TableCell className="text-right">
                                <span className={`font-semibold tabular-nums ${
                                  isCritico ? "text-red-600" : isBaixo ? "text-orange-600" : "text-foreground"
                                }`}>
                                  {fmtEstoque(ins.estoque_atual, ins.unidade)}
                                </span>
                              </TableCell>
                              {/* Coluna 3: Mínimo */}
                              <TableCell className="text-right hidden sm:table-cell">
                                <span className="text-sm text-muted-foreground tabular-nums">
                                  {fmtEstoque(ins.estoque_minimo, ins.unidade)}
                                </span>
                              </TableCell>
                              {/* Coluna: Valor em estoque (custo médio × estoque atual) */}
                              <TableCell className="text-right hidden xl:table-cell">
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {(ins.custo_medio ?? ins.preco_estimado)
                                    ? fmtBRL(Number(ins.estoque_atual ?? 0) * Number(ins.custo_medio ?? ins.preco_estimado ?? 0))
                                    : "—"}
                                </span>
                              </TableCell>
                              {/* Coluna 4: Status Real */}
                              <TableCell>
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[ins.status_estoque ?? "ok"]}`}>
                                  {STATUS_LABELS[ins.status_estoque ?? "ok"]}
                                </span>
                              </TableCell>
                              {/* Coluna 5: Fornecedor */}
                              <TableCell className="hidden md:table-cell">
                                {ins.fornecedor_nome ? (
                                  <span className="text-sm text-muted-foreground">{ins.fornecedor_nome}</span>
                                ) : (
                                  <button
                                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                                    onClick={(e) => { e.stopPropagation(); setVincularFornecedorInsumo(ins); }}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>Cadastrar</span>
                                  </button>
                                )}
                              </TableCell>
                                    {/* Coluna 6: Ação direta */}
                                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-1">
                                        {isCritico && (
                                          <button
                                            className="px-2 py-1 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors whitespace-nowrap"
                                            onClick={() => { setNovoPedido(p => ({ ...p, insumo_id: ins.id })); setOpenNovoPedido(true); }}
                                          >
                                            Pedir
                                          </button>
                                        )}
                                        {isBaixo && !isCritico && (
                                          <button
                                            className="px-2 py-1 rounded-md text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors whitespace-nowrap"
                                            onClick={() => { setMovimInsumoId(ins.id); setOpenMovim(true); }}
                                          >
                                            Repor
                                          </button>
                                        )}
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                              <MoreVertical className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => { setSelectedInsumoId(ins.id); setHistoryOpen(true); }}>
                                              <History className="h-4 w-4 mr-2" /> Histórico
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => { setMovimInsumoId(ins.id); setOpenMovim(true); }}>
                                              <Plus className="h-4 w-4 mr-2" /> Movimentar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleEditInsumo(ins)}>
                                              <Pencil className="h-4 w-4 mr-2" /> Editar
                                            </DropdownMenuItem>
                                            {(isCritico || isBaixo) && (
                                              <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                  className="text-emerald-700 font-medium"
                                                  onClick={() => { setNovoPedido(p => ({ ...p, insumo_id: ins.id })); setOpenNovoPedido(true); }}
                                                >
                                                  <ShoppingBag className="h-4 w-4 mr-2" /> Fazer Pedido
                                                </DropdownMenuItem>
                                              </>
                                            )}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </TableCell>
                                    {/* Coluna 7: Excluir */}
                                    <TableCell className="px-1" onClick={e => e.stopPropagation()}>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                        onClick={() => setConfirmDeleteId(ins.id)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                          }
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Dialog movimentação */}
          <Dialog open={openMovim} onOpenChange={setOpenMovim}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Registrar Movimentação</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Tipo de movimentação</Label>
                  <Select value={movimForm.tipo} onValueChange={v => setMovimForm(p => ({ ...p, tipo: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_MOVIM_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min="0.01" step="0.01" value={movimForm.quantidade} onChange={e => setMovimForm(p => ({ ...p, quantidade: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Custo unitário (R$)</Label>
                  <Input type="number" min="0" step="0.01" value={movimForm.custo_unitario} onChange={e => setMovimForm(p => ({ ...p, custo_unitario: e.target.value }))} placeholder="Opcional" />
                </div>
                {/* Motivo de saída — visível apenas para tipos de saída */}
                {["uso", "perda", "venda", "ajuste_negativo"].includes(movimForm.tipo) && (
                  <>
                    <div>
                      <Label>Motivo da saída</Label>
                      <Select value={movimForm.motivo_saida} onValueChange={v => setMovimForm(p => ({ ...p, motivo_saida: v as any }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione o motivo…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="consumo_rebanho">🐄 Consumo do rebanho</SelectItem>
                          <SelectItem value="perda">⚠️ Perda / deterioração</SelectItem>
                          <SelectItem value="vencimento">📅 Vencimento</SelectItem>
                          <SelectItem value="transferencia">🔄 Transferência entre lotes</SelectItem>
                          <SelectItem value="venda">💰 Venda</SelectItem>
                          <SelectItem value="ajuste">⚙️ Ajuste de inventário</SelectItem>
                          <SelectItem value="outro">• Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {movimForm.motivo_saida === "consumo_rebanho" && (
                      <div>
                        <Label>Atividade pecuária</Label>
                        <Select value={movimForm.atividade} onValueChange={v => setMovimForm(p => ({ ...p, atividade: v as any }))}>
                          <SelectTrigger><SelectValue placeholder="Qual atividade consumiu?" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pecuaria_corte">Pecuária de Corte</SelectItem>
                            <SelectItem value="pecuaria_leite">Pecuária Leiteira</SelectItem>
                            <SelectItem value="suinocultura">Suinocultura</SelectItem>
                            <SelectItem value="avicultura">Avicultura</SelectItem>
                            <SelectItem value="agricultura">Agricultura</SelectItem>
                            <SelectItem value="geral">Geral / Múltiplas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {movimForm.motivo_saida === "transferencia" && (
                      <div>
                        <Label>Lote de destino</Label>
                        <Input value={movimForm.lote_destino} onChange={e => setMovimForm(p => ({ ...p, lote_destino: e.target.value }))} placeholder="Ex: Lote B, Confinamento 2…" />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <Label>Observação</Label>
                  <Input value={movimForm.observacao} onChange={e => setMovimForm(p => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" />
                </div>
                {/* Preview custo médio calculado */}
                {movimForm.tipo === "compra" && movimForm.custo_unitario && movimInsumoId && (() => {
                  const ins = insumos.find((i: any) => i.id === movimInsumoId);
                  if (!ins) return null;
                  const novoCusto = calcularNovoCustoMedio(
                    Number(ins.estoque_atual ?? 0),
                    ins.custo_medio ?? ins.preco_estimado ?? null,
                    movimForm.quantidade,
                    Number(movimForm.custo_unitario)
                  );
                  const novoValor = calcularValorTotalEstoque(
                    Number(ins.estoque_atual ?? 0) + movimForm.quantidade,
                    novoCusto
                  );
                  return (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-1">
                      <p className="font-semibold text-emerald-800 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Custo médio após esta compra
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">Atual:</span>{" "}
                          <span className="font-medium">{fmtBRL(ins.custo_medio ?? ins.preco_estimado ?? 0)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Novo:</span>{" "}
                          <span className="font-bold text-emerald-700">{fmtBRL(novoCusto)}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Valor total em estoque:</span>{" "}
                          <span className="font-bold text-emerald-700">{fmtBRL(novoValor)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <Button
                  className="w-full"
                  disabled={!movimInsumoId || movimForm.quantidade <= 0 || movimentar.isPending}
                  onClick={() => movimentar.mutate({
                    imovelId: imovelId!,
                    insumoId: movimInsumoId!,
                    tipo: movimForm.tipo,
                    quantidade: movimForm.quantidade,
                    custo_unitario: movimForm.custo_unitario ? Number(movimForm.custo_unitario) : undefined,
                    observacao: movimForm.observacao || undefined,
                    motivo_saida: movimForm.motivo_saida || undefined,
                    atividade: movimForm.atividade || undefined,
                    lote_destino: movimForm.lote_destino || undefined,
                  })}
                >
                  {movimentar.isPending ? "Salvando..." : "Registrar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Dialog: Confirmar exclusão de insumo */}
        <Dialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-700 flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Excluir Insumo
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir este insumo? Esta ação desativa o registro (soft delete).
                O histórico de movimentações será preservado.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
                <Button
                  variant="destructive" className="flex-1"
                  disabled={deleteInsumo.isPending}
                  onClick={() => confirmDeleteId && deleteInsumo.mutate({ imovelId: imovelId!, insumoId: confirmDeleteId })}
                >
                  {deleteInsumo.isPending ? "Excluindo..." : "Sim, excluir"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Vincular fornecedor a um insumo específico */}
        <Dialog
          open={!!vincularFornecedorInsumo}
          onOpenChange={(o) => { if (!o) { setVincularFornecedorInsumo(null); setVincularFornecedorSelecao(""); setVincularFornecedorNovoNome(""); } }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-amber-600" />
                Vincular fornecedor
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Escolha o fornecedor de <strong>{vincularFornecedorInsumo?.nome}</strong>.
              </p>
              <div>
                <Label>Fornecedor</Label>
                <Select value={vincularFornecedorSelecao} onValueChange={setVincularFornecedorSelecao}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(fornecedores as any[]).map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
                    ))}
                    <SelectItem value="novo">+ Cadastrar novo fornecedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {vincularFornecedorSelecao === "novo" && (
                <div>
                  <Label>Nome do novo fornecedor *</Label>
                  <Input value={vincularFornecedorNovoNome} onChange={e => setVincularFornecedorNovoNome(e.target.value)} placeholder="Ex: Agropecuária Central" />
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setVincularFornecedorInsumo(null)}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={!vincularFornecedorSelecao || vincularFornecedorMutation.isPending || criarFornecedorParaVincular.isPending}
                  onClick={confirmarVincularFornecedor}
                >
                  {vincularFornecedorMutation.isPending || criarFornecedorParaVincular.isPending ? "Salvando..." : "Vincular"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Limpar duplicados */}
        <Dialog open={openLimparDuplicados} onOpenChange={setOpenLimparDuplicados}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                ⚠️ Limpar Insumos Duplicados
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Esta ação irá <strong>remover automaticamente todas as duplicatas</strong>, mantendo apenas
                o registro mais antigo de cada insumo. Estoques dos duplicados serão somados ao registro principal.
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Esta operação não pode ser desfeita. Verifique os insumos antes de continuar.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setOpenLimparDuplicados(false)}>Cancelar</Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  disabled={limparDuplicados.isPending}
                  onClick={() => limparDuplicados.mutate({ imovelId: imovelId! })}
                >
                  {limparDuplicados.isPending ? "Limpando..." : "Limpar Duplicatas"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── ABA FORNECEDORES ── */}
        <TabsContent value="fornecedores">
          <div className="flex justify-end mb-4">
            <Dialog
              open={openNovoFornecedor}
              onOpenChange={(o) => {
                setOpenNovoFornecedor(o);
                if (!o) setEditingFornecedorId(null);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingFornecedorId(null);
                    setNovoFornecedor({ nome: "", cnpj_cpf: "", whatsapp: "", telegram: "", email: "", prazo_entrega_dias: 7, forma_pagamento: "a_vista" });
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Novo Fornecedor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{editingFornecedorId ? "Editar Fornecedor" : "Cadastrar Fornecedor"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome *</Label>
                    <Input value={novoFornecedor.nome} onChange={e => setNovoFornecedor(p => ({ ...p, nome: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>CNPJ/CPF</Label>
                      <Input value={novoFornecedor.cnpj_cpf} onChange={e => setNovoFornecedor(p => ({ ...p, cnpj_cpf: e.target.value }))} />
                    </div>
                    <div>
                      <Label>WhatsApp</Label>
                      <Input value={novoFornecedor.whatsapp} onChange={e => setNovoFornecedor(p => ({ ...p, whatsapp: e.target.value }))} placeholder="(99) 99999-9999" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Telegram (chat_id)</Label>
                      <Input value={novoFornecedor.telegram} onChange={e => setNovoFornecedor(p => ({ ...p, telegram: e.target.value }))} />
                    </div>
                    <div>
                      <Label>E-mail</Label>
                      <Input type="email" value={novoFornecedor.email} onChange={e => setNovoFornecedor(p => ({ ...p, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Prazo entrega (dias)</Label>
                      <Input type="number" min="1" value={novoFornecedor.prazo_entrega_dias} onChange={e => setNovoFornecedor(p => ({ ...p, prazo_entrega_dias: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Forma de pagamento</Label>
                      <Select value={novoFornecedor.forma_pagamento} onValueChange={v => setNovoFornecedor(p => ({ ...p, forma_pagamento: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="a_vista">À vista</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="prazo_30">30 dias</SelectItem>
                          <SelectItem value="prazo_60">60 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!novoFornecedor.nome || createFornecedor.isPending || updateFornecedor.isPending}
                    onClick={() => {
                      const fields = {
                        nome: novoFornecedor.nome,
                        cnpj_cpf: novoFornecedor.cnpj_cpf || undefined,
                        whatsapp: novoFornecedor.whatsapp || undefined,
                        telegram: novoFornecedor.telegram || undefined,
                        email: novoFornecedor.email || undefined,
                        prazo_entrega_dias: novoFornecedor.prazo_entrega_dias,
                        forma_pagamento: novoFornecedor.forma_pagamento,
                      };
                      if (editingFornecedorId) {
                        updateFornecedor.mutate({ imovelId: imovelId!, fornecedorId: editingFornecedorId, ...fields });
                      } else {
                        createFornecedor.mutate({ imovelId: imovelId!, ...fields });
                      }
                    }}
                  >
                    {createFornecedor.isPending || updateFornecedor.isPending
                      ? "Salvando..."
                      : editingFornecedorId ? "Salvar Alterações" : "Cadastrar Fornecedor"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loadingFornecedores ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : fornecedores.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum fornecedor cadastrado.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fornecedores.map((f: any) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">{f.nome}</CardTitle>
                      {f.cnpj_cpf && <p className="text-xs text-muted-foreground">{f.cnpj_cpf}</p>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -mr-1">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingFornecedorId(f.id);
                            setNovoFornecedor({
                              nome: f.nome ?? "",
                              cnpj_cpf: f.cnpj_cpf ?? "",
                              whatsapp: f.whatsapp ?? "",
                              telegram: f.telegram ?? "",
                              email: f.email ?? "",
                              prazo_entrega_dias: f.prazo_entrega_dias ?? 7,
                              forma_pagamento: f.forma_pagamento ?? "a_vista",
                            });
                            setOpenNovoFornecedor(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDeleteFornecedorId(f.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {f.whatsapp && <p className="text-muted-foreground">📱 {f.whatsapp}</p>}
                    {f.email && <p className="text-muted-foreground">✉️ {f.email}</p>}
                    <p className="text-muted-foreground">Prazo: {f.prazo_entrega_dias} dias</p>
                    <p className="text-muted-foreground capitalize">Pagamento: {f.forma_pagamento.replace("_", " ")}</p>
                    {f.total_pedidos > 0 && (
                      <Badge variant="secondary" className="text-xs">{f.total_pedidos} pedido(s)</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Dialog: Confirmar exclusão de fornecedor */}
        <Dialog open={!!confirmDeleteFornecedorId} onOpenChange={(o) => { if (!o) setConfirmDeleteFornecedorId(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-700 flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Excluir Fornecedor
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir este fornecedor? Esta ação desativa o registro (soft delete).
                Insumos e pedidos já vinculados a ele são preservados.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteFornecedorId(null)}>Cancelar</Button>
                <Button
                  variant="destructive" className="flex-1"
                  disabled={deleteFornecedor.isPending}
                  onClick={() => confirmDeleteFornecedorId && deleteFornecedor.mutate({ imovelId: imovelId!, fornecedorId: confirmDeleteFornecedorId })}
                >
                  {deleteFornecedor.isPending ? "Excluindo..." : "Sim, excluir"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── ABA PEDIDOS DE COMPRA ── */}
        <TabsContent value="pedidos">
          <div className="flex justify-end mb-4">
            <Dialog open={openNovoPedido} onOpenChange={setOpenNovoPedido}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Pedido</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Criar Pedido de Compra</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Insumo *</Label>
                    <Select value={String(novoPedido.insumo_id || "")} onValueChange={v => setNovoPedido(p => ({ ...p, insumo_id: Number(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o insumo" /></SelectTrigger>
                      <SelectContent>
                        {insumos.map((ins: any) => (
                          <SelectItem key={ins.id} value={String(ins.id)}>{ins.nome} ({ins.estoque_atual} {ins.unidade})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fornecedor</Label>
                    <Select value={novoPedido.fornecedor_id} onValueChange={v => setNovoPedido(p => ({ ...p, fornecedor_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>
                        {fornecedores.map((f: any) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Quantidade *</Label>
                      <Input type="number" min="0.01" step="0.01" value={novoPedido.quantidade} onChange={e => setNovoPedido(p => ({ ...p, quantidade: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Preço unitário (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={novoPedido.preco_estimado} onChange={e => setNovoPedido(p => ({ ...p, preco_estimado: e.target.value }))} placeholder="Opcional" />
                    </div>
                  </div>
                  <div>
                    <Label>Data de entrega desejada</Label>
                    <Input type="date" value={novoPedido.data_entrega_desejada} onChange={e => setNovoPedido(p => ({ ...p, data_entrega_desejada: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Input value={novoPedido.observacao} onChange={e => setNovoPedido(p => ({ ...p, observacao: e.target.value }))} placeholder="Opcional" />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!novoPedido.insumo_id || novoPedido.quantidade <= 0 || createPedido.isPending}
                    onClick={() => createPedido.mutate({
                      imovelId: imovelId!,
                      insumo_id: novoPedido.insumo_id,
                      fornecedor_id: novoPedido.fornecedor_id ? Number(novoPedido.fornecedor_id) : undefined,
                      quantidade: novoPedido.quantidade,
                      preco_estimado: novoPedido.preco_estimado ? Number(novoPedido.preco_estimado) : undefined,
                      data_entrega_desejada: novoPedido.data_entrega_desejada || undefined,
                      observacao: novoPedido.observacao || undefined,
                    })}
                  >
                    {createPedido.isPending ? "Criando..." : "Criar Pedido"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loadingPedidos ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : pedidos.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum pedido de compra registrado.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Valor total</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.insumo_nome ?? `#${p.insumo_id}`}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.fornecedor_nome ?? "—"}</TableCell>
                      <TableCell>{p.quantidade} {p.unidade ?? ""}</TableCell>
                      <TableCell>
                        {p.valor_total_estimado != null
                          ? `R$ ${Number(p.valor_total_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.data_entrega_desejada ? new Date(p.data_entrega_desejada).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${PEDIDO_STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {p.status === "pendente" && (
                            <Button variant="outline" size="sm" disabled={aprovarPedido.isPending}
                              onClick={() => aprovarPedido.mutate({ imovelId: imovelId!, pedidoId: p.id })}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Aprovar
                            </Button>
                          )}
                          {(p.status === "aprovado" || p.status === "pendente") && (
                            <Button variant="outline" size="sm" disabled={enviarPedido.isPending}
                              onClick={() => enviarPedido.mutate({ imovelId: imovelId!, pedidoId: p.id })}>
                              <Send className="h-3 w-3 mr-1" /> Enviar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── DRAWER: Histórico de movimentações ── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              {loadingDetalhe ? "Carregando..." : insumoDetalhe?.nome ?? "Insumo"}
            </SheetTitle>
          </SheetHeader>

          {loadingDetalhe ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : insumoDetalhe ? (
            <div className="space-y-5">
              {/* Resumo do insumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Estoque atual</p>
                  <p className={`text-lg font-bold ${insumoDetalhe.status_estoque === "critico" ? "text-red-600" : insumoDetalhe.status_estoque === "baixo" ? "text-orange-600" : "text-foreground"}`}>
                    {insumoDetalhe.estoque_atual}
                  </p>
                  <p className="text-xs text-muted-foreground">{insumoDetalhe.unidade}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Mínimo</p>
                  <p className="text-lg font-bold">{insumoDetalhe.estoque_minimo}</p>
                  <p className="text-xs text-muted-foreground">{insumoDetalhe.unidade}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Ideal</p>
                  <p className="text-lg font-bold">{insumoDetalhe.estoque_ideal}</p>
                  <p className="text-xs text-muted-foreground">{insumoDetalhe.unidade}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_COLORS[insumoDetalhe.status_estoque ?? "ok"]}`}>
                  {STATUS_LABELS[insumoDetalhe.status_estoque ?? "ok"]}
                </span>
                <span className="text-xs text-muted-foreground capitalize">{insumoDetalhe.categoria}</span>
                {insumoDetalhe.reposicao_modo === "automatico" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                    <Zap className="h-3 w-3" /> Reposição automática
                  </span>
                )}
              </div>

              {/* Movimentação do mês: estoque inicial + entradas - saídas = estoque atual */}
              {(insumoDetalhe.entradas_mes > 0 || insumoDetalhe.saidas_mes > 0) && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Movimentação deste mês</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Inicial</p>
                      <p className="text-sm font-bold tabular-nums">{fmtEstoque(insumoDetalhe.estoque_inicial_mes, insumoDetalhe.unidade)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Entradas</p>
                      <p className="text-sm font-bold text-green-600 tabular-nums">+{fmtEstoque(insumoDetalhe.entradas_mes, insumoDetalhe.unidade)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Saídas</p>
                      <p className="text-sm font-bold text-red-600 tabular-nums">-{fmtEstoque(insumoDetalhe.saidas_mes, insumoDetalhe.unidade)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Atual</p>
                      <p className="text-sm font-bold tabular-nums">{fmtEstoque(insumoDetalhe.estoque_atual, insumoDetalhe.unidade)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => { setMovimInsumoId(selectedInsumoId); setOpenMovim(true); }}>
                  <Plus className="h-3 w-3 mr-1" /> Registrar movimentação
                </Button>
              </div>

              <Separator />

              {/* Histórico */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Últimas movimentações
                </h3>
                {!insumoDetalhe.movimentacoes || insumoDetalhe.movimentacoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação registrada.</p>
                ) : (
                  <div className="space-y-2">
                    {insumoDetalhe.movimentacoes.map((m: any) => {
                      const isSaida = ["uso", "venda", "perda", "ajuste_negativo"].includes(m.tipo);
                      return (
                        <div key={m.id} className="flex items-start gap-3 rounded-lg border p-3 bg-card">
                          <div className="mt-0.5 shrink-0">
                            {TIPO_MOVIM_ICONS[m.tipo] ?? <Info className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{TIPO_MOVIM_LABELS[m.tipo] ?? m.tipo}</span>
                              <span className={`text-sm font-bold ${isSaida ? "text-red-600" : "text-green-600"}`}>
                                {isSaida ? "-" : "+"}{m.quantidade} {insumoDetalhe.unidade}
                              </span>
                            </div>
                            {m.custo_unitario && (
                              <p className="text-xs text-muted-foreground">
                                R$ {Number(m.custo_unitario).toFixed(2)}/un · Total: R$ {(m.custo_total ?? m.custo_unitario * m.quantidade).toFixed(2)}
                              </p>
                            )}
                            {m.observacao && <p className="text-xs text-muted-foreground truncate">{m.observacao}</p>}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {m.data_movim ? new Date(m.data_movim).toLocaleDateString("pt-BR") : ""}
                              {m.criado_em ? ` · ${new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Selecione um insumo para ver o histórico.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
