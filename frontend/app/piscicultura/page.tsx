// page.tsx — Piscicultura
"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Ciclo = {
  id: number;
  nome_ciclo: string;
  especie: string;
  sistema: string;
  area_ha: number;
  data_povoamento: string;
  data_despesca_prevista: string | null;
  qtd_alevinos: number;
  peso_medio_inicial_g: number;
  meta_peso_final_g: number | null;
  meta_preco_venda_kg: number | null;
  status: string;
  estoque_vivo: number | null;
  biomassa_atual_kg: number | null;
  total_racao_kg: number | null;
  total_custo_insumos: number | null;
  ica_atual: number | null;
  mortalidade_acumulada: number | null;
  mortalidade_perc: number | null;
};

type Dashboard = {
  estoque_vivo: number;
  mortalidade_acumulada: number;
  mortalidade_perc: number;
  biomassa_atual_kg: number | null;
  ica_atual: number | null;
  dias_em_producao: number;
  total_racao_kg: number | string;
  custo_racao_total: number | string;
  custo_alevinos: number | string;
  custo_outros_insumos: number | string;
  custo_total: number | string;
  custo_por_kg_estimado: number | null;
  receita_realizada: number | string;
  receita_projetada: number | null;
  lucro_estimado: number | null;
  margem_estimada_perc: number | null;
  alertas: string[];
};

type RegistroDiario = {
  id: number;
  data_registro: string;
  racao_kg: number | null;
  mortalidade_qtd: number;
  oxigenio_dissolvido: number | null;
  ph: number | null;
  temperatura_c: number | null;
  alertas: string | null;
};

type Biometria = {
  id: number;
  data_biometria: string;
  peso_medio_g: number | null;
  biomassa_estimada_kg: number | null;
  ica_acumulado: number | null;
};

const SISTEMAS = [
  { value: "extensivo", label: "Extensivo" },
  { value: "semi_intensivo", label: "Semi-intensivo" },
  { value: "intensivo", label: "Intensivo" },
  { value: "superintensivo", label: "Superintensivo" },
];

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-emerald-100 text-emerald-800",
  encerrado: "bg-gray-100 text-gray-600",
  cancelado: "bg-red-100 text-red-700",
};

const fmt = (v: number | string | null | undefined, dec = 2) =>
  v != null ? parseFloat(String(v)).toFixed(dec) : "—";
