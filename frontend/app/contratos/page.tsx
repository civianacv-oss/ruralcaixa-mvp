"use client";
import { useState, useEffect, useCallback } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const FAZENDA_ID = 1;

type Produtor = { id: number; nome: string; cpf: string; telefone?: string };
type Contrato = {
  id: string; tipo: string; status: string; data_inicio: string; data_fim: string;
  percentual_outorgante: number; percentual_outorgado: number;
  outorgante_nome: string; outorgado_nome: string;
  frequencia_pagamento: string; area_parceria_hectares: number | null;
  criado_em: string; assinaturas_concluidas: number; assinaturas_total: number;
};
type ParceiroExterno = { nome: string; tipo_documento: string; documento: string; telefone?: string };
type Condomino = { origem: "cadastrado" | "externo"; prodId: number | null; ext: ParceiroExterno; percentual: number };

const TIPOS_PARCERIA = ["agricola", "pecuaria", "agroindustrial", "extrativa"];
const TIPOS = [
  { value: "agricola",       label: "Parceria Agrícola",       icon: "🌾" },
  { value: "pecuaria",       label: "Parceria Pecuária",       icon: "🐄" },
  { value: "agroindustrial", label: "Parceria Agroindustrial", icon: "🏭" },
  { value: "extrativa",      label: "Parceria Extrativa",      icon: "🌲" },
  { value: "condominio",     label: "Condomínio Rural",        icon: "🤝" },
];
const FREQ = [
  { value: "safra", label: "Por Safra" }, { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },     { value: "semestral", label: "Semestral" },
];
const ST: Record<string, { bg: string; color: string; label: string }> = {
  rascunho:               { bg: "#f0e8d8", color: "#7a6a4a", label: "Rascunho" },
  aguardando_assinaturas: { bg: "#e8f0fa", color: "#2a5a8a", label: "Aguard. Assinaturas" },
  ativo:                  { bg: "#e8f5e9", color: "#2a6a3a", label: "Ativo" },
  encerrado:              { bg: "#f0f0f0", color: "#5a5a5a", label: "Encerrado" },
  cancelado:              { bg: "#fce8e8", color: "#8a2a2a", label: "Cancelado" },
};

function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

const INP: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #d8d0c0", fontSize: 13,
  background: "#faf8f4", color: "#1a2e1a", boxSizing: "border-box",
};

function ParteSelector({ label, produtores, origem, setOrigem, prodId, setProdId, ext, setExt }: {
  label: string; produtores: Produtor[];
  origem: "cadastrado" | "externo"; setOrigem: (v: "cadastrado" | "externo") => void;
  prodId: number | null; setProdId: (v: number | null) => void;
  ext: ParceiroExterno; setExt: (v: ParceiroExterno) => void;
}) {
  const prod = produtores.find(p => p.id === prodId);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3a" }}>{label}</label>
        <div style={{ display: "flex", gap: 4 }}>
          {(["cadastrado", "externo"] as const).map(op => (
            <button key={op} onClick={() => setOrigem(op)} style={{
              padding: "3px 12px", borderRadius: 20, border: "1.5px solid",
              borderColor: origem === op ? "#4a7a3a" : "#d0c8b8",
              background: origem === op ? "#4a7a3a" : "transparent",
              color: origem === op ? "#fff" : "#6a7a6a",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>{op === "cadastrado" ? "Cadastrado" : "Externo"}</button>
          ))}
        </div>
      </div>
      {origem === "cadastrado" ? (
        <div>
          <select value={prodId ?? ""} onChange={e => setProdId(e.target.value ? Number(e.target.value) : null)} style={INP}>
            <option value="">Selecione...</option>
            {produtores.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.cpf}</option>)}
          </select>
          {prod && <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 8, background: "#e8f5e9", fontSize: 12, color: "#2a6a3a" }}>✓ {prod.nome} · {prod.cpf}</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <input placeholder="Nome completo" value={ext.nome} onChange={e => setExt({ ...ext, nome: e.target.value })} style={{ ...INP, gridColumn: "1/-1" }} />
          <select value={ext.tipo_documento} onChange={e => setExt({ ...ext, tipo_documento: e.target.value })} style={INP}>
            <option value="CPF">CPF</option><option value="CNPJ">CNPJ</option>
          </select>
          <input placeholder={ext.tipo_documento === "CPF" ? "000.000.000-00" : "00.000.000/0001-00"} value={ext.documento} onChange={e => setExt({ ...ext, documento: e.target.value })} style={INP} />
          <input placeholder="WhatsApp (opcional)" value={ext.telefone ?? ""} onChange={e => setExt({ ...ext, telefone: e.target.value })} style={INP} />
        </div>
      )}
    </div>
  );
}

