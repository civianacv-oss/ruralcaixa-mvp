"use client";
import AuthGuard from "@/lib/AuthGuard";
import { apiFetch } from "@/lib/api";
import React, { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Apuracao = {
  ano_base: number; regime: string;
  receita_bruta: number; receita_acertos: number;
  despesas_por_categoria: Record<string, number>;
  total_despesas_categorias: number; depreciacao_anual: number;
  total_deducoes_rurais: number; resultado_antes_prejuizo: number;
  prejuizo_acumulado_disponivel: number; prejuizo_compensado_este_ano: number;
  novo_prejuizo_gerado: number; base_tributavel: number;
  base_presumida_20pct: number; total_deducoes_pessoais: number;
  deducoes: Record<string, number>; base_calculo_irpf: number;
  aliquota_efetiva_pct: number; imposto_bruto: number;
  irrf_retido_total: number; imposto_a_pagar: number; imposto_a_restituir: number;
  acertos_funrural_retido: number; acertos_senar_retido: number;
  comparativo: {
    presumido_base: number; presumido_irpf: number;
    real_base: number; real_irpf: number;
    economia_regime_real: number; recomendacao: string; recomendacao_texto: string;
  };
};
type Despesa = { id: number; categoria: string; descricao: string; valor: number; data_despesa?: string; comprovante?: string; };
type Bem = { id: number; descricao: string; tipo_bem: string; data_aquisicao: string; valor_aquisicao: number; vida_util_anos: number; taxa_depreciacao_pct: number; dep_anual: number; dep_acumulada: number; valor_contabil: number; pct_depreciado: number; ativo: boolean; };
type Prejuizo = { id: number; ano_base: number; valor_prejuizo: number; valor_compensado: number; saldo_compensar: number; };

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function fmtPct(v: number) { return `${(v || 0).toFixed(2)}%`; }

const CATEGORIAS: Record<string, string> = {
  insumos: "🌱 Insumos",
  combustivel: "⛽ Combustível",
  manutencao: "🔧 Manutenção",
  mao_de_obra: "👷 Mão de Obra",
  arrendamento_pago: "🏠 Arrendamento Pago",
  funrural_pago: "📋 FUNRURAL/SENAR",
  energia: "💡 Energia",
  transporte: "🚛 Transporte",
  seguro: "🛡️ Seguro",
  assistencia_tecnica: "🔬 Assist. Técnica",
  investimento_rural: "🏗️ Investimentos Rurais",
  outros: "📌 Outros",
};

const TIPOS_BEM: Record<string, { label: string; anos: number; taxa: number }> = {
  trator:              { label: "Trator", anos: 5, taxa: 20 },
  colheitadeira:       { label: "Colheitadeira", anos: 5, taxa: 20 },
  implemento_agricola: { label: "Implemento Agrícola", anos: 5, taxa: 20 },
  caminhao:            { label: "Caminhão", anos: 5, taxa: 20 },
  veiculo_leve:        { label: "Veículo Leve", anos: 5, taxa: 20 },
  silo_armazem:        { label: "Silo / Armazém", anos: 25, taxa: 4 },
  edificacao_rural:    { label: "Edificação Rural", anos: 25, taxa: 4 },
  cerca:               { label: "Cerca", anos: 10, taxa: 10 },
  sistema_irrigacao:   { label: "Sistema de Irrigação", anos: 10, taxa: 10 },
  computador:          { label: "Computador / Equip.", anos: 5, taxa: 20 },
  outros:              { label: "Outros Bens", anos: 10, taxa: 10 },
};

export default function DirpfPage() {
  const [aba, setAba] = useState<"apuracao" | "despesas" | "depreciacao" | "prejuizo" | "config">("apuracao");
  const [ano, setAno] = useState(new Date().getFullYear() - 1);
  const [regime, setRegime] = useState<"presumido_20pct" | "resultado_real">("presumido_20pct");
  const [apuracao, setApuracao] = useState<Apuracao | null>(null);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [bens, setBens] = useState<Bem[]>([]);
  const [prejuizos, setPrejuizos] = useState<Prejuizo[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  const [formDesp, setFormDesp] = useState({ categoria: "insumos", descricao: "", valor: "", data_despesa: "", comprovante: "" });
  const [formBem, setFormBem] = useState({ descricao: "", tipo_bem: "trator", data_aquisicao: "", valor_aquisicao: "", valor_residual: "0" });
  const [formConfig, setFormConfig] = useState({
    dependentes: "0", deducao_inss: "0", deducao_previdencia_privada: "0",
    deducao_educacao: "0", deducao_saude: "0", deducao_pensao_alimenticia: "0",
    irrf_retido_fonte: "0", irrf_carne_leao: "0",
    usa_depreciacao: true, compensar_prejuizo: true,
  });

  const showMsg = (tipo: "ok" | "err", texto: string) => { setMsg({ tipo, texto }); setTimeout(() => setMsg(null), 5000); };

  const loadApuracao = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/dirpf/apuracao/${IMOVEL_ID}/${ano}?regime=${regime}`);
      if (r.ok) setApuracao(await r.json());
    } catch { setApuracao(null); }
    setLoading(false);
  }, [ano, regime]);

  const loadDespesas = useCallback(async () => {
    try { setDespesas(await apiFetch(`${API}/dirpf/despesas/${IMOVEL_ID}/${ano}`).then(r => r.json())); }
    catch { setDespesas([]); }
  }, [ano]);

  const loadBens = useCallback(async () => {
    try { setBens(await apiFetch(`${API}/dirpf/bens/${IMOVEL_ID}?ano_base=${ano}`).then(r => r.json())); }
    catch { setBens([]); }
  }, [ano]);

  const loadPrejuizos = useCallback(async () => {
    try { setPrejuizos(await apiFetch(`${API}/dirpf/prejuizo/${IMOVEL_ID}`).then(r => r.json())); }
    catch { setPrejuizos([]); }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const c = await apiFetch(`${API}/dirpf/config/${IMOVEL_ID}/${ano}`).then(r => r.json());
      if (c && c.imovel_id) {
        setFormConfig({
          dependentes: String(c.dependentes || 0),
          deducao_inss: String(c.deducao_inss || 0),
          deducao_previdencia_privada: String(c.deducao_previdencia_privada || 0),
          deducao_educacao: String(c.deducao_educacao || 0),
          deducao_saude: String(c.deducao_saude || 0),
          deducao_pensao_alimenticia: String(c.deducao_pensao_alimenticia || 0),
          irrf_retido_fonte: String(c.irrf_retido_fonte || 0),
          irrf_carne_leao: String(c.irrf_carne_leao || 0),
          usa_depreciacao: c.usa_depreciacao !== false,
          compensar_prejuizo: c.compensar_prejuizo !== false,
        });
        setRegime(c.regime || "presumido_20pct");
      }
    } catch {}
  }, [ano]);

  useEffect(() => { loadApuracao(); }, [loadApuracao]);
  useEffect(() => { if (aba === "despesas") loadDespesas(); }, [aba, loadDespesas]);
  useEffect(() => { if (aba === "depreciacao") loadBens(); }, [aba, loadBens]);
  useEffect(() => { if (aba === "prejuizo") loadPrejuizos(); }, [aba, loadPrejuizos]);
  useEffect(() => { if (aba === "config") loadConfig(); }, [aba, loadConfig]);

  const salvarDespesa = async () => {
    if (!formDesp.descricao || !formDesp.valor) { showMsg("err", "Preencha descrição e valor"); return; }
    const r = await apiFetch(`${API}/dirpf/despesas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imovel_id: IMOVEL_ID, ano_base: ano, ...formDesp, valor: parseFloat(formDesp.valor) }),
    });
    if (r.ok) { showMsg("ok", "Despesa registrada"); loadDespesas(); loadApuracao(); setFormDesp({ categoria: "insumos", descricao: "", valor: "", data_despesa: "", comprovante: "" }); }
    else { const d = await r.json(); showMsg("err", d.detail || "Erro"); }
  };

  const excluirDespesa = async (id: number) => {
    if (!confirm("Excluir esta despesa?")) return;
    await apiFetch(`${API}/dirpf/despesas/${id}`, { method: "DELETE" });
    loadDespesas(); loadApuracao();
  };

  const salvarBem = async () => {
    if (!formBem.descricao || !formBem.data_aquisicao || !formBem.valor_aquisicao) { showMsg("err", "Preencha todos os campos"); return; }
    const r = await apiFetch(`${API}/dirpf/bens`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imovel_id: IMOVEL_ID, ...formBem, valor_aquisicao: parseFloat(formBem.valor_aquisicao), valor_residual: parseFloat(formBem.valor_residual || "0") }),
    });
    if (r.ok) { showMsg("ok", "Bem cadastrado"); loadBens(); setFormBem({ descricao: "", tipo_bem: "trator", data_aquisicao: "", valor_aquisicao: "", valor_residual: "0" }); }
    else showMsg("err", "Erro ao cadastrar bem");
  };

  const baixarBem = async (id: number) => {
    const motivo = prompt("Motivo da baixa (alienacao, sucateamento, sinistro):", "alienacao");
    if (!motivo) return;
    await apiFetch(`${API}/dirpf/bens/${id}/baixa`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_baixa: new Date().toISOString().split("T")[0], valor_baixa: 0, motivo_baixa: motivo }),
    });
    loadBens();
  };

  const salvarConfig = async () => {
    const r = await apiFetch(`${API}/dirpf/config`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: IMOVEL_ID, ano_base: ano, regime,
        dependentes: parseInt(formConfig.dependentes) || 0,
        deducao_inss: parseFloat(formConfig.deducao_inss) || 0,
        deducao_previdencia_privada: parseFloat(formConfig.deducao_previdencia_privada) || 0,
        deducao_educacao: parseFloat(formConfig.deducao_educacao) || 0,
        deducao_saude: parseFloat(formConfig.deducao_saude) || 0,
        deducao_pensao_alimenticia: parseFloat(formConfig.deducao_pensao_alimenticia) || 0,
        irrf_retido_fonte: parseFloat(formConfig.irrf_retido_fonte) || 0,
        irrf_carne_leao: parseFloat(formConfig.irrf_carne_leao) || 0,
        usa_depreciacao: formConfig.usa_depreciacao,
        compensar_prejuizo: formConfig.compensar_prejuizo,
      }),
    });
    if (r.ok) { showMsg("ok", "Configuração salva"); loadApuracao(); }
    else showMsg("err", "Erro ao salvar configuração");
  };

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter',sans-serif", padding: "24px" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    title: { fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 },
    subtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
    kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 12, marginBottom: 20 },


    kpiLabel: { fontSize: 11, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 0.5 },
    tabs: { display: "flex", gap: 4, marginBottom: 20, background: "#fff", borderRadius: 10, padding: 4, boxShadow: "0 1px 4px rgba(0,0,0,.06)", flexWrap: "wrap" as const },

    card: { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden", marginBottom: 16 },
    cardHeader: { padding: "14px 18px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" },
    cardBody: { padding: "16px 18px" },
    table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
    th: { textAlign: "left" as const, padding: "10px 12px", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const },
    td: { padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#334155" },
    input: { width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" as const },
    label: { fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4, display: "block" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },

    row: { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10, paddingBottom: 6, borderBottom: "1.5px solid #f1f5f9" },

    emptyState: { textAlign: "center" as const, padding: "32px 20px", color: "#94a3b8" },
  };
  const kpi = (c: string): React.CSSProperties => ({ background: "#fff", borderRadius: 10, padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", borderLeft: `3px solid ${c}` });
  const kpiVal = (c: string): React.CSSProperties => ({ fontSize: 17, fontWeight: 700, color: c, marginBottom: 2 });
  const tab = (a: boolean): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: a ? "#1e40af" : "transparent", color: a ? "#fff" : "#64748b" });
  const alert = (t: "ok" | "err"): React.CSSProperties => ({ padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13, background: t === "ok" ? "#dcfce7" : "#fee2e2", color: t === "ok" ? "#166534" : "#991b1b", fontWeight: 500 });
  const highlight = (c: string): React.CSSProperties => ({ background: c + "15", border: `1.5px solid ${c}40`, borderRadius: 10, padding: "14px 18px", marginBottom: 12 });
  const btn = (c: string, o?: boolean): React.CSSProperties => ({ padding: "7px 14px", borderRadius: 7, border: o ? `1.5px solid ${c}` : "none", background: o ? "transparent" : c, color: o ? c : "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 });

  const a = apuracao;

  return (

    <AuthGuard>
    <div style={s.page}>
      {msg && <div style={alert(msg.tipo)}>{msg.texto}</div>}

      <div style={s.header}>
        <div>
          <h1 style={s.title}>📊 DIRPF — Atividade Rural</h1>
          <p style={s.subtitle}>Apuração anual — Ficha Atividade Rural (RIR/2018 arts. 58-71 · Lei 9.250/1995 art. 18)</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={ano} onChange={e => setAno(parseInt(e.target.value))} style={{ ...s.input, width: 90 }}>
            {[2021, 2022, 2023, 2024, 2025].map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={regime} onChange={e => setRegime(e.target.value as typeof regime)} style={{ ...s.input, width: 190 }}>
            <option value="presumido_20pct">Presumido 20% (art. 59 RIR)</option>
            <option value="resultado_real">Resultado Real (Lucro Real)</option>
          </select>
          <button style={btn("#1e40af")} onClick={loadApuracao}>Calcular</button>
        </div>
      </div>

      {/* KPIs */}
      {a && (
        <div style={s.kpiGrid}>
          {[
            ["Receita Bruta", fmt(a.receita_bruta), "#10b981"],
            ["Despesas Reais", fmt(a.total_despesas_categorias), "#f59e0b"],
            ["Depreciação", fmt(a.depreciacao_anual), "#f59e0b"],
            ["Base Tributável", fmt(a.base_tributavel), "#1e40af"],
            ["Alíquota Efetiva", fmtPct(a.aliquota_efetiva_pct), "#8b5cf6"],
            ["IRPF Bruto", fmt(a.imposto_bruto), "#ef4444"],
            [a.imposto_a_pagar > 0 ? "A Pagar" : "A Restituir", fmt(a.imposto_a_pagar || a.imposto_a_restituir), a.imposto_a_pagar > 0 ? "#ef4444" : "#10b981"],
          ].map(([l, v, c]) => (
            <div key={l as string} style={kpi(c as string)}>
              <div style={kpiVal(c as string)}>{v}</div>
              <div style={s.kpiLabel}>{l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={s.tabs}>
        {([["apuracao", "📊 Apuração"], ["despesas", "💰 Despesas"], ["depreciacao", "🏗️ Depreciação"], ["prejuizo", "📉 Prejuízo"], ["config", "⚙️ Config"]] as [string, string][]).map(([id, label]) => (
          <button key={id} style={tab(aba === id)} onClick={() => setAba(id as typeof aba)}>{label}</button>
        ))}
      </div>

      {/* ── ABA APURAÇÃO ── */}
      {aba === "apuracao" && (
        loading ? <div style={s.emptyState}>Calculando...</div> : !a ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Nenhum dado para {ano}</div>
            <div style={{ fontSize: 12 }}>Configure as deduções e registre as despesas para calcular.</div>
          </div>
        ) : (
          <div>
            {/* Comparativo */}
            <div style={s.card}>
              <div style={s.cardHeader}><strong>⚖️ Comparativo de Regimes — {ano}</strong></div>
              <div style={s.cardBody}>
                <div style={s.grid2}>
                  {[
                    { label: "Presumido 20%", base: a.comparativo.presumido_base, irpf: a.comparativo.presumido_irpf, rec: "presumido_20pct" },
                    { label: "Resultado Real (Lucro Real)", base: a.comparativo.real_base, irpf: a.comparativo.real_irpf, rec: "resultado_real" },
                  ].map(item => (
                    <div key={item.rec} style={highlight(a.comparativo.recomendacao === item.rec ? "#10b981" : "#94a3b8")}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                        {item.label}
                        {a.comparativo.recomendacao === item.rec && <span style={{ marginLeft: 8, fontSize: 11, background: "#10b981", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>✓ Recomendado</span>}
                        {regime === item.rec && a.comparativo.recomendacao !== item.rec && <span style={{ marginLeft: 8, fontSize: 11, background: "#f59e0b", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>Atual</span>}
                      </div>
                      {[["Base tributável", fmt(item.base)], ["IRPF estimado", fmt(item.irpf)]].map(([k, v]) => (
                        <div key={k} style={s.row}><span style={{ color: "#64748b" }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
                      ))}
                    </div>
                  ))}
                </div>
                {a.comparativo.economia_regime_real > 0 && (
                  <div style={{ background: "#dcfce7", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#166534", fontWeight: 600 }}>
                    💡 {a.comparativo.recomendacao_texto}
                  </div>
                )}
              </div>
            </div>

            {/* Demonstrativo Resultado Real */}
            {regime === "resultado_real" && (
              <div style={s.card}>
                <div style={s.cardHeader}><strong>📋 Demonstrativo Resultado Real — {ano}</strong></div>
                <div style={s.cardBody}>
                  <div style={s.sectionTitle}>Receitas</div>
                  {[["Receita Bruta (Livro Caixa)", fmt(a.receita_bruta), "#10b981"], ["Receita de Acertos de Contrato", fmt(a.receita_acertos), "#10b981"]].map(([k, v, c]) => (
                    <div key={k as string} style={s.row}><span style={{ color: "#64748b" }}>{k}</span><span style={{ fontWeight: 600, color: c as string }}>{v}</span></div>
                  ))}

                  <div style={{ ...s.sectionTitle, marginTop: 16 }}>Despesas Dedutíveis (art. 18 Lei 9.250/1995)</div>
                  {Object.entries(a.despesas_por_categoria).filter(([, v]) => v > 0).map(([cat, val]) => (
                    <div key={cat} style={s.row}>
                      <span style={{ color: "#64748b" }}>{CATEGORIAS[cat] || cat}</span>
                      <span style={{ fontWeight: 600, color: "#ef4444" }}>{fmt(val)}</span>
                    </div>
                  ))}
                  {a.depreciacao_anual > 0 && (
                    <div style={s.row}><span style={{ color: "#64748b" }}>🏗️ Depreciação de Bens (IN SRF 162/1998)</span><span style={{ fontWeight: 600, color: "#ef4444" }}>{fmt(a.depreciacao_anual)}</span></div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13, fontWeight: 700, borderTop: "2px solid #e2e8f0", marginTop: 4 }}>
                    <span>Total Despesas</span><span style={{ color: "#ef4444" }}>{fmt(a.total_deducoes_rurais)}</span>
                  </div>

                  <div style={{ ...s.sectionTitle, marginTop: 16 }}>Resultado</div>
                  <div style={s.row}><span style={{ color: "#64748b" }}>Resultado antes da compensação</span><span style={{ fontWeight: 600, color: a.resultado_antes_prejuizo >= 0 ? "#10b981" : "#ef4444" }}>{fmt(a.resultado_antes_prejuizo)}</span></div>
                  {a.prejuizo_compensado_este_ano > 0 && (
                    <div style={s.row}><span style={{ color: "#64748b" }}>Prejuízo compensado neste ano</span><span style={{ fontWeight: 600, color: "#f59e0b" }}>({fmt(a.prejuizo_compensado_este_ano)})</span></div>
                  )}
                  {a.novo_prejuizo_gerado > 0 && (
                    <div style={{ background: "#fee2e2", borderRadius: 8, padding: "10px 14px", marginTop: 8, fontSize: 13, color: "#991b1b" }}>
                      ⚠️ Prejuízo gerado: <strong>{fmt(a.novo_prejuizo_gerado)}</strong> — compensável em anos futuros sem limite de prazo (RIR/2018 art. 63)
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 14, fontWeight: 800, borderTop: "2px solid #1e40af", marginTop: 8 }}>
                    <span>Base Tributável</span><span style={{ color: "#1e40af" }}>{fmt(a.base_tributavel)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Cálculo IRPF */}
            <div style={s.card}>
              <div style={s.cardHeader}><strong>🧮 Cálculo IRPF {ano}</strong></div>
              <div style={s.cardBody}>
                {[
                  ["Base tributável atividade rural", fmt(a.base_tributavel), "#1e40af"],
                  ["(−) Deduções pessoais", fmt(a.total_deducoes_pessoais), "#f59e0b"],
                  ["= Base de cálculo IRPF", fmt(a.base_calculo_irpf), "#1e40af"],
                  ["Alíquota efetiva", fmtPct(a.aliquota_efetiva_pct), "#334155"],
                  ["IRPF bruto", fmt(a.imposto_bruto), "#ef4444"],
                  ["(−) IRRF retido + Carnê-leão", fmt(a.irrf_retido_total), "#10b981"],
                ].map(([k, v, c]) => (
                  <div key={k as string} style={s.row}><span style={{ color: "#64748b" }}>{k}</span><span style={{ fontWeight: 600, color: c as string }}>{v}</span></div>
                ))}
                <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 10, background: a.imposto_a_pagar > 0 ? "#fee2e2" : "#dcfce7", border: `1.5px solid ${a.imposto_a_pagar > 0 ? "#fca5a5" : "#86efac"}` }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{a.imposto_a_pagar > 0 ? "IRPF A PAGAR" : "IRPF A RESTITUIR"}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: a.imposto_a_pagar > 0 ? "#dc2626" : "#16a34a" }}>
                    {fmt(a.imposto_a_pagar || a.imposto_a_restituir)}
                  </div>
                </div>
              </div>
            </div>

            {/* Deduções pessoais */}
            {a.total_deducoes_pessoais > 0 && (
              <div style={s.card}>
                <div style={s.cardHeader}><strong>👨‍👩‍👧 Deduções Pessoais</strong></div>
                <div style={s.cardBody}>
                  {Object.entries(a.deducoes).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} style={s.row}>
                      <span style={{ color: "#64748b" }}>{k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
                      <span style={{ fontWeight: 600, color: "#f59e0b" }}>{fmt(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── ABA DESPESAS ── */}
      {aba === "despesas" && (
        <div>
          <div style={s.card}>
            <div style={s.cardHeader}><strong>➕ Registrar Despesa Rural — {ano}</strong></div>
            <div style={s.cardBody}>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Categoria *</label>
                  <select style={s.input} value={formDesp.categoria} onChange={e => setFormDesp(f => ({ ...f, categoria: e.target.value }))}>
                    {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Valor (R$) *</label>
                  <input type="number" step="0.01" style={s.input} value={formDesp.valor} onChange={e => setFormDesp(f => ({ ...f, valor: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={s.label}>Descrição *</label>
                <input type="text" style={s.input} value={formDesp.descricao} onChange={e => setFormDesp(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Fertilizante NPK — NF 1234" />
              </div>
              <div style={{ ...s.grid2, marginTop: 10 }}>
                <div>
                  <label style={s.label}>Data</label>
                  <input type="date" style={s.input} value={formDesp.data_despesa} onChange={e => setFormDesp(f => ({ ...f, data_despesa: e.target.value }))} />
                </div>
                <div>
                  <label style={s.label}>Comprovante (NF, recibo)</label>
                  <input type="text" style={s.input} value={formDesp.comprovante} onChange={e => setFormDesp(f => ({ ...f, comprovante: e.target.value }))} />
                </div>
              </div>
              <button style={{ ...btn("#1e40af"), marginTop: 12 }} onClick={salvarDespesa}>Registrar Despesa</button>
            </div>
          </div>

          {a && a.total_despesas_categorias > 0 && (
            <div style={s.card}>
              <div style={s.cardHeader}><strong>📊 Totais por Categoria — {ano}</strong></div>
              <div style={s.cardBody}>
                {Object.entries(a.despesas_por_categoria).filter(([, v]) => v > 0).map(([cat, val]) => (
                  <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>{CATEGORIAS[cat] || cat}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{fmt(val)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 14, fontWeight: 800, borderTop: "2px solid #e2e8f0", marginTop: 4 }}>
                  <span>Total</span><span style={{ color: "#ef4444" }}>{fmt(a.total_despesas_categorias)}</span>
                </div>
              </div>
            </div>
          )}

          <div style={s.card}>
            <div style={s.cardHeader}><strong>📋 Despesas Registradas — {ano}</strong></div>
            {despesas.length === 0 ? (
              <div style={s.emptyState}>Nenhuma despesa registrada para {ano}</div>
            ) : (
              <table style={s.table}>
                <thead><tr>{["Categoria", "Descrição", "Valor", "Data", "Comprovante", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {despesas.map(d => (
                    <tr key={d.id}>
                      <td style={s.td}><span style={{ fontSize: 11, background: "#f1f5f9", borderRadius: 20, padding: "2px 8px" }}>{CATEGORIAS[d.categoria]?.split(" ")[0] || d.categoria}</span></td>
                      <td style={s.td}>{d.descricao}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: "#ef4444" }}>{fmt(d.valor)}</td>
                      <td style={s.td}>{d.data_despesa ? new Date(d.data_despesa).toLocaleDateString("pt-BR") : "-"}</td>
                      <td style={s.td}>{d.comprovante || "-"}</td>
                      <td style={s.td}><button style={{ ...btn("#ef4444", true), padding: "3px 8px", fontSize: 11 }} onClick={() => excluirDespesa(d.id)}>Excluir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── ABA DEPRECIAÇÃO ── */}
      {aba === "depreciacao" && (
        <div>
          <div style={s.card}>
            <div style={s.cardHeader}><strong>➕ Cadastrar Bem — Tabela IN SRF 162/1998</strong></div>
            <div style={s.cardBody}>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Descrição *</label>
                  <input type="text" style={s.input} value={formBem.descricao} onChange={e => setFormBem(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Trator John Deere 5075E" />
                </div>
                <div>
                  <label style={s.label}>Tipo de Bem *</label>
                  <select style={s.input} value={formBem.tipo_bem} onChange={e => setFormBem(f => ({ ...f, tipo_bem: e.target.value }))}>
                    {Object.entries(TIPOS_BEM).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} — {v.anos} anos ({v.taxa}%/ano)</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ ...s.grid3, marginTop: 10 }}>
                <div>
                  <label style={s.label}>Data de Aquisição *</label>
                  <input type="date" style={s.input} value={formBem.data_aquisicao} onChange={e => setFormBem(f => ({ ...f, data_aquisicao: e.target.value }))} />
                </div>
                <div>
                  <label style={s.label}>Valor de Aquisição (R$) *</label>
                  <input type="number" step="0.01" style={s.input} value={formBem.valor_aquisicao} onChange={e => setFormBem(f => ({ ...f, valor_aquisicao: e.target.value }))} />
                </div>
                <div>
                  <label style={s.label}>Valor Residual (R$)</label>
                  <input type="number" step="0.01" style={s.input} value={formBem.valor_residual} onChange={e => setFormBem(f => ({ ...f, valor_residual: e.target.value }))} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Vida útil e taxa preenchidos automaticamente pela tabela IN SRF 162/1998.</div>
              <button style={{ ...btn("#1e40af"), marginTop: 12 }} onClick={salvarBem}>Cadastrar Bem</button>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardHeader}>
              <strong>🏗️ Bens Cadastrados — Depreciação {ano}</strong>
              {a && <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>Total: {fmt(a.depreciacao_anual)}/ano</span>}
            </div>
            {bens.length === 0 ? (
              <div style={s.emptyState}>Nenhum bem cadastrado. Cadastre tratores, colheitadeiras, silos, etc.</div>
            ) : (
              <div style={{ overflowX: "auto" as const }}>
                <table style={s.table}>
                  <thead><tr>{["Bem", "Tipo", "Aquisição", "Valor Aq.", "Vida Útil", "Taxa", "Dep. Anual", "Dep. Acum.", "V. Contábil", "% Dep.", "Status", ""].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {bens.map(b => (
                      <tr key={b.id} style={{ opacity: b.ativo ? 1 : 0.5 }}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{b.descricao}</td>
                        <td style={s.td}>{TIPOS_BEM[b.tipo_bem]?.label || b.tipo_bem}</td>
                        <td style={s.td}>{new Date(b.data_aquisicao).toLocaleDateString("pt-BR")}</td>
                        <td style={s.td}>{fmt(b.valor_aquisicao)}</td>
                        <td style={s.td}>{b.vida_util_anos} anos</td>
                        <td style={s.td}>{b.taxa_depreciacao_pct}%/ano</td>
                        <td style={{ ...s.td, fontWeight: 700, color: "#f59e0b" }}>{fmt(b.dep_anual)}</td>
                        <td style={s.td}>{fmt(b.dep_acumulada)}</td>
                        <td style={{ ...s.td, color: "#1e40af" }}>{fmt(b.valor_contabil)}</td>
                        <td style={s.td}>
                          <div style={{ background: "#f1f5f9", borderRadius: 20, height: 6, width: 60, overflow: "hidden" }}>
                            <div style={{ background: b.pct_depreciado >= 100 ? "#ef4444" : "#f59e0b", height: "100%", width: `${Math.min(100, b.pct_depreciado)}%` }} />
                          </div>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{b.pct_depreciado.toFixed(0)}%</div>
                        </td>
                        <td style={s.td}>{b.ativo ? <span style={{ fontSize: 11, color: "#10b981" }}>Ativo</span> : <span style={{ fontSize: 11, color: "#94a3b8" }}>Baixado</span>}</td>
                        <td style={s.td}>{b.ativo && <button style={{ ...btn("#f59e0b", true), padding: "3px 8px", fontSize: 11 }} onClick={() => baixarBem(b.id)}>Baixar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ABA PREJUÍZO ── */}
      {aba === "prejuizo" && (
        <div>
          <div style={{ ...highlight("#f59e0b"), marginBottom: 16 }}>
            <strong style={{ fontSize: 13 }}>📋 Compensação de Prejuízo Rural</strong>
            <p style={{ fontSize: 12, color: "#475569", margin: "6px 0 0" }}>
              O prejuízo rural pode ser compensado em anos futuros <strong>sem limite de prazo</strong> (RIR/2018 art. 63). Diferente do IRPJ que limita a 30% do lucro.
            </p>
          </div>
          <div style={s.card}>
            <div style={s.cardHeader}><strong>📉 Histórico de Prejuízos</strong></div>
            {prejuizos.length === 0 ? (
              <div style={s.emptyState}>Nenhum prejuízo registrado. Quando o Resultado Real for negativo, o sistema registrará automaticamente.</div>
            ) : (
              <table style={s.table}>
                <thead><tr>{["Ano-base", "Prejuízo Original", "Já Compensado", "Saldo a Compensar", "Status"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {prejuizos.map(p => (
                    <tr key={p.id}>
                      <td style={{ ...s.td, fontWeight: 700 }}>{p.ano_base}</td>
                      <td style={{ ...s.td, color: "#ef4444" }}>{fmt(p.valor_prejuizo)}</td>
                      <td style={{ ...s.td, color: "#10b981" }}>{fmt(p.valor_compensado)}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: p.saldo_compensar > 0 ? "#f59e0b" : "#94a3b8" }}>{fmt(p.saldo_compensar)}</td>
                      <td style={s.td}>{p.saldo_compensar > 0 ? <span style={{ fontSize: 11, color: "#f59e0b" }}>Disponível</span> : <span style={{ fontSize: 11, color: "#94a3b8" }}>Compensado</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {a && a.prejuizo_acumulado_disponivel > 0 && (
            <div style={{ ...highlight("#f59e0b") }}>
              <strong>Saldo total disponível: {fmt(a.prejuizo_acumulado_disponivel)}</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>Será compensado automaticamente no cálculo do Resultado Real quando houver lucro.</div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA CONFIG ── */}
      {aba === "config" && (
        <div style={s.card}>
          <div style={s.cardHeader}><strong>⚙️ Configuração DIRPF — {ano}</strong></div>
          <div style={s.cardBody}>
            <div style={s.sectionTitle}>Regime de Apuração</div>
            <div style={s.grid2}>
              {(["presumido_20pct", "resultado_real"] as const).map(r => (
                <button key={r} onClick={() => setRegime(r)}
                  style={{ padding: "12px 16px", borderRadius: 8, border: `2px solid ${regime === r ? "#1e40af" : "#e2e8f0"}`, background: regime === r ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left" as const }}>
                  <div style={{ fontWeight: 700, color: regime === r ? "#1e40af" : "#334155", fontSize: 13 }}>
                    {r === "presumido_20pct" ? "Presumido 20%" : "Resultado Real (Lucro Real)"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    {r === "presumido_20pct" ? "Base = 20% da receita bruta (art. 59 RIR/2018)" : "Base = Receita − Despesas − Depreciação (art. 18 Lei 9.250/1995)"}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ ...s.sectionTitle, marginTop: 20 }}>Deduções Pessoais</div>
            <div style={s.grid3}>
              {[
                ["Dependentes (qtd)", "dependentes"],
                ["INSS (R$)", "deducao_inss"],
                ["Prev. Privada (R$)", "deducao_previdencia_privada"],
                ["Educação (R$, lim. R$ 3.561,50)", "deducao_educacao"],
                ["Saúde (R$, sem limite)", "deducao_saude"],
                ["Pensão Alimentícia (R$)", "deducao_pensao_alimenticia"],
              ].map(([label, field]) => (
                <div key={field}>
                  <label style={s.label}>{label}</label>
                  <input type="number" step="0.01" style={s.input}
                    value={(formConfig as Record<string, string | boolean>)[field] as string}
                    onChange={e => setFormConfig(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div style={{ ...s.sectionTitle, marginTop: 20 }}>IRRF Retido</div>
            <div style={s.grid2}>
              {[["IRRF Retido na Fonte (R$)", "irrf_retido_fonte"], ["Carnê-leão Pago (R$)", "irrf_carne_leao"]].map(([label, field]) => (
                <div key={field}>
                  <label style={s.label}>{label}</label>
                  <input type="number" step="0.01" style={s.input}
                    value={(formConfig as Record<string, string | boolean>)[field] as string}
                    onChange={e => setFormConfig(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
            </div>

            {regime === "resultado_real" && (
              <>
                <div style={{ ...s.sectionTitle, marginTop: 20 }}>Opções Resultado Real</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {[
                    ["Incluir depreciação de bens no cálculo (IN SRF 162/1998)", "usa_depreciacao"],
                    ["Compensar prejuízos acumulados automaticamente (RIR/2018 art. 63)", "compensar_prejuizo"],
                  ].map(([label, field]) => (
                    <label key={field} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox"
                        checked={(formConfig as Record<string, string | boolean>)[field] as boolean}
                        onChange={e => setFormConfig(f => ({ ...f, [field]: e.target.checked }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}

            <button style={{ ...btn("#1e40af"), marginTop: 20 }} onClick={salvarConfig}>Salvar Configuração</button>
          </div>
        </div>
      )}
    </div>
  );
}
