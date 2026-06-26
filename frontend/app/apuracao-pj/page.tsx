"use client";
import AuthGuard from "@/lib/AuthGuard";
import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";
const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${Number(v || 0).toFixed(2)}%`;

const REGIMES = [
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
];

const ATIVIDADES = [
  { value: "comercio", label: "Comércio (8% IRPJ / 12% CSLL)" },
  { value: "industria", label: "Indústria (8% IRPJ / 12% CSLL)" },
  { value: "in_natura", label: "Produção Rural in natura (8% IRPJ / 12% CSLL)" },
  { value: "industrializado", label: "Prod. Rural industrializado (8% IRPJ / 12% CSLL)" },
  { value: "servico", label: "Serviços (32% IRPJ / 32% CSLL)" },
  { value: "servico_simples", label: "Serviços simples até R$ 120k (16% IRPJ / 32% CSLL)" },
];

const TIPOS_CREDITO = [
  { value: "insumos", label: "Insumos (art. 3° I)" },
  { value: "energia", label: "Energia elétrica (art. 3° III)" },
  { value: "frete_venda", label: "Frete — venda (art. 3° IX)" },
  { value: "frete_compra", label: "Frete — compra de insumos (art. 3° IX)" },
  { value: "ativo_imobilizado", label: "Depreciação ativo imobilizado (art. 3° VI)" },
  { value: "aluguel", label: "Aluguel de imóveis/equipamentos (art. 3° IV)" },
  { value: "armazenagem", label: "Armazenagem (art. 3° IX)" },
  { value: "embalagens", label: "Embalagens (art. 3° I)" },
  { value: "outros", label: "Outros créditos em lei" },
];

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function ApuracaoPJPage() {
  const [tab, setTab] = useState<"config"|"lancamentos"|"apuracao"|"creditos"|"resumo">("config");
  const [imovelId] = useState(1);
  const [anoBase, setAnoBase] = useState(new Date().getFullYear());

  // Config
  const [cfg, setCfg] = useState({
    regime: "lucro_presumido", tipo_atividade: "comercio",
    cnpj: "", razao_social: "", usa_jcp: false, jcp_anual: 0,
    anexo_simples: "II", folha_12m: 0,
  });
  const [cfgSaved, setCfgSaved] = useState(false);

  // Lançamentos
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [lanc, setLanc] = useState({
    competencia: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`,
    receita_bruta: 0, receita_servicos: 0, receita_financeira: 0, outras_receitas: 0,
    custo_mercadorias: 0, despesas_operacionais: 0, folha_pagamento: 0, prolabore: 0,
    despesas_financeiras: 0, outras_despesas: 0, creditos_pis_cofins: 0,
    tipo_producao: "comercio",
  });

  // Apuração
  const [apuracoes, setApuracoes] = useState<any[]>([]);
  const [apurandoTrim, setApurandoTrim] = useState<number|null>(null);

  // Créditos PIS/COFINS
  const [creditos, setCreditos] = useState<any[]>([]);
  const [cred, setCred] = useState({
    competencia: `${new Date().getFullYear()}-01`,
    tipo_credito: "insumos", descricao: "", valor_base: 0, nf_numero: "",
  });

  // Resumo
  const [resumo, setResumo] = useState<any>(null);

  const loadConfig = useCallback(async () => {
    const r = await apiFetch(`${API}/apuracao-pj/config/${imovelId}/${anoBase}`);
    if (r.ok) { const d = await r.json(); if (d.id) setCfg({...cfg, ...d}); }
  }, [imovelId, anoBase]);

  const loadLancamentos = useCallback(async () => {
    const r = await apiFetch(`${API}/apuracao-pj/lancamentos/${imovelId}/${anoBase}`);
    if (r.ok) setLancamentos(await r.json());
  }, [imovelId, anoBase]);

  const loadApuracoes = useCallback(async () => {
    const r = await apiFetch(`${API}/apuracao-pj/apuracoes/${imovelId}/${anoBase}`);
    if (r.ok) setApuracoes(await r.json());
  }, [imovelId, anoBase]);

  const loadCreditos = useCallback(async () => {
    const r = await apiFetch(`${API}/apuracao-pj/creditos-pis-cofins/${imovelId}/${anoBase}`);
    if (r.ok) setCreditos(await r.json());
  }, [imovelId, anoBase]);

  const loadResumo = useCallback(async () => {
    const r = await apiFetch(`${API}/apuracao-pj/resumo-anual/${imovelId}/${anoBase}`);
    if (r.ok) setResumo(await r.json());
  }, [imovelId, anoBase]);

  useEffect(() => {
    loadConfig(); loadLancamentos(); loadApuracoes(); loadCreditos(); loadResumo();
  }, [anoBase]);

  const salvarConfig = async () => {
    const r = await apiFetch(`${API}/apuracao-pj/config`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({...cfg, imovel_id: imovelId, ano_base: anoBase}),
    });
    if (r.ok) { setCfgSaved(true); setTimeout(() => setCfgSaved(false), 3000); }
  };

  const salvarLancamento = async () => {
    const r = await apiFetch(`${API}/apuracao-pj/lancamento`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({...lanc, imovel_id: imovelId}),
    });
    if (r.ok) { loadLancamentos(); loadResumo(); }
  };

  const apurarTrimestre = async (trim: number) => {
    setApurandoTrim(trim);
    const r = await apiFetch(`${API}/apuracao-pj/apurar/${imovelId}/${anoBase}/${trim}`, {method:"POST"});
    if (r.ok) { loadApuracoes(); loadResumo(); }
    setApurandoTrim(null);
  };

  const marcarPago = async (id: number) => {
    const hoje = new Date().toISOString().split("T")[0];
    await apiFetch(`${API}/apuracao-pj/apuracoes/${id}/pagar`, {
      method: "PATCH", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({data_pagamento: hoje}),
    });
    loadApuracoes();
  };

  const salvarCredito = async () => {
    const r = await apiFetch(`${API}/apuracao-pj/credito-pis-cofins`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({...cred, imovel_id: imovelId}),
    });
    if (r.ok) loadCreditos();
  };

  const totalLancMes = (l: any) =>
    (l.receita_bruta||0)+(l.receita_servicos||0)+(l.receita_financeira||0)+(l.outras_receitas||0);
  const totalDespMes = (l: any) =>
    (l.custo_mercadorias||0)+(l.despesas_operacionais||0)+(l.folha_pagamento||0)+(l.prolabore||0)+(l.despesas_financeiras||0)+(l.outras_despesas||0);

  const tabs = [
    {id:"config", label:"⚙️ Configuração"},
    {id:"lancamentos", label:"📊 Lançamentos"},
    {id:"apuracao", label:"🧾 Apuração Trimestral"},
    {id:"creditos", label:"💳 Créditos PIS/COFINS"},
    {id:"resumo", label:"📋 Resumo Anual"},
  ];

  return (

    <AuthGuard>
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Apuração PJ</h1>
            <p className="text-sm text-gray-500 mt-1">Lucro Presumido · Lucro Real · IRPJ · CSLL · PIS · COFINS</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Ano-base:</label>
            <select value={anoBase} onChange={e => setAnoBase(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm bg-white">
              {[2022,2023,2024,2025,2026].map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 border shadow-sm overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-100"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CONFIG ── */}
        {tab === "config" && (
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Configuração do Regime — {anoBase}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Regime Tributário</label>
                <select value={cfg.regime} onChange={e => setCfg({...cfg, regime: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Atividade</label>
                <select value={cfg.tipo_atividade} onChange={e => setCfg({...cfg, tipo_atividade: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {ATIVIDADES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input value={cfg.cnpj} onChange={e => setCfg({...cfg, cnpj: e.target.value})}
                  placeholder="00.000.000/0001-00" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
                <input value={cfg.razao_social} onChange={e => setCfg({...cfg, razao_social: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              {cfg.regime === "lucro_real" && (
                <>
                  <div className="flex items-center gap-3 col-span-2">
                    <input type="checkbox" id="jcp" checked={cfg.usa_jcp}
                      onChange={e => setCfg({...cfg, usa_jcp: e.target.checked})} className="w-4 h-4" />
                    <label htmlFor="jcp" className="text-sm text-gray-700">
                      Utilizar JCP (Juros sobre Capital Próprio) como dedução
                    </label>
                  </div>
                  {cfg.usa_jcp && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">JCP Anual (R$)</label>
                      <input type="number" value={cfg.jcp_anual}
                        onChange={e => setCfg({...cfg, jcp_anual: Number(e.target.value)})}
                        className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Info regime */}
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              {cfg.regime === "lucro_presumido" ? (
                <div>
                  <p className="text-sm font-semibold text-blue-800 mb-2">Lucro Presumido — Alíquotas</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-blue-700">
                    <div><span className="font-medium">IRPJ:</span> 15% sobre base presumida</div>
                    <div><span className="font-medium">Adicional IRPJ:</span> 10% sobre base &gt; R$ 60k/trim</div>
                    <div><span className="font-medium">CSLL:</span> 9% sobre base presumida</div>
                    <div><span className="font-medium">PIS/COFINS:</span> 0,65% + 3% (cumulativo)</div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-blue-800 mb-2">Lucro Real — Alíquotas</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-blue-700">
                    <div><span className="font-medium">IRPJ:</span> 15% sobre lucro real</div>
                    <div><span className="font-medium">Adicional IRPJ:</span> 10% sobre lucro &gt; R$ 60k/trim</div>
                    <div><span className="font-medium">CSLL:</span> 9% sobre lucro real</div>
                    <div><span className="font-medium">PIS/COFINS:</span> 1,65% + 7,6% (não-cumulativo)</div>
                  </div>
                </div>
              )}
            </div>

            <button onClick={salvarConfig}
              className={`mt-4 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                cfgSaved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {cfgSaved ? "✅ Salvo!" : "Salvar Configuração"}
            </button>
          </div>
        )}

        {/* ── LANÇAMENTOS ── */}
        {tab === "lancamentos" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Lançamento Mensal</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Competência</label>
                  <input type="month" value={lanc.competencia}
                    onChange={e => setLanc({...lanc, competencia: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Receita Bruta (vendas)</label>
                  <input type="number" value={lanc.receita_bruta}
                    onChange={e => setLanc({...lanc, receita_bruta: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Receita de Serviços</label>
                  <input type="number" value={lanc.receita_servicos}
                    onChange={e => setLanc({...lanc, receita_servicos: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Receita Financeira</label>
                  <input type="number" value={lanc.receita_financeira}
                    onChange={e => setLanc({...lanc, receita_financeira: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custo das Mercadorias (CMV)</label>
                  <input type="number" value={lanc.custo_mercadorias}
                    onChange={e => setLanc({...lanc, custo_mercadorias: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Despesas Operacionais</label>
                  <input type="number" value={lanc.despesas_operacionais}
                    onChange={e => setLanc({...lanc, despesas_operacionais: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Folha de Pagamento</label>
                  <input type="number" value={lanc.folha_pagamento}
                    onChange={e => setLanc({...lanc, folha_pagamento: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pró-labore</label>
                  <input type="number" value={lanc.prolabore}
                    onChange={e => setLanc({...lanc, prolabore: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Créditos PIS/COFINS (base)</label>
                  <input type="number" value={lanc.creditos_pis_cofins}
                    onChange={e => setLanc({...lanc, creditos_pis_cofins: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <button onClick={salvarLancamento}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Salvar Lançamento
              </button>
            </div>

            {/* Tabela de lançamentos */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h3 className="font-semibold text-gray-800">Lançamentos {anoBase}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-600">Competência</th>
                      <th className="px-4 py-3 text-right text-gray-600">Receita Total</th>
                      <th className="px-4 py-3 text-right text-gray-600">Despesas Total</th>
                      <th className="px-4 py-3 text-right text-gray-600">Lucro Bruto</th>
                      <th className="px-4 py-3 text-right text-gray-600">Créditos PIS/COFINS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lancamentos.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Nenhum lançamento registrado</td></tr>
                    ) : lancamentos.map(l => {
                      const rec = totalLancMes(l);
                      const desp = totalDespMes(l);
                      return (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{String(l.competencia).slice(0,7)}</td>
                          <td className="px-4 py-3 text-right text-green-700">{fmt(rec)}</td>
                          <td className="px-4 py-3 text-right text-red-600">{fmt(desp)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${rec-desp >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {fmt(rec - desp)}
                          </td>
                          <td className="px-4 py-3 text-right text-blue-600">{fmt(l.creditos_pis_cofins || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {lancamentos.length > 0 && (
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-4 py-3">Total {anoBase}</td>
                        <td className="px-4 py-3 text-right text-green-700">
                          {fmt(lancamentos.reduce((s,l) => s + totalLancMes(l), 0))}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">
                          {fmt(lancamentos.reduce((s,l) => s + totalDespMes(l), 0))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {fmt(lancamentos.reduce((s,l) => s + totalLancMes(l) - totalDespMes(l), 0))}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-600">
                          {fmt(lancamentos.reduce((s,l) => s + (l.creditos_pis_cofins||0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── APURAÇÃO TRIMESTRAL ── */}
        {tab === "apuracao" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-2">Apuração Trimestral — {anoBase}</h2>
              <p className="text-sm text-gray-500 mb-4">
                Regime: <strong>{cfg.regime === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real"}</strong> · 
                IRPJ/CSLL vence no último dia útil do mês seguinte ao trimestre (Lei 9.430/1996 art. 5°)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1,2,3,4].map(trim => {
                  const ap = apuracoes.find(a => a.trimestre === trim);
                  const mesesTrim = [(trim-1)*3+1,(trim-1)*3+2,(trim-1)*3+3].map(m => MESES[m-1]).join("/");
                  const vencimentos = {1:"30/04",2:"31/07",3:"31/10",4:"31/01"};
                  return (
                    <div key={trim} className={`rounded-xl border-2 p-4 ${
                      ap?.status === "pago" ? "border-green-300 bg-green-50" :
                      ap ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-gray-800">{trim}° Trimestre</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          ap?.status === "pago" ? "bg-green-200 text-green-800" :
                          ap ? "bg-blue-200 text-blue-800" : "bg-gray-200 text-gray-600"}`}>
                          {ap?.status === "pago" ? "✅ Pago" : ap ? "Calculado" : "Pendente"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">{mesesTrim} · Vence {vencimentos[trim as 1|2|3|4]}</p>
                      {ap ? (
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-gray-600">Receita:</span><span className="font-medium">{fmt(ap.receita_bruta)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">IRPJ:</span><span>{fmt(ap.irpj)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">Adicional:</span><span>{fmt(ap.irpj_adicional)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">CSLL:</span><span>{fmt(ap.csll)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">PIS+COFINS:</span><span>{fmt((ap.pis_trimestre||0)+(ap.cofins_trimestre||0))}</span></div>
                          <div className="flex justify-between border-t pt-1 mt-1 font-bold">
                            <span>Total:</span><span className="text-red-600">{fmt(ap.total_tributos)}</span>
                          </div>
                          <div className="text-xs text-gray-500">Alíq. efetiva: {fmtPct(ap.aliq_efetiva_pct)}</div>
                          {ap.status !== "pago" && (
                            <button onClick={() => marcarPago(ap.id)}
                              className="mt-2 w-full py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                              Marcar como Pago
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => apurarTrimestre(trim)} disabled={apurandoTrim === trim}
                          className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                          {apurandoTrim === trim ? "Calculando..." : "Calcular Apuração"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Breakdown detalhado */}
            {apuracoes.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h3 className="font-semibold">Comparativo LP vs LR por Trimestre</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left">Trimestre</th>
                        <th className="px-4 py-3 text-right">Receita</th>
                        <th className="px-4 py-3 text-right">IRPJ LP</th>
                        <th className="px-4 py-3 text-right">CSLL LP</th>
                        <th className="px-4 py-3 text-right">IRPJ LR</th>
                        <th className="px-4 py-3 text-right">CSLL LR</th>
                        <th className="px-4 py-3 text-right">PIS+COFINS</th>
                        <th className="px-4 py-3 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {apuracoes.map(ap => (
                        <tr key={ap.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{ap.trimestre}° Trim</td>
                          <td className="px-4 py-3 text-right">{fmt(ap.receita_bruta)}</td>
                          <td className="px-4 py-3 text-right">{fmt((ap.irpj||0)+(ap.irpj_adicional||0))}</td>
                          <td className="px-4 py-3 text-right">{fmt(ap.csll)}</td>
                          <td className="px-4 py-3 text-right">{fmt((ap.irpj_real||0)+(ap.irpj_adicional_real||0))}</td>
                          <td className="px-4 py-3 text-right">{fmt(ap.csll_real)}</td>
                          <td className="px-4 py-3 text-right">{fmt((ap.pis_trimestre||0)+(ap.cofins_trimestre||0))}</td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(ap.total_tributos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CRÉDITOS PIS/COFINS ── */}
        {tab === "creditos" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-2">Créditos PIS/COFINS Não-Cumulativo</h2>
              <p className="text-sm text-gray-500 mb-4">
                Aplicável apenas no regime Lucro Real. Base legal: Lei 10.637/2002 (PIS) e Lei 10.833/2003 (COFINS).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Competência</label>
                  <input type="month" value={cred.competencia}
                    onChange={e => setCred({...cred, competencia: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Crédito</label>
                  <select value={cred.tipo_credito} onChange={e => setCred({...cred, tipo_credito: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    {TIPOS_CREDITO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor Base (R$)</label>
                  <input type="number" value={cred.valor_base}
                    onChange={e => setCred({...cred, valor_base: Number(e.target.value)})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nº NF (opcional)</label>
                  <input value={cred.nf_numero} onChange={e => setCred({...cred, nf_numero: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <input value={cred.descricao} onChange={e => setCred({...cred, descricao: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              {/* Preview crédito */}
              {cred.valor_base > 0 && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm">
                  <span className="font-medium text-blue-800">Crédito gerado: </span>
                  <span className="text-blue-700">
                    PIS {fmt(cred.valor_base * 0.0165)} + COFINS {fmt(cred.valor_base * 0.076)} = {" "}
                    <strong>{fmt(cred.valor_base * 0.0925)}</strong>
                  </span>
                </div>
              )}
              <button onClick={salvarCredito}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Registrar Crédito
              </button>
            </div>

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="font-semibold">Créditos Registrados — {anoBase}</h3>
                <span className="text-sm text-gray-500">
                  Total: {fmt(creditos.reduce((s,c) => s + Number(c.credito_total||0), 0))}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">Competência</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-right">Base</th>
                      <th className="px-4 py-3 text-right">Créd. PIS</th>
                      <th className="px-4 py-3 text-right">Créd. COFINS</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {creditos.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum crédito registrado</td></tr>
                    ) : creditos.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{String(c.competencia).slice(0,7)}</td>
                        <td className="px-4 py-3 text-gray-600">{TIPOS_CREDITO.find(t=>t.value===c.tipo_credito)?.label || c.tipo_credito}</td>
                        <td className="px-4 py-3 text-right">{fmt(c.valor_base)}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{fmt(c.credito_pis)}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{fmt(c.credito_cofins)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(c.credito_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── RESUMO ANUAL ── */}
        {tab === "resumo" && (
          <div className="space-y-4">
            {resumo ? (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    {label:"Receita Total", value: fmt(resumo.lancamentos?.receita_total || 0), color:"text-green-700"},
                    {label:"Total Tributos", value: fmt(resumo.resumo_apuracoes?.total_tributos || 0), color:"text-red-600"},
                    {label:"Alíq. Efetiva Média", value: fmtPct(resumo.resumo_apuracoes?.aliq_media || 0), color:"text-orange-600"},
                    {label:"Trimestres Pagos", value: `${resumo.resumo_apuracoes?.trimestres_pagos||0} / ${resumo.resumo_apuracoes?.trimestres_apurados||0}`, color:"text-blue-600"},
                  ].map(k => (
                    <div key={k.label} className="bg-white rounded-xl border shadow-sm p-4">
                      <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                      <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Breakdown tributos */}
                <div className="bg-white rounded-xl border shadow-sm p-6">
                  <h3 className="font-semibold mb-4">Composição da Carga Tributária — {anoBase}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      {label:"IRPJ", value: resumo.resumo_apuracoes?.irpj_total || 0, color:"bg-red-100 text-red-700"},
                      {label:"CSLL", value: resumo.resumo_apuracoes?.csll_total || 0, color:"bg-orange-100 text-orange-700"},
                      {label:"PIS", value: resumo.resumo_apuracoes?.pis_total || 0, color:"bg-yellow-100 text-yellow-700"},
                      {label:"COFINS", value: resumo.resumo_apuracoes?.cofins_total || 0, color:"bg-amber-100 text-amber-700"},
                      {label:"Total", value: resumo.resumo_apuracoes?.total_tributos || 0, color:"bg-gray-100 text-gray-800"},
                    ].map(t => (
                      <div key={t.label} className={`rounded-lg p-4 ${t.color}`}>
                        <p className="text-xs font-medium mb-1">{t.label}</p>
                        <p className="text-lg font-bold">{fmt(t.value)}</p>
                        <p className="text-xs mt-1">
                          {resumo.lancamentos?.receita_total > 0
                            ? fmtPct(t.value / resumo.lancamentos.receita_total * 100)
                            : "—"} da receita
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Config resumida */}
                {resumo.config?.id && (
                  <div className="bg-white rounded-xl border shadow-sm p-6">
                    <h3 className="font-semibold mb-3">Configuração do Ano</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><span className="text-gray-500">Regime:</span><br/><strong>{resumo.config.regime === "lucro_presumido" ? "Lucro Presumido" : "Lucro Real"}</strong></div>
                      <div><span className="text-gray-500">Atividade:</span><br/><strong>{resumo.config.tipo_atividade}</strong></div>
                      <div><span className="text-gray-500">% Presunção IRPJ:</span><br/><strong>{resumo.config.pct_presuncao_irpj}%</strong></div>
                      <div><span className="text-gray-500">% Presunção CSLL:</span><br/><strong>{resumo.config.pct_presuncao_csll}%</strong></div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-gray-400">
                <p className="text-lg">Nenhum dado para {anoBase}</p>
                <p className="text-sm mt-2">Registre lançamentos mensais e calcule as apurações trimestrais</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