function newExt(): ParceiroExterno { return { nome: "", tipo_documento: "CPF", documento: "", telefone: "" }; }
function newCond(): Condomino { return { origem: "cadastrado", prodId: null, ext: newExt(), percentual: 0 }; }

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  // form
  const [tipo, setTipo] = useState("agricola");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [percOut, setPercOut] = useState(50);
  const [freq, setFreq] = useState("safra");
  const [area, setArea] = useState("");

  // parceria
  const [origemOut1, setOrigemOut1] = useState<"cadastrado"|"externo">("cadastrado");
  const [prodOut1, setProdOut1] = useState<number|null>(null);
  const [extOut1, setExtOut1] = useState<ParceiroExterno>(newExt());
  const [origemOut2, setOrigemOut2] = useState<"cadastrado"|"externo">("cadastrado");
  const [prodOut2, setProdOut2] = useState<number|null>(null);
  const [extOut2, setExtOut2] = useState<ParceiroExterno>(newExt());

  // condomínio
  const [condominos, setCondominos] = useState<Condomino[]>([newCond(), newCond()]);

  const percOtd = 100 - percOut;
  const isParceria = TIPOS_PARCERIA.includes(tipo);
  const totalPercCond = condominos.reduce((s, c) => s + (c.percentual || 0), 0);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, ps] = await Promise.all([
        fetch(`${API}/contratos/?fazenda_id=${FAZENDA_ID}`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`${API}/produtores`).then(r => r.json()).catch(() => []),
      ]);
      setContratos(Array.isArray(cs.data) ? cs.data : []);
      setProdutores(Array.isArray(ps) ? ps : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function reset() {
    setTipo("agricola"); setDataInicio(""); setDataFim(""); setPercOut(50);
    setFreq("safra"); setArea(""); setErro("");
    setOrigemOut1("cadastrado"); setProdOut1(null); setExtOut1(newExt());
    setOrigemOut2("cadastrado"); setProdOut2(null); setExtOut2(newExt());
    setCondominos([newCond(), newCond()]);
  }

  const prazoAlerta = (() => {
    if (!dataInicio || !dataFim) return null;
    const anos = (new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const min = tipo === "extrativa" ? 7 : 3;
    if (anos < min) return `⚠️ Prazo mínimo legal: ${min} anos. Atual: ${anos.toFixed(1)} anos.`;
    return null;
  })();

  async function criar() {
    setErro("");
    if (!dataInicio || !dataFim) return setErro("Informe as datas de início e fim.");

    if (isParceria) {
      if (origemOut1 === "cadastrado" && !prodOut1) return setErro("Selecione o outorgante.");
      if (origemOut1 === "externo" && (!extOut1.nome || !extOut1.documento)) return setErro("Preencha nome e documento do outorgante.");
      if (origemOut2 === "cadastrado" && !prodOut2) return setErro("Selecione o outorgado.");
      if (origemOut2 === "externo" && (!extOut2.nome || !extOut2.documento)) return setErro("Preencha nome e documento do outorgado.");
    } else {
      if (condominos.length < 2) return setErro("Condomínio requer ao menos 2 condôminos.");
      for (const [i, c] of condominos.entries()) {
        if (c.origem === "cadastrado" && !c.prodId) return setErro(`Selecione o produtor do condômino ${i + 1}.`);
        if (c.origem === "externo" && (!c.ext.nome || !c.ext.documento)) return setErro(`Preencha nome e documento do condômino ${i + 1}.`);
        if (!c.percentual || c.percentual <= 0) return setErro(`Informe o percentual do condômino ${i + 1}.`);
      }
      if (Math.abs(totalPercCond - 100) > 0.1) return setErro(`A soma dos percentuais deve ser 100%. Atual: ${totalPercCond.toFixed(2)}%`);
    }

    setSalvando(true);
    try {
      // Criar contrato base
      const body: Record<string, unknown> = {
        fazenda_id: FAZENDA_ID, tipo,
        data_inicio: dataInicio, data_fim: dataFim,
        frequencia_pagamento: freq,
        area_parceria_hectares: area ? parseFloat(area) : null,
        percentual_outorgante: isParceria ? percOut : 0,
        percentual_outorgado: isParceria ? percOtd : 0,
      };
      if (isParceria) {
        if (origemOut1 === "cadastrado") body.outorgante_socio_id = prodOut1;
        else body.outorgante_externo = { ...extOut1, telefone: extOut1.telefone || undefined };
        if (origemOut2 === "cadastrado") body.outorgado_socio_id = prodOut2;
        else body.outorgado_externo = { ...extOut2, telefone: extOut2.telefone || undefined };
      }

      const r = await fetch(`${API}/contratos/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erro ao criar contrato");
      const contratoId = data.data?.id;

      // Para condomínio: adicionar condôminos
      if (!isParceria && contratoId) {
        for (const c of condominos) {
          const cb: Record<string, unknown> = { percentual_cota: c.percentual, data_entrada: dataInicio };
          if (c.origem === "cadastrado") cb.produtor_id = c.prodId;
          else cb.parceiro_externo = { ...c.ext, telefone: c.ext.telefone || undefined };
          await fetch(`${API}/contratos/${contratoId}/condominos`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cb),
          });
        }
      }

      setSucesso("Contrato criado com sucesso!");
      setShowModal(false); reset(); await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setSalvando(false); }
  }

  async function enviar(id: string) {
    setEnviando(id);
    try {
      const r = await fetch(`${API}/contratos/${id}/enviar`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erro");
      setSucesso(`Enviado! ${data.partes_notificadas?.length ?? 0} parte(s) notificada(s).`);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setEnviando(null); }
  }

  async function deletar(id: string) {
    if (!confirm("Excluir este rascunho?")) return;
    await fetch(`${API}/contratos/${id}`, { method: "DELETE" });
    await carregar();
  }

  function updateCond(i: number, patch: Partial<Condomino>) {
    setCondominos(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <header style={{ background: "#1a2e1a", color: "#e8e0d0", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{display:"flex",gap:8}}><a href="/" style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"white",fontSize:13,fontWeight:600,textDecoration:"none",borderRadius:8,padding:"6px 14px"}}>🏠 Painel Principal</a><button onClick={() => window.history.back()} style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"white",fontSize:13,fontWeight:600,cursor:"pointer",borderRadius:8,padding:"6px 14px"}}>← Voltar</button></div>
        <div style={{ width: 1, height: 20, background: "#2d4a2d" }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Contratos Rurais</div>
          <div style={{ fontSize: 12, color: "#7a9a6a" }}>Parceria agrícola, pecuária e condomínio rural</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a href="/contratos/acerto" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#3a5a9a", color: "#fff", textDecoration: "none", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>🌾 Acerto de Contrato</a>
          <button onClick={() => { reset(); setShowModal(true); }} style={{ background: "#4a7a3a", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Novo Contrato
          </button>
        </div>
      </header>

      <div style={{ padding: "28px 32px" }}>
        {sucesso && (
          <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10, padding: "12px 18px", marginBottom: 20, color: "#2a6a3a", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            ✅ {sucesso}
            <button onClick={() => setSucesso("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#2a6a3a" }}>×</button>
          </div>
        )}
        {erro && !showModal && (
          <div style={{ background: "#fce8e8", border: "1px solid #ef9a9a", borderRadius: 10, padding: "12px 18px", marginBottom: 20, color: "#8a2a2a", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            ❌ {erro}
            <button onClick={() => setErro("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#8a2a2a" }}>×</button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#8a9a8a" }}>Carregando contratos...</div>
        ) : contratos.length === 0 ? (
          <div style={{ textAlign: "center", padding: 64, color: "#8a9a8a" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Nenhum contrato cadastrado</div>
            <div style={{ fontSize: 13, marginBottom: 24 }}>Clique em "+ Novo Contrato" para começar.</div>
            <button onClick={() => { reset(); setShowModal(true); }} style={{ background: "#4a7a3a", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Novo Contrato</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {contratos.map(c => {
              const st = ST[c.status] ?? ST.rascunho;
              const tl = TIPOS.find(t => t.value === c.tipo);
              return (
                <div key={c.id} style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", border: "1px solid #e8e0d0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 20, alignItems: "center" }}>
                  <div style={{ textAlign: "center", minWidth: 56 }}>
                    <div style={{ fontSize: 28 }}>{tl?.icon ?? "📄"}</div>
                    <div style={{ fontSize: 10, color: "#7a8a6a", marginTop: 2, fontWeight: 600 }}>{tl?.label ?? c.tipo}</div>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "#1a2e1a" }}>
                        {c.tipo === "condominio"
                          ? "Condomínio Rural"
                          : `${c.outorgante_nome ?? "—"} → ${c.outorgado_nome ?? "—"}`}
                      </span>
                      <span style={{ ...st, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                      {c.assinaturas_total > 0 && <span style={{ fontSize: 11, color: "#5a7a5a" }}>{c.assinaturas_concluidas}/{c.assinaturas_total} assin.</span>}
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#6a7a6a", flexWrap: "wrap" }}>
                      <span>📅 {fmtDate(c.data_inicio)} → {fmtDate(c.data_fim)}</span>
                      {c.tipo !== "condominio" && <span>⚖️ {c.percentual_outorgante}% / {c.percentual_outorgado}%</span>}
                      {c.area_parceria_hectares ? <span>🌱 {c.area_parceria_hectares} ha</span> : null}
                      <span>🔄 {FREQ.find(f => f.value === c.frequencia_pagamento)?.label ?? c.frequencia_pagamento}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {c.status === "rascunho" && (
                      <>
                        <button onClick={() => enviar(c.id)} disabled={enviando === c.id} style={{ background: "#3a6a9a", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: enviando === c.id ? "not-allowed" : "pointer", opacity: enviando === c.id ? 0.6 : 1 }}>
                          {enviando === c.id ? "Enviando..." : "✉️ Enviar"}
                        </button>
                        <button onClick={() => deletar(c.id)} style={{ background: "#fce8e8", color: "#8a2a2a", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>🗑️</button>
                      </>
                    )}
                    {c.status === "aguardando_assinaturas" && (
                      <a href={`/assinar/${c.id}`} style={{ background: "#e8f0fa", color: "#2a5a8a", textDecoration: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>✍️ Ver Assinaturas</a>
                    )}
                    {c.status === "ativo" && <span style={{ background: "#e8f5e9", color: "#2a6a3a", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>✅ Ativo</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); reset(); } }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 660, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ background: "#1a2e1a", color: "#e8e0d0", padding: "18px 24px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Novo Contrato Rural</div>
                <div style={{ fontSize: 12, color: "#7a9a6a" }}>Estatuto da Terra · Lei 4.504/1964 · Decreto 59.566/1966</div>
              </div>
              <button onClick={() => { setShowModal(false); reset(); }} style={{ background: "none", border: "none", color: "#a0b890", fontSize: 24, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              {/* tipo */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3a", display: "block", marginBottom: 8 }}>Tipo de Contrato</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {TIPOS.map(t => (
                    <button key={t.value} onClick={() => setTipo(t.value)} style={{ padding: "10px 8px", borderRadius: 10, border: "1.5px solid", borderColor: tipo === t.value ? "#4a7a3a" : "#d8d0c0", background: tipo === t.value ? "#f0f8ea" : "#faf8f4", cursor: "pointer", fontSize: 12, fontWeight: tipo === t.value ? 700 : 400, color: tipo === t.value ? "#2a5a1a" : "#4a5a4a", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 20 }}>{t.icon}</span>
                      <span style={{ textAlign: "center", lineHeight: 1.3 }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* datas */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                {([["Data Início", dataInicio, setDataInicio], ["Data Fim", dataFim, setDataFim]] as [string, string, (v: string) => void][]).map(([l, v, s]) => (
                  <div key={l}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>{l}</label>
                    <input type="date" value={v} onChange={e => s(e.target.value)} style={INP} />
                  </div>
                ))}
              </div>
              {prazoAlerta && <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#7a5a00" }}>{prazoAlerta}</div>}

              {/* partilha (só parceria) */}
              {isParceria && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>% Outorgante</label>
                    <input type="number" min={0} max={100} value={percOut} onChange={e => setPercOut(Math.min(100, Math.max(0, Number(e.target.value))))} style={INP} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>% Outorgado</label>
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e8e0d0", fontSize: 13, background: "#f0f0f0", color: "#5a5a5a" }}>{percOtd}%</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>Frequência</label>
                    <select value={freq} onChange={e => setFreq(e.target.value)} style={INP}>
                      {FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* frequência + área (condomínio) */}
              {!isParceria && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>Frequência</label>
                    <select value={freq} onChange={e => setFreq(e.target.value)} style={INP}>
                      {FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>Área (hectares)</label>
                    <input type="number" min={0} step={0.01} placeholder="0,00" value={area} onChange={e => setArea(e.target.value)} style={INP} />
                  </div>
                </div>
              )}

              {isParceria && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>Área (hectares)</label>
                  <input type="number" min={0} step={0.01} placeholder="0,00" value={area} onChange={e => setArea(e.target.value)} style={INP} />
                </div>
              )}

              <div style={{ height: 1, background: "#e8e0d0", margin: "20px 0" }} />

              {/* ── PARCERIA: outorgante + outorgado ── */}
              {isParceria && (
                <>
                  <ParteSelector label="Outorgante (quem cede)" produtores={produtores} origem={origemOut1} setOrigem={setOrigemOut1} prodId={prodOut1} setProdId={setProdOut1} ext={extOut1} setExt={setExtOut1} />
                  <ParteSelector label="Outorgado (quem recebe)" produtores={produtores} origem={origemOut2} setOrigem={setOrigemOut2} prodId={prodOut2} setProdId={setProdOut2} ext={extOut2} setExt={setExtOut2} />
                </>
              )}

              {/* ── CONDOMÍNIO: lista de condôminos ── */}
              {!isParceria && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3a" }}>Condôminos</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, color: Math.abs(totalPercCond - 100) < 0.1 ? "#2a6a3a" : "#8a3a3a", fontWeight: 600 }}>
                        Σ {totalPercCond.toFixed(2)}% {Math.abs(totalPercCond - 100) < 0.1 ? "✓" : "≠ 100%"}
                      </span>
                      <button onClick={() => setCondominos(cs => [...cs, newCond()])} style={{ background: "#e8f5e9", color: "#2a6a3a", border: "none", padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Condômino</button>
                    </div>
                  </div>
                  {condominos.map((c, i) => (
                    <div key={i} style={{ background: "#faf8f4", border: "1.5px solid #e8e0d0", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3a" }}>Condômino {i + 1}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {(["cadastrado", "externo"] as const).map(op => (
                            <button key={op} onClick={() => updateCond(i, { origem: op })} style={{ padding: "3px 10px", borderRadius: 20, border: "1.5px solid", borderColor: c.origem === op ? "#4a7a3a" : "#d0c8b8", background: c.origem === op ? "#4a7a3a" : "transparent", color: c.origem === op ? "#fff" : "#6a7a6a", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              {op === "cadastrado" ? "Cadastrado" : "Externo"}
                            </button>
                          ))}
                          {condominos.length > 2 && (
                            <button onClick={() => setCondominos(cs => (Array.isArray(cs) ? cs : []).filter((_, idx) => idx !== i))} style={{ background: "#fce8e8", color: "#8a2a2a", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
                        <div>
                          {c.origem === "cadastrado" ? (
                            <select value={c.prodId ?? ""} onChange={e => updateCond(i, { prodId: e.target.value ? Number(e.target.value) : null })} style={INP}>
                              <option value="">Selecione o produtor...</option>
                              {produtores.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.cpf}</option>)}
                            </select>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                              <input placeholder="Nome completo" value={c.ext.nome} onChange={e => updateCond(i, { ext: { ...c.ext, nome: e.target.value } })} style={{ ...INP, gridColumn: "1/-1" }} />
                              <select value={c.ext.tipo_documento} onChange={e => updateCond(i, { ext: { ...c.ext, tipo_documento: e.target.value } })} style={INP}>
                                <option value="CPF">CPF</option><option value="CNPJ">CNPJ</option>
                              </select>
                              <input placeholder="Documento" value={c.ext.documento} onChange={e => updateCond(i, { ext: { ...c.ext, documento: e.target.value } })} style={INP} />
                            </div>
                          )}
                        </div>
                        <div style={{ minWidth: 90 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>Cota %</label>
                          <input type="number" min={0} max={100} step={0.01} value={c.percentual || ""} onChange={e => updateCond(i, { percentual: parseFloat(e.target.value) || 0 })} style={{ ...INP, width: 90 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {erro && <div style={{ background: "#fce8e8", border: "1px solid #ef9a9a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#8a2a2a", fontSize: 13 }}>❌ {erro}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowModal(false); reset(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button onClick={criar} disabled={salvando} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: salvando ? "#a0b890" : "#3a6a2a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: salvando ? "not-allowed" : "pointer" }}>
                  {salvando ? "Salvando..." : "Criar Contrato"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer style={{ padding: "24px 32px", borderTop: "1px solid #e0d8c8", marginTop: 40, textAlign: "center", fontSize: 12, color: "#8a9a8a" }}>
        <strong>GestaoAgro Tech</strong> — Soluções tecnológicas para gestão rural<br />
        LCDPR · NF-e Produtor Rural · DRE Gerencial · WhatsApp Bot<br />
        contato: civiana.cv@gmail.com · ruralcaixa-mvp.vercel.app
      </footer>
    </div>
  );
}
