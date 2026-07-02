import { useEffect, useMemo, useState } from "react";
import {
  Fish, Plus, RefreshCw, Droplets, Scale, ShoppingCart, Truck,
  AlertTriangle, TrendingUp, TrendingDown, Layers, CalendarDays,
  Skull, Activity, Wallet, Calculator, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { API_BASE, getImovelId } from "@/lib/api";

// ─── Cores da identidade do módulo (mesma paleta dos fluxogramas) ─────────────
const COR_PRIMARIA = "oklch(0.42 0.14 145)"; // verde RuralCaixa
const COR_AGUA = "#0f7d8f";
const COR_BIOMETRIA = "#6d3fa6";
const COR_INSUMO = "#0e7c66";
const COR_DESPESCA = "#c2560c";
const COR_VIAB = "#1F5C3A";

// ─── Tipos (espelham app/schemas_piscicultura.py) ─────────────────────────────
type Sistema = "extensivo" | "semi_intensivo" | "intensivo" | "superintensivo";
type StatusCiclo = "ativo" | "encerrado" | "cancelado";
type TipoInsumo = "racao" | "alevinos" | "calcario" | "cal" | "medicamento" | "aerador" | "outro";
type TipoDespesca = "total" | "parcial";

interface Ciclo {
  id: number;
  imovel_id: number;
  produtor_id?: number | null;
  nome_ciclo: string;
  especie: string;
  sistema: Sistema;
  area_ha: string | number;
  data_povoamento: string;
  data_despesca_prevista?: string | null;
  data_despesca_real?: string | null;
  qtd_alevinos: number;
  peso_medio_inicial_g: string | number;
  preco_alevino_unit?: string | number | null;
  meta_peso_final_g?: string | number | null;
  meta_preco_venda_kg?: string | number | null;
  status: StatusCiclo;
  observacoes?: string | null;
  estoque_vivo?: number | null;
  biomassa_atual_kg?: string | number | null;
  total_racao_kg?: string | number | null;
  total_custo_insumos?: string | number | null;
  ica_atual?: string | number | null;
  mortalidade_acumulada?: number | null;
  mortalidade_perc?: string | number | null;
}

interface RegistroDiario {
  id: number;
  ciclo_id: number;
  data_registro: string;
  racao_kg?: string | number | null;
  tipo_racao?: string | null;
  custo_racao_dia?: string | number | null;
  mortalidade_qtd: number;
  mortalidade_causa?: string | null;
  oxigenio_dissolvido?: string | number | null;
  ph?: string | number | null;
  temperatura_c?: string | number | null;
  transparencia_secchi_cm?: number | null;
  alertas?: string | null;
}

interface Biometria {
  id: number;
  ciclo_id: number;
  data_biometria: string;
  qtd_amostrada: number;
  peso_total_amostra_g: string | number;
  peso_medio_g?: string | number | null;
  biomassa_estimada_kg?: string | number | null;
  ica_acumulado?: string | number | null;
  tecnico_responsavel?: string | null;
  observacoes?: string | null;
}

interface CompraInsumo {
  id: number;
  ciclo_id: number;
  data_compra: string;
  tipo_insumo: TipoInsumo;
  descricao: string;
  quantidade?: string | number | null;
  unidade?: string | null;
  valor_total: string | number;
  fornecedor?: string | null;
  nota_fiscal?: string | null;
}

interface Despesca {
  id: number;
  ciclo_id: number;
  data_despesca: string;
  tipo: TipoDespesca;
  qtd_peixes_vendidos?: number | null;
  peso_total_kg: string | number;
  preco_kg: string | number;
  valor_total: string | number;
  comprador?: string | null;
  nota_fiscal?: string | null;
  observacoes?: string | null;
}

interface Dashboard {
  ciclo: Ciclo;
  estoque_vivo: number;
  mortalidade_acumulada: number;
  mortalidade_perc: string | number;
  peso_medio_atual_g?: string | number | null;
  biomassa_atual_kg?: string | number | null;
  ica_atual?: string | number | null;
  dias_em_producao: number;
  total_racao_kg: string | number;
  custo_racao_total: string | number;
  custo_alevinos: string | number;
  custo_outros_insumos: string | number;
  custo_total: string | number;
  custo_por_kg_estimado?: string | number | null;
  receita_realizada: string | number;
  receita_projetada?: string | number | null;
  lucro_estimado?: string | number | null;
  margem_estimada_perc?: string | number | null;
  registros_recentes: RegistroDiario[];
  alertas: string[];
}

interface PrecoMedioRacao {
  ciclo_id: number;
  preco_medio_kg: number | null;
  total_valor: number;
  total_kg: number;
  qtd_compras: number;
  tem_dados: boolean;
}

// ─── Labels ────────────────────────────────────────────────────────────────
const SISTEMA_LABEL: Record<Sistema, string> = {
  extensivo: "Extensivo",
  semi_intensivo: "Semi-intensivo",
  intensivo: "Intensivo",
  superintensivo: "Superintensivo",
};
const STATUS_LABEL: Record<StatusCiclo, string> = { ativo: "Ativo", encerrado: "Encerrado", cancelado: "Cancelado" };
const STATUS_VARIANT: Record<StatusCiclo, "default" | "secondary" | "destructive"> = {
  ativo: "default", encerrado: "secondary", cancelado: "destructive",
};
const TIPO_INSUMO_LABEL: Record<TipoInsumo, string> = {
  racao: "Ração", alevinos: "Alevinos", calcario: "Calcário", cal: "Cal",
  medicamento: "Medicamento", aerador: "Aerador", outro: "Outro",
};

// ─── Helpers de formatação ─────────────────────────────────────────────────
const n = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : parseFloat(String(v)));
const fmtMoeda = (v: unknown) => n(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: unknown, casas = 2) => n(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtData = (v?: string | null) => (v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const hoje = () => new Date().toISOString().split("T")[0];

// ─── Chamadas de API ──────────────────────────────────────────────────────
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail ?? `Erro HTTP ${res.status}`);
  return res.json();
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail ?? `Erro HTTP ${res.status}`);
  return res.json();
}

