"use client";
import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-api.up.railway.app";
const IMOVEL_ID = 1;

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v.toFixed(2)}%`;

type Alerta = { nivel: string; mensagem: string };
type Lancamento = {
  id: number;
  competencia: string;
  faturamento: number;
  despesas_operacionais: number;
  folha_pagamento: number;
  prolabore: number;
  tipo_producao: string;
  pf_diferenciado: number;
  pf_lucro_real: number;
  pj_simples_ii: number;
  pj_simples_iii: number;
  pj_simples_v: number;
  pj_lucro_real: number;
  regime_recomendado: string;
  economia_anual: number;
  fator_r_pct: number;
  faturamento_12m: number;
  alertas: Alerta[] | null;
};
type SimResult = {
  pf_diferenciado: number;
  pf_lucro_real: number;
  pj_simples_ii: number;
  pj_simples_iii: number;
  pj_simples_v: number;
  pj_lucro_real: number;
  regime_recomendado: string;
  economia_anual: number;
  fator_r_pct: number;
  alertas: Alerta[];
};

const nivelCor: Record<string, string> = {
  vermelho: "#dc2626",
  laranja:  "#ea580c",
  amarelo:  "#ca8a04",
  azul:     "#2563eb",
  verde:    "#16a34a",
};
const nivelBg: Record<string, string> = {
  vermelho: "#fef2f2",
  laranja:  "#fff7ed",
  amarelo:  "#fefce8",
  azul:     "#eff6ff",
  verde:    "#f0fdf4",
};
const nivelEmoji: Record<string, string> = {
  vermelho: "🔴",
  laranja:  "🟠",
  amarelo:  "🟡",
  azul:     "🔵",
  verde:    "🟢",
};

const TIPOS = [
  { value: "in_natura",     label: "🌾 In Natura (100% desconto CBS/IBS)" },
  { value: "industrializado",label: "🏭 Industrializado (60% desconto CBS/IBS)" },
  { value: "servico",       label: "🔧 Serviço (sem desconto, Fator R aplicável)" },
  { value: "misto",         label: "🔀 Misto (estimativa 80% desconto)" },
];

const REGIMES_LABEL: Record<string, string> = {
  "PF — Regime Diferenciado": "PF — Regime Diferenciado",
  "PF — Lucro Real":          "PF — Lucro Real",
  "PJ — Simples Anexo II":    "PJ — Simples Anexo II",
  "PJ — Simples Anexo III":   "PJ — Simples Anexo III",
  "PJ — Simples Anexo V":     "PJ — Simples Anexo V",
  "PJ — Lucro Real":          "PJ — Lucro Real",
};

export default function SimuladorRegimePage() {
  const [aba, setAba] = useState<"simulador" | "lancamentos" | "historico" | "comparativo">("simulador");

  // ── Simulação avulsa ────────────────────────────────────────────────────
  const [simForm, setSimForm] = useState({
    faturamento_12m: "",
    folha_12m: "",
    despesas_12m: "",
    tipo_producao: "in_natura",
  });
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // ── Lançamento mensal ───────────────────────────────────────────────────
  const hoje = new Date();
  const [lancForm, setLancForm] = useState({
    competencia: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`,
    faturamento: "",
    despesas_operacionais: "",
    folha_pagamento: "",
    prolabore: "",
    tipo_producao: "in_natura",
    observacoes: "",
  });
  const [lancLoading, setLancLoading] = useState(false);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingLanc, setLoadingLanc] = useState(false);

  const carregarLancamentos = useCallback(async () => {
    setLoadingLanc(true);
    try {
      const r = await fetch(`${API}/simulador-regime/lancamentos/${IMOVEL_ID}`);
      if (r.ok) setLancamentos(await r.json());
    } finally {
      setLoadingLanc(false);
    }
  }, []);

  useEffect(() => { carregarLancamentos(); }, [carregarLancamentos]);

  // ── Simular avulso ──────────────────────────────────────────────────────
  async function simular() {
    setSimLoading(true);
    try {
      const r = await fetch(`${API}/simulador-regime/simulacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faturamento_12m: parseFloat(simForm.faturamento_12m) || 0,
          folha_12m:       parseFloat(simForm.folha_12m) || 0,
          despesas_12m:    parseFloat(simForm.despesas_12m) || 0,
          tipo_producao:   simForm.tipo_producao,
        }),
      });
      if (r.ok) setSimResult(await r.json());
    } finally {
      setSimLoading(false);
    }
  }

  // ── Registrar lançamento ────────────────────────────────────────────────
  async function registrarLancamento() {
    setLancLoading(true);
    try {
      const r = await fetch(`${API}/simulador-regime/lancamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID,
          competencia: lancForm.competencia,
          faturamento: parseFloat(lancForm.faturamento) || 0,
          despesas_operacionais: parseFloat(lancForm.despesas_operacionais) || 0,
          folha_pagamento: parseFloat(lancForm.folha_pagamento) || 0,
          prolabore: parseFloat(lancForm.prolabore) || 0,
          tipo_producao: lancForm.tipo_producao,
          observacoes: lancForm.observacoes || null,
        }),
      });
      if (r.ok) {
        await carregarLancamentos();
        setLancForm(f => ({ ...f, faturamento: "", despesas_operacionais: "", folha_pagamento: "", prolabore: "", observacoes: "" }));
        setAba("historico");
      }
    } finally {
      setLancLoading(false);
    }
  }

  async function deletarLancamento(competencia: string) {
    const comp = competencia.substring(0, 7);
    await fetch(`${API}/simulador-regime/lancamento/${IMOVEL_ID}/${comp}`, { method: "DELETE" });
    await carregarLancamentos();
  }

  // ── Comparativo: último lançamento ─────────────────────────────────────
  const ultimo = lancamentos[0];

  // ── Alertas ativos ──────────────────────────────────────────────────────
  const todosAlertas = lancamentos
    .filter(l => l.alertas && l.alertas.length > 0)
    .flatMap(l => (l.alertas || []).map(a => ({ ...a, competencia: l.competencia })));

  const ABAS = [
    { id: "simulador",   label: "🧮 Simulador Rápido" },
    { id: "lancamentos", label: "📅 Lançamento Mensal" },
    { id: "historico",   label: "📊 Histórico" },
    { id: "comparativo", label: "⚖️ Comparativo" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f4", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1a3a2a", color: "#fff", padding: "20px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>⚖️</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Simulador de Regime Tributário</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
              Reforma Tributária — LC 214/2024 · Imóvel #{IMOVEL_ID}
            </p>
          </div>
        </div>
      </div>

      {/* Banner informativo */}
      <div style={{ background: "#fffbeb", borderBottom: "1px solid #fde68a", padding: "10px 32px", fontSize: 13, color: "#92400e" }}>
        <strong>⚠️ Reforma Tributária em vigor:</strong> Produtores PF com faturamento ≤ R$ 3,6 milhões/ano têm <strong>isenção total de CBS/IBS</strong> (LC 214/2024).
        Implementação gradual até 2033. Consulte sempre um contador para decisões definitivas.
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {/* Alertas ativos no topo */}
        {todosAlertas.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>
              🚨 {todosAlertas.length} Alerta{todosAlertas.length > 1 ? "s" : ""} Ativo{todosAlertas.length > 1 ? "s" : ""}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {todosAlertas.slice(0, 3).map((a, i) => (
                <div key={i} style={{
                  background: nivelBg[a.nivel] || "#f9fafb",
                  border: `1px solid ${nivelCor[a.nivel] || "#d1d5db"}`,
                  borderRadius: 8, padding: "8px 14px", fontSize: 13,
                  color: nivelCor[a.nivel] || "#374151"
                }}>
                  {nivelEmoji[a.nivel]} {a.mensagem}
                  <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>
                    ({new Date(a.competencia).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e5e7eb", paddingBottom: 0 }}>
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id as typeof aba)} style={{
              padding: "10px 18px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: aba === a.id ? "#1a3a2a" : "transparent",
              color: aba === a.id ? "#fff" : "#6b7280",
              borderRadius: "8px 8px 0 0",
              borderBottom: aba === a.id ? "2px solid #1a3a2a" : "none",
              marginBottom: -2,
            }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── ABA: Simulador Rápido ─────────────────────────────────────── */}
        {aba === "simulador" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Formulário */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a3a2a" }}>
                🧮 Simulação Instantânea
              </h2>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
                Insira os valores dos últimos 12 meses para comparar todos os regimes.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                    Tipo de Produção
                  </label>
                  <select value={simForm.tipo_producao} onChange={e => setSimForm(f => ({ ...f, tipo_producao: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginTop: 4 }}>
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {[
                  { key: "faturamento_12m", label: "Faturamento 12 meses (R$)", hint: "Receita bruta total dos últimos 12 meses" },
                  { key: "despesas_12m",    label: "Despesas Operacionais 12m (R$)", hint: "Insumos, frete, energia, manutenção" },
                  { key: "folha_12m",       label: "Folha de Pagamento 12m (R$)", hint: "Pró-labore + salários — usado no Fator R" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{f.label}</label>
                    <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 4px" }}>{f.hint}</p>
                    <input type="number" min="0" step="0.01"
                      value={(simForm as any)[f.key]}
                      onChange={e => setSimForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder="0,00"
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                ))}

                <button onClick={simular} disabled={simLoading || !simForm.faturamento_12m}
                  style={{ background: "#1a3a2a", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
                  {simLoading ? "Calculando..." : "⚖️ Comparar Regimes"}
                </button>
              </div>
            </div>

            {/* Resultado */}
            <div>
              {simResult ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Recomendação */}
                  <div style={{ background: "#f0fdf4", border: "2px solid #16a34a", borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 13, color: "#15803d", fontWeight: 700, marginBottom: 4 }}>
                      ✅ Regime Recomendado
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#14532d" }}>
                      {simResult.regime_recomendado}
                    </div>
                    <div style={{ fontSize: 13, color: "#16a34a", marginTop: 4 }}>
                      Economia estimada vs. pior regime: <strong>{fmt(simResult.economia_anual)}/ano</strong>
                    </div>
                    {simResult.fator_r_pct > 0 && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        Fator R: <strong style={{ color: simResult.fator_r_pct >= 28 ? "#16a34a" : "#dc2626" }}>
                          {fmtPct(simResult.fator_r_pct)}
                        </strong> {simResult.fator_r_pct >= 28 ? "(Anexo III ✓)" : "(Anexo V ⚠️)"}
                      </div>
                    )}
                  </div>

                  {/* Comparativo de regimes */}
                  <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#374151" }}>
                      Tributos Estimados (12 meses)
                    </h3>
                    {[
                      { label: "PF — Regime Diferenciado",  value: simResult.pf_diferenciado,  destaque: simResult.regime_recomendado === "PF — Regime Diferenciado" },
                      { label: "PF — Lucro Real",           value: simResult.pf_lucro_real,    destaque: simResult.regime_recomendado === "PF — Lucro Real" },
                      { label: "PJ — Simples Anexo II",     value: simResult.pj_simples_ii,    destaque: simResult.regime_recomendado === "PJ — Simples Anexo II" },
                      { label: "PJ — Simples Anexo III",    value: simResult.pj_simples_iii,   destaque: simResult.regime_recomendado === "PJ — Simples Anexo III" },
                      { label: "PJ — Simples Anexo V",      value: simResult.pj_simples_v,     destaque: simResult.regime_recomendado === "PJ — Simples Anexo V" },
                      { label: "PJ — Lucro Real",           value: simResult.pj_lucro_real,    destaque: simResult.regime_recomendado === "PJ — Lucro Real" },
                    ].sort((a, b) => a.value - b.value).map((r, i) => (
                      <div key={r.label} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                        background: r.destaque ? "#f0fdf4" : i % 2 === 0 ? "#f9fafb" : "#fff",
                        border: r.destaque ? "1px solid #86efac" : "1px solid transparent",
                      }}>
                        <span style={{ fontSize: 13, color: "#374151", fontWeight: r.destaque ? 700 : 400 }}>
                          {r.destaque ? "✅ " : `${i + 1}. `}{r.label}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: r.destaque ? "#16a34a" : "#374151" }}>
                          {r.value === 0 ? "ISENTO" : fmt(r.value)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Alertas */}
                  {simResult.alertas.length > 0 && (
                    <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#374151" }}>
                        🚨 Alertas desta Simulação
                      </h3>
                      {simResult.alertas.map((a, i) => (
                        <div key={i} style={{
                          background: nivelBg[a.nivel] || "#f9fafb",
                          border: `1px solid ${nivelCor[a.nivel] || "#d1d5db"}`,
                          borderRadius: 8, padding: "8px 12px", fontSize: 12,
                          color: nivelCor[a.nivel] || "#374151", marginBottom: 6
                        }}>
                          {nivelEmoji[a.nivel]} {a.mensagem}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: "#fff", borderRadius: 12, padding: 40, textAlign: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)", color: "#9ca3af" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>⚖️</div>
                  <p style={{ fontSize: 14 }}>Preencha os dados ao lado e clique em <strong>Comparar Regimes</strong> para ver qual tributação é mais vantajosa para você.</p>
                  <div style={{ marginTop: 20, textAlign: "left", background: "#f9fafb", borderRadius: 8, padding: 16, fontSize: 12, color: "#374151" }}>
                    <strong>Regimes comparados:</strong>
                    <ul style={{ margin: "8px 0 0 16px", lineHeight: 1.8 }}>
                      <li>PF — Regime Diferenciado (isenção até R$ 3,6M)</li>
                      <li>PF — Lucro Real (IRPF com deduções)</li>
                      <li>PJ — Simples Nacional Anexo II (Indústria)</li>
                      <li>PJ — Simples Nacional Anexo III (Serviços, Fator R ≥ 28%)</li>
                      <li>PJ — Simples Nacional Anexo V (Serviços, Fator R &lt; 28%)</li>
                      <li>PJ — Lucro Real (IRPJ + CSLL + adicional)</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA: Lançamento Mensal ────────────────────────────────────── */}
        {aba === "lancamentos" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", maxWidth: 600 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#1a3a2a" }}>
              📅 Registrar Competência Mensal
            </h2>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
              Registre os dados de cada mês. O sistema calcula automaticamente a janela de 12 meses e atualiza o comparativo de regimes.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Competência (Mês/Ano) *</label>
                <input type="month" value={lancForm.competencia}
                  onChange={e => setLancForm(f => ({ ...f, competencia: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginTop: 4, boxSizing: "border-box" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Tipo de Produção</label>
                <select value={lancForm.tipo_producao} onChange={e => setLancForm(f => ({ ...f, tipo_producao: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginTop: 4 }}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {[
                { key: "faturamento",           label: "Faturamento do Mês (R$) *",    hint: "Receita bruta do mês" },
                { key: "despesas_operacionais", label: "Despesas Operacionais (R$)",   hint: "Insumos, frete, energia" },
                { key: "folha_pagamento",       label: "Folha de Pagamento (R$)",      hint: "Total pró-labore + salários" },
                { key: "prolabore",             label: "Pró-labore (R$)",              hint: "Remuneração do sócio" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{f.label}</label>
                  <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 4px" }}>{f.hint}</p>
                  <input type="number" min="0" step="0.01"
                    value={(lancForm as any)[f.key]}
                    onChange={e => setLancForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0,00"
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
              ))}

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Observações</label>
                <textarea value={lancForm.observacoes} onChange={e => setLancForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2} placeholder="Ex: safra de soja, venda de gado..."
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginTop: 4, boxSizing: "border-box", resize: "vertical" }}
                />
              </div>
            </div>

            <button onClick={registrarLancamento} disabled={lancLoading || !lancForm.faturamento}
              style={{ background: "#1a3a2a", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px",
                fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 16, width: "100%" }}>
              {lancLoading ? "Salvando..." : "💾 Salvar e Calcular"}
            </button>
          </div>
        )}

        {/* ── ABA: Histórico ───────────────────────────────────────────── */}
        {aba === "historico" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a3a2a" }}>
              📊 Histórico de Competências
            </h2>
            {loadingLanc ? (
              <p style={{ color: "#9ca3af", textAlign: "center", padding: 40 }}>Carregando...</p>
            ) : lancamentos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
                <p>Nenhuma competência registrada ainda.</p>
                <p style={{ fontSize: 12 }}>Use a aba <strong>Lançamento Mensal</strong> para começar.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f3f4f6" }}>
                      {["Competência", "Faturamento Mês", "Fat. 12m", "Fator R", "PF Diferenciado", "PJ Simples II", "Recomendado", "Economia/Ano", "Alertas", ""].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentos.map((l, i) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                          {new Date(l.competencia).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                        </td>
                        <td style={{ padding: "10px 12px" }}>{fmt(l.faturamento)}</td>
                        <td style={{ padding: "10px 12px" }}>{l.faturamento_12m ? fmt(l.faturamento_12m) : "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          {l.fator_r_pct != null ? (
                            <span style={{ color: l.fator_r_pct >= 28 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                              {fmtPct(l.fator_r_pct)}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: l.pf_diferenciado === 0 ? "#16a34a" : "#374151", fontWeight: l.pf_diferenciado === 0 ? 700 : 400 }}>
                          {l.pf_diferenciado === 0 ? "ISENTO" : fmt(l.pf_diferenciado)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>{l.pj_simples_ii != null ? fmt(l.pj_simples_ii) : "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: "#f0fdf4", color: "#15803d", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                            {l.regime_recomendado || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#16a34a", fontWeight: 600 }}>
                          {l.economia_anual != null ? fmt(l.economia_anual) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {l.alertas && l.alertas.length > 0 ? (
                            <span style={{ background: "#fef2f2", color: "#dc2626", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                              {l.alertas.length} alerta{l.alertas.length > 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span style={{ color: "#16a34a", fontSize: 11 }}>✓ OK</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <button onClick={() => deletarLancamento(l.competencia)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16 }}
                            title="Excluir">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA: Comparativo ─────────────────────────────────────────── */}
        {aba === "comparativo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {!ultimo ? (
              <div style={{ background: "#fff", borderRadius: 12, padding: 40, textAlign: "center", color: "#9ca3af" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚖️</div>
                <p>Registre pelo menos uma competência para ver o comparativo.</p>
              </div>
            ) : (
              <>
                {/* KPIs */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Faturamento 12m", value: fmt(ultimo.faturamento_12m || 0), cor: "#1a3a2a" },
                    { label: "Regime Recomendado", value: ultimo.regime_recomendado || "—", cor: "#16a34a" },
                    { label: "Economia Estimada/Ano", value: fmt(ultimo.economia_anual || 0), cor: "#2563eb" },
                    { label: "Fator R", value: ultimo.fator_r_pct != null ? fmtPct(ultimo.fator_r_pct) : "—",
                      cor: (ultimo.fator_r_pct || 0) >= 28 ? "#16a34a" : "#dc2626" },
                  ].map(k => (
                    <div key={k.label} style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.value}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Barras comparativas */}
                <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a3a2a" }}>
                    Comparativo de Tributos — Última Competência
                  </h3>
                  {(() => {
                    const regimes = [
                      { label: "PF — Regime Diferenciado", value: ultimo.pf_diferenciado || 0 },
                      { label: "PF — Lucro Real",          value: ultimo.pf_lucro_real || 0 },
                      { label: "PJ — Simples Anexo II",    value: ultimo.pj_simples_ii || 0 },
                      { label: "PJ — Simples Anexo III",   value: ultimo.pj_simples_iii || 0 },
                      { label: "PJ — Simples Anexo V",     value: ultimo.pj_simples_v || 0 },
                      { label: "PJ — Lucro Real",          value: ultimo.pj_lucro_real || 0 },
                    ].sort((a, b) => a.value - b.value);
                    const max = Math.max(...regimes.map(r => r.value), 1);
                    return regimes.map((r, i) => {
                      const isRecomendado = r.label === ultimo.regime_recomendado;
                      const pct = (r.value / max) * 100;
                      return (
                        <div key={r.label} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: isRecomendado ? 700 : 400, color: isRecomendado ? "#15803d" : "#374151" }}>
                              {isRecomendado ? "✅ " : `${i + 1}. `}{r.label}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: isRecomendado ? "#16a34a" : "#374151" }}>
                              {r.value === 0 ? "ISENTO" : fmt(r.value)}
                            </span>
                          </div>
                          <div style={{ background: "#f3f4f6", borderRadius: 4, height: 10, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", borderRadius: 4,
                              width: `${pct}%`,
                              background: isRecomendado ? "#16a34a" : i === regimes.length - 1 ? "#dc2626" : "#6b7280",
                              transition: "width 0.5s ease"
                            }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Tabela Simples Nacional — referência */}
                <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a3a2a" }}>
                    📋 Tabela Simples Nacional — Referência (Anexo II)
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        {["Faixa", "Receita Bruta 12m", "Alíquota Nominal", "Parcela a Deduzir"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["1ª", "Até R$ 180.000",          "6,00%",  "—"],
                        ["2ª", "De R$ 180.001 a R$ 360.000", "11,20%", "R$ 9.360"],
                        ["3ª", "De R$ 360.001 a R$ 720.000", "13,50%", "R$ 17.640"],
                        ["4ª", "De R$ 720.001 a R$ 1.800.000","16,00%","R$ 35.640"],
                        ["5ª", "De R$ 1.800.001 a R$ 3.600.000","21,00%","R$ 125.640"],
                        ["6ª", "De R$ 3.600.001 a R$ 4.800.000","33,00%","R$ 648.000"],
                      ].map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: "8px 12px", color: "#374151" }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
                    * Alíquota efetiva = (Receita Bruta 12m × Alíquota Nominal − Parcela a Deduzir) ÷ Receita Bruta 12m
                  </p>
                </div>

                {/* Base legal */}
                <div style={{ background: "#f8f7f4", borderRadius: 12, padding: 16, fontSize: 12, color: "#6b7280" }}>
                  <strong>Base legal:</strong> LC 214/2024 (Reforma Tributária) · Decreto 9.580/2018 (RIR/2018) ·
                  LC 123/2006 (Simples Nacional) · Tabela IRPF 2024 (Lei 14.848/2024) ·
                  Implementação gradual CBS/IBS até 2033.
                  <br /><strong>⚠️ Atenção:</strong> Os valores são estimativas para fins de planejamento. Consulte sempre um contador para decisões definitivas.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
