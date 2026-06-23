"use client";
/**
 * RuralCaixa — Módulo EFD-Reinf
 * Eventos R-2055 (comercialização), R-2010 (serviços), Apuração FUNRURAL, DARF
 * Base legal: IN RFB 2.237/2024 | Decreto 9.580/2018 | Lei 8.212/1991
 */
import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Dashboard {
  kpis: {
    receita_bruta_ano: number;
    funrural_ano: number;
    senar_ano: number;
    inss_servicos_ano: number;
    total_recolher_ano: number;
    em_aberto: number;
    pagos: number;
  };
  pendentes: Apuracao[];
  ultimas_vendas: R2055[];
}
interface R2055 {
  id: number; competencia: string; cnpj_adquirente: string; nome_adquirente: string;
  data_nota: string; numero_nota: string; tipo_produto: string;
  valor_bruto: number; valor_funrural: number; valor_senar: number;
  valor_total_retido: number; retencao_pelo_adquirente: boolean; status: string;
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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "R$ 0,00";
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const hoje = () => new Date().toISOString().split("T")[0];

const TIPOS_PRODUTO = [
  { value: "bovino",  label: "🐂 Bovino" },
  { value: "suino",   label: "🐖 Suíno" },
  { value: "ovino",   label: "🐑 Ovino" },
  { value: "caprino", label: "🐐 Caprino" },
  { value: "aves",    label: "🐔 Aves" },
  { value: "leite",   label: "🥛 Leite" },
  { value: "graos",   label: "🌾 Grãos" },
  { value: "frutas",  label: "🍎 Frutas" },
  { value: "acai",    label: "🌴 Açaí" },
  { value: "outros",  label: "📦 Outros" },
];
const TIPOS_SERVICO = [
  { value: "colheita",   label: "🌾 Colheita terceirizada" },
  { value: "tratorista", label: "🚜 Tratorista / máquinas" },
  { value: "construcao", label: "🏗️ Construção / cercas" },
  { value: "transporte", label: "🚛 Transporte de carga" },
  { value: "irrigacao",  label: "💧 Irrigação" },
  { value: "outros",     label: "🔧 Outros serviços" },
];
const STATUS_BADGE: Record<string, string> = {
  em_aberto: "bg-yellow-100 text-yellow-800",
  gerado:    "bg-blue-100 text-blue-800",
  pago:      "bg-green-100 text-green-800",
  compensado:"bg-purple-100 text-purple-800",
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function EfdReinfPage() {
  const [aba, setAba] = useState<"dashboard"|"r2055"|"r2010"|"apuracao"|"darf">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [r2055List, setR2055List] = useState<R2055[]>([]);
  const [r2010List, setR2010List] = useState<R2010[]>([]);
  const [apuracaoList, setApuracaoList] = useState<Apuracao[]>([]);
  const [competencia, setCompetencia] = useState(mesAtual());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Formulário R-2055
  const [f2055, setF2055] = useState({
    cnpj_adquirente: "", nome_adquirente: "", data_nota: hoje(),
    numero_nota: "", tipo_produto: "bovino", valor_bruto: "",
    aliquota_funrural: "0.0187", aliquota_senar: "0.0011",
    retencao_pelo_adquirente: true,
  });
  // Formulário R-2010
  const [f2010, setF2010] = useState({
    cnpj_prestador: "", nome_prestador: "", data_nota: hoje(),
    numero_nota: "", tipo_servico: "outros", valor_bruto: "",
    aliquota_retencao: "0.11", cessao_mao_obra: true,
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, r55, r10, ap] = await Promise.all([
        fetch(`${API}/efdreinf/dashboard/${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/efdreinf/r2055/${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/efdreinf/r2010/${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/efdreinf/apuracao/${IMOVEL_ID}`).then(r => r.json()),
      ]);
      setDashboard(dash);
      setR2055List(Array.isArray(r55) ? r55 : []);
      setR2010List(Array.isArray(r10) ? r10 : []);
      setApuracaoList(Array.isArray(ap) ? ap : []);
    } catch { setMsg("Erro ao carregar dados."); }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  // ── Submeter R-2055 ──────────────────────────────────────────────────────
  const submitR2055 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f2055.cnpj_adquirente || !f2055.valor_bruto) return showMsg("Preencha CNPJ e valor.");
    const comp = f2055.data_nota.substring(0, 7);
    const res = await fetch(`${API}/efdreinf/r2055`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    } else showMsg("Erro ao registrar venda.");
  };

