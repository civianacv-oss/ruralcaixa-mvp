"use client";
import { getImovelId } from "@/hooks/useImovel";
import { apiFetch } from "@/lib/api";
/**
 * RuralCaixa — Módulo EFD-Reinf (v2)
 * Eventos R-2055 (comercialização), R-2010 (serviços), Apuração FUNRURAL, DARF, XML
 * Base legal: IN RFB 2.237/2024 | Decreto 9.580/2018 | Lei 8.212/1991 | LC 214/2024
 */
import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = getImovelId();

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Dashboard {
  kpis: {
    receita_bruta_ano: number; funrural_ano: number; senar_ano: number;
    inss_servicos_ano: number; total_recolher_ano: number;
    cbs_ano: number; ibs_ano: number; em_aberto: number; pagos: number;
  };
  pendentes: Apuracao[];
  ultimas_vendas: R2055[];
  acertos_sem_r2055: AcertoPendente[];
  aliquotas_vigentes: AliquotasInfo;
}
interface R2055 {
  id: number; competencia: string; cnpj_adquirente: string; nome_adquirente: string;
  data_nota: string; numero_nota: string; tipo_produto: string;
  valor_bruto: number; valor_funrural: number; valor_senar: number;
  valor_total_retido: number; retencao_pelo_adquirente: boolean; status: string;
  origem: string; acerto_id: number | null;
}
interface R2010 {
  id: number; competencia: string; cnpj_prestador: string; nome_prestador: string;
  data_nota: string; numero_nota: string; tipo_servico: string;
  valor_bruto: number; aliquota_retencao: number; valor_retido: number;
  cessao_mao_obra: boolean; status: string;
}
interface Apuracao {
  id: number; competencia: string; total_receita_bruta: number;
  total_funrural: number; total_senar: number; total_inss_servicos: number;
  total_a_recolher: number; data_vencimento: string; codigo_receita_darf: string;
  status_darf: string; data_pagamento: string | null; valor_pago: number | null;
  total_cbs: number; total_ibs: number;
}
interface AcertoPendente {
  id: number; safra: string; arrendatario_nome: string;
  valor_bruto: number; data_pagamento: string | null; produto: string;
}
interface AliquotasInfo {
  funrural_pf: number; funrural_pj: number; senar: number; inss_servicos: number;
  base_legal: string;
  reforma_tributaria: { cbs_estimada: number; ibs_estimada: number; vigencia: string; };
}
interface XmlLote {
  id: number; competencia: string; tipo_evento: string; qtd_eventos: number;
  valor_total: number; status: string; data_geracao: string; protocolo: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${((v ?? 0) * 100).toFixed(2)}%`;
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const hoje = () => new Date().toISOString().split("T")[0];
const fmtData = (s: string) => s ? new Date(s).toLocaleDateString("pt-BR") : "—";

const TIPOS_PRODUTO = [
  { value: "bovino", label: "🐂 Bovino" }, { value: "suino", label: "🐖 Suíno" },
  { value: "ovino", label: "🐑 Ovino" }, { value: "caprino", label: "🐐 Caprino" },
  { value: "aves", label: "🐔 Aves" }, { value: "leite", label: "🥛 Leite" },
  { value: "graos", label: "🌾 Grãos" }, { value: "frutas", label: "🍎 Frutas" },
  { value: "acai", label: "🌴 Açaí" }, { value: "outros", label: "📦 Outros" },
];
const TIPOS_SERVICO = [
  { value: "colheita", label: "🌾 Colheita terceirizada" },
  { value: "tratorista", label: "🚜 Tratorista / máquinas" },
  { value: "construcao", label: "🏗️ Construção / cercas" },
  { value: "transporte", label: "🚛 Transporte de carga" },
  { value: "irrigacao", label: "💧 Irrigação" },
  { value: "outros", label: "🔧 Outros serviços" },
];
const STATUS_BADGE: Record<string, string> = {
  em_aberto: "bg-yellow-100 text-yellow-800",
  gerado:    "bg-blue-100 text-blue-800",
  pago:      "bg-green-100 text-green-800",
  compensado:"bg-purple-100 text-purple-800",
  pendente:  "bg-gray-100 text-gray-600",
  transmitido: "bg-teal-100 text-teal-800",
};
const ORIGEM_BADGE: Record<string, string> = {
  manual:           "bg-gray-100 text-gray-600",
  acerto_contrato:  "bg-green-100 text-green-700",
  importacao:       "bg-blue-100 text-blue-700",
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function EfdReinfPage() {
  type Aba = "dashboard"|"r2055"|"r2010"|"apuracao"|"xml"|"darf"|"aliquotas";
  const [aba, setAba] = useState<Aba>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [r2055List, setR2055List] = useState<R2055[]>([]);
  const [r2010List, setR2010List] = useState<R2010[]>([]);
  const [apuracaoList, setApuracaoList] = useState<Apuracao[]>([]);
  const [xmlLotes, setXmlLotes] = useState<XmlLote[]>([]);
  const [aliquotas, setAliquotas] = useState<any>(null);
  const [competencia, setCompetencia] = useState(mesAtual());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"ok"|"err">("ok");

  // Formulário R-2055
  const [f2055, setF2055] = useState({
    cnpj_adquirente: "", nome_adquirente: "", data_nota: hoje(),
    numero_nota: "", tipo_produto: "graos", valor_bruto: "",
    aliquota_funrural: "0.0187", aliquota_senar: "0.0011",
    retencao_pelo_adquirente: true,
  });
  // Formulário R-2010
  const [f2010, setF2010] = useState({
    cnpj_prestador: "", nome_prestador: "", data_nota: hoje(),
    numero_nota: "", tipo_servico: "outros", valor_bruto: "",
    aliquota_retencao: "0.11", cessao_mao_obra: true,
  });
  // Pagar DARF
  const [pagandoId, setPagandoId] = useState<number|null>(null);
  const [pagtoData, setPagtoData] = useState(hoje());
  const [pagtoValor, setPagtoValor] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, r55, r10, ap, lotes, aliq] = await Promise.all([
        apiFetch(`${API}/efdreinf/dashboard/${IMOVEL_ID}`).then(r => r.json()),
        apiFetch(`${API}/efdreinf/r2055/${IMOVEL_ID}`).then(r => r.json()),
        apiFetch(`${API}/efdreinf/r2010/${IMOVEL_ID}`).then(r => r.json()),
        apiFetch(`${API}/efdreinf/apuracao/${IMOVEL_ID}`).then(r => r.json()),
        apiFetch(`${API}/efdreinf/xml-lotes/${IMOVEL_ID}`).then(r => r.json()),
        apiFetch(`${API}/efdreinf/aliquotas`).then(r => r.json()),
      ]);
      setDashboard(dash);
      setR2055List(Array.isArray(r55) ? r55 : []);
      setR2010List(Array.isArray(r10) ? r10 : []);
      setApuracaoList(Array.isArray(ap) ? ap : []);
      setXmlLotes(Array.isArray(lotes) ? lotes : []);
      setAliquotas(aliq);
    } catch { showMsg("Erro ao carregar dados.", "err"); }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const showMsg = (m: string, t: "ok"|"err" = "ok") => {
    setMsg(m); setMsgType(t); setTimeout(() => setMsg(""), 5000);
  };

  // ── Preview de cálculo ───────────────────────────────────────────────────
  const calcPreview = () => {
    const vb = parseFloat(f2055.valor_bruto) || 0;
    const af = parseFloat(f2055.aliquota_funrural) || 0;
    const as_ = parseFloat(f2055.aliquota_senar) || 0;
    return {
      funrural: vb * af,
      senar: vb * as_,
      total: vb * (af + as_),
    };
  };
  const calcPreviewR2010 = () => {
    const vb = parseFloat(f2010.valor_bruto) || 0;
    const ar = parseFloat(f2010.aliquota_retencao) || 0;
    return { retido: vb * ar };
  };

  // ── Submeter R-2055 ──────────────────────────────────────────────────────
  const submitR2055 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f2055.cnpj_adquirente || !f2055.valor_bruto) return showMsg("Preencha CNPJ e valor.", "err");
    const comp = f2055.data_nota.substring(0, 7);
    const res = await apiFetch(`${API}/efdreinf/r2055`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: IMOVEL_ID, competencia: comp, ...f2055,
        valor_bruto: parseFloat(f2055.valor_bruto),
        aliquota_funrural: parseFloat(f2055.aliquota_funrural),
        aliquota_senar: parseFloat(f2055.aliquota_senar),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      showMsg(`✅ Venda registrada. FUNRURAL: ${fmt(data.valor_funrural)} | SENAR: ${fmt(data.valor_senar)}`);
      setF2055(p => ({ ...p, cnpj_adquirente: "", nome_adquirente: "", numero_nota: "", valor_bruto: "" }));
      carregar();
    } else { const e = await res.json(); showMsg(e.detail || "Erro ao registrar venda.", "err"); }
  };

  // ── Submeter R-2010 ──────────────────────────────────────────────────────
  const submitR2010 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f2010.cnpj_prestador || !f2010.valor_bruto) return showMsg("Preencha CNPJ e valor.", "err");
    const comp = f2010.data_nota.substring(0, 7);
    const res = await apiFetch(`${API}/efdreinf/r2010`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: IMOVEL_ID, competencia: comp, ...f2010,
        valor_bruto: parseFloat(f2010.valor_bruto),
        aliquota_retencao: parseFloat(f2010.aliquota_retencao),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      showMsg(`✅ Serviço registrado. INSS retido: ${fmt(data.valor_retido)}`);
      setF2010(p => ({ ...p, cnpj_prestador: "", nome_prestador: "", numero_nota: "", valor_bruto: "" }));
      carregar();
    } else { const e = await res.json(); showMsg(e.detail || "Erro ao registrar serviço.", "err"); }
  };

  // ── Gerar R-2055 a partir de acerto ─────────────────────────────────────
  const gerarR2055FromAcerto = async (acertoId: number) => {
    const res = await apiFetch(`${API}/efdreinf/r2055/from-acerto/${acertoId}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      showMsg(`✅ R-2055 gerado automaticamente (competência ${data.competencia}). Verifique o CNPJ do adquirente.`);
      carregar();
    } else { const e = await res.json(); showMsg(e.detail || "Erro ao gerar R-2055.", "err"); }
  };

  // ── Excluir ──────────────────────────────────────────────────────────────
  const excluirR2055 = async (id: number) => {
    if (!confirm("Excluir este registro?")) return;
    const res = await apiFetch(`${API}/efdreinf/r2055/${id}`, { method: "DELETE" });
    if (res.ok) { showMsg("Registro excluído."); carregar(); }
    else { const e = await res.json(); showMsg(e.detail || "Erro ao excluir.", "err"); }
  };
  const excluirR2010 = async (id: number) => {
    if (!confirm("Excluir este registro?")) return;
    const res = await apiFetch(`${API}/efdreinf/r2010/${id}`, { method: "DELETE" });
    if (res.ok) { showMsg("Registro excluído."); carregar(); }
    else { const e = await res.json(); showMsg(e.detail || "Erro ao excluir.", "err"); }
  };

  // ── Marcar DARF pago ─────────────────────────────────────────────────────
  const marcarPago = async (id: number) => {
    if (!pagtoValor) return showMsg("Informe o valor pago.", "err");
    const res = await apiFetch(
      `${API}/efdreinf/apuracao/${id}/pago?data_pagamento=${pagtoData}&valor_pago=${pagtoValor}`,
      { method: "PATCH" }
    );
    if (res.ok) { showMsg("✅ DARF marcado como pago."); setPagandoId(null); carregar(); }
    else showMsg("Erro ao marcar pagamento.", "err");
  };

  // ── Baixar XML ───────────────────────────────────────────────────────────
  const baixarXml = async (comp: string) => {
    const url = `${API}/efdreinf/xml/${IMOVEL_ID}/${comp}?tipo=r2055`;
    try {
      const res = await apiFetch(url);
      if (!res.ok) { const e = await res.json(); return showMsg(e.detail || "Erro ao gerar XML.", "err"); }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `reinf_R2055_${comp}_${IMOVEL_ID}.xml`;
      a.click();
      showMsg(`✅ XML R-2055 ${comp} baixado com sucesso.`);
      carregar();
    } catch { showMsg("Erro ao baixar XML.", "err"); }
  };

  const prev = calcPreview();
  const prev10 = calcPreviewR2010();

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f0e8]">
      {/* Header */}
      <div className="bg-[#1a4d2e] text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <span className="text-3xl">📋</span>
          <div>
            <h1 className="text-xl font-bold">EFD-Reinf</h1>
            <p className="text-sm text-green-200">Escrituração Fiscal Digital — Imóvel #{IMOVEL_ID}</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <a href="/contratos/acerto" className="text-green-200 hover:text-white text-sm">🌾 Acertos</a>
            <a href="/" className="text-green-200 hover:text-white text-sm">← Voltar</a>
          </div>
        </div>
      </div>

      {/* Alerta legal */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-2">
        <div className="max-w-6xl mx-auto text-xs text-blue-800 flex flex-wrap gap-4">
          <span><strong>📌 IN RFB 2.237/2024</strong> — FUNRURAL 1,87% + SENAR 0,11%</span>
          <span>Entrega: até dia <strong>15</strong> do mês seguinte</span>
          <span>DARF: até dia <strong>20</strong> do mês seguinte</span>
          <span className="text-orange-700"><strong>⚠️ LC 214/2024</strong> — Reforma Tributária (CBS/IBS) vigência 2027+</span>
        </div>
      </div>

      {msg && (
        <div className="max-w-6xl mx-auto mt-3 px-6">
          <div className={`border rounded px-4 py-2 text-sm ${
            msgType === "ok"
              ? "bg-green-100 border-green-300 text-green-800"
              : "bg-red-100 border-red-300 text-red-800"
          }`}>{msg}</div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Abas */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm border border-gray-200 w-fit">
          {[
            { id: "dashboard", label: "📊 Painel" },
            { id: "r2055",     label: "🌾 R-2055 Vendas" },
            { id: "r2010",     label: "🔧 R-2010 Serviços" },
            { id: "apuracao",  label: "📅 Apuração" },
            { id: "xml",       label: "📄 XML" },
            { id: "darf",      label: "🧾 DARF" },
            { id: "aliquotas", label: "📐 Alíquotas" },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as Aba)}
              className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                aba === a.id ? "bg-[#1a4d2e] text-white shadow" : "text-gray-600 hover:bg-gray-100"
              }`}>
              {a.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center text-gray-400 py-8">Carregando...</div>}

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        {aba === "dashboard" && dashboard && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Receita Bruta (ano)", value: fmt(dashboard.kpis.receita_bruta_ano), color: "text-green-700", icon: "💰" },
                { label: "FUNRURAL (ano)",       value: fmt(dashboard.kpis.funrural_ano),       color: "text-orange-600", icon: "🏛️" },
                { label: "SENAR (ano)",           value: fmt(dashboard.kpis.senar_ano),           color: "text-blue-600", icon: "📚" },
                { label: "Total a Recolher",      value: fmt(dashboard.kpis.total_recolher_ano),  color: "text-red-600", icon: "⚠️" },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{k.icon}</span>
                    <p className="text-xs text-gray-500">{k.label}</p>
                  </div>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Acertos pendentes de R-2055 */}
            {dashboard.acertos_sem_r2055.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                <h3 className="font-semibold text-amber-800 mb-3">
                  🔗 Acertos de Contrato sem R-2055 ({dashboard.acertos_sem_r2055.length})
                </h3>
                <p className="text-xs text-amber-700 mb-3">
                  Os acertos abaixo ainda não geraram evento R-2055. Clique em "Gerar R-2055" para integrar automaticamente.
                </p>
                <div className="space-y-2">
                  {dashboard.acertos_sem_r2055.map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-white rounded p-3 border border-amber-100">
                      <div>
                        <span className="font-medium text-gray-800">{a.arrendatario_nome}</span>
                        <span className="ml-2 text-xs text-gray-500">Safra {a.safra} · {a.produto}</span>
                        {a.data_pagamento && (
                          <span className="ml-2 text-xs text-gray-400">Pago: {fmtData(a.data_pagamento)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-green-700">{fmt(a.valor_bruto)}</span>
                        <button
                          onClick={() => gerarR2055FromAcerto(a.id)}
                          className="text-xs bg-[#1a4d2e] text-white px-3 py-1.5 rounded hover:bg-green-800 transition-colors">
                          Gerar R-2055
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competências em aberto */}
            {dashboard.pendentes.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h3 className="font-semibold text-yellow-800 mb-3">⚠️ Competências em Aberto</h3>
                <div className="space-y-2">
                  {dashboard.pendentes.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-white rounded p-3 border border-yellow-100">
                      <div>
                        <span className="font-medium text-gray-800">{p.competencia}</span>
                        <span className="ml-3 text-sm text-gray-500">Venc.: {fmtData(p.data_vencimento)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-600">{fmt(p.total_a_recolher)}</span>
                        <button onClick={() => baixarXml(p.competencia)}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                          📄 XML
                        </button>
                        <button onClick={() => { setPagandoId(p.id); setPagtoValor(String(p.total_a_recolher)); setAba("apuracao"); }}
                          className="text-xs bg-[#1a4d2e] text-white px-2 py-1 rounded hover:bg-green-800">
                          Pagar DARF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Últimas vendas */}
            {dashboard.ultimas_vendas.length > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-3">📋 Últimas Vendas Registradas</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b text-xs">
                    <th className="pb-2">Competência</th><th>Produto</th>
                    <th className="text-right">Valor Bruto</th><th className="text-right">Total Retido</th>
                    <th className="text-center">Origem</th>
                  </tr></thead>
                  <tbody>
                    {dashboard.ultimas_vendas.map((v, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2">{v.competencia}</td>
                        <td>{TIPOS_PRODUTO.find(t => t.value === v.tipo_produto)?.label ?? v.tipo_produto}</td>
                        <td className="text-right">{fmt(v.valor_bruto)}</td>
                        <td className="text-right text-orange-600">{fmt(v.valor_total_retido)}</td>
                        <td className="text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ORIGEM_BADGE[v.origem] ?? "bg-gray-100"}`}>
                            {v.origem === "acerto_contrato" ? "🔗 Acerto" : v.origem === "importacao" ? "📥 Import." : "✏️ Manual"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dashboard.pendentes.length === 0 && dashboard.ultimas_vendas.length === 0 && dashboard.acertos_sem_r2055.length === 0 && (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-gray-600 font-medium">Nenhum evento registrado ainda.</p>
                <p className="text-sm text-gray-400 mt-1">Use as abas <strong>R-2055 Vendas</strong> e <strong>R-2010 Serviços</strong> para lançar os eventos do mês.</p>
              </div>
            )}
          </div>
        )}

        {/* ── R-2055 VENDAS ─────────────────────────────────────────────── */}
        {aba === "r2055" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-4">➕ Registrar Venda de Produção Rural (R-2055)</h3>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-sm text-blue-700">
                <strong>R-2055</strong> — Informe cada nota fiscal de venda para empresa (indústria, cooperativa, laticínio, frigorífico).
                FUNRURAL (<strong>1,87%</strong>) e SENAR (<strong>0,11%</strong>) calculados automaticamente sobre o valor bruto.
              </div>
              <form onSubmit={submitR2055} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">CNPJ do Adquirente *</label>
                  <input value={f2055.cnpj_adquirente} onChange={e => setF2055(p=>({...p,cnpj_adquirente:e.target.value}))}
                    placeholder="00.000.000/0001-00" className="w-full border rounded px-3 py-2 text-sm" required />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Nome do Adquirente</label>
                  <input value={f2055.nome_adquirente} onChange={e => setF2055(p=>({...p,nome_adquirente:e.target.value}))}
                    placeholder="Frigorífico / Cooperativa / Laticínio" className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Data da Nota *</label>
                  <input type="date" value={f2055.data_nota} onChange={e => setF2055(p=>({...p,data_nota:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Nº da Nota</label>
                  <input value={f2055.numero_nota} onChange={e => setF2055(p=>({...p,numero_nota:e.target.value}))}
                    placeholder="000001" className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo de Produto *</label>
                  <select value={f2055.tipo_produto} onChange={e => setF2055(p=>({...p,tipo_produto:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {TIPOS_PRODUTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Valor Bruto (R$) *</label>
                  <input type="number" step="0.01" value={f2055.valor_bruto}
                    onChange={e => setF2055(p=>({...p,valor_bruto:e.target.value}))}
                    placeholder="0,00" className="w-full border rounded px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Alíq. FUNRURAL</label>
                  <input type="number" step="0.0001" value={f2055.aliquota_funrural}
                    onChange={e => setF2055(p=>({...p,aliquota_funrural:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Alíq. SENAR</label>
                  <input type="number" step="0.0001" value={f2055.aliquota_senar}
                    onChange={e => setF2055(p=>({...p,aliquota_senar:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input type="checkbox" id="ret" checked={f2055.retencao_pelo_adquirente}
                    onChange={e => setF2055(p=>({...p,retencao_pelo_adquirente:e.target.checked}))} />
                  <label htmlFor="ret" className="text-xs text-gray-600">Retenção pelo adquirente</label>
                </div>
                {/* Preview em tempo real */}
                {parseFloat(f2055.valor_bruto) > 0 && (
                  <div className="col-span-4 bg-green-50 border border-green-200 rounded p-3 text-sm">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div><p className="text-xs text-gray-500">FUNRURAL</p><p className="font-bold text-orange-600">{fmt(prev.funrural)}</p></div>
                      <div><p className="text-xs text-gray-500">SENAR</p><p className="font-bold text-blue-600">{fmt(prev.senar)}</p></div>
                      <div><p className="text-xs text-gray-500">Total Retido</p><p className="font-bold text-red-600">{fmt(prev.total)}</p></div>
                    </div>
                  </div>
                )}
                <div className="col-span-4">
                  <button type="submit" className="bg-[#1a4d2e] text-white px-6 py-2 rounded hover:bg-green-800 text-sm font-medium transition-colors">
                    Registrar Venda
                  </button>
                </div>
              </form>
            </div>

            {/* Histórico R-2055 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">📋 Histórico R-2055 ({r2055List.length})</h3>
              {r2055List.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Nenhum evento registrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 border-b text-xs">
                      <th className="pb-2">Competência</th><th>Adquirente</th><th>Produto</th>
                      <th className="text-right">Bruto</th><th className="text-right">FUNRURAL</th>
                      <th className="text-right">SENAR</th><th className="text-center">Origem</th>
                      <th className="text-center">Status</th><th></th>
                    </tr></thead>
                    <tbody>
                      {r2055List.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2">{r.competencia}</td>
                          <td className="max-w-[120px] truncate" title={r.nome_adquirente}>{r.nome_adquirente || r.cnpj_adquirente}</td>
                          <td>{TIPOS_PRODUTO.find(t => t.value === r.tipo_produto)?.label ?? r.tipo_produto}</td>
                          <td className="text-right">{fmt(r.valor_bruto)}</td>
                          <td className="text-right text-orange-600">{fmt(r.valor_funrural)}</td>
                          <td className="text-right text-blue-600">{fmt(r.valor_senar)}</td>
                          <td className="text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${ORIGEM_BADGE[r.origem] ?? "bg-gray-100"}`}>
                              {r.origem === "acerto_contrato" ? "🔗" : r.origem === "importacao" ? "📥" : "✏️"}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? "bg-gray-100"}`}>
                              {r.status}
                            </span>
                          </td>
                          <td>
                            {r.status !== "transmitido" && (
                              <button onClick={() => excluirR2055(r.id)}
                                className="text-red-400 hover:text-red-600 text-xs px-2">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── R-2010 SERVIÇOS ───────────────────────────────────────────── */}
        {aba === "r2010" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-4">➕ Registrar Serviço Tomado com Cessão de Mão de Obra (R-2010)</h3>
              <div className="bg-purple-50 border border-purple-200 rounded p-3 mb-4 text-sm text-purple-700">
                <strong>R-2010</strong> — Informe serviços contratados com cessão de mão de obra (colheita, tratorista, construção).
                INSS retido: <strong>11%</strong> sobre o valor bruto.
              </div>
              <form onSubmit={submitR2010} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">CNPJ do Prestador *</label>
                  <input value={f2010.cnpj_prestador} onChange={e => setF2010(p=>({...p,cnpj_prestador:e.target.value}))}
                    placeholder="00.000.000/0001-00" className="w-full border rounded px-3 py-2 text-sm" required />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Nome do Prestador</label>
                  <input value={f2010.nome_prestador} onChange={e => setF2010(p=>({...p,nome_prestador:e.target.value}))}
                    placeholder="Empresa de serviços" className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Data da Nota *</label>
                  <input type="date" value={f2010.data_nota} onChange={e => setF2010(p=>({...p,data_nota:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Nº da Nota</label>
                  <input value={f2010.numero_nota} onChange={e => setF2010(p=>({...p,numero_nota:e.target.value}))}
                    placeholder="000001" className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo de Serviço *</label>
                  <select value={f2010.tipo_servico} onChange={e => setF2010(p=>({...p,tipo_servico:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {TIPOS_SERVICO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Valor Bruto (R$) *</label>
                  <input type="number" step="0.01" value={f2010.valor_bruto}
                    onChange={e => setF2010(p=>({...p,valor_bruto:e.target.value}))}
                    placeholder="0,00" className="w-full border rounded px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Alíq. Retenção INSS</label>
                  <input type="number" step="0.0001" value={f2010.aliquota_retencao}
                    onChange={e => setF2010(p=>({...p,aliquota_retencao:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                {parseFloat(f2010.valor_bruto) > 0 && (
                  <div className="col-span-4 bg-purple-50 border border-purple-200 rounded p-3 text-sm text-center">
                    <span className="text-xs text-gray-500">INSS a Reter: </span>
                    <span className="font-bold text-purple-700">{fmt(prev10.retido)}</span>
                  </div>
                )}
                <div className="col-span-4">
                  <button type="submit" className="bg-[#1a4d2e] text-white px-6 py-2 rounded hover:bg-green-800 text-sm font-medium transition-colors">
                    Registrar Serviço
                  </button>
                </div>
              </form>
            </div>

            {/* Histórico R-2010 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">📋 Histórico R-2010 ({r2010List.length})</h3>
              {r2010List.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Nenhum evento registrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 border-b text-xs">
                      <th className="pb-2">Competência</th><th>Prestador</th><th>Serviço</th>
                      <th className="text-right">Bruto</th><th className="text-right">INSS Retido</th>
                      <th className="text-center">Status</th><th></th>
                    </tr></thead>
                    <tbody>
                      {r2010List.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2">{r.competencia}</td>
                          <td className="max-w-[120px] truncate" title={r.nome_prestador}>{r.nome_prestador || r.cnpj_prestador}</td>
                          <td>{TIPOS_SERVICO.find(t => t.value === r.tipo_servico)?.label ?? r.tipo_servico}</td>
                          <td className="text-right">{fmt(r.valor_bruto)}</td>
                          <td className="text-right text-purple-600">{fmt(r.valor_retido)}</td>
                          <td className="text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? "bg-gray-100"}`}>{r.status}</span>
                          </td>
                          <td>
                            {r.status !== "transmitido" && (
                              <button onClick={() => excluirR2010(r.id)}
                                className="text-red-400 hover:text-red-600 text-xs px-2">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── APURAÇÃO ──────────────────────────────────────────────────── */}
        {aba === "apuracao" && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-700 mb-4">📅 Apuração Mensal FUNRURAL</h3>
            {apuracaoList.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Nenhuma apuração gerada. Registre eventos R-2055 ou R-2010 para gerar a apuração automaticamente.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b text-xs">
                    <th className="pb-2">Competência</th>
                    <th className="text-right">Receita Bruta</th>
                    <th className="text-right">FUNRURAL</th>
                    <th className="text-right">SENAR</th>
                    <th className="text-right">INSS Serv.</th>
                    <th className="text-right">Total DARF</th>
                    <th className="text-center">Vencimento</th>
                    <th className="text-center">Status</th>
                    <th></th>
                  </tr></thead>
                  <tbody>
                    {apuracaoList.map(ap => (
                      <tr key={ap.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 font-medium">{ap.competencia}</td>
                        <td className="text-right">{fmt(ap.total_receita_bruta)}</td>
                        <td className="text-right text-orange-600">{fmt(ap.total_funrural)}</td>
                        <td className="text-right text-blue-600">{fmt(ap.total_senar)}</td>
                        <td className="text-right text-purple-600">{fmt(ap.total_inss_servicos)}</td>
                        <td className="text-right font-bold text-red-600">{fmt(ap.total_a_recolher)}</td>
                        <td className="text-center text-xs">{fmtData(ap.data_vencimento)}</td>
                        <td className="text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[ap.status_darf] ?? "bg-gray-100"}`}>
                            {ap.status_darf}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => baixarXml(ap.competencia)}
                              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
                              📄 XML
                            </button>
                            {ap.status_darf === "em_aberto" && (
                              pagandoId === ap.id ? (
                                <div className="flex gap-1 items-center">
                                  <input type="date" value={pagtoData} onChange={e => setPagtoData(e.target.value)}
                                    className="border rounded px-1 py-0.5 text-xs w-28" />
                                  <input type="number" step="0.01" value={pagtoValor}
                                    onChange={e => setPagtoValor(e.target.value)}
                                    placeholder="Valor" className="border rounded px-1 py-0.5 text-xs w-24" />
                                  <button onClick={() => marcarPago(ap.id)}
                                    className="text-xs bg-green-600 text-white px-2 py-1 rounded">✓</button>
                                  <button onClick={() => setPagandoId(null)}
                                    className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">✕</button>
                                </div>
                              ) : (
                                <button onClick={() => { setPagandoId(ap.id); setPagtoValor(String(ap.total_a_recolher)); }}
                                  className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">
                                  Pagar
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── XML ───────────────────────────────────────────────────────── */}
        {aba === "xml" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-2">📄 Gerar XML EFD-Reinf (schema v2.01.01)</h3>
              <p className="text-sm text-gray-500 mb-4">
                Selecione a competência e clique em "Baixar XML" para gerar o arquivo para transmissão à RFB.
                O XML é gerado conforme o schema EFD-Reinf v2.01.01 (NT 2024/001).
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-sm text-yellow-800">
                <strong>⚠️ Atenção:</strong> A transmissão do XML à RFB requer certificado digital A1/A3.
                O RuralCaixa gera o arquivo XML — a transmissão deve ser feita pelo contribuinte ou contador
                via <a href="https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/efd-reinf" target="_blank" className="underline">Portal e-CAC</a> ou sistema de transmissão homologado.
              </div>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Competência</label>
                  <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
                    className="border rounded px-3 py-2 text-sm" />
                </div>
                <button onClick={() => baixarXml(competencia)}
                  className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 text-sm font-medium transition-colors">
                  📥 Baixar XML R-2055
                </button>
              </div>
            </div>

            {/* Histórico de lotes XML */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">📂 Lotes XML Gerados ({xmlLotes.length})</h3>
              {xmlLotes.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Nenhum lote gerado ainda.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b text-xs">
                    <th className="pb-2">Competência</th><th>Evento</th>
                    <th className="text-center">Qtd.</th><th className="text-right">Valor Total</th>
                    <th className="text-center">Status</th><th>Gerado em</th>
                  </tr></thead>
                  <tbody>
                    {xmlLotes.map(l => (
                      <tr key={l.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{l.competencia}</td>
                        <td><span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{l.tipo_evento}</span></td>
                        <td className="text-center">{l.qtd_eventos}</td>
                        <td className="text-right">{fmt(l.valor_total)}</td>
                        <td className="text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[l.status] ?? "bg-gray-100"}`}>{l.status}</span>
                        </td>
                        <td className="text-xs text-gray-500">{fmtData(l.data_geracao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── DARF ──────────────────────────────────────────────────────── */}
        {aba === "darf" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">🧾 Emissão de DARF — FUNRURAL</h3>
              <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800 mb-4">
                <p className="font-medium mb-2">Como emitir o DARF numerado:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Acesse <a href="https://sicalc.receita.fazenda.gov.br" target="_blank" className="underline font-medium">sicalc.receita.fazenda.gov.br</a></li>
                  <li>Clique em <strong>Preenchimento Rápido</strong></li>
                  <li>Informe o código de receita, período de apuração e valor abaixo</li>
                  <li>Imprima ou salve o DARF com código de barras</li>
                </ol>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Array.isArray(apuracaoList) ? apuracaoList : []).filter(ap => ap.status_darf === "em_aberto").map(ap => (
                  <div key={ap.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-gray-800">Competência: {ap.competencia}</p>
                        <p className="text-xs text-gray-500">Vencimento: {fmtData(ap.data_vencimento)}</p>
                      </div>
                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">em aberto</span>
                    </div>
                    <table className="w-full text-sm mb-3">
                      <tbody>
                        <tr><td className="text-gray-500 py-0.5">Código de Receita</td><td className="font-mono font-bold text-right">{ap.codigo_receita_darf}</td></tr>
                        <tr><td className="text-gray-500 py-0.5">FUNRURAL</td><td className="text-right text-orange-600">{fmt(ap.total_funrural)}</td></tr>
                        <tr><td className="text-gray-500 py-0.5">SENAR</td><td className="text-right text-blue-600">{fmt(ap.total_senar)}</td></tr>
                        {ap.total_inss_servicos > 0 && (
                          <tr><td className="text-gray-500 py-0.5">INSS Serviços</td><td className="text-right text-purple-600">{fmt(ap.total_inss_servicos)}</td></tr>
                        )}
                        <tr className="border-t"><td className="font-bold py-1">Total a Recolher</td><td className="font-bold text-right text-red-600">{fmt(ap.total_a_recolher)}</td></tr>
                      </tbody>
                    </table>
                    <a href={`https://sicalc.receita.fazenda.gov.br/sicalc/rapido/contribuinte?codigo=${ap.codigo_receita_darf}&periodo_apuracao=${ap.competencia}`}
                      target="_blank"
                      className="block w-full text-center bg-[#1a4d2e] text-white py-2 rounded text-sm hover:bg-green-800 transition-colors">
                      Abrir SICALC →
                    </a>
                  </div>
                ))}
                {(Array.isArray(apuracaoList) ? apuracaoList : []).filter(ap => ap.status_darf === "em_aberto").length === 0 && (
                  <div className="col-span-2 text-center py-8 text-gray-400">
                    <p className="text-2xl mb-2">✅</p>
                    <p>Nenhum DARF em aberto. Todas as competências estão pagas.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ALÍQUOTAS ─────────────────────────────────────────────────── */}
        {aba === "aliquotas" && aliquotas && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-4">📐 Alíquotas Vigentes — IN RFB 2.237/2024</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(aliquotas.vigentes || {}).map(([key, info]: [string, any]) => (
                  <div key={key} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold text-gray-800 text-sm">{info.descricao || key.replace(/_/g," ").toUpperCase()}</p>
                      <span className="bg-green-100 text-green-800 font-bold text-sm px-3 py-1 rounded-full">{info.percentual}</span>
                    </div>
                    {info.base_legal && <p className="text-xs text-gray-500">📋 {info.base_legal}</p>}
                    {info.base_calculo && <p className="text-xs text-gray-400 mt-1">Base: {info.base_calculo}</p>}
                    {info.contribuinte && <p className="text-xs text-blue-600 mt-1">👤 {info.contribuinte}</p>}
                    {info.aplicacao && <p className="text-xs text-purple-600 mt-1">🔧 {info.aplicacao}</p>}
                    {info.destino && <p className="text-xs text-teal-600 mt-1">🎯 {info.destino}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Reforma Tributária */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
              <h3 className="font-semibold text-orange-800 mb-3">⚠️ Reforma Tributária — LC 214/2024</h3>
              <div className="bg-white rounded-lg p-4 border border-orange-100 mb-4">
                <p className="text-sm text-gray-700 mb-3">
                  A Lei Complementar 214/2024 institui a Reforma Tributária que substituirá PIS/COFINS pela <strong>CBS</strong>
                  e ICMS/ISS pelo <strong>IBS</strong>, com vigência a partir de <strong>01/01/2027</strong> (período de transição 2027–2033).
                  O impacto sobre o FUNRURAL ainda está em regulamentação.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-orange-50 rounded p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">CBS (estimativa)</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {((aliquotas.reforma_tributaria_lc214_2024?.cbs?.aliquota_estimada ?? 0) * 100).toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-400">substitui PIS/COFINS</p>
                  </div>
                  <div className="bg-blue-50 rounded p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">IBS (estimativa)</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {((aliquotas.reforma_tributaria_lc214_2024?.ibs?.aliquota_estimada ?? 0) * 100).toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-400">substitui ICMS/ISS</p>
                  </div>
                </div>
              </div>
              <div className="text-xs text-orange-700 bg-orange-100 rounded p-3">
                <strong>⚠️ Atenção:</strong> As alíquotas CBS/IBS são estimativas baseadas na LC 214/2024.
                As alíquotas definitivas serão fixadas pelo Comitê Gestor do IBS e pela regulamentação complementar.
                O RuralCaixa será atualizado assim que as alíquotas forem oficializadas.
              </div>
            </div>

            {/* Prazos */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">📅 Prazos e Penalidades</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {Object.entries(aliquotas.prazos || {}).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-lg">
                      {k.includes("entrega") ? "📤" : k.includes("pagamento") ? "💳" : "⚠️"}
                    </span>
                    <div>
                      <p className="text-xs text-gray-500">{k.replace(/_/g," ")}</p>
                      <p className="font-medium text-gray-800">{String(v)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