const fmtBRL = (v: number | string | null | undefined) =>
  v != null ? parseFloat(String(v)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export default function PisciculturaPage() {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cicloSelecionado, setCicloSelecionado] = useState<Ciclo | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [biometrias, setBiometrias] = useState<Biometria[]>([]);
  const [tabDetalhe, setTabDetalhe] = useState<"dashboard" | "diario" | "biometria" | "insumos" | "despesca">("dashboard");
  const [showNovoCiclo, setShowNovoCiclo] = useState(false);
  const [showRegistroDiario, setShowRegistroDiario] = useState(false);
  const [showBiometria, setShowBiometria] = useState(false);
  const [showCompra, setShowCompra] = useState(false);
  const [showDespesca, setShowDespesca] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Form novo ciclo
  const [fcNome, setFcNome] = useState("");
  const [fcEspecie, setFcEspecie] = useState("Tilápia do Nilo");
  const [fcSistema, setFcSistema] = useState("semi_intensivo");
  const [fcAreaHa, setFcAreaHa] = useState("");
  const [fcDataPov, setFcDataPov] = useState("");
  const [fcDataDesp, setFcDataDesp] = useState("");
  const [fcQtdAlevinos, setFcQtdAlevinos] = useState("");
  const [fcPesoInicial, setFcPesoInicial] = useState("5");
  const [fcPrecoAlevino, setFcPrecoAlevino] = useState("");
  const [fcMetaPeso, setFcMetaPeso] = useState("800");
  const [fcMetaPreco, setFcMetaPreco] = useState("");

  // Form registro diário
  const [rdData, setRdData] = useState(new Date().toISOString().split("T")[0]);
  const [rdRacaoKg, setRdRacaoKg] = useState("");
  const [rdCustoRacao, setRdCustoRacao] = useState("");
  const [rdMortalidade, setRdMortalidade] = useState("0");
  const [rdO2, setRdO2] = useState("");
  const [rdPh, setRdPh] = useState("");
  const [rdTemp, setRdTemp] = useState("");
  const [rdSecchi, setRdSecchi] = useState("");
  const [pmpRacao, setPmpRacao] = useState<number | null>(null);
  const [rdPrecoKgRacao, setRdPrecoKgRacao] = useState("");

  // Form biometria
  const [bioData, setBioData] = useState(new Date().toISOString().split("T")[0]);
  const [bioQtd, setBioQtd] = useState("");
  const [bioPesoTotal, setBioPesoTotal] = useState("");

  // Form compra insumo
  const [compData, setCompData] = useState(new Date().toISOString().split("T")[0]);
  const [compTipo, setCompTipo] = useState("racao");
  const [compDesc, setCompDesc] = useState("");
  const [compQtd, setCompQtd] = useState("");
  const [compUnidade, setCompUnidade] = useState("kg");
  const [compValor, setCompValor] = useState("");
  const [compFornecedor, setCompFornecedor] = useState("");

  // Form despesca
  const [despData, setDespData] = useState(new Date().toISOString().split("T")[0]);
  const [despTipo, setDespTipo] = useState("total");
  const [despPesoKg, setDespPesoKg] = useState("");
  const [despPrecoKg, setDespPrecoKg] = useState("");
  const [despComprador, setDespComprador] = useState("");

  useEffect(() => { loadCiclos(); }, []);

  async function loadCiclos() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/piscicultura/ciclos?imovel_id=${IMOVEL_ID}`);
      const data = await r.json();
      setCiclos(Array.isArray(data) ? data : []);
    } catch { setCiclos([]); }
    setLoading(false);
  }

  async function loadDashboard(cicloId: number) {
    try {
      const [dash, regs, bios] = await Promise.all([
        fetch(`${API}/piscicultura/dashboard/${cicloId}`).then(r => r.json()),
        fetch(`${API}/piscicultura/registros-diarios/${cicloId}`).then(r => r.json()),
        fetch(`${API}/piscicultura/biometrias/${cicloId}`).then(r => r.json()),
      ]);
      setDashboard(dash);
      setRegistros(Array.isArray(regs) ? regs.slice(0, 10) : []);
      setBiometrias(Array.isArray(bios) ? bios : []);
    } catch {}
  }

  function selecionarCiclo(c: Ciclo) {
    setCicloSelecionado(c);
    setTabDetalhe("dashboard");
    loadDashboard(c.id);
    fetch(`${API}/piscicultura/preco-medio-racao/${c.id}`)
      .then(r => r.json())
      .then(d => {
        setPmpRacao(d.preco_medio_kg);
        if (d.preco_medio_kg) setRdPrecoKgRacao(d.preco_medio_kg.toFixed(4));
      })
      .catch(() => setPmpRacao(null));
  }

  async function criarCiclo() {
    if (!fcNome || !fcEspecie || !fcAreaHa || !fcDataPov || !fcQtdAlevinos) {
      setMsg("Preencha os campos obrigatórios"); return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API}/piscicultura/ciclos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID,
          nome_ciclo: fcNome,
          especie: fcEspecie,
          sistema: fcSistema,
          area_ha: parseFloat(fcAreaHa),
          data_povoamento: fcDataPov,
          data_despesca_prevista: (fcDataDesp && fcDataDesp > fcDataPov) ? fcDataDesp : null,
          qtd_alevinos: parseInt(fcQtdAlevinos),
          peso_medio_inicial_g: parseFloat(fcPesoInicial),
          preco_alevino_unit: fcPrecoAlevino ? parseFloat(fcPrecoAlevino) : null,
          meta_peso_final_g: fcMetaPeso ? parseFloat(fcMetaPeso) : null,
          meta_preco_venda_kg: fcMetaPreco ? parseFloat(fcMetaPreco) : null,
        }),
      });
      if (r.ok) {
        setMsg("Ciclo criado com sucesso!");
        setShowNovoCiclo(false);
        loadCiclos();
      } else {
        const err = await r.json();
        setMsg("Erro: " + JSON.stringify(err.detail));
      }
    } catch { setMsg("Erro de conexão"); }
    setSaving(false);
  }

  async function salvarRegistroDiario() {
    if (!cicloSelecionado) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/piscicultura/registros-diarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciclo_id: cicloSelecionado.id,
          data_registro: rdData,
          racao_kg: rdRacaoKg ? parseFloat(rdRacaoKg) : null,
          custo_racao_dia: rdCustoRacao ? parseFloat(rdCustoRacao) : null,
          preco_kg_racao: rdPrecoKgRacao ? parseFloat(rdPrecoKgRacao) : null,
          mortalidade_qtd: parseInt(rdMortalidade) || 0,
          oxigenio_dissolvido: rdO2 ? parseFloat(rdO2) : null,
          ph: rdPh ? parseFloat(rdPh) : null,
          temperatura_c: rdTemp ? parseFloat(rdTemp) : null,
          transparencia_secchi_cm: rdSecchi ? parseInt(rdSecchi) : null,
        }),
      });
      if (r.ok) {
        setMsg("Registro salvo!");
        setShowRegistroDiario(false);
        loadDashboard(cicloSelecionado.id);
      } else { setMsg("Erro ao salvar"); }
    } catch { setMsg("Erro de conexão"); }
    setSaving(false);
  }

  async function salvarBiometria() {
    if (!cicloSelecionado || !bioQtd || !bioPesoTotal) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/piscicultura/biometrias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciclo_id: cicloSelecionado.id,
          data_biometria: bioData,
          qtd_amostrada: parseInt(bioQtd),
          peso_total_amostra_g: parseFloat(bioPesoTotal),
        }),
      });
      if (r.ok) {
        setMsg("Biometria registrada!");
        setShowBiometria(false);
        loadDashboard(cicloSelecionado.id);
      } else { setMsg("Erro ao salvar"); }
    } catch { setMsg("Erro de conexão"); }
    setSaving(false);
  }

  async function salvarCompra() {
    if (!cicloSelecionado || !compDesc || !compValor) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/piscicultura/compras-insumos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciclo_id: cicloSelecionado.id,
          data_compra: compData,
          tipo_insumo: compTipo,
          descricao: compDesc,
          quantidade: compQtd ? parseFloat(compQtd) : null,
          unidade: compUnidade || null,
          valor_total: parseFloat(compValor),
          fornecedor: compFornecedor || null,
        }),
      });
      if (r.ok) {
        setMsg("Compra registrada! Lançamento LCDPR gerado.");
        setShowCompra(false);
        loadDashboard(cicloSelecionado.id);
      } else { setMsg("Erro ao salvar"); }
    } catch { setMsg("Erro de conexão"); }
    setSaving(false);
  }

  async function salvarDespesca() {
    if (!cicloSelecionado || !despPesoKg || !despPrecoKg) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/piscicultura/despescas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ciclo_id: cicloSelecionado.id,
          data_despesca: despData,
          tipo: despTipo,
          peso_total_kg: parseFloat(despPesoKg),
          preco_kg: parseFloat(despPrecoKg),
          comprador: despComprador || null,
        }),
      });
      if (r.ok) {
        setMsg("Despesca registrada! Receita LCDPR gerada.");
        setShowDespesca(false);
        loadCiclos();
        loadDashboard(cicloSelecionado.id);
      } else { setMsg("Erro ao salvar"); }
    } catch { setMsg("Erro de conexão"); }
    setSaving(false);
  }

  const ciclosAtivos = ciclos.filter(c => c.status === "ativo");
  const ciclosEncerrados = ciclos.filter(c => c.status !== "ativo");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Piscicultura</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gestão de ciclos, biometrias e controle econômico</p>
          </div>
          <button
            onClick={() => setShowNovoCiclo(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Novo Ciclo
          </button>
        </div>
      </div>

      {msg && (
        <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm flex justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} className="text-blue-500 hover:text-blue-700">✕</button>
        </div>
      )}

      <div className="flex h-[calc(100vh-80px)]">
        {/* Lista de ciclos — sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Carregando...</div>
          ) : ciclos.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-4xl mb-3">🐟</div>
              <p className="text-gray-500 text-sm">Nenhum ciclo cadastrado.</p>
              <button onClick={() => setShowNovoCiclo(true)} className="mt-3 text-blue-600 text-sm underline">
                Criar primeiro ciclo
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {ciclosAtivos.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase px-2 pt-2">Ativos</p>
                  {ciclosAtivos.map(c => (
                    <CicloCard key={c.id} ciclo={c} selecionado={cicloSelecionado?.id === c.id} onClick={() => selecionarCiclo(c)} />
                  ))}
                </>
              )}
              {ciclosEncerrados.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase px-2 pt-4">Encerrados</p>
                  {ciclosEncerrados.map(c => (
                    <CicloCard key={c.id} ciclo={c} selecionado={cicloSelecionado?.id === c.id} onClick={() => selecionarCiclo(c)} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Painel direito */}
        <div className="flex-1 overflow-y-auto">
          {!cicloSelecionado ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <div className="text-5xl mb-4">🐟</div>
                <p className="text-lg font-medium">Selecione um ciclo</p>
                <p className="text-sm mt-1">ou crie um novo para começar</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* Cabeçalho do ciclo */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">{cicloSelecionado.nome_ciclo}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[cicloSelecionado.status]}`}>
                      {cicloSelecionado.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {cicloSelecionado.especie} · {cicloSelecionado.sistema.replace("_", "-")} · {cicloSelecionado.area_ha} ha · Povoamento: {cicloSelecionado.data_povoamento}
                  </p>
                </div>
                {cicloSelecionado.status === "ativo" && (
                  <div className="flex gap-2">
                    <button onClick={() => setShowRegistroDiario(true)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg">
                      + Dia
                    </button>
                    <button onClick={() => setShowBiometria(true)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
                      + Biometria
                    </button>
                    <button onClick={() => setShowCompra(true)} className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg">
                      + Insumo
                    </button>
                    <button onClick={() => setShowDespesca(true)} className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg">
                      + Despesca
                    </button>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-gray-200 mb-6">
                {(["dashboard", "diario", "biometria"] as const).map(t => (
                  <button key={t} onClick={() => setTabDetalhe(t)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                      tabDetalhe === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}>
                    {t === "dashboard" ? "Dashboard" : t === "diario" ? "Registros Diários" : "Biometrias"}
                  </button>
                ))}
              </div>

              {/* Dashboard */}
              {tabDetalhe === "dashboard" && dashboard && (
                <div className="space-y-6">
                  {/* Alertas */}
                  {dashboard.alertas.length > 0 && (
                    <div className="space-y-2">
                      {dashboard.alertas.map((a, i) => (
                        <div key={i} className="bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-2 rounded-lg">{a}</div>
                      ))}
                    </div>
                  )}

                  {/* KPIs zootécnicos */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Estoque Vivo" value={`${dashboard.estoque_vivo} peixes`} color="emerald" />
                    <KpiCard label="Mortalidade" value={`${fmt(dashboard.mortalidade_perc, 1)}%`} sub={`${dashboard.mortalidade_acumulada} peixes`} color={dashboard.mortalidade_perc > 10 ? "red" : "gray"} />
                    <KpiCard label="Biomassa Atual" value={dashboard.biomassa_atual_kg ? `${fmt(dashboard.biomassa_atual_kg)} kg` : "—"} color="blue" />
                    <KpiCard label="ICA Atual" value={dashboard.ica_atual ? fmt(dashboard.ica_atual, 3) : "—"} sub="ideal < 2.0" color={dashboard.ica_atual && dashboard.ica_atual > 2.5 ? "red" : "green"} />
                  </div>

                  {/* KPIs econômicos */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Gestão Econômica</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <KpiCard label="Custo Total" value={fmtBRL(dashboard.custo_total)} color="orange" />
                      <KpiCard label="Custo/kg Estimado" value={fmtBRL(dashboard.custo_por_kg_estimado)} color="orange" />
                      <KpiCard label="Receita Realizada" value={fmtBRL(dashboard.receita_realizada)} color="emerald" />
                      <KpiCard label="Lucro Estimado" value={fmtBRL(dashboard.lucro_estimado)} sub={dashboard.margem_estimada_perc != null ? `Margem: ${fmt(dashboard.margem_estimada_perc, 1)}%` : undefined} color={dashboard.lucro_estimado != null && dashboard.lucro_estimado > 0 ? "emerald" : "red"} />
                    </div>
                  </div>

                  {/* Detalhamento de custos */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Composição de Custos</h3>
                    <div className="space-y-2">
                      <CustoLinha label="Alevinos" valor={dashboard.custo_alevinos} total={dashboard.custo_total} />
                      <CustoLinha label="Ração" valor={dashboard.custo_racao_total} total={dashboard.custo_total} />
                      <CustoLinha label="Outros insumos" valor={dashboard.custo_outros_insumos} total={dashboard.custo_total} />
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm font-semibold">
                      <span>Total</span>
                      <span>{fmtBRL(dashboard.custo_total)}</span>
                    </div>
                  </div>

                  {/* Resumo ração */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <p className="text-xs text-gray-500">Total de Ração</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(dashboard.total_racao_kg)} kg</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <p className="text-xs text-gray-500">Dias em Produção</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{dashboard.dias_em_producao} dias</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Registros diários */}
              {tabDetalhe === "diario" && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Data", "Ração (kg)", "Mortalidade", "O₂ (mg/L)", "pH", "Temp (°C)", "Alertas"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {registros.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhum registro ainda</td></tr>
                      ) : registros.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{r.data_registro}</td>
                          <td className="px-4 py-3">{r.racao_kg ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={r.mortalidade_qtd > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                              {r.mortalidade_qtd}
                            </span>
                          </td>
                          <td className="px-4 py-3">{r.oxigenio_dissolvido ?? "—"}</td>
                          <td className="px-4 py-3">{r.ph ?? "—"}</td>
                          <td className="px-4 py-3">{r.temperatura_c ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-orange-600">{r.alertas ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Biometrias */}
              {tabDetalhe === "biometria" && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Data", "Amostras", "Peso Médio (g)", "Biomassa (kg)", "ICA Acumulado"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {biometrias.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhuma biometria ainda</td></tr>
                      ) : biometrias.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{b.data_biometria}</td>
                          <td className="px-4 py-3">{b.id}</td>
                          <td className="px-4 py-3">{fmt(b.peso_medio_g, 1)}</td>
                          <td className="px-4 py-3">{fmt(b.biomassa_estimada_kg)}</td>
                          <td className="px-4 py-3">
                            <span className={b.ica_acumulado && b.ica_acumulado > 2.5 ? "text-red-600 font-medium" : ""}>
                              {fmt(b.ica_acumulado, 3)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Novo Ciclo */}
      {showNovoCiclo && (
        <Modal title="Novo Ciclo de Produção" onClose={() => setShowNovoCiclo(false)}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nome do Ciclo *</label>
              <input className="input" value={fcNome} onChange={e => setFcNome(e.target.value)} placeholder="Ex: Tilápia Viveiro 1 – 2026/1" />
            </div>
            <div>
              <label className="label">Espécie *</label>
              <input className="input" value={fcEspecie} onChange={e => setFcEspecie(e.target.value)} />
            </div>
            <div>
              <label className="label">Sistema *</label>
              <select className="input" value={fcSistema} onChange={e => setFcSistema(e.target.value)}>
                {SISTEMAS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Área do Viveiro (ha) *</label>
              <input className="input" type="number" step="0.01" value={fcAreaHa} onChange={e => setFcAreaHa(e.target.value)} placeholder="0.50" />
            </div>
            <div>
              <label className="label">Data de Povoamento *</label>
              <input className="input" type="date" value={fcDataPov} onChange={e => setFcDataPov(e.target.value)} />
            </div>
            <div>
              <label className="label">Data Despesca Prevista</label>
              <input className="input" type="date" value={fcDataDesp} onChange={e => setFcDataDesp(e.target.value)} />
            </div>
            <div>
              <label className="label">Qtd. Alevinos *</label>
              <input className="input" type="number" value={fcQtdAlevinos} onChange={e => setFcQtdAlevinos(e.target.value)} placeholder="5000" />
            </div>
            <div>
              <label className="label">Peso Médio Inicial (g) *</label>
              <input className="input" type="number" value={fcPesoInicial} onChange={e => setFcPesoInicial(e.target.value)} />
            </div>
            <div>
              <label className="label">Preço Alevino (R$/un)</label>
              <input className="input" type="number" step="0.01" value={fcPrecoAlevino} onChange={e => setFcPrecoAlevino(e.target.value)} placeholder="0.15" />
            </div>
            <div>
              <label className="label">Meta Peso Final (g)</label>
              <input className="input" type="number" value={fcMetaPeso} onChange={e => setFcMetaPeso(e.target.value)} />
            </div>
            <div>
              <label className="label">Meta Preço Venda (R$/kg)</label>
              <input className="input" type="number" step="0.01" value={fcMetaPreco} onChange={e => setFcMetaPreco(e.target.value)} placeholder="8.50" />
            </div>
          </div>
          {msg && <p className="text-red-600 text-sm mt-3">{msg}</p>}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowNovoCiclo(false)} className="btn-secondary">Cancelar</button>
            <button onClick={criarCiclo} disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Criar Ciclo"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Registro Diário */}
      {showRegistroDiario && (
        <Modal title="Registro Diário" onClose={() => setShowRegistroDiario(false)}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Data</label>
              <input className="input" type="date" value={rdData} onChange={e => setRdData(e.target.value)} />
            </div>
            <div>
              <label className="label">Ração fornecida (kg)</label>
              <input className="input" type="number" step="0.1" value={rdRacaoKg} onChange={e => {
                const kg = e.target.value;
                setRdRacaoKg(kg);
                if (rdPrecoKgRacao && kg) {
                  setRdCustoRacao((parseFloat(kg) * parseFloat(rdPrecoKgRacao)).toFixed(2));
                }
              }} placeholder="50.0" />
            </div>
            <div>
              <label className="label">
                Preço/kg da ração (R$)
                {pmpRacao ? (
                  <span className="text-xs text-blue-500 ml-2">PMP calculado</span>
                ) : (
                  <span className="text-xs text-gray-400 ml-2">sem compras — informe manualmente</span>
                )}
              </label>
              <input className="input" type="number" step="0.0001" value={rdPrecoKgRacao} onChange={e => {
                setRdPrecoKgRacao(e.target.value);
                if (rdRacaoKg && e.target.value) {
                  setRdCustoRacao((parseFloat(rdRacaoKg) * parseFloat(e.target.value)).toFixed(2));
                }
              }} placeholder="ex: 2.8500" />
            </div>
            <div>
              <label className="label">Custo ração hoje (R$) <span className="text-xs text-gray-400">calculado automaticamente</span></label>
              <input className="input" type="number" step="0.01" value={rdCustoRacao} onChange={e => setRdCustoRacao(e.target.value)} placeholder="automático" />
            </div>
            <div>
              <label className="label">Mortalidade (qtd)</label>
              <input className="input" type="number" value={rdMortalidade} onChange={e => setRdMortalidade(e.target.value)} />
            </div>
            <div className="col-span-2 border-t pt-4 mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Qualidade da Água</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">O₂ Dissolvido (mg/L)</label>
                  <input className="input" type="number" step="0.1" value={rdO2} onChange={e => setRdO2(e.target.value)} placeholder="5.0" />
                </div>
                <div>
                  <label className="label">pH</label>
                  <input className="input" type="number" step="0.1" value={rdPh} onChange={e => setRdPh(e.target.value)} placeholder="7.2" />
                </div>
                <div>
                  <label className="label">Temperatura (°C)</label>
                  <input className="input" type="number" step="0.1" value={rdTemp} onChange={e => setRdTemp(e.target.value)} placeholder="28.0" />
                </div>
                <div>
                  <label className="label">Disco de Secchi (cm)</label>
                  <input className="input" type="number" value={rdSecchi} onChange={e => setRdSecchi(e.target.value)} placeholder="45" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowRegistroDiario(false)} className="btn-secondary">Cancelar</button>
            <button onClick={salvarRegistroDiario} disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Biometria */}
      {showBiometria && (
        <Modal title="Registrar Biometria" onClose={() => setShowBiometria(false)}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Data</label>
              <input className="input" type="date" value={bioData} onChange={e => setBioData(e.target.value)} />
            </div>
            <div>
              <label className="label">Qtd. amostrada *</label>
              <input className="input" type="number" value={bioQtd} onChange={e => setBioQtd(e.target.value)} placeholder="30" />
            </div>
            <div className="col-span-2">
              <label className="label">Peso total da amostra (g) *</label>
              <input className="input" type="number" step="0.1" value={bioPesoTotal} onChange={e => setBioPesoTotal(e.target.value)} placeholder="Ex: 9000 para 30 peixes de 300g" />
              {bioQtd && bioPesoTotal && (
                <p className="text-xs text-gray-500 mt-1">
                  Peso médio: {(parseFloat(bioPesoTotal) / parseFloat(bioQtd)).toFixed(1)} g/peixe
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowBiometria(false)} className="btn-secondary">Cancelar</button>
            <button onClick={salvarBiometria} disabled={saving} className="btn-primary">
              {saving ? "Calculando..." : "Registrar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Compra de Insumo */}
      {showCompra && (
        <Modal title="Registrar Compra de Insumo" onClose={() => setShowCompra(false)}>
          <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg mb-4">
            ✓ Lançamento de despesa no LCDPR será gerado automaticamente
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Data *</label>
              <input className="input" type="date" value={compData} onChange={e => setCompData(e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo de Insumo *</label>
              <select className="input" value={compTipo} onChange={e => setCompTipo(e.target.value)}>
                {["racao","alevinos","calcario","cal","medicamento","aerador","outro"].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Descrição *</label>
              <input className="input" value={compDesc} onChange={e => setCompDesc(e.target.value)} placeholder="Ex: Ração extrusada 32% proteína 5mm" />
            </div>
            <div>
              <label className="label">Quantidade</label>
              <input className="input" type="number" step="0.1" value={compQtd} onChange={e => setCompQtd(e.target.value)} />
            </div>
            <div>
              <label className="label">Unidade</label>
              <select className="input" value={compUnidade} onChange={e => setCompUnidade(e.target.value)}>
                {["kg","saco","unidade","litro"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Valor Total (R$) *</label>
              <input className="input" type="number" step="0.01" value={compValor} onChange={e => setCompValor(e.target.value)} />
            </div>
            <div>
              <label className="label">Fornecedor</label>
              <input className="input" value={compFornecedor} onChange={e => setCompFornecedor(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowCompra(false)} className="btn-secondary">Cancelar</button>
            <button onClick={salvarCompra} disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Registrar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Despesca */}
      {showDespesca && (
        <Modal title="Registrar Despesca / Venda" onClose={() => setShowDespesca(false)}>
          <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg mb-4">
            ✓ Receita rural será lançada no LCDPR automaticamente
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Data *</label>
              <input className="input" type="date" value={despData} onChange={e => setDespData(e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={despTipo} onChange={e => setDespTipo(e.target.value)}>
                <option value="total">Total (encerra ciclo)</option>
                <option value="parcial">Parcial</option>
              </select>
            </div>
            <div>
              <label className="label">Peso Total (kg) *</label>
              <input className="input" type="number" step="0.1" value={despPesoKg} onChange={e => setDespPesoKg(e.target.value)} placeholder="500" />
            </div>
            <div>
              <label className="label">Preço (R$/kg) *</label>
              <input className="input" type="number" step="0.01" value={despPrecoKg} onChange={e => setDespPrecoKg(e.target.value)} placeholder="8.50" />
            </div>
            {despPesoKg && despPrecoKg && (
              <div className="col-span-2 bg-emerald-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-emerald-800">
                  Receita: {fmtBRL(parseFloat(despPesoKg) * parseFloat(despPrecoKg))}
                </p>
              </div>
            )}
            <div className="col-span-2">
              <label className="label">Comprador</label>
              <input className="input" value={despComprador} onChange={e => setDespComprador(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowDespesca(false)} className="btn-secondary">Cancelar</button>
            <button onClick={salvarDespesca} disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Registrar Venda"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Componentes auxiliares ───────────────────────────────

function CicloCard({ ciclo, selecionado, onClick }: { ciclo: Ciclo; selecionado: boolean; onClick: () => void }) {
  const mortalidade = ciclo.mortalidade_perc ?? 0;
  return (
    <button onClick={onClick} className={`w-full text-left p-3 rounded-xl border transition-all ${
      selecionado ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-tight">{ciclo.nome_ciclo}</p>
          <p className="text-xs text-gray-500 mt-0.5">{ciclo.especie}</p>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[ciclo.status]}`}>
          {ciclo.status}
        </span>
      </div>
      <div className="mt-2 flex gap-3 text-xs text-gray-500">
        <span>🐟 {ciclo.estoque_vivo ?? ciclo.qtd_alevinos}</span>
        <span>⚖️ {ciclo.biomassa_atual_kg ? `${fmt(ciclo.biomassa_atual_kg)}kg` : "—"}</span>
        {mortalidade > 0 && <span className={mortalidade > 10 ? "text-red-500" : ""}>💀 {fmt(mortalidade, 1)}%</span>}
      </div>
    </button>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-600", blue: "text-blue-600", orange: "text-orange-500",
    red: "text-red-600", gray: "text-gray-600", green: "text-emerald-600",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${colors[color] ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CustoLinha({ label, valor, total }: { label: string; valor: number | string; total: number | string }) {
  const perc = Number(total) > 0 ? (Number(valor) / Number(total)) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-32">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${perc}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700 w-24 text-right">{fmtBRL(valor)}</span>
      <span className="text-xs text-gray-400 w-10 text-right">{fmt(perc, 0)}%</span>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