  // ── Submeter R-2010 ──────────────────────────────────────────────────────
  const submitR2010 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f2010.cnpj_prestador || !f2010.valor_bruto) return showMsg("Preencha CNPJ e valor.");
    const comp = f2010.data_nota.substring(0, 7);
    const res = await fetch(`${API}/efdreinf/r2010`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    } else showMsg("Erro ao registrar serviço.");
  };

  const excluirR2055 = async (id: number) => {
    if (!confirm("Excluir este registro?")) return;
    await fetch(`${API}/efdreinf/r2055/${id}`, { method: "DELETE" });
    carregar();
  };
  const excluirR2010 = async (id: number) => {
    if (!confirm("Excluir este registro?")) return;
    await fetch(`${API}/efdreinf/r2010/${id}`, { method: "DELETE" });
    carregar();
  };

  // ── Render ───────────────────────────────────────────────────────────────
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
          <a href="/" className="ml-auto text-green-200 hover:text-white text-sm">← Voltar</a>
        </div>
      </div>

      {/* Alerta legal */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
        <div className="max-w-6xl mx-auto text-sm text-blue-800">
          <strong>📌 Base Legal:</strong> IN RFB 2.237/2024 | Alíquotas: FUNRURAL 1,87% + SENAR 0,11% sobre receita bruta.
          Prazo de entrega: até o dia 15 do mês seguinte. Multa por atraso: a partir de R$ 200,00/mês.
          <span className="ml-2 font-medium">Eventos obrigatórios: R-2055 (vendas) · R-2010 (serviços tomados com cessão de mão de obra).</span>
        </div>
      </div>

      {msg && (
        <div className="max-w-6xl mx-auto mt-3 px-6">
          <div className="bg-green-100 border border-green-300 text-green-800 rounded px-4 py-2 text-sm">{msg}</div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Abas */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm border border-gray-200 w-fit">
          {[
            { id: "dashboard", label: "📊 Painel" },
            { id: "r2055",     label: "🐄 R-2055 Vendas" },
            { id: "r2010",     label: "🔧 R-2010 Serviços" },
            { id: "apuracao",  label: "📅 Apuração" },
            { id: "darf",      label: "🧾 DARF" },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as typeof aba)}
              className={`px-4 py-2 rounded text-sm font-medium transition-all ${
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Receita Bruta (ano)", value: fmt(dashboard.kpis.receita_bruta_ano), color: "text-green-700" },
                { label: "FUNRURAL (ano)",       value: fmt(dashboard.kpis.funrural_ano),       color: "text-orange-600" },
                { label: "SENAR (ano)",           value: fmt(dashboard.kpis.senar_ano),           color: "text-blue-600" },
                { label: "INSS Serviços (ano)",   value: fmt(dashboard.kpis.inss_servicos_ano),   color: "text-purple-600" },
                { label: "Total a Recolher",      value: fmt(dashboard.kpis.total_recolher_ano),  color: "text-red-600" },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{k.label}</p>
                </div>
              ))}
            </div>

            {/* Pendentes */}
            {dashboard.pendentes.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h3 className="font-semibold text-yellow-800 mb-3">⚠️ Competências em Aberto</h3>
                <div className="space-y-2">
                  {dashboard.pendentes.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-white rounded p-3 border border-yellow-100">
                      <div>
                        <span className="font-medium text-gray-800">{p.competencia}</span>
                        <span className="ml-3 text-sm text-gray-500">Venc.: {p.data_vencimento ? new Date(p.data_vencimento).toLocaleDateString("pt-BR") : "—"}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-red-600">{fmt(p.total_a_recolher)}</span>
                        <button onClick={() => setAba("darf")}
                          className="ml-3 text-xs bg-[#1a4d2e] text-white px-2 py-1 rounded hover:bg-green-800">
                          Gerar DARF
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
                  <thead><tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Competência</th><th>Produto</th>
                    <th className="text-right">Valor Bruto</th><th className="text-right">Total Retido</th>
                  </tr></thead>
                  <tbody>
                    {dashboard.ultimas_vendas.map((v, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2">{v.competencia}</td>
                        <td>{TIPOS_PRODUTO.find(t => t.value === v.tipo_produto)?.label ?? v.tipo_produto}</td>
                        <td className="text-right">{fmt(v.valor_bruto)}</td>
                        <td className="text-right text-orange-600">{fmt(v.valor_total_retido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {dashboard.pendentes.length === 0 && dashboard.ultimas_vendas.length === 0 && (
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
                <strong>R-2055</strong> — Informe cada nota fiscal de venda de produção rural para empresa (indústria, cooperativa, laticínio, frigorífico).
                O FUNRURAL (1,87%) e SENAR (0,11%) são calculados automaticamente sobre o valor bruto.
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
                  <label className="text-xs text-gray-500 block mb-1">Alíquota FUNRURAL</label>
                  <input type="number" step="0.0001" value={f2055.aliquota_funrural}
                    onChange={e => setF2055(p=>({...p,aliquota_funrural:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Padrão: 1,87% (0,0187)</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Alíquota SENAR</label>
                  <input type="number" step="0.0001" value={f2055.aliquota_senar}
                    onChange={e => setF2055(p=>({...p,aliquota_senar:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Padrão: 0,11% (0,0011)</p>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={f2055.retencao_pelo_adquirente}
                      onChange={e => setF2055(p=>({...p,retencao_pelo_adquirente:e.target.checked}))}
                      className="w-4 h-4" />
                    Retenção pelo adquirente
                  </label>
                </div>
                {f2055.valor_bruto && (
                  <div className="col-span-2 md:col-span-4 bg-green-50 border border-green-200 rounded p-3 text-sm">
                    <strong>Prévia do cálculo:</strong>
                    <span className="ml-3">FUNRURAL: <strong>{fmt(parseFloat(f2055.valor_bruto||"0") * parseFloat(f2055.aliquota_funrural))}</strong></span>
                    <span className="ml-3">SENAR: <strong>{fmt(parseFloat(f2055.valor_bruto||"0") * parseFloat(f2055.aliquota_senar))}</strong></span>
                    <span className="ml-3">Total Retido: <strong className="text-orange-600">{fmt(parseFloat(f2055.valor_bruto||"0") * (parseFloat(f2055.aliquota_funrural) + parseFloat(f2055.aliquota_senar)))}</strong></span>
                  </div>
                )}
                <div className="col-span-2 md:col-span-4">
                  <button type="submit" className="bg-[#1a4d2e] text-white px-6 py-2 rounded hover:bg-green-800 text-sm font-medium">
                    + Registrar Venda
                  </button>
                </div>
              </form>
            </div>

            {/* Histórico R-2055 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">📋 Histórico de Vendas (R-2055)</h3>
              {r2055List.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Nenhuma venda registrada. Use o formulário acima para lançar as notas fiscais do mês.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 border-b text-xs">
                      <th className="pb-2">Competência</th><th>Adquirente</th><th>Produto</th>
                      <th className="text-right">Valor Bruto</th><th className="text-right">FUNRURAL</th>
                      <th className="text-right">SENAR</th><th className="text-right">Total Retido</th><th></th>
                    </tr></thead>
                    <tbody>
                      {r2055List.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2">{r.competencia}</td>
                          <td className="max-w-[120px] truncate">{r.nome_adquirente || r.cnpj_adquirente}</td>
                          <td>{TIPOS_PRODUTO.find(t=>t.value===r.tipo_produto)?.label ?? r.tipo_produto}</td>
                          <td className="text-right">{fmt(r.valor_bruto)}</td>
                          <td className="text-right text-orange-600">{fmt(r.valor_funrural)}</td>
                          <td className="text-right text-blue-600">{fmt(r.valor_senar)}</td>
                          <td className="text-right font-medium text-red-600">{fmt(r.valor_total_retido)}</td>
                          <td className="pl-2">
                            <button onClick={() => excluirR2055(r.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="font-bold text-gray-700 border-t">
                      <td colSpan={3} className="pt-2">Total</td>
                      <td className="text-right pt-2">{fmt(r2055List.reduce((s,r)=>s+r.valor_bruto,0))}</td>
                      <td className="text-right pt-2 text-orange-600">{fmt(r2055List.reduce((s,r)=>s+r.valor_funrural,0))}</td>
                      <td className="text-right pt-2 text-blue-600">{fmt(r2055List.reduce((s,r)=>s+r.valor_senar,0))}</td>
                      <td className="text-right pt-2 text-red-600">{fmt(r2055List.reduce((s,r)=>s+r.valor_total_retido,0))}</td>
                      <td></td>
                    </tr></tfoot>
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
              <h3 className="font-semibold text-gray-700 mb-4">➕ Registrar Serviço Tomado (R-2010)</h3>
              <div className="bg-purple-50 border border-purple-200 rounded p-3 mb-4 text-sm text-purple-700">
                <strong>R-2010</strong> — Informe serviços contratados com <strong>cessão de mão de obra</strong> (a empresa contratada traz seus próprios funcionários).
                Exemplos: colheita terceirizada, tratorista, construção de cercas. Retenção de INSS: 11%.
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
                    placeholder="Empresa prestadora de serviço" className="w-full border rounded px-3 py-2 text-sm" />
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
                  <label className="text-xs text-gray-500 block mb-1">Alíquota Retenção</label>
                  <input type="number" step="0.01" value={f2010.aliquota_retencao}
                    onChange={e => setF2010(p=>({...p,aliquota_retencao:e.target.value}))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Padrão: 11% (0,11)</p>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={f2010.cessao_mao_obra}
                      onChange={e => setF2010(p=>({...p,cessao_mao_obra:e.target.checked}))}
                      className="w-4 h-4" />
                    Cessão de mão de obra
                  </label>
                </div>
                {f2010.valor_bruto && (
                  <div className="col-span-2 md:col-span-4 bg-purple-50 border border-purple-200 rounded p-3 text-sm">
                    <strong>INSS a reter:</strong>
                    <strong className="ml-2 text-purple-700">{fmt(parseFloat(f2010.valor_bruto||"0") * parseFloat(f2010.aliquota_retencao))}</strong>
                  </div>
                )}
                <div className="col-span-2 md:col-span-4">
                  <button type="submit" className="bg-purple-700 text-white px-6 py-2 rounded hover:bg-purple-800 text-sm font-medium">
                    + Registrar Serviço
                  </button>
                </div>
              </form>
            </div>

            {/* Histórico R-2010 */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">📋 Histórico de Serviços (R-2010)</h3>
              {r2010List.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Nenhum serviço registrado. Use o formulário acima para lançar as notas de serviço com retenção de INSS.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 border-b text-xs">
                      <th className="pb-2">Competência</th><th>Prestador</th><th>Serviço</th>
                      <th className="text-right">Valor Bruto</th><th className="text-right">INSS Retido</th><th></th>
                    </tr></thead>
                    <tbody>
                      {r2010List.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2">{r.competencia}</td>
                          <td className="max-w-[120px] truncate">{r.nome_prestador || r.cnpj_prestador}</td>
                          <td>{TIPOS_SERVICO.find(t=>t.value===r.tipo_servico)?.label ?? r.tipo_servico}</td>
                          <td className="text-right">{fmt(r.valor_bruto)}</td>
                          <td className="text-right font-medium text-purple-600">{fmt(r.valor_retido)}</td>
                          <td className="pl-2">
                            <button onClick={() => excluirR2010(r.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="font-bold text-gray-700 border-t">
                      <td colSpan={3} className="pt-2">Total</td>
                      <td className="text-right pt-2">{fmt(r2010List.reduce((s,r)=>s+r.valor_bruto,0))}</td>
                      <td className="text-right pt-2 text-purple-600">{fmt(r2010List.reduce((s,r)=>s+r.valor_retido,0))}</td>
                      <td></td>
                    </tr></tfoot>
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
            <p className="text-sm text-gray-500 mb-4">
              A apuração é calculada automaticamente ao registrar eventos R-2055 e R-2010.
              Vencimento: dia 20 do mês seguinte. Código DARF: <strong>2985</strong> (FUNRURAL PF).
            </p>
            {apuracaoList.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Nenhuma apuração gerada. Registre vendas na aba R-2055 para gerar a apuração automática.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b text-xs">
                    <th className="pb-2">Competência</th><th className="text-right">Receita Bruta</th>
                    <th className="text-right">FUNRURAL</th><th className="text-right">SENAR</th>
                    <th className="text-right">INSS Serv.</th><th className="text-right">Total a Recolher</th>
                    <th>Vencimento</th><th>Status</th><th>Cód. DARF</th>
                  </tr></thead>
                  <tbody>
                    {apuracaoList.map(a => (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 font-medium">{a.competencia}</td>
                        <td className="text-right">{fmt(a.total_receita_bruta)}</td>
                        <td className="text-right text-orange-600">{fmt(a.total_funrural)}</td>
                        <td className="text-right text-blue-600">{fmt(a.total_senar)}</td>
                        <td className="text-right text-purple-600">{fmt(a.total_inss_servicos)}</td>
                        <td className="text-right font-bold text-red-600">{fmt(a.total_a_recolher)}</td>
                        <td>{a.data_vencimento ? new Date(a.data_vencimento).toLocaleDateString("pt-BR") : "—"}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[a.status_darf] ?? "bg-gray-100 text-gray-600"}`}>
                            {a.status_darf.replace("_"," ")}
                          </span>
                        </td>
                        <td className="font-mono text-xs">{a.codigo_receita_darf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── DARF ──────────────────────────────────────────────────────── */}
        {aba === "darf" && (
          <div className="space-y-6">
            {/* Aviso DARF numerado */}
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
              <h3 className="font-semibold text-amber-800 text-lg mb-2">🧾 Emissão de DARF — Como Funciona</h3>
              <div className="text-sm text-amber-700 space-y-2">
                <p>
                  <strong>DARF sem código de barras</strong> (preenchimento manual): pode ser pago em qualquer banco.
                  Use os dados abaixo para preencher manualmente no caixa do banco ou no internet banking.
                </p>
                <p>
                  <strong>DARF numerado (com código de barras)</strong>: emitido exclusivamente pelo
                  <strong> SICALC da Receita Federal</strong> ou via <strong>API Integra-Sicalc do SERPRO</strong>
                  (requer certificado digital A1/A3 e contrato com SERPRO). O RuralCaixa fornece todos os
                  dados calculados para facilitar o preenchimento no SICALC.
                </p>
                <a href="https://sicalc.receita.fazenda.gov.br/sicalc/rapido/contribuinte"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-2 bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 font-medium">
                  🔗 Abrir SICALC — Receita Federal
                </a>
              </div>
            </div>

            {/* Dados para DARF por competência */}
            {apuracaoList.filter(a => a.status_darf !== "pago").length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-green-700 font-medium">Todas as competências estão pagas ou não há apurações pendentes.</p>
              </div>
            ) : (
              apuracaoList.filter(a => a.status_darf !== "pago").map(a => (
                <div key={a.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-gray-800 text-lg">Competência {a.competencia}</h4>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGE[a.status_darf] ?? "bg-gray-100"}`}>
                      {a.status_darf.replace("_"," ")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    {[
                      { label: "Código da Receita", value: a.codigo_receita_darf, note: "FUNRURAL PF" },
                      { label: "Período de Apuração", value: a.competencia },
                      { label: "Data de Vencimento", value: a.data_vencimento ? new Date(a.data_vencimento).toLocaleDateString("pt-BR") : "—" },
                      { label: "FUNRURAL (1,87%)", value: fmt(a.total_funrural) },
                      { label: "SENAR (0,11%)", value: fmt(a.total_senar) },
                      { label: "INSS Serviços", value: fmt(a.total_inss_servicos) },
                    ].map(item => (
                      <div key={item.label} className="bg-gray-50 rounded p-3">
                        <p className="text-xs text-gray-500">{item.label}</p>
                        <p className="font-bold text-gray-800">{item.value}</p>
                        {item.note && <p className="text-xs text-gray-400">{item.note}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-red-500">Valor Principal a Recolher</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(a.total_a_recolher)}</p>
                    </div>
                    <a href={`https://sicalc.receita.fazenda.gov.br/sicalc/rapido/contribuinte?codigo=${a.codigo_receita_darf}`}
                      target="_blank" rel="noopener noreferrer"
                      className="bg-[#1a4d2e] text-white px-5 py-2 rounded hover:bg-green-800 font-medium text-sm">
                      Preencher no SICALC →
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Informe também: CPF/CNPJ do contribuinte, número de referência (opcional) e observações.
                    Após o pagamento, registre na aba Apuração.
                  </p>
                </div>
              ))
            )}

            {/* Tabela de códigos DARF */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h4 className="font-semibold text-gray-700 mb-3">📌 Códigos DARF — Produtor Rural</h4>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b text-xs">
                  <th className="pb-2">Código</th><th>Descrição</th><th>Alíquota</th><th>Vencimento</th>
                </tr></thead>
                <tbody>
                  {[
                    { cod: "2985", desc: "FUNRURAL — Produtor Rural Pessoa Física", aliq: "1,87% + 0,11% SENAR", venc: "Dia 20 do mês seguinte" },
                    { cod: "2991", desc: "FUNRURAL — Produtor Rural Pessoa Jurídica", aliq: "1,87% + 0,11% SENAR", venc: "Dia 20 do mês seguinte" },
                    { cod: "2089", desc: "INSS — Retenção sobre Serviços (cessão mão de obra)", aliq: "11%", venc: "Dia 20 do mês seguinte" },
                    { cod: "0588", desc: "IRPF — Ganho de Capital (venda de imóvel rural)", aliq: "15% a 22,5%", venc: "Último dia útil do mês seguinte" },
                  ].map(r => (
                    <tr key={r.cod} className="border-b border-gray-50">
                      <td className="py-2 font-mono font-bold text-[#1a4d2e]">{r.cod}</td>
                      <td>{r.desc}</td>
                      <td>{r.aliq}</td>
                      <td className="text-gray-500">{r.venc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