export default function Piscicultura() {
  const imovelId = getImovelId();

  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [cicloId, setCicloId] = useState<number | null>(null);
  const [loadingCiclos, setLoadingCiclos] = useState(true);

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [biometrias, setBiometrias] = useState<Biometria[]>([]);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [insumos, setInsumos] = useState<CompraInsumo[]>([]);
  const [despescas, setDespescas] = useState<Despesca[]>([]);
  const [precoRacao, setPrecoRacao] = useState<PrecoMedioRacao | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  const [tab, setTab] = useState("visao-geral");

  // Modais
  const [showNovoCiclo, setShowNovoCiclo] = useState(false);
  const [showNovoRegistro, setShowNovoRegistro] = useState(false);
  const [showNovaBiometria, setShowNovaBiometria] = useState(false);
  const [showNovoInsumo, setShowNovoInsumo] = useState(false);
  const [showNovaDespesca, setShowNovaDespesca] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const ciclo = useMemo(() => ciclos.find((c) => c.id === cicloId) ?? null, [ciclos, cicloId]);
  const ciclosAtivos = useMemo(() => ciclos.filter((c) => c.status === "ativo"), [ciclos]);

  // ── Carregar lista de ciclos ──
  const loadCiclos = async () => {
    if (!imovelId) { setLoadingCiclos(false); return; }
    setLoadingCiclos(true);
    try {
      const data = await apiGet<Ciclo[]>(`/piscicultura/ciclos?imovel_id=${imovelId}`);
      setCiclos(data);
      if (data.length > 0 && !data.some((c) => c.id === cicloId)) {
        const preferido = data.find((c) => c.status === "ativo") ?? data[0];
        setCicloId(preferido.id);
      }
    } catch {
      toast.error("Não foi possível carregar os ciclos de piscicultura");
    } finally {
      setLoadingCiclos(false);
    }
  };

  useEffect(() => { loadCiclos(); /* eslint-disable-next-line */ }, [imovelId]);

  // ── Carregar detalhe do ciclo selecionado ──
  const loadDetalhe = async () => {
    if (!cicloId) return;
    setLoadingDetalhe(true);
    try {
      const [dash, bio, reg, ins, desp, pmr] = await Promise.all([
        apiGet<Dashboard>(`/piscicultura/dashboard/${cicloId}`),
        apiGet<Biometria[]>(`/piscicultura/biometrias/${cicloId}`),
        apiGet<RegistroDiario[]>(`/piscicultura/registros-diarios/${cicloId}`),
        apiGet<CompraInsumo[]>(`/piscicultura/compras-insumos/${cicloId}`),
        apiGet<Despesca[]>(`/piscicultura/despescas/${cicloId}`),
        apiGet<PrecoMedioRacao>(`/piscicultura/preco-medio-racao/${cicloId}`),
      ]);
      setDashboard(dash);
      setBiometrias(bio);
      setRegistros(reg);
      setInsumos(ins);
      setDespescas(desp);
      setPrecoRacao(pmr);
    } catch {
      toast.error("Não foi possível carregar os dados do ciclo");
    } finally {
      setLoadingDetalhe(false);
    }
  };

  useEffect(() => { loadDetalhe(); /* eslint-disable-next-line */ }, [cicloId]);

  const recarregarTudo = async () => { await loadCiclos(); await loadDetalhe(); };

  // ── Formulário: Novo Ciclo ──
  const [fCiclo, setFCiclo] = useState({
    nome_ciclo: "", especie: "Tilápia", sistema: "semi_intensivo" as Sistema,
    area_ha: "", data_povoamento: hoje(), data_despesca_prevista: "",
    qtd_alevinos: "", peso_medio_inicial_g: "", preco_alevino_unit: "",
    meta_peso_final_g: "", meta_preco_venda_kg: "", observacoes: "",
  });

  const criarCiclo = async () => {
    if (!imovelId) { toast.error("Selecione um imóvel antes de iniciar um ciclo"); return; }
    if (!fCiclo.nome_ciclo.trim() || !fCiclo.especie.trim()) { toast.error("Informe o nome do ciclo e a espécie"); return; }
    if (!fCiclo.area_ha || !fCiclo.qtd_alevinos || !fCiclo.peso_medio_inicial_g) {
      toast.error("Informe área, quantidade de alevinos e peso médio inicial"); return;
    }
    setSalvando(true);
    try {
      const novo = await apiPost<Ciclo>("/piscicultura/ciclos", {
        imovel_id: imovelId,
        nome_ciclo: fCiclo.nome_ciclo,
        especie: fCiclo.especie,
        sistema: fCiclo.sistema,
        area_ha: Number(fCiclo.area_ha),
        data_povoamento: fCiclo.data_povoamento,
        data_despesca_prevista: fCiclo.data_despesca_prevista || undefined,
        qtd_alevinos: Number(fCiclo.qtd_alevinos),
        peso_medio_inicial_g: Number(fCiclo.peso_medio_inicial_g),
        preco_alevino_unit: fCiclo.preco_alevino_unit ? Number(fCiclo.preco_alevino_unit) : undefined,
        meta_peso_final_g: fCiclo.meta_peso_final_g ? Number(fCiclo.meta_peso_final_g) : undefined,
        meta_preco_venda_kg: fCiclo.meta_preco_venda_kg ? Number(fCiclo.meta_preco_venda_kg) : undefined,
        observacoes: fCiclo.observacoes || undefined,
      });
      toast.success(`Ciclo "${novo.nome_ciclo}" iniciado com sucesso`);
      setShowNovoCiclo(false);
      setFCiclo({
        nome_ciclo: "", especie: "Tilápia", sistema: "semi_intensivo", area_ha: "",
        data_povoamento: hoje(), data_despesca_prevista: "", qtd_alevinos: "",
        peso_medio_inicial_g: "", preco_alevino_unit: "", meta_peso_final_g: "",
        meta_preco_venda_kg: "", observacoes: "",
      });
      setCicloId(novo.id);
      await loadCiclos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar ciclo");
    } finally {
      setSalvando(false);
    }
  };

  // ── Formulário: Registro Diário (água + ração + mortalidade) ──
  const [fReg, setFReg] = useState({
    data_registro: hoje(), racao_kg: "", tipo_racao: "", custo_racao_dia: "",
    mortalidade_qtd: "0", mortalidade_causa: "",
    oxigenio_dissolvido: "", ph: "", temperatura_c: "", transparencia_secchi_cm: "",
  });

  const salvarRegistro = async () => {
    if (!cicloId) return;
    setSalvando(true);
    try {
      const resp = await apiPost<RegistroDiario>("/piscicultura/registros-diarios", {
        ciclo_id: cicloId,
        data_registro: fReg.data_registro,
        racao_kg: fReg.racao_kg ? Number(fReg.racao_kg) : undefined,
        tipo_racao: fReg.tipo_racao || undefined,
        custo_racao_dia: fReg.custo_racao_dia ? Number(fReg.custo_racao_dia) : undefined,
        mortalidade_qtd: Number(fReg.mortalidade_qtd || 0),
        mortalidade_causa: fReg.mortalidade_causa || undefined,
        oxigenio_dissolvido: fReg.oxigenio_dissolvido ? Number(fReg.oxigenio_dissolvido) : undefined,
        ph: fReg.ph ? Number(fReg.ph) : undefined,
        temperatura_c: fReg.temperatura_c ? Number(fReg.temperatura_c) : undefined,
        transparencia_secchi_cm: fReg.transparencia_secchi_cm ? Number(fReg.transparencia_secchi_cm) : undefined,
      });
      if (resp.alertas) toast.warning(resp.alertas.split(" | ")[0]);
      toast.success("Registro do dia salvo");
      setShowNovoRegistro(false);
      setFReg({
        data_registro: hoje(), racao_kg: "", tipo_racao: "", custo_racao_dia: "",
        mortalidade_qtd: "0", mortalidade_causa: "", oxigenio_dissolvido: "",
        ph: "", temperatura_c: "", transparencia_secchi_cm: "",
      });
      await recarregarTudo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar registro");
    } finally {
      setSalvando(false);
    }
  };

  // ── Formulário: Biometria ──
  const [fBio, setFBio] = useState({
    data_biometria: hoje(), qtd_amostrada: "", peso_total_amostra_g: "",
    tecnico_responsavel: "", observacoes: "",
  });

  const salvarBiometria = async () => {
    if (!cicloId) return;
    if (!fBio.qtd_amostrada || !fBio.peso_total_amostra_g) { toast.error("Informe a quantidade amostrada e o peso total"); return; }
    setSalvando(true);
    try {
      await apiPost<Biometria>("/piscicultura/biometrias", {
        ciclo_id: cicloId,
        data_biometria: fBio.data_biometria,
        qtd_amostrada: Number(fBio.qtd_amostrada),
        peso_total_amostra_g: Number(fBio.peso_total_amostra_g),
        tecnico_responsavel: fBio.tecnico_responsavel || undefined,
        observacoes: fBio.observacoes || undefined,
      });
      toast.success("Biometria registrada — ICA recalculado");
      setShowNovaBiometria(false);
      setFBio({ data_biometria: hoje(), qtd_amostrada: "", peso_total_amostra_g: "", tecnico_responsavel: "", observacoes: "" });
      await recarregarTudo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar biometria");
    } finally {
      setSalvando(false);
    }
  };

  // ── Formulário: Compra de Insumo ──
  const [fIns, setFIns] = useState({
    data_compra: hoje(), tipo_insumo: "racao" as TipoInsumo, descricao: "",
    quantidade: "", unidade: "kg", valor_total: "", fornecedor: "", nota_fiscal: "",
  });

  const salvarInsumo = async () => {
    if (!cicloId) return;
    if (!fIns.descricao.trim() || !fIns.valor_total) { toast.error("Informe a descrição e o valor total"); return; }
    setSalvando(true);
    try {
      await apiPost<CompraInsumo>("/piscicultura/compras-insumos", {
        ciclo_id: cicloId,
        data_compra: fIns.data_compra,
        tipo_insumo: fIns.tipo_insumo,
        descricao: fIns.descricao,
        quantidade: fIns.quantidade ? Number(fIns.quantidade) : undefined,
        unidade: fIns.unidade || undefined,
        valor_total: Number(fIns.valor_total),
        fornecedor: fIns.fornecedor || undefined,
        nota_fiscal: fIns.nota_fiscal || undefined,
      });
      toast.success("Compra registrada e lançada no LCDPR");
      setShowNovoInsumo(false);
      setFIns({ data_compra: hoje(), tipo_insumo: "racao", descricao: "", quantidade: "", unidade: "kg", valor_total: "", fornecedor: "", nota_fiscal: "" });
      await recarregarTudo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar compra");
    } finally {
      setSalvando(false);
    }
  };

  // ── Formulário: Despesca / Venda ──
  const [fDesp, setFDesp] = useState({
    data_despesca: hoje(), tipo: "total" as TipoDespesca, qtd_peixes_vendidos: "",
    peso_total_kg: "", preco_kg: "", comprador: "", nota_fiscal: "", observacoes: "",
  });

  const salvarDespesca = async () => {
    if (!cicloId) return;
    if (!fDesp.peso_total_kg || !fDesp.preco_kg) { toast.error("Informe o peso total e o preço por kg"); return; }
    setSalvando(true);
    try {
      await apiPost<Despesca>("/piscicultura/despescas", {
        ciclo_id: cicloId,
        data_despesca: fDesp.data_despesca,
        tipo: fDesp.tipo,
        qtd_peixes_vendidos: fDesp.qtd_peixes_vendidos ? Number(fDesp.qtd_peixes_vendidos) : undefined,
        peso_total_kg: Number(fDesp.peso_total_kg),
        preco_kg: Number(fDesp.preco_kg),
        comprador: fDesp.comprador || undefined,
        nota_fiscal: fDesp.nota_fiscal || undefined,
        observacoes: fDesp.observacoes || undefined,
      });
      toast.success(fDesp.tipo === "total" ? "Despesca total registrada — ciclo encerrado" : "Despesca parcial registrada");
      setShowNovaDespesca(false);
      setFDesp({ data_despesca: hoje(), tipo: "total", qtd_peixes_vendidos: "", peso_total_kg: "", preco_kg: "", comprador: "", nota_fiscal: "", observacoes: "" });
      await recarregarTudo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar despesca");
    } finally {
      setSalvando(false);
    }
  };

  // ── Calculadora de Viabilidade Econômica ──
  const [fViab, setFViab] = useState({
    qtd_alevinos: "5000", area_ha: "0.5", duracao_dias: "180", sobrevivencia: "90",
    peso_inicial_g: "1", preco_alevino: "0.15", peso_final_g: "800",
    ica_po: "1.0", preco_racao_po: "4.50",
    ica_juvenil: "1.3", preco_racao_juvenil: "3.80",
    ica_recria: "1.6", preco_racao_recria: "3.20",
    ica_engorda: "1.8", preco_racao_engorda: "2.80",
    cal_kg_ha: "1750", preco_cal: "0.90", calcario_kg_ha: "500", preco_calcario: "0.55",
    mao_obra_mes: "400", energia_mes: "150", imprevistos_pct: "5",
    preco_venda: "8.50",
    capex_escavacao_ha: "8000", capex_abastecimento: "2500",
    capex_aeradores_qtd: "1", capex_aeradores_preco: "1800",
    capex_redes_ha: "3000", capex_kit: "900",
  });

  const preencherComDadosDoCiclo = () => {
    if (!ciclo) return;
    setFViab((f) => ({
      ...f,
      qtd_alevinos: String(ciclo.qtd_alevinos),
      area_ha: String(n(ciclo.area_ha) || f.area_ha),
      peso_inicial_g: String(n(ciclo.peso_medio_inicial_g) || f.peso_inicial_g),
      preco_alevino: ciclo.preco_alevino_unit != null ? String(n(ciclo.preco_alevino_unit)) : f.preco_alevino,
      peso_final_g: ciclo.meta_peso_final_g != null ? String(n(ciclo.meta_peso_final_g)) : f.peso_final_g,
      preco_venda: ciclo.meta_preco_venda_kg != null ? String(n(ciclo.meta_preco_venda_kg)) : f.preco_venda,
      preco_racao_engorda: precoRacao?.tem_dados && precoRacao.preco_medio_kg ? String(precoRacao.preco_medio_kg) : f.preco_racao_engorda,
      ica_engorda: dashboard?.ica_atual != null ? String(n(dashboard.ica_atual)) : f.ica_engorda,
      sobrevivencia: dashboard ? String((100 - n(dashboard.mortalidade_perc)).toFixed(1)) : f.sobrevivencia,
    }));
    toast.success("Premissas preenchidas com os dados reais do ciclo (ICA e preço da ração usam a fase de engorda, que concentra o maior volume)");
  };

  const viab = useMemo(() => {
    const g = (k: keyof typeof fViab) => n(fViab[k]);
    const qtdAlevinos = g("qtd_alevinos");
    const areaHa = g("area_ha");
    const duracaoDias = g("duracao_dias") || 1;
    const sobrevivencia = g("sobrevivencia") / 100;
    const pesoInicialG = g("peso_inicial_g");
    const pesoFinalG = g("peso_final_g");

    const sobreviventes = qtdAlevinos * sobrevivencia;
    const biomassaInicialKg = (qtdAlevinos * pesoInicialG) / 1000;
    const biomassaFinalKg = (sobreviventes * pesoFinalG) / 1000;
    const ganhoKg = Math.max(0, biomassaFinalKg - biomassaInicialKg);

    // Ração calculada fase a fase (faixas de peso do peixe), cada uma com seu próprio ICA e preço/kg
    const biomassaNoPeso = (pesoG: number) => (sobreviventes * pesoG) / 1000;
    const fases = [
      { nome: "Pó (alevino)", de: 1, ate: 30, ica: g("ica_po"), preco: g("preco_racao_po") },
      { nome: "Juvenil 2-3mm", de: 30, ate: 100, ica: g("ica_juvenil"), preco: g("preco_racao_juvenil") },
      { nome: "Recria 3-5mm", de: 100, ate: 300, ica: g("ica_recria"), preco: g("preco_racao_recria") },
      { nome: "Engorda 5-8mm", de: 300, ate: Infinity, ica: g("ica_engorda"), preco: g("preco_racao_engorda") },
    ].map((f) => {
      const de = Math.min(Math.max(f.de, pesoInicialG), pesoFinalG);
      const ate = Math.min(Math.max(f.ate, pesoInicialG), pesoFinalG);
      const ganhoFase = Math.max(0, biomassaNoPeso(ate) - biomassaNoPeso(de));
      const racaoFase = ganhoFase * f.ica;
      const custoFase = racaoFase * f.preco;
      return { ...f, ganhoFase, racaoFase, custoFase };
    });

    const racaoKg = fases.reduce((s, f) => s + f.racaoFase, 0);
    const custoRacao = fases.reduce((s, f) => s + f.custoFase, 0);
    const icaMedioPonderado = ganhoKg > 0 ? racaoKg / ganhoKg : 0;

    const custoAlevinos = qtdAlevinos * g("preco_alevino");
    const custoCal = g("cal_kg_ha") * areaHa * g("preco_cal");
    const custoCalcario = g("calcario_kg_ha") * areaHa * g("preco_calcario");
    const custoMaoObra = (g("mao_obra_mes") * duracaoDias) / 30;
    const custoEnergia = (g("energia_mes") * duracaoDias) / 30;
    const subtotal = custoAlevinos + custoRacao + custoCal + custoCalcario + custoMaoObra + custoEnergia;
    const imprevistos = subtotal * (g("imprevistos_pct") / 100);
    const custoTotal = subtotal + imprevistos;

    const receita = biomassaFinalKg * g("preco_venda");
    const lucro = receita - custoTotal;
    const margem = receita > 0 ? lucro / receita : 0;
    const custoPorKg = biomassaFinalKg > 0 ? custoTotal / biomassaFinalKg : 0;
    const pontoEquilibrioKg = g("preco_venda") > 0 ? custoTotal / g("preco_venda") : 0;

    const capexTotal =
      g("capex_escavacao_ha") * areaHa + g("capex_abastecimento") +
      g("capex_aeradores_qtd") * g("capex_aeradores_preco") +
      g("capex_redes_ha") * areaHa + g("capex_kit");

    const ciclosAno = 365 / duracaoDias;
    const lucroAnual = lucro * ciclosAno;
    const roiAnual = capexTotal > 0 ? lucroAnual / capexTotal : 0;
    const paybackCiclos = lucro > 0 ? capexTotal / lucro : null;
    const paybackMeses = paybackCiclos != null ? (paybackCiclos * duracaoDias) / 30 : null;

    return {
      sobreviventes, biomassaInicialKg, biomassaFinalKg, ganhoKg, racaoKg, fases, icaMedioPonderado,
      custoAlevinos, custoRacao, custoCal, custoCalcario, custoMaoObra, custoEnergia,
      subtotal, imprevistos, custoTotal, receita, lucro, margem, custoPorKg, pontoEquilibrioKg,
      capexTotal, ciclosAno, lucroAnual, roiAnual, paybackCiclos, paybackMeses,
    };
  }, [fViab]);

  // ─── Sem imóvel selecionado ───
  if (!imovelId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Selecione um imóvel rural para ver ou iniciar ciclos de piscicultura.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: COR_PRIMARIA }}>
            <Fish className="w-6 h-6" /> Piscicultura
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ciclos de produção, água, biometria, insumos e despesca</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={recarregarTudo} disabled={loadingCiclos || loadingDetalhe}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingCiclos || loadingDetalhe ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowNovoCiclo(true)} style={{ background: COR_PRIMARIA }}>
            <Plus className="w-4 h-4 mr-2" /> Novo Ciclo
          </Button>
        </div>
      </div>

      {loadingCiclos ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : ciclos.length === 0 ? (
        // ─── Estado vazio ───
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <Fish className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Nenhum ciclo de piscicultura neste imóvel ainda</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Um ciclo acompanha um povoamento do início (aquisição de alevinos) até a despesca —
              com biometrias, registros diários de água e ração, e custos automaticamente lançados no LCDPR.
            </p>
            <Button onClick={() => setShowNovoCiclo(true)} style={{ background: COR_PRIMARIA }}>
              <Plus className="w-4 h-4 mr-2" /> Iniciar primeiro ciclo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Seletor de ciclo */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={cicloId ? String(cicloId) : undefined} onValueChange={(v) => setCicloId(Number(v))}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Selecione um ciclo" />
              </SelectTrigger>
              <SelectContent>
                {ciclos.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nome_ciclo} — {c.especie} ({STATUS_LABEL[c.status]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ciclo && (
              <>
                <Badge variant={STATUS_VARIANT[ciclo.status]}>{STATUS_LABEL[ciclo.status]}</Badge>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> {SISTEMA_LABEL[ciclo.sistema]}
                </span>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" /> Povoado em {fmtData(ciclo.data_povoamento)}
                </span>
              </>
            )}
          </div>

          {loadingDetalhe || !dashboard ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <>
              {/* Alertas */}
              {dashboard.alertas.length > 0 && (
                <div className="space-y-2">
                  {dashboard.alertas.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Integração econômica-sanitária: cada peixe morto = perda; cada kg de ração = custo */}
              <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground bg-muted/40">
                Cada peixe morto reduz a receita futura, cada compra de insumo entra automaticamente no LCDPR e cada
                biometria recalcula o ICA e o custo por kg do ciclo.
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="visao-geral"><Activity className="w-4 h-4 mr-1.5" />Visão Geral</TabsTrigger>
                  <TabsTrigger value="registro"><Droplets className="w-4 h-4 mr-1.5" />Registro Diário</TabsTrigger>
                  <TabsTrigger value="biometria"><Scale className="w-4 h-4 mr-1.5" />Biometria</TabsTrigger>
                  <TabsTrigger value="insumos"><ShoppingCart className="w-4 h-4 mr-1.5" />Insumos</TabsTrigger>
                  <TabsTrigger value="despesca"><Truck className="w-4 h-4 mr-1.5" />Despesca</TabsTrigger>
                  <TabsTrigger value="viabilidade"><Calculator className="w-4 h-4 mr-1.5" />Viabilidade</TabsTrigger>
                </TabsList>

                {/* ── VISÃO GERAL ── */}
                <TabsContent value="visao-geral" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard icon={<Fish className="w-4 h-4" />} label="Estoque vivo" value={dashboard.estoque_vivo.toLocaleString("pt-BR")} color={COR_PRIMARIA} />
                    <StatCard icon={<Skull className="w-4 h-4" />} label="Mortalidade" value={`${fmtNum(dashboard.mortalidade_perc)}%`} sub={`${dashboard.mortalidade_acumulada} un.`} color={n(dashboard.mortalidade_perc) > 15 ? "#c0392b" : COR_AGUA} />
                    <StatCard icon={<Activity className="w-4 h-4" />} label="ICA atual" value={dashboard.ica_atual ? fmtNum(dashboard.ica_atual, 3) : "—"} sub="meta ≤ 1,8" color={dashboard.ica_atual && n(dashboard.ica_atual) > 1.8 ? "#c0392b" : COR_BIOMETRIA} />
                    <StatCard icon={<CalendarDays className="w-4 h-4" />} label="Dias em produção" value={String(dashboard.dias_em_producao)} color={COR_DESPESCA} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wallet className="w-4 h-4" /> Custos do ciclo</CardTitle></CardHeader>
                      <CardContent className="space-y-1.5 text-sm">
                        <Row label="Ração" value={fmtMoeda(dashboard.custo_racao_total)} />
                        <Row label="Alevinos" value={fmtMoeda(dashboard.custo_alevinos)} />
                        <Row label="Outros insumos" value={fmtMoeda(dashboard.custo_outros_insumos)} />
                        <Row label="Total" value={fmtMoeda(dashboard.custo_total)} bold />
                        <Row label="Custo por kg estimado" value={dashboard.custo_por_kg_estimado ? fmtMoeda(dashboard.custo_por_kg_estimado) : "—"} />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Receita e margem</CardTitle></CardHeader>
                      <CardContent className="space-y-1.5 text-sm">
                        <Row label="Receita realizada (despescas)" value={fmtMoeda(dashboard.receita_realizada)} />
                        <Row label="Receita projetada (meta)" value={dashboard.receita_projetada ? fmtMoeda(dashboard.receita_projetada) : "—"} />
                        <Row
                          label="Lucro estimado"
                          value={dashboard.lucro_estimado ? fmtMoeda(dashboard.lucro_estimado) : "—"}
                          bold
                          icon={dashboard.lucro_estimado != null ? (n(dashboard.lucro_estimado) >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> : <TrendingDown className="w-3.5 h-3.5 text-red-600" />) : undefined}
                        />
                        <Row label="Margem estimada" value={dashboard.margem_estimada_perc ? `${fmtNum(dashboard.margem_estimada_perc)}%` : "—"} />
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Últimos registros (7 dias)</CardTitle></CardHeader>
                    <CardContent>
                      {dashboard.registros_recentes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum registro diário nos últimos 7 dias.</p>
                      ) : (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>Data</TableHead><TableHead>Ração</TableHead><TableHead>O₂</TableHead>
                            <TableHead>pH</TableHead><TableHead>Temp.</TableHead><TableHead>Mortes</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {dashboard.registros_recentes.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>{fmtData(r.data_registro)}</TableCell>
                                <TableCell>{r.racao_kg ? `${fmtNum(r.racao_kg)} kg` : "—"}</TableCell>
                                <TableCell className={r.oxigenio_dissolvido != null && n(r.oxigenio_dissolvido) < 3 ? "text-red-600 font-medium" : ""}>{r.oxigenio_dissolvido ?? "—"}</TableCell>
                                <TableCell>{r.ph ?? "—"}</TableCell>
                                <TableCell>{r.temperatura_c ? `${r.temperatura_c}°C` : "—"}</TableCell>
                                <TableCell className={r.mortalidade_qtd > 0 ? "text-red-600 font-medium" : ""}>{r.mortalidade_qtd}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── REGISTRO DIÁRIO ── */}
                <TabsContent value="registro" className="space-y-4 mt-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setShowNovoRegistro(true)} style={{ background: COR_AGUA }}>
                      <Plus className="w-4 h-4 mr-2" /> Registrar o dia
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      {registros.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhum registro ainda. Registre diariamente ração, mortalidade e qualidade da água
                          (O₂ &gt; 3 mg/L, pH 6,5–8,5, temperatura 26–30°C, transparência 30–70 cm).
                        </p>
                      ) : (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>Data</TableHead><TableHead>Ração (kg)</TableHead><TableHead>Custo</TableHead>
                            <TableHead>O₂</TableHead><TableHead>pH</TableHead><TableHead>Temp.</TableHead>
                            <TableHead>Secchi</TableHead><TableHead>Mortes</TableHead><TableHead>Alertas</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {registros.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>{fmtData(r.data_registro)}</TableCell>
                                <TableCell>{r.racao_kg ? fmtNum(r.racao_kg) : "—"}</TableCell>
                                <TableCell>{r.custo_racao_dia ? fmtMoeda(r.custo_racao_dia) : "—"}</TableCell>
                                <TableCell className={r.oxigenio_dissolvido != null && n(r.oxigenio_dissolvido) < 3 ? "text-red-600 font-medium" : ""}>{r.oxigenio_dissolvido ?? "—"}</TableCell>
                                <TableCell>{r.ph ?? "—"}</TableCell>
                                <TableCell>{r.temperatura_c ? `${r.temperatura_c}°C` : "—"}</TableCell>
                                <TableCell>{r.transparencia_secchi_cm ? `${r.transparencia_secchi_cm} cm` : "—"}</TableCell>
                                <TableCell className={r.mortalidade_qtd > 0 ? "text-red-600 font-medium" : ""}>{r.mortalidade_qtd}</TableCell>
                                <TableCell className="max-w-[220px] text-xs text-amber-700">{r.alertas ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── BIOMETRIA ── */}
                <TabsContent value="biometria" className="space-y-4 mt-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setShowNovaBiometria(true)} style={{ background: COR_BIOMETRIA }}>
                      <Plus className="w-4 h-4 mr-2" /> Nova biometria
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      {biometrias.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma biometria ainda. Faça uma amostragem a cada 15-30 dias para calcular
                          peso médio, biomassa estimada e o Índice de Conversão Alimentar (ICA).
                        </p>
                      ) : (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>Data</TableHead><TableHead>Amostra</TableHead><TableHead>Peso médio</TableHead>
                            <TableHead>Biomassa</TableHead><TableHead>ICA</TableHead><TableHead>Técnico</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {biometrias.map((b) => (
                              <TableRow key={b.id}>
                                <TableCell>{fmtData(b.data_biometria)}</TableCell>
                                <TableCell>{b.qtd_amostrada} peixes</TableCell>
                                <TableCell>{b.peso_medio_g ? `${fmtNum(b.peso_medio_g)} g` : "—"}</TableCell>
                                <TableCell>{b.biomassa_estimada_kg ? `${fmtNum(b.biomassa_estimada_kg)} kg` : "—"}</TableCell>
                                <TableCell className={b.ica_acumulado && n(b.ica_acumulado) > 1.8 ? "text-red-600 font-medium" : ""}>{b.ica_acumulado ? fmtNum(b.ica_acumulado, 3) : "—"}</TableCell>
                                <TableCell>{b.tecnico_responsavel ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── INSUMOS ── */}
                <TabsContent value="insumos" className="space-y-4 mt-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setShowNovoInsumo(true)} style={{ background: COR_INSUMO }}>
                      <Plus className="w-4 h-4 mr-2" /> Registrar compra
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      {insumos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma compra registrada. Ração, alevinos, cal, calcário, medicamentos e aeradores
                          entram aqui e são lançados automaticamente como despesa no LCDPR.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead>
                            <TableHead>Qtd.</TableHead><TableHead>Valor</TableHead><TableHead>Fornecedor</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {insumos.map((it) => (
                              <TableRow key={it.id}>
                                <TableCell>{fmtData(it.data_compra)}</TableCell>
                                <TableCell><Badge variant="outline">{TIPO_INSUMO_LABEL[it.tipo_insumo]}</Badge></TableCell>
                                <TableCell>{it.descricao}</TableCell>
                                <TableCell>{it.quantidade ? `${fmtNum(it.quantidade)} ${it.unidade ?? ""}` : "—"}</TableCell>
                                <TableCell>{fmtMoeda(it.valor_total)}</TableCell>
                                <TableCell>{it.fornecedor ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── DESPESCA ── */}
                <TabsContent value="despesca" className="space-y-4 mt-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setShowNovaDespesca(true)} disabled={ciclo?.status !== "ativo"} style={{ background: COR_DESPESCA }}>
                      <Plus className="w-4 h-4 mr-2" /> Registrar despesca
                    </Button>
                  </div>
                  {ciclo?.status !== "ativo" && (
                    <p className="text-xs text-muted-foreground">Este ciclo já está {STATUS_LABEL[ciclo?.status ?? "encerrado"].toLowerCase()} — não é possível registrar novas despescas.</p>
                  )}
                  <Card>
                    <CardContent className="pt-4">
                      {despescas.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma despesca ainda. Uma despesca total encerra o ciclo automaticamente e gera
                          receita no LCDPR; uma parcial mantém o ciclo ativo.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Peso</TableHead>
                            <TableHead>Preço/kg</TableHead><TableHead>Total</TableHead><TableHead>Comprador</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {despescas.map((d) => (
                              <TableRow key={d.id}>
                                <TableCell>{fmtData(d.data_despesca)}</TableCell>
                                <TableCell><Badge variant={d.tipo === "total" ? "default" : "secondary"}>{d.tipo === "total" ? "Total" : "Parcial"}</Badge></TableCell>
                                <TableCell>{fmtNum(d.peso_total_kg)} kg</TableCell>
                                <TableCell>{fmtMoeda(d.preco_kg)}</TableCell>
                                <TableCell className="font-medium">{fmtMoeda(d.valor_total)}</TableCell>
                                <TableCell>{d.comprador ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── VIABILIDADE ECONÔMICA ── */}
                <TabsContent value="viabilidade" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm text-muted-foreground max-w-lg">
                      Simule custos, receita, ponto de equilíbrio e payback antes de decidir sobre um viveiro.
                      As premissas abaixo são só um ponto de partida — ajuste ao seu contexto.
                    </p>
                    <Button size="sm" variant="outline" onClick={preencherComDadosDoCiclo} disabled={!ciclo}>
                      <Wand2 className="w-4 h-4 mr-2" /> Preencher com dados deste ciclo
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
                    {/* Formulário de premissas */}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Premissas</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <ViabGroup title="Zootécnico">
                          <ViabField label="Qtd. de alevinos" value={fViab.qtd_alevinos} onChange={(v) => setFViab({ ...fViab, qtd_alevinos: v })} />
                          <ViabField label="Área (ha)" value={fViab.area_ha} onChange={(v) => setFViab({ ...fViab, area_ha: v })} />
                          <ViabField label="Duração do ciclo (dias)" value={fViab.duracao_dias} onChange={(v) => setFViab({ ...fViab, duracao_dias: v })} />
                          <ViabField label="Sobrevivência (%)" value={fViab.sobrevivencia} onChange={(v) => setFViab({ ...fViab, sobrevivencia: v })} />
                          <ViabField label="Peso inicial (g)" value={fViab.peso_inicial_g} onChange={(v) => setFViab({ ...fViab, peso_inicial_g: v })} />
                          <ViabField label="Peso final meta (g)" value={fViab.peso_final_g} onChange={(v) => setFViab({ ...fViab, peso_final_g: v })} />
                        </ViabGroup>
                        <ViabGroup title="Ração por fase (ICA e preço/kg)">
                          <ViabField label="Pó — ICA (1-30g)" value={fViab.ica_po} onChange={(v) => setFViab({ ...fViab, ica_po: v })} step="0.01" />
                          <ViabField label="Pó — preço (R$/kg)" value={fViab.preco_racao_po} onChange={(v) => setFViab({ ...fViab, preco_racao_po: v })} step="0.01" />
                          <ViabField label="Juvenil 2-3mm — ICA (30-100g)" value={fViab.ica_juvenil} onChange={(v) => setFViab({ ...fViab, ica_juvenil: v })} step="0.01" />
                          <ViabField label="Juvenil 2-3mm — preço (R$/kg)" value={fViab.preco_racao_juvenil} onChange={(v) => setFViab({ ...fViab, preco_racao_juvenil: v })} step="0.01" />
                          <ViabField label="Recria 3-5mm — ICA (100-300g)" value={fViab.ica_recria} onChange={(v) => setFViab({ ...fViab, ica_recria: v })} step="0.01" />
                          <ViabField label="Recria 3-5mm — preço (R$/kg)" value={fViab.preco_racao_recria} onChange={(v) => setFViab({ ...fViab, preco_racao_recria: v })} step="0.01" />
                          <ViabField label="Engorda 5-8mm — ICA (300g+)" value={fViab.ica_engorda} onChange={(v) => setFViab({ ...fViab, ica_engorda: v })} step="0.01" />
                          <ViabField label="Engorda 5-8mm — preço (R$/kg)" value={fViab.preco_racao_engorda} onChange={(v) => setFViab({ ...fViab, preco_racao_engorda: v })} step="0.01" />
                        </ViabGroup>
                        <ViabGroup title="Outros insumos">
                          <ViabField label="Preço do alevino (R$/un.)" value={fViab.preco_alevino} onChange={(v) => setFViab({ ...fViab, preco_alevino: v })} step="0.01" />
                          <ViabField label="Cal (kg/ha)" value={fViab.cal_kg_ha} onChange={(v) => setFViab({ ...fViab, cal_kg_ha: v })} />
                          <ViabField label="Preço da cal (R$/kg)" value={fViab.preco_cal} onChange={(v) => setFViab({ ...fViab, preco_cal: v })} step="0.01" />
                          <ViabField label="Calcário (kg/ha)" value={fViab.calcario_kg_ha} onChange={(v) => setFViab({ ...fViab, calcario_kg_ha: v })} />
                          <ViabField label="Preço do calcário (R$/kg)" value={fViab.preco_calcario} onChange={(v) => setFViab({ ...fViab, preco_calcario: v })} step="0.01" />
                        </ViabGroup>
                        <ViabGroup title="Mão de obra, energia e venda">
                          <ViabField label="Mão de obra (R$/mês)" value={fViab.mao_obra_mes} onChange={(v) => setFViab({ ...fViab, mao_obra_mes: v })} />
                          <ViabField label="Energia (R$/mês)" value={fViab.energia_mes} onChange={(v) => setFViab({ ...fViab, energia_mes: v })} />
                          <ViabField label="Imprevistos (%)" value={fViab.imprevistos_pct} onChange={(v) => setFViab({ ...fViab, imprevistos_pct: v })} />
                          <ViabField label="Preço de venda (R$/kg)" value={fViab.preco_venda} onChange={(v) => setFViab({ ...fViab, preco_venda: v })} step="0.01" />
                        </ViabGroup>
                        <ViabGroup title="Investimento inicial (CAPEX)">
                          <ViabField label="Escavação do viveiro (R$/ha)" value={fViab.capex_escavacao_ha} onChange={(v) => setFViab({ ...fViab, capex_escavacao_ha: v })} />
                          <ViabField label="Abastecimento de água (R$)" value={fViab.capex_abastecimento} onChange={(v) => setFViab({ ...fViab, capex_abastecimento: v })} />
                          <ViabField label="Aeradores — qtd." value={fViab.capex_aeradores_qtd} onChange={(v) => setFViab({ ...fViab, capex_aeradores_qtd: v })} />
                          <ViabField label="Aeradores — preço unit. (R$)" value={fViab.capex_aeradores_preco} onChange={(v) => setFViab({ ...fViab, capex_aeradores_preco: v })} />
                          <ViabField label="Redes/cercas (R$/ha)" value={fViab.capex_redes_ha} onChange={(v) => setFViab({ ...fViab, capex_redes_ha: v })} />
                          <ViabField label="Kit de medição (R$)" value={fViab.capex_kit} onChange={(v) => setFViab({ ...fViab, capex_kit: v })} />
                        </ViabGroup>
                      </CardContent>
                    </Card>

                    {/* Resultados */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <StatCard icon={<Scale className="w-4 h-4" />} label="Biomassa final" value={`${fmtNum(viab.biomassaFinalKg)} kg`} color={COR_BIOMETRIA} />
                        <StatCard icon={<Droplets className="w-4 h-4" />} label="Ração total" value={`${fmtNum(viab.racaoKg)} kg`} color={COR_AGUA} />
                        <StatCard icon={<Wallet className="w-4 h-4" />} label="Custo total do ciclo" value={fmtMoeda(viab.custoTotal)} color={COR_INSUMO} />
                        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Receita do ciclo" value={fmtMoeda(viab.receita)} color={COR_DESPESCA} />
                      </div>

                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">{viab.lucro >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />} Resultado do ciclo</CardTitle></CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                          <Row label="ICA médio ponderado do ciclo" value={fmtNum(viab.icaMedioPonderado, 3)} />
                          <Row label="Custo por kg produzido" value={fmtMoeda(viab.custoPorKg)} />
                          <Row label="Ponto de equilíbrio" value={`${fmtNum(viab.pontoEquilibrioKg)} kg`} />
                          <Row label="Lucro do ciclo" value={fmtMoeda(viab.lucro)} bold />
                          <Row label="Margem sobre a receita" value={`${fmtNum(viab.margem * 100)}%`} />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Droplets className="w-4 h-4" style={{ color: COR_AGUA }} /> Ração por fase</CardTitle></CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead>Fase</TableHead><TableHead>Ração (kg)</TableHead><TableHead>Custo</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {viab.fases.map((f) => (
                                <TableRow key={f.nome}>
                                  <TableCell className="text-xs">{f.nome}</TableCell>
                                  <TableCell className="text-xs">{fmtNum(f.racaoFase)} kg</TableCell>
                                  <TableCell className="text-xs">{fmtMoeda(f.custoFase)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4" /> Investimento e retorno</CardTitle></CardHeader>
                        <CardContent className="space-y-1.5 text-sm">
                          <Row label="Investimento inicial (CAPEX)" value={fmtMoeda(viab.capexTotal)} />
                          <Row label="Ciclos por ano" value={fmtNum(viab.ciclosAno)} />
                          <Row label="Lucro anual estimado" value={fmtMoeda(viab.lucroAnual)} />
                          <Row label="ROI anual" value={`${fmtNum(viab.roiAnual * 100)}%`} />
                          <Row label="Payback" value={viab.paybackMeses != null ? `${fmtNum(viab.paybackMeses, 1)} meses (${fmtNum(viab.paybackCiclos ?? 0, 1)} ciclos)` : "Não recuperado com lucro negativo"} bold />
                        </CardContent>
                      </Card>

                      {viab.lucro < 0 && (
                        <div className="flex items-start gap-2 text-sm rounded-md border border-red-300 bg-red-50 text-red-900 px-3 py-2">
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>Com essas premissas o ciclo dá prejuízo — revise preço de venda, ração ou densidade antes de investir.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </>
      )}

      {/* ═══ MODAL: Novo Ciclo ═══ */}
      <Dialog open={showNovoCiclo} onOpenChange={setShowNovoCiclo}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Iniciar novo ciclo de piscicultura</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome do ciclo" full><Input value={fCiclo.nome_ciclo} onChange={(e) => setFCiclo({ ...fCiclo, nome_ciclo: e.target.value })} placeholder="Ex.: Viveiro 1 — Safra 2026" /></Field>
            <Field label="Espécie"><Input value={fCiclo.especie} onChange={(e) => setFCiclo({ ...fCiclo, especie: e.target.value })} placeholder="Tilápia" /></Field>
            <Field label="Sistema">
              <Select value={fCiclo.sistema} onValueChange={(v) => setFCiclo({ ...fCiclo, sistema: v as Sistema })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(SISTEMA_LABEL) as Sistema[]).map((s) => <SelectItem key={s} value={s}>{SISTEMA_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Área (ha)"><Input type="number" step="0.01" value={fCiclo.area_ha} onChange={(e) => setFCiclo({ ...fCiclo, area_ha: e.target.value })} placeholder="0,50" /></Field>
            <Field label="Data de povoamento"><Input type="date" value={fCiclo.data_povoamento} onChange={(e) => setFCiclo({ ...fCiclo, data_povoamento: e.target.value })} /></Field>
            <Field label="Despesca prevista"><Input type="date" value={fCiclo.data_despesca_prevista} onChange={(e) => setFCiclo({ ...fCiclo, data_despesca_prevista: e.target.value })} /></Field>
            <Field label="Qtd. de alevinos"><Input type="number" value={fCiclo.qtd_alevinos} onChange={(e) => setFCiclo({ ...fCiclo, qtd_alevinos: e.target.value })} placeholder="5000" /></Field>
            <Field label="Peso médio inicial (g)"><Input type="number" step="0.1" value={fCiclo.peso_medio_inicial_g} onChange={(e) => setFCiclo({ ...fCiclo, peso_medio_inicial_g: e.target.value })} placeholder="1,0" /></Field>
            <Field label="Preço do alevino (un.)"><Input type="number" step="0.01" value={fCiclo.preco_alevino_unit} onChange={(e) => setFCiclo({ ...fCiclo, preco_alevino_unit: e.target.value })} placeholder="0,15" /></Field>
            <Field label="Meta de peso final (g)"><Input type="number" step="1" value={fCiclo.meta_peso_final_g} onChange={(e) => setFCiclo({ ...fCiclo, meta_peso_final_g: e.target.value })} placeholder="800" /></Field>
            <Field label="Meta de preço de venda (R$/kg)" full><Input type="number" step="0.01" value={fCiclo.meta_preco_venda_kg} onChange={(e) => setFCiclo({ ...fCiclo, meta_preco_venda_kg: e.target.value })} placeholder="8,50" /></Field>
            <Field label="Observações" full><Textarea value={fCiclo.observacoes} onChange={(e) => setFCiclo({ ...fCiclo, observacoes: e.target.value })} rows={2} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoCiclo(false)}>Cancelar</Button>
            <Button onClick={criarCiclo} disabled={salvando} style={{ background: COR_PRIMARIA }}>{salvando ? "Salvando..." : "Iniciar ciclo"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL: Registro Diário ═══ */}
      <Dialog open={showNovoRegistro} onOpenChange={setShowNovoRegistro}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar o dia</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" full><Input type="date" value={fReg.data_registro} onChange={(e) => setFReg({ ...fReg, data_registro: e.target.value })} /></Field>
            <Field label="Ração (kg)"><Input type="number" step="0.01" value={fReg.racao_kg} onChange={(e) => setFReg({ ...fReg, racao_kg: e.target.value })} /></Field>
            <Field label="Custo da ração no dia"><Input type="number" step="0.01" value={fReg.custo_racao_dia} onChange={(e) => setFReg({ ...fReg, custo_racao_dia: e.target.value })} /></Field>
            <Field label="Mortalidade (qtd.)"><Input type="number" value={fReg.mortalidade_qtd} onChange={(e) => setFReg({ ...fReg, mortalidade_qtd: e.target.value })} /></Field>
            <Field label="Causa da mortalidade"><Input value={fReg.mortalidade_causa} onChange={(e) => setFReg({ ...fReg, mortalidade_causa: e.target.value })} placeholder="Opcional" /></Field>
            <Field label="O₂ dissolvido (mg/L)"><Input type="number" step="0.1" value={fReg.oxigenio_dissolvido} onChange={(e) => setFReg({ ...fReg, oxigenio_dissolvido: e.target.value })} placeholder="> 3 ideal" /></Field>
            <Field label="pH"><Input type="number" step="0.1" value={fReg.ph} onChange={(e) => setFReg({ ...fReg, ph: e.target.value })} placeholder="6,5 – 8,5" /></Field>
            <Field label="Temperatura (°C)"><Input type="number" step="0.1" value={fReg.temperatura_c} onChange={(e) => setFReg({ ...fReg, temperatura_c: e.target.value })} placeholder="26 – 30" /></Field>
            <Field label="Transparência — Secchi (cm)"><Input type="number" value={fReg.transparencia_secchi_cm} onChange={(e) => setFReg({ ...fReg, transparencia_secchi_cm: e.target.value })} placeholder="30 – 70" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoRegistro(false)}>Cancelar</Button>
            <Button onClick={salvarRegistro} disabled={salvando} style={{ background: COR_AGUA }}>{salvando ? "Salvando..." : "Salvar registro"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL: Nova Biometria ═══ */}
      <Dialog open={showNovaBiometria} onOpenChange={setShowNovaBiometria}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova biometria</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" full><Input type="date" value={fBio.data_biometria} onChange={(e) => setFBio({ ...fBio, data_biometria: e.target.value })} /></Field>
            <Field label="Qtd. amostrada"><Input type="number" value={fBio.qtd_amostrada} onChange={(e) => setFBio({ ...fBio, qtd_amostrada: e.target.value })} placeholder="30" /></Field>
            <Field label="Peso total da amostra (g)"><Input type="number" step="0.1" value={fBio.peso_total_amostra_g} onChange={(e) => setFBio({ ...fBio, peso_total_amostra_g: e.target.value })} placeholder="4500" /></Field>
            <Field label="Técnico responsável" full><Input value={fBio.tecnico_responsavel} onChange={(e) => setFBio({ ...fBio, tecnico_responsavel: e.target.value })} placeholder="Opcional" /></Field>
            <Field label="Observações" full><Textarea rows={2} value={fBio.observacoes} onChange={(e) => setFBio({ ...fBio, observacoes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovaBiometria(false)}>Cancelar</Button>
            <Button onClick={salvarBiometria} disabled={salvando} style={{ background: COR_BIOMETRIA }}>{salvando ? "Salvando..." : "Registrar biometria"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL: Compra de Insumo ═══ */}
      <Dialog open={showNovoInsumo} onOpenChange={setShowNovoInsumo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar compra de insumo</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" value={fIns.data_compra} onChange={(e) => setFIns({ ...fIns, data_compra: e.target.value })} /></Field>
            <Field label="Tipo">
              <Select value={fIns.tipo_insumo} onValueChange={(v) => setFIns({ ...fIns, tipo_insumo: v as TipoInsumo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TIPO_INSUMO_LABEL) as TipoInsumo[]).map((t) => <SelectItem key={t} value={t}>{TIPO_INSUMO_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Descrição" full><Input value={fIns.descricao} onChange={(e) => setFIns({ ...fIns, descricao: e.target.value })} placeholder="Ex.: Ração extrusada 32% PB" /></Field>
            <Field label="Quantidade"><Input type="number" step="0.01" value={fIns.quantidade} onChange={(e) => setFIns({ ...fIns, quantidade: e.target.value })} /></Field>
            <Field label="Unidade"><Input value={fIns.unidade} onChange={(e) => setFIns({ ...fIns, unidade: e.target.value })} placeholder="kg" /></Field>
            <Field label="Valor total (R$)"><Input type="number" step="0.01" value={fIns.valor_total} onChange={(e) => setFIns({ ...fIns, valor_total: e.target.value })} /></Field>
            <Field label="Fornecedor"><Input value={fIns.fornecedor} onChange={(e) => setFIns({ ...fIns, fornecedor: e.target.value })} placeholder="Opcional" /></Field>
            <Field label="Nota fiscal" full><Input value={fIns.nota_fiscal} onChange={(e) => setFIns({ ...fIns, nota_fiscal: e.target.value })} placeholder="Opcional" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoInsumo(false)}>Cancelar</Button>
            <Button onClick={salvarInsumo} disabled={salvando} style={{ background: COR_INSUMO }}>{salvando ? "Salvando..." : "Registrar compra"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL: Despesca ═══ */}
      <Dialog open={showNovaDespesca} onOpenChange={setShowNovaDespesca}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar despesca / venda</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" value={fDesp.data_despesca} onChange={(e) => setFDesp({ ...fDesp, data_despesca: e.target.value })} /></Field>
            <Field label="Tipo">
              <Select value={fDesp.tipo} onValueChange={(v) => setFDesp({ ...fDesp, tipo: v as TipoDespesca })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total (encerra o ciclo)</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Qtd. de peixes vendidos"><Input type="number" value={fDesp.qtd_peixes_vendidos} onChange={(e) => setFDesp({ ...fDesp, qtd_peixes_vendidos: e.target.value })} /></Field>
            <Field label="Peso total (kg)"><Input type="number" step="0.01" value={fDesp.peso_total_kg} onChange={(e) => setFDesp({ ...fDesp, peso_total_kg: e.target.value })} /></Field>
            <Field label="Preço por kg (R$)"><Input type="number" step="0.01" value={fDesp.preco_kg} onChange={(e) => setFDesp({ ...fDesp, preco_kg: e.target.value })} /></Field>
            <Field label="Comprador"><Input value={fDesp.comprador} onChange={(e) => setFDesp({ ...fDesp, comprador: e.target.value })} placeholder="Opcional" /></Field>
            <Field label="Nota fiscal"><Input value={fDesp.nota_fiscal} onChange={(e) => setFDesp({ ...fDesp, nota_fiscal: e.target.value })} placeholder="Opcional" /></Field>
            <Field label="Observações" full><Textarea rows={2} value={fDesp.observacoes} onChange={(e) => setFDesp({ ...fDesp, observacoes: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovaDespesca(false)}>Cancelar</Button>
            <Button onClick={salvarDespesca} disabled={salvando} style={{ background: COR_DESPESCA }}>{salvando ? "Salvando..." : "Registrar despesca"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Subcomponentes de apresentação ────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2" style={{ color }}>
          {icon}
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, icon }: { label: string; value: string; bold?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1 ${bold ? "font-semibold" : ""}`}>{icon}{value}</span>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ViabGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function ViabField({ label, value, onChange, step = "1" }: { label: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

