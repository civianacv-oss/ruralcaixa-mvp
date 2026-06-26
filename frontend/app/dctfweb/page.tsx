"use client";
import { apiFetch } from "@/lib/api";
import React, { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

type Declaracao = {
  id: number; competencia: string; tipo: string; status: string;
  funrural_valor: number; senar_valor: number; inss_servicos_valor: number;
  total_devido: number; valor_credito_vinculado: number; valor_pago: number;
  valor_compensado: number; saldo_a_pagar: number;
  numero_declaracao?: string; data_transmissao?: string;
  perdcomp_numero?: string; observacoes?: string;
  credito_descricao?: string; credito_valor_original?: number;
};
type Credito = {
  id: number; tipo: string; competencia_origem: string;
  valor_original: number; descricao: string; numero_perdcomp?: string;
  total_utilizado: number; saldo_disponivel: number;
};
type Perdcomp = {
  id: number; numero: string; tipo: string; competencia_debito: string;
  valor_solicitado: number; valor_deferido: number; status: string;
  data_protocolo?: string; credito_descricao?: string; credito_valor_original?: number;
};
type PainelItem = {
  competencia: string;
  declaracao_ativa?: Declaracao;
  historico_declaracoes: Declaracao[];
  apuracao_reinf?: { total_a_recolher: number; status_darf: string; total_funrural: number; total_senar: number };
  perdcomps: Perdcomp[];
  acao_sugerida: { codigo: string; label: string; cor: string; detalhe?: string };
};
type Kpis = {
  total_devido: number; total_pago: number; total_compensado: number;
  saldo_em_aberto: number; declaracoes_pendentes_transmissao: number;
  creditos_disponiveis: number; saldo_creditos: number;
};

const IMOVEL_ID = 1;
const STATUS_COLORS: Record<string, string> = {
  rascunho: "#f59e0b", transmitida: "#3b82f6", retificada: "#8b5cf6",
  cancelada: "#6b7280", concluida: "#10b981"
};
const ACAO_COLORS: Record<string, string> = {
  red: "#ef4444", orange: "#f59e0b", green: "#10b981",
  blue: "#3b82f6", gray: "#9ca3af"
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function fmtComp(c: string) {
  if (!c) return "";
  const [y, m] = c.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m)-1]}/${y}`;
}

export default function DCTFWebPage() {
  const [aba, setAba] = useState<"painel"|"declaracoes"|"creditos"|"perdcomp"|"nova">("painel");
  const [painel, setPainel] = useState<PainelItem[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [declaracoes, setDeclaracoes] = useState<Declaracao[]>([]);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [perdcomps, setPerdcomps] = useState<Perdcomp[]>([]);
  const [creditosDisponiveis, setCreditosDisponiveis] = useState<Credito[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{tipo:"ok"|"err", texto:string}|null>(null);
  const [expandido, setExpandido] = useState<string|null>(null);
  const [filtroAno, setFiltroAno] = useState(new Date().getFullYear().toString());

  // Formulário nova declaração
  const [form, setForm] = useState({
    competencia: "", tipo: "original",
    funrural_valor: "", senar_valor: "", inss_servicos_valor: "",
    credito_origem_id: "", valor_credito_vinculado: "",
    valor_pago: "", data_pagamento: "", numero_darf: "",
    perdcomp_numero: "", valor_compensado: "",
    numero_declaracao: "", data_transmissao: "", observacoes: ""
  });

  // Formulário crédito
  const [formCred, setFormCred] = useState({
    tipo: "pagamento_indevido", competencia_origem: "",
    valor_original: "", descricao: "", numero_perdcomp: ""
  });

  const showMsg = (tipo: "ok"|"err", texto: string) => {
    setMsg({ tipo, texto });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadPainel = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/dctfweb/painel/${IMOVEL_ID}?competencia_inicio=${filtroAno}-01&competencia_fim=${filtroAno}-12`);
      const d = await r.json();
      setPainel(d.painel || []);
      setKpis(d.kpis || null);
      setCreditosDisponiveis(d.creditos_disponiveis || []);
    } catch { showMsg("err", "Erro ao carregar painel"); }
    setLoading(false);
  }, [filtroAno]);

  const loadDeclaracoes = useCallback(async () => {
    const r = await apiFetch(`${API}/dctfweb/declaracoes/${IMOVEL_ID}?ano=${filtroAno}`);
    setDeclaracoes(await r.json());
  }, [filtroAno]);

  const loadCreditos = useCallback(async () => {
    const r = await apiFetch(`${API}/dctfweb/creditos/${IMOVEL_ID}`);
    setCreditos(await r.json());
  }, []);

  const loadPerdcomp = useCallback(async () => {
    const r = await apiFetch(`${API}/dctfweb/perdcomp/${IMOVEL_ID}`);
    setPerdcomps(await r.json());
  }, []);

  useEffect(() => {
    if (aba === "painel") loadPainel();
    if (aba === "declaracoes") loadDeclaracoes();
    if (aba === "creditos") loadCreditos();
    if (aba === "perdcomp") loadPerdcomp();
  }, [aba, loadPainel, loadDeclaracoes, loadCreditos, loadPerdcomp]);

  // Calcular totais do formulário
  const totalDevido = (parseFloat(form.funrural_valor)||0) + (parseFloat(form.senar_valor)||0) + (parseFloat(form.inss_servicos_valor)||0);
  const saldoCalc = Math.max(0, totalDevido - (parseFloat(form.valor_credito_vinculado)||0) - (parseFloat(form.valor_pago)||0) - (parseFloat(form.valor_compensado)||0));

  const salvarDeclaracao = async () => {
    if (!form.competencia) { showMsg("err", "Informe a competência"); return; }
    const body = {
      imovel_id: IMOVEL_ID,
      competencia: form.competencia,
      tipo: form.tipo,
      funrural_valor: parseFloat(form.funrural_valor)||0,
      senar_valor: parseFloat(form.senar_valor)||0,
      inss_servicos_valor: parseFloat(form.inss_servicos_valor)||0,
      credito_origem_id: form.credito_origem_id ? parseInt(form.credito_origem_id) : null,
      valor_credito_vinculado: parseFloat(form.valor_credito_vinculado)||0,
      valor_pago: parseFloat(form.valor_pago)||0,
      data_pagamento: form.data_pagamento || null,
      numero_darf: form.numero_darf || null,
      perdcomp_numero: form.perdcomp_numero || null,
      valor_compensado: parseFloat(form.valor_compensado)||0,
      numero_declaracao: form.numero_declaracao || null,
      data_transmissao: form.data_transmissao || null,
      observacoes: form.observacoes || null,
    };
    const r = await apiFetch(`${API}/dctfweb/declaracoes`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { showMsg("err", d.detail || "Erro ao salvar"); return; }
    showMsg("ok", `Declaração criada (id ${d.id}). Saldo a pagar: ${fmt(d.saldo_a_pagar)}`);
    setForm({ competencia:"", tipo:"original", funrural_valor:"", senar_valor:"", inss_servicos_valor:"", credito_origem_id:"", valor_credito_vinculado:"", valor_pago:"", data_pagamento:"", numero_darf:"", perdcomp_numero:"", valor_compensado:"", numero_declaracao:"", data_transmissao:"", observacoes:"" });
    setAba("painel");
    loadPainel();
  };

  const salvarCredito = async () => {
    if (!formCred.competencia_origem || !formCred.valor_original || !formCred.descricao) {
      showMsg("err", "Preencha competência, valor e descrição"); return;
    }
    const body = { imovel_id: IMOVEL_ID, ...formCred, valor_original: parseFloat(formCred.valor_original) };
    const r = await apiFetch(`${API}/dctfweb/creditos`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    if (!r.ok) { showMsg("err", "Erro ao salvar crédito"); return; }
    showMsg("ok", "Crédito registrado com sucesso");
    setFormCred({ tipo:"pagamento_indevido", competencia_origem:"", valor_original:"", descricao:"", numero_perdcomp:"" });
    loadCreditos();
  };

  const marcarTransmitida = async (id: number) => {
    const num = prompt("Número da declaração DCTFWeb (e-CAC):");
    if (!num) return;
    const r = await apiFetch(`${API}/dctfweb/declaracoes/${id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ status:"transmitida", numero_declaracao: num, data_transmissao: new Date().toISOString().split("T")[0] })
    });
    if (r.ok) { showMsg("ok", "Declaração marcada como transmitida"); loadPainel(); loadDeclaracoes(); }
  };

  const s = {
    page: { minHeight:"100vh", background:"#f8fafc", fontFamily:"'Inter',sans-serif", padding:"24px" },
    header: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 },
    title: { fontSize:22, fontWeight:700, color:"#1e293b", margin:0 },
    subtitle: { fontSize:13, color:"#64748b", marginTop:2 },
    tabs: { display:"flex", gap:4, marginBottom:24, background:"#fff", borderRadius:10, padding:4, boxShadow:"0 1px 4px rgba(0,0,0,.06)", width:"fit-content" },

    kpiGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 },
    kpi: { background:"#fff", borderRadius:10, padding:"16px 20px", boxShadow:"0 1px 4px rgba(0,0,0,.06)" },
    kpiVal: { fontSize:20, fontWeight:700, color:"#1e293b", marginBottom:2 },
    kpiLabel: { fontSize:11, color:"#94a3b8", textTransform:"uppercase" as const, letterSpacing:.5 },
    card: { background:"#fff", borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,.06)", marginBottom:12, overflow:"hidden" },
    cardHeader: { padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", userSelect:"none" as const },
    cardBody: { padding:"0 18px 16px" },

    input: { width:"100%", padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" as const },
    label: { fontSize:12, fontWeight:600, color:"#475569", marginBottom:4, display:"block" },
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
    grid3: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
    section: { marginBottom:20 },
    sectionTitle: { fontSize:13, fontWeight:700, color:"#334155", marginBottom:10, paddingBottom:6, borderBottom:"1.5px solid #f1f5f9" },
    table: { width:"100%", borderCollapse:"collapse" as const, fontSize:13 },
    th: { textAlign:"left" as const, padding:"8px 10px", background:"#f8fafc", color:"#64748b", fontSize:11, fontWeight:600, textTransform:"uppercase" as const, letterSpacing:.4 },
    td: { padding:"10px 10px", borderBottom:"1px solid #f1f5f9", color:"#334155" },

    emptyState: { textAlign:"center" as const, padding:"40px 20px", color:"#94a3b8" },
    previewBox: { background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"14px 18px", marginTop:12 },
    previewRow: { display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:13 },
    previewTotal: { display:"flex", justifyContent:"space-between", padding:"8px 0 0", marginTop:4, borderTop:"2px solid #e2e8f0", fontWeight:700, fontSize:14 },

  };
  const tab = (active: boolean): React.CSSProperties => ({ padding:"8px 16px", borderRadius:7, border:"none", cursor:"pointer", fontSize:13, fontWeight:500, background: active ? "#1e40af" : "transparent", color: active ? "#fff" : "#64748b", transition:"all .15s" });
  const alert = (tipo: "ok"|"err"): React.CSSProperties => ({ padding:"12px 16px", borderRadius:8, marginBottom:16, fontSize:13, background: tipo==="ok" ? "#dcfce7" : "#fee2e2", color: tipo==="ok" ? "#166534" : "#991b1b", fontWeight:500 });
  const previewSaldo = (v: number): React.CSSProperties => ({ display:"flex", justifyContent:"space-between", padding:"6px 0 0", fontWeight:700, fontSize:15, color: v > 0 ? "#ef4444" : "#10b981" });
  const badge = (cor: string) => ({ display:"inline-block", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, background: cor+"22", color: cor });
  const btn = (color: string, outline?: boolean): React.CSSProperties => ({ padding:"7px 14px", borderRadius:7, border: outline ? `1.5px solid ${color}` : "none", background: outline ? "transparent" : color, color: outline ? color : "#fff", cursor:"pointer", fontSize:12, fontWeight:600, transition:"all .15s" });

  return (
    <div style={s.page}>
      {msg && <div style={alert(msg.tipo)}>{msg.texto}</div>}

      <div style={s.header}>
        <div>
          <h1 style={s.title}>📋 DCTFWeb</h1>
          <p style={s.subtitle}>Gestão de declarações, créditos e PER/DCOMP — a partir de 10/2021</p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
            style={{ ...s.input, width:90 }}>
            {[2021,2022,2023,2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <button style={btn("#1e40af")} onClick={() => setAba("nova")}>+ Nova Declaração</button>
        </div>
      </div>

      <div style={s.tabs}>
        {([["painel","🗺️ Painel Guia"],["declaracoes","📄 Declarações"],["creditos","💳 Créditos"],["perdcomp","🔄 PER/DCOMP"],["nova","➕ Nova"]] as [string,string][]).map(([id,label]) => (
          <button key={id} style={tab(aba===id)} onClick={() => setAba(id as typeof aba)}>{label}</button>
        ))}
      </div>

      {/* ── PAINEL GUIA ── */}
      {aba === "painel" && (
        <div>
          {kpis && (
            <div style={s.kpiGrid}>
              {[
                ["Total Devido", fmt(kpis.total_devido), "#1e40af"],
                ["Total Pago", fmt(kpis.total_pago), "#10b981"],
                ["Compensado", fmt(kpis.total_compensado), "#8b5cf6"],
                ["Saldo em Aberto", fmt(kpis.saldo_em_aberto), kpis.saldo_em_aberto > 0 ? "#ef4444" : "#10b981"],
                ["Pendentes Transmissão", kpis.declaracoes_pendentes_transmissao.toString(), "#f59e0b"],
                ["Créditos Disponíveis", fmt(kpis.saldo_creditos), "#0ea5e9"],
              ].map(([label, val, cor]) => (
                <div key={label} style={s.kpi}>
                  <div style={{ ...s.kpiVal, color: cor }}>{val}</div>
                  <div style={s.kpiLabel}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {creditosDisponiveis.length > 0 && (
            <div style={{ ...s.card, border:"2px solid #bfdbfe", marginBottom:16 }}>
              <div style={{ padding:"12px 18px", background:"#eff6ff", borderBottom:"1px solid #bfdbfe" }}>
                <strong style={{ color:"#1e40af", fontSize:13 }}>💳 Créditos disponíveis para compensação</strong>
              </div>
              <div style={{ padding:"12px 18px", display:"flex", flexWrap:"wrap" as const, gap:10 }}>
                {creditosDisponiveis.map(c => (
                  <div key={c.id} style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 14px", fontSize:12 }}>
                    <div style={{ fontWeight:700, color:"#0369a1" }}>{fmt(c.saldo_disponivel)}</div>
                    <div style={{ color:"#64748b" }}>{c.descricao} — {fmtComp(c.competencia_origem)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div style={s.emptyState}>Carregando painel...</div>
          ) : painel.length === 0 ? (
            <div style={s.emptyState}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              <div style={{ fontWeight:600, marginBottom:4 }}>Nenhuma declaração em {filtroAno}</div>
              <div style={{ fontSize:12 }}>Crie a primeira declaração ou verifique o EFD-Reinf.</div>
            </div>
          ) : (
            painel.map(item => (
              <div key={item.competencia} style={s.card}>
                <div style={s.cardHeader} onClick={() => setExpandido(expandido === item.competencia ? null : item.competencia)}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:15, fontWeight:700, color:"#1e293b" }}>{fmtComp(item.competencia)}</span>
                    {item.declaracao_ativa && (
                      <span style={badge(STATUS_COLORS[item.declaracao_ativa.status] || "#6b7280")}>
                        {item.declaracao_ativa.status}
                      </span>
                    )}
                    {item.declaracao_ativa?.tipo === "retificadora" && (
                      <span style={badge("#8b5cf6")}>retificadora</span>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ ...badge(ACAO_COLORS[item.acao_sugerida.cor] || "#6b7280"), fontSize:12 }}>
                      {item.acao_sugerida.label}
                    </span>
                    {item.declaracao_ativa && (
                      <span style={{ fontSize:14, fontWeight:700, color: (item.declaracao_ativa.saldo_a_pagar||0) > 0 ? "#ef4444" : "#10b981" }}>
                        {fmt(item.declaracao_ativa.saldo_a_pagar || 0)}
                      </span>
                    )}
                    <span style={{ color:"#94a3b8", fontSize:16 }}>{expandido === item.competencia ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expandido === item.competencia && (
                  <div style={s.cardBody}>
                    {item.acao_sugerida.detalhe && (
                      <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:12, color:"#92400e" }}>
                        ⚠️ {item.acao_sugerida.detalhe}
                      </div>
                    )}

                    <div style={s.grid2}>
                      {/* Declaração */}
                      <div>
                        <div style={s.sectionTitle}>📄 Declaração DCTFWeb</div>
                        {item.declaracao_ativa ? (
                          <table style={s.table}>
                            <tbody>
                              {[
                                ["FUNRURAL", fmt(item.declaracao_ativa.funrural_valor)],
                                ["SENAR", fmt(item.declaracao_ativa.senar_valor)],
                                ["INSS Serviços", fmt(item.declaracao_ativa.inss_servicos_valor)],
                                ["Total Devido", fmt(item.declaracao_ativa.total_devido)],
                                ["Crédito Vinculado", fmt(item.declaracao_ativa.valor_credito_vinculado)],
                                ["Valor Pago", fmt(item.declaracao_ativa.valor_pago)],
                                ["Compensado", fmt(item.declaracao_ativa.valor_compensado)],
                              ].map(([k,v]) => (
                                <tr key={k}><td style={{ ...s.td, color:"#64748b", paddingLeft:0 }}>{k}</td><td style={{ ...s.td, textAlign:"right" as const, fontWeight:500 }}>{v}</td></tr>
                              ))}
                              <tr>
                                <td style={{ ...s.td, fontWeight:700, paddingLeft:0, color:"#1e293b" }}>Saldo a Pagar</td>
                                <td style={{ ...s.td, textAlign:"right" as const, fontWeight:800, fontSize:15, color: (item.declaracao_ativa.saldo_a_pagar||0) > 0 ? "#ef4444" : "#10b981" }}>
                                  {fmt(item.declaracao_ativa.saldo_a_pagar || 0)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ color:"#94a3b8", fontSize:12, padding:"8px 0" }}>Nenhuma declaração criada</div>
                        )}
                        <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" as const }}>
                          {item.declaracao_ativa?.status === "rascunho" && (
                            <button style={btn("#1e40af")} onClick={() => marcarTransmitida(item.declaracao_ativa!.id)}>
                              ✓ Marcar Transmitida
                            </button>
                          )}
                          {item.acao_sugerida.codigo === "criar_dctfweb" && (
                            <button style={btn("#f59e0b")} onClick={() => {
                              setForm(f => ({ ...f, competencia: item.competencia,
                                funrural_valor: item.apuracao_reinf?.total_funrural?.toString() || "",
                                senar_valor: item.apuracao_reinf?.total_senar?.toString() || "" }));
                              setAba("nova");
                            }}>
                              + Criar DCTFWeb
                            </button>
                          )}
                          {item.declaracao_ativa?.status === "transmitida" && (
                            <button style={btn("#8b5cf6", true)} onClick={() => {
                              setForm(f => ({ ...f, competencia: item.competencia, tipo:"retificadora" }));
                              setAba("nova");
                            }}>
                              ✏️ Retificar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* EFD-Reinf */}
                      <div>
                        <div style={s.sectionTitle}>🔗 EFD-Reinf Apuração</div>
                        {item.apuracao_reinf ? (
                          <table style={s.table}>
                            <tbody>
                              {[
                                ["FUNRURAL Apurado", fmt(item.apuracao_reinf.total_funrural)],
                                ["SENAR Apurado", fmt(item.apuracao_reinf.total_senar)],
                                ["Total a Recolher", fmt(item.apuracao_reinf.total_a_recolher)],
                                ["Status DARF", item.apuracao_reinf.status_darf],
                              ].map(([k,v]) => (
                                <tr key={k}><td style={{ ...s.td, color:"#64748b", paddingLeft:0 }}>{k}</td><td style={{ ...s.td, textAlign:"right" as const, fontWeight:500 }}>{v}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ color:"#94a3b8", fontSize:12, padding:"8px 0" }}>Sem apuração EFD-Reinf</div>
                        )}

                        {item.perdcomps.length > 0 && (
                          <>
                            <div style={{ ...s.sectionTitle, marginTop:12 }}>🔄 PER/DCOMP</div>
                            {item.perdcomps.map(p => (
                              <div key={p.id} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 12px", marginBottom:6, fontSize:12 }}>
                                <div style={{ fontWeight:600 }}>{p.numero} — {p.tipo}</div>
                                <div style={{ color:"#64748b" }}>Solicitado: {fmt(p.valor_solicitado)} | Deferido: {fmt(p.valor_deferido)}</div>
                                <span style={badge(p.status === "deferido" ? "#10b981" : p.status === "indeferido" ? "#ef4444" : "#f59e0b")}>
                                  {p.status}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>

                    {item.historico_declaracoes.length > 1 && (
                      <div style={{ marginTop:12 }}>
                        <div style={s.sectionTitle}>📚 Histórico de Declarações</div>
                        <table style={s.table}>
                          <thead><tr>
                            {["ID","Tipo","Status","Total Devido","Saldo","Número","Transmissão"].map(h => <th key={h} style={s.th}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {item.historico_declaracoes.map(d => (
                              <tr key={d.id}>
                                <td style={s.td}>{d.id}</td>
                                <td style={s.td}><span style={badge(d.tipo === "retificadora" ? "#8b5cf6" : "#3b82f6")}>{d.tipo}</span></td>
                                <td style={s.td}><span style={badge(STATUS_COLORS[d.status]||"#6b7280")}>{d.status}</span></td>
                                <td style={s.td}>{fmt(d.total_devido)}</td>
                                <td style={s.td}>{fmt(d.saldo_a_pagar)}</td>
                                <td style={s.td}>{d.numero_declaracao || "—"}</td>
                                <td style={s.td}>{d.data_transmissao || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── DECLARAÇÕES ── */}
      {aba === "declaracoes" && (
        <div style={s.card}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <strong style={{ fontSize:14 }}>Declarações {filtroAno}</strong>
            <button style={btn("#1e40af")} onClick={() => setAba("nova")}>+ Nova</button>
          </div>
          {declaracoes.length === 0 ? (
            <div style={s.emptyState}>Nenhuma declaração encontrada</div>
          ) : (
            <table style={{ ...s.table, margin:0 }}>
              <thead><tr>
                {["Competência","Tipo","Status","Total Devido","Pago","Compensado","Saldo","Número","Ações"].map(h => <th key={h} style={s.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {declaracoes.map(d => (
                  <tr key={d.id}>
                    <td style={s.td}>{fmtComp(d.competencia)}</td>
                    <td style={s.td}><span style={badge(d.tipo==="retificadora"?"#8b5cf6":"#3b82f6")}>{d.tipo}</span></td>
                    <td style={s.td}><span style={badge(STATUS_COLORS[d.status]||"#6b7280")}>{d.status}</span></td>
                    <td style={s.td}>{fmt(d.total_devido)}</td>
                    <td style={s.td}>{fmt(d.valor_pago)}</td>
                    <td style={s.td}>{fmt(d.valor_compensado)}</td>
                    <td style={{ ...s.td, fontWeight:700, color:(d.saldo_a_pagar||0)>0?"#ef4444":"#10b981" }}>{fmt(d.saldo_a_pagar)}</td>
                    <td style={s.td}>{d.numero_declaracao || "—"}</td>
                    <td style={s.td}>
                      {d.status === "rascunho" && (
                        <button style={btn("#1e40af", true)} onClick={() => marcarTransmitida(d.id)}>Transmitir</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CRÉDITOS ── */}
      {aba === "creditos" && (
        <div>
          <div style={s.card}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9" }}>
              <strong style={{ fontSize:14 }}>Registrar Novo Crédito</strong>
            </div>
            <div style={{ padding:"16px 18px" }}>
              <div style={s.grid2}>
                <div>
                  <label style={s.label}>Tipo de Crédito</label>
                  <select style={s.input} value={formCred.tipo} onChange={e => setFormCred(f => ({...f, tipo:e.target.value}))}>
                    <option value="pagamento_indevido">Pagamento Indevido</option>
                    <option value="pagamento_a_maior">Pagamento a Maior</option>
                    <option value="saldo_negativo">Saldo Negativo</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>Competência de Origem</label>
                  <input type="month" style={s.input} value={formCred.competencia_origem}
                    onChange={e => setFormCred(f => ({...f, competencia_origem:e.target.value}))} />
                </div>
                <div>
                  <label style={s.label}>Valor Original (R$)</label>
                  <input type="number" step="0.01" style={s.input} value={formCred.valor_original}
                    onChange={e => setFormCred(f => ({...f, valor_original:e.target.value}))} />
                </div>
                <div>
                  <label style={s.label}>Nº PER/DCOMP (opcional)</label>
                  <input type="text" style={s.input} value={formCred.numero_perdcomp}
                    onChange={e => setFormCred(f => ({...f, numero_perdcomp:e.target.value}))} />
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={s.label}>Descrição</label>
                  <input type="text" style={s.input} value={formCred.descricao}
                    onChange={e => setFormCred(f => ({...f, descricao:e.target.value}))}
                    placeholder="Ex: Pagamento duplicado competência 2024-03" />
                </div>
              </div>
              <button style={{ ...btn("#10b981"), marginTop:12 }} onClick={salvarCredito}>Registrar Crédito</button>
            </div>
          </div>

          <div style={s.card}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9" }}>
              <strong style={{ fontSize:14 }}>Créditos Registrados</strong>
            </div>
            {creditos.length === 0 ? (
              <div style={s.emptyState}>Nenhum crédito registrado</div>
            ) : (
              <table style={{ ...s.table, margin:0 }}>
                <thead><tr>
                  {["Competência","Tipo","Valor Original","Utilizado","Saldo Disponível","Descrição"].map(h => <th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {creditos.map(c => (
                    <tr key={c.id}>
                      <td style={s.td}>{fmtComp(c.competencia_origem)}</td>
                      <td style={s.td}><span style={badge("#3b82f6")}>{c.tipo.replace(/_/g," ")}</span></td>
                      <td style={s.td}>{fmt(c.valor_original)}</td>
                      <td style={s.td}>{fmt(c.total_utilizado)}</td>
                      <td style={{ ...s.td, fontWeight:700, color: c.saldo_disponivel > 0 ? "#10b981" : "#94a3b8" }}>
                        {fmt(c.saldo_disponivel)}
                      </td>
                      <td style={s.td}>{c.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── PER/DCOMP ── */}
      {aba === "perdcomp" && (
        <div style={s.card}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <strong style={{ fontSize:14 }}>PER/DCOMP — Pedidos de Restituição e Compensação</strong>
          </div>
          {perdcomps.length === 0 ? (
            <div style={s.emptyState}>
              <div style={{ fontSize:36, marginBottom:8 }}>🔄</div>
              <div style={{ fontWeight:600 }}>Nenhum PER/DCOMP registrado</div>
              <div style={{ fontSize:12, marginTop:4 }}>Registre créditos primeiro, depois vincule PER/DCOMPs a eles.</div>
            </div>
          ) : (
            <table style={{ ...s.table, margin:0 }}>
              <thead><tr>
                {["Número","Tipo","Comp. Débito","Crédito Origem","Solicitado","Deferido","Status","Protocolo"].map(h => <th key={h} style={s.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {perdcomps.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...s.td, fontWeight:600 }}>{p.numero}</td>
                    <td style={s.td}><span style={badge("#8b5cf6")}>{p.tipo}</span></td>
                    <td style={s.td}>{fmtComp(p.competencia_debito)}</td>
                    <td style={s.td}>{p.credito_descricao || "—"}</td>
                    <td style={s.td}>{fmt(p.valor_solicitado)}</td>
                    <td style={s.td}>{fmt(p.valor_deferido)}</td>
                    <td style={s.td}>
                      <span style={badge(p.status==="deferido"?"#10b981":p.status==="indeferido"?"#ef4444":"#f59e0b")}>
                        {p.status}
                      </span>
                    </td>
                    <td style={s.td}>{p.data_protocolo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── NOVA DECLARAÇÃO ── */}
      {aba === "nova" && (
        <div style={s.card}>
          <div style={{ padding:"14px 18px", borderBottom:"1px solid #f1f5f9" }}>
            <strong style={{ fontSize:14 }}>Nova Declaração DCTFWeb</strong>
          </div>
          <div style={{ padding:"16px 18px" }}>
            <div style={s.grid2}>
              <div>
                <label style={s.label}>Competência *</label>
                <input type="month" style={s.input} value={form.competencia}
                  onChange={e => setForm(f => ({...f, competencia:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Tipo</label>
                <select style={s.input} value={form.tipo} onChange={e => setForm(f => ({...f, tipo:e.target.value}))}>
                  <option value="original">Original</option>
                  <option value="retificadora">Retificadora</option>
                  <option value="cancelamento">Cancelamento</option>
                </select>
              </div>
            </div>

            <div style={{ ...s.sectionTitle, marginTop:16 }}>Valores Declarados</div>
            <div style={s.grid3}>
              <div>
                <label style={s.label}>FUNRURAL (R$)</label>
                <input type="number" step="0.01" style={s.input} value={form.funrural_valor}
                  onChange={e => setForm(f => ({...f, funrural_valor:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>SENAR (R$)</label>
                <input type="number" step="0.01" style={s.input} value={form.senar_valor}
                  onChange={e => setForm(f => ({...f, senar_valor:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>INSS Serviços (R$)</label>
                <input type="number" step="0.01" style={s.input} value={form.inss_servicos_valor}
                  onChange={e => setForm(f => ({...f, inss_servicos_valor:e.target.value}))} />
              </div>
            </div>

            <div style={{ ...s.sectionTitle, marginTop:16 }}>Créditos e Pagamentos</div>
            <div style={s.grid2}>
              <div>
                <label style={s.label}>Crédito de Origem (ID)</label>
                <select style={s.input} value={form.credito_origem_id}
                  onChange={e => setForm(f => ({...f, credito_origem_id:e.target.value}))}>
                  <option value="">— Nenhum —</option>
                  {creditosDisponiveis.map(c => (
                    <option key={c.id} value={c.id}>{c.descricao} (saldo: {fmt(c.saldo_disponivel)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.label}>Valor do Crédito Vinculado (R$)</label>
                <input type="number" step="0.01" style={s.input} value={form.valor_credito_vinculado}
                  onChange={e => setForm(f => ({...f, valor_credito_vinculado:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Nº PER/DCOMP</label>
                <input type="text" style={s.input} value={form.perdcomp_numero}
                  onChange={e => setForm(f => ({...f, perdcomp_numero:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Valor Compensado (R$)</label>
                <input type="number" step="0.01" style={s.input} value={form.valor_compensado}
                  onChange={e => setForm(f => ({...f, valor_compensado:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Valor Pago (DARF) (R$)</label>
                <input type="number" step="0.01" style={s.input} value={form.valor_pago}
                  onChange={e => setForm(f => ({...f, valor_pago:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Data do Pagamento</label>
                <input type="date" style={s.input} value={form.data_pagamento}
                  onChange={e => setForm(f => ({...f, data_pagamento:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Nº DARF</label>
                <input type="text" style={s.input} value={form.numero_darf}
                  onChange={e => setForm(f => ({...f, numero_darf:e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Nº Declaração (e-CAC)</label>
                <input type="text" style={s.input} value={form.numero_declaracao}
                  onChange={e => setForm(f => ({...f, numero_declaracao:e.target.value}))} />
              </div>
            </div>

            <div style={{ marginTop:12 }}>
              <label style={s.label}>Observações</label>
              <textarea style={{ ...s.input, height:60, resize:"vertical" as const }} value={form.observacoes}
                onChange={e => setForm(f => ({...f, observacoes:e.target.value}))} />
            </div>

            {/* Preview */}
            {totalDevido > 0 && (
              <div style={s.previewBox}>
                <div style={{ fontSize:12, fontWeight:700, color:"#64748b", marginBottom:8, textTransform:"uppercase" as const, letterSpacing:.5 }}>Preview do Cálculo</div>
                <div style={s.previewRow}><span style={{ color:"#64748b" }}>FUNRURAL</span><span>{fmt(parseFloat(form.funrural_valor)||0)}</span></div>
                <div style={s.previewRow}><span style={{ color:"#64748b" }}>SENAR</span><span>{fmt(parseFloat(form.senar_valor)||0)}</span></div>
                <div style={s.previewRow}><span style={{ color:"#64748b" }}>INSS Serviços</span><span>{fmt(parseFloat(form.inss_servicos_valor)||0)}</span></div>
                <div style={s.previewTotal}><span>Total Devido</span><span>{fmt(totalDevido)}</span></div>
                {(parseFloat(form.valor_credito_vinculado)||0) > 0 && <div style={s.previewRow}><span style={{ color:"#10b981" }}>(-) Crédito Vinculado</span><span style={{ color:"#10b981" }}>-{fmt(parseFloat(form.valor_credito_vinculado)||0)}</span></div>}
                {(parseFloat(form.valor_pago)||0) > 0 && <div style={s.previewRow}><span style={{ color:"#10b981" }}>(-) Valor Pago</span><span style={{ color:"#10b981" }}>-{fmt(parseFloat(form.valor_pago)||0)}</span></div>}
                {(parseFloat(form.valor_compensado)||0) > 0 && <div style={s.previewRow}><span style={{ color:"#10b981" }}>(-) Compensado</span><span style={{ color:"#10b981" }}>-{fmt(parseFloat(form.valor_compensado)||0)}</span></div>}
                <div style={previewSaldo(saldoCalc)}><span>Saldo a Pagar</span><span>{fmt(saldoCalc)}</span></div>
              </div>
            )}

            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <button style={btn("#1e40af")} onClick={salvarDeclaracao}>Salvar Declaração</button>
              <button style={btn("#6b7280", true)} onClick={() => setAba("painel")}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
