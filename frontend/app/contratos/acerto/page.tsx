"use client";
import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Calculo = {
  valor_bruto: number;
  valor_desconto_prod: number;
  valor_desconto_frete: number;
  outros_descontos: number;
  valor_liquido: number;
  base_tributavel_irpf: number;
  funrural_sugerido_pf: number;
  senar_sugerido: number;
};

type Acerto = {
  id: number;
  safra: string;
  arrendatario_nome: string;
  arrendatario_cpf_cnpj?: string;
  produto: string;
  quantidade_sacas: number;
  valor_por_saca: number;
  valor_bruto: number;
  pct_desconto_prod: number;
  valor_desconto_prod: number;
  valor_liquido: number;
  funrural_retido: number;
  senar_retido: number;
  base_tributavel_irpf: number;
  pct_base_tributavel: number;
  tipo_pagamento: string;
  nota_fiscal_emitida: boolean;
  numero_nota_fiscal?: string;
  comprovante_funrural?: string;
  data_pagamento?: string;
  status: string;
  criado_em: string;
};

type Alerta = { tipo: "atencao" | "aviso" | "info"; mensagem: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const NUM = (v: number, d = 3) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const INP: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1.5px solid #d8d0c0", fontSize: 13,
  background: "#faf8f4", color: "#1a2e1a", boxSizing: "border-box",
};

const PRODUTOS = [
  { value: "soja",    label: "Soja",    icon: "🌱" },
  { value: "milho",   label: "Milho",   icon: "🌽" },
  { value: "cafe",    label: "Café",    icon: "☕" },
  { value: "arroz",   label: "Arroz",   icon: "🍚" },
  { value: "trigo",   label: "Trigo",   icon: "🌾" },
  { value: "algodao", label: "Algodão", icon: "🤍" },
  { value: "outro",   label: "Outro",   icon: "📦" },
];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  registrado:          { bg: "#fff8e1", color: "#7a5a00", label: "Registrado" },
  conferido:           { bg: "#e8f0fa", color: "#2a5a8a", label: "Conferido" },
  lancado_livro_caixa: { bg: "#e8f5e9", color: "#2a6a3a", label: "Lançado no Livro Caixa" },
  declarado:           { bg: "#f3e5f5", color: "#6a2a8a", label: "Declarado (DIRPF)" },
};

function fmtDate(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AcertoContratoPage() {
  const [acertos, setAcertos] = useState<Acerto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState("");
  const [erro, setErro] = useState("");
  const [alertasRetorno, setAlertasRetorno] = useState<Alerta[]>([]);
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [filtroSafra, setFiltroSafra] = useState("");
  const [detalhe, setDetalhe] = useState<Acerto | null>(null);

  // ── Form state ──
  const [safra, setSafra] = useState("25/26");
  const [arrendNome, setArrendNome] = useState("");
  const [arrendDoc, setArrendDoc] = useState("");
  const [arrendTel, setArrendTel] = useState("");
  const [produto, setProduto] = useState("soja");
  const [qtdSacas, setQtdSacas] = useState("");
  const [vlrSaca, setVlrSaca] = useState("");
  const [pctProd, setPctProd] = useState("1.63");
  const [pctFrete, setPctFrete] = useState("0");
  const [outrosDesc, setOutrosDesc] = useState("0");
  const [descOutros, setDescOutros] = useState("");
  const [funrural, setFunrural] = useState("");
  const [senar, setSenar] = useState("");
  const [nfEmitida, setNfEmitida] = useState(false);
  const [nfNumero, setNfNumero] = useState("");
  const [nfData, setNfData] = useState("");
  const [comprovante, setComprovante] = useState("");
  const [dataPgto, setDataPgto] = useState("");
  const [obs, setObs] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API}/acertos-contrato/?imovel_id=${IMOVEL_ID}${filtroSafra ? `&safra=${filtroSafra}` : ""}`;
      const r = await fetch(url);
      const data = await r.json();
      setAcertos(Array.isArray(data.data) ? data.data : []);
    } catch {
      setAcertos([]);
    } finally {
      setLoading(false);
    }
  }, [filtroSafra]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Preview de cálculo em tempo real ──
  useEffect(() => {
    const q = parseFloat(qtdSacas);
    const v = parseFloat(vlrSaca);
    if (!q || !v || q <= 0 || v <= 0) { setCalculo(null); return; }

    const timer = setTimeout(async () => {
      setCalculando(true);
      try {
        const params = new URLSearchParams({
          quantidade_sacas: String(q),
          valor_por_saca: String(v),
          pct_desconto_prod: pctProd || "0",
          pct_desconto_frete: pctFrete || "0",
          outros_descontos: outrosDesc || "0",
        });
        const r = await apiFetch(`${API}/acertos-contrato/preview-calculo?${params}`);
        const data = await r.json();
        if (data.ok) {
          setCalculo(data.calculo);
          // Preencher FUNRURAL sugerido se ainda não preenchido
          if (!funrural) setFunrural(data.calculo.funrural_sugerido_pf.toFixed(2));
          if (!senar) setSenar(data.calculo.senar_sugerido.toFixed(2));
        }
      } catch { /* silencioso */ } finally {
        setCalculando(false);
      }
    }, 600);
    return (
      ) => clearTimeout(timer);
  }, [qtdSacas, vlrSaca, pctProd, pctFrete, outrosDesc]); // eslint-disable-line

  function reset() {
    setSafra("25/26"); setArrendNome(""); setArrendDoc(""); setArrendTel("");
    setProduto("soja"); setQtdSacas(""); setVlrSaca("");
    setPctProd("1.63"); setPctFrete("0"); setOutrosDesc("0"); setDescOutros("");
    setFunrural(""); setSenar("");
    setNfEmitida(false); setNfNumero(""); setNfData("");
    setComprovante(""); setDataPgto(""); setObs("");
    setCalculo(null); setErro(""); setAlertasRetorno([]);
  }

  async function salvar() {
    setErro("");
    if (!arrendNome.trim()) return setErro("Informe o nome do arrendatário.");
    if (!qtdSacas || parseFloat(qtdSacas) <= 0) return setErro("Informe a quantidade de sacas.");
    if (!vlrSaca || parseFloat(vlrSaca) <= 0) return setErro("Informe o valor por saca.");

    setSalvando(true);
    try {
      const body = {
        imovel_id: IMOVEL_ID,
        safra,
        arrendatario_nome: arrendNome,
        arrendatario_cpf_cnpj: arrendDoc || undefined,
        arrendatario_telefone: arrendTel || undefined,
        produto,
        quantidade_sacas: parseFloat(qtdSacas),
        valor_por_saca: parseFloat(vlrSaca),
        pct_desconto_prod: parseFloat(pctProd) || 0,
        pct_desconto_frete: parseFloat(pctFrete) || 0,
        outros_descontos: parseFloat(outrosDesc) || 0,
        descricao_outros_desc: descOutros || undefined,
        funrural_retido: parseFloat(funrural) || 0,
        senar_retido: parseFloat(senar) || 0,
        tipo_pagamento: "produto",
        produto_ficou_com: "arrendatario",
        nota_fiscal_emitida: nfEmitida,
        numero_nota_fiscal: nfNumero || undefined,
        data_nota_fiscal: nfData || undefined,
        comprovante_funrural: comprovante || undefined,
        data_pagamento: dataPgto || undefined,
        observacoes: obs || undefined,
      };
      const r = await apiFetch(`${API}/acertos-contrato/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erro ao salvar acerto.");
      setAlertasRetorno(data.alertas || []);
      setSucesso(`Acerto registrado com sucesso! ID #${data.id}`);
      setShowModal(false);
      reset();
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizarStatus(id: number, status: string) {
    await apiFetch(`${API}/acertos-contrato/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await carregar();
  }

  async function deletar(id: number) {
    if (!confirm("Excluir este acerto?")) return;
    const r = await apiFetch(`${API}/acertos-contrato/${id}`, { method: "DELETE" });
    if (r.ok) await carregar();
    else {
      const d = await r.json();
      setErro(d.detail || "Erro ao excluir.");
    }
  }

  // ── Resumo dos acertos listados ──
  const totalBruto = acertos.reduce((s, a) => s + (a.valor_bruto || 0), 0);
  const totalLiquido = acertos.reduce((s, a) => s + (a.valor_liquido || 0), 0);
  const totalBase = acertos.reduce((s, a) => s + (a.base_tributavel_irpf || 0), 0);
  const totalFunrural = acertos.reduce((s, a) => s + (a.funrural_retido || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      {/* ── Header ── */}
      <header style={{ background: "#1a2e1a", color: "#e8e0d0", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8, padding: "6px 14px" }}>🏠 Painel</a>
          <a href="/contratos" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8, padding: "6px 14px" }}>← Contratos</a>
        </div>
        <div style={{ width: 1, height: 20, background: "#2d4a2d" }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Acerto de Contrato — Arrendamento em Produto</div>
          <div style={{ fontSize: 12, color: "#7a9a6a" }}>Soja · Milho · Café · Arroz · RIR/2018 art. 59 — Base tributável 20%</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="Filtrar safra (ex: 25/26)"
            value={filtroSafra}
            onChange={e => setFiltroSafra(e.target.value)}
            style={{ ...INP, width: 180, background: "rgba(255,255,255,0.1)", color: "#e8e0d0", border: "1px solid rgba(255,255,255,0.3)" }}
          />
          <button onClick={() => { reset(); setShowModal(true); }} style={{ background: "#4a7a3a", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Novo Acerto
          </button>
        </div>
      </header>

      <div style={{ padding: "28px 32px" }}>
        {/* ── Alertas de retorno ── */}
        {alertasRetorno.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {alertasRetorno.map((a, i) => (
              <div key={i} style={{
                background: a.tipo === "atencao" ? "#fff3e0" : a.tipo === "aviso" ? "#fff8e1" : "#e8f5e9",
                border: `1px solid ${a.tipo === "atencao" ? "#ffb74d" : a.tipo === "aviso" ? "#ffe082" : "#a5d6a7"}`,
                borderRadius: 10, padding: "10px 16px", marginBottom: 8,
                color: a.tipo === "atencao" ? "#7a3a00" : a.tipo === "aviso" ? "#7a5a00" : "#2a6a3a",
                fontSize: 13,
              }}>
                {a.tipo === "atencao" ? "⚠️" : a.tipo === "aviso" ? "📋" : "ℹ️"} {a.mensagem}
              </div>
            ))}
            <button onClick={() => setAlertasRetorno([])} style={{ fontSize: 11, color: "#7a8a7a", background: "none", border: "none", cursor: "pointer" }}>Fechar alertas</button>
          </div>
        )}

        {sucesso && (
          <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10, padding: "12px 18px", marginBottom: 20, color: "#2a6a3a", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            ✅ {sucesso}
            <button onClick={() => setSucesso("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        )}
        {erro && !showModal && (
          <div style={{ background: "#fce8e8", border: "1px solid #ef9a9a", borderRadius: 10, padding: "12px 18px", marginBottom: 20, color: "#8a2a2a", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            ❌ {erro}
            <button onClick={() => setErro("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        )}

        {/* ── Cards de resumo ── */}
        {acertos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>
            {[
              { label: "Receita Bruta Total", value: BRL(totalBruto), icon: "💰", color: "#1a2e1a" },
              { label: "Valor Líquido Total", value: BRL(totalLiquido), icon: "✅", color: "#2a6a3a" },
              { label: "Base Tributável IRPF (20%)", value: BRL(totalBase), icon: "📊", color: "#3a5a9a" },
              { label: "FUNRURAL Retido Total", value: BRL(totalFunrural), icon: "🏛️", color: "#7a4a2a" },
            ].map(c => (
              <div key={c.label} style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", border: "1px solid #e8e0d0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: "#8a9a8a", marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Nota fiscal DIRPF ── */}
        <div style={{ background: "#e8f0fa", border: "1px solid #90b8e0", borderRadius: 12, padding: "14px 20px", marginBottom: 24, fontSize: 13, color: "#1a3a6a" }}>
          <strong>📋 Escrituração DIRPF — Atividade Rural:</strong> A receita de arrendamento recebida em produto (soja) é classificada como <strong>receita de atividade rural</strong>. A base tributável é <strong>20% da receita bruta</strong> (art. 59 RIR/2018 — Decreto 9.580/2018). FUNRURAL e SENAR retidos pelo arrendatário são <strong>despesas dedutíveis</strong> no Livro Caixa Rural. O desconto PROD também é dedutível como despesa de comercialização.
        </div>

        {/* ── Lista de acertos ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#8a9a8a" }}>Carregando acertos...</div>
        ) : acertos.length === 0 ? (
          <div style={{ textAlign: "center", padding: 64, color: "#8a9a8a" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌾</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Nenhum acerto registrado</div>
            <div style={{ fontSize: 13, marginBottom: 24 }}>Clique em "+ Novo Acerto" para registrar o pagamento do arrendamento em produto.</div>
            <button onClick={() => { reset(); setShowModal(true); }} style={{ background: "#4a7a3a", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              + Registrar Acerto de Contrato
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {acertos.map(a => {
              const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.registrado;
              const prod = PRODUTOS.find(p => p.value === a.produto);
              return (
                <div key={a.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e8e0d0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  {/* Linha principal */}
                  <div style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 20, alignItems: "center" }}>
                    <div style={{ textAlign: "center", minWidth: 52 }}>
                      <div style={{ fontSize: 28 }}>{prod?.icon ?? "🌾"}</div>
                      <div style={{ fontSize: 10, color: "#7a8a6a", fontWeight: 600, marginTop: 2 }}>{prod?.label ?? a.produto}</div>
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#1a2e1a" }}>{a.arrendatario_nome}</span>
                        <span style={{ background: "#f0f8ea", color: "#2a5a1a", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Safra {a.safra}</span>
                        <span style={{ ...st, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                        {a.nota_fiscal_emitida && <span style={{ background: "#e8f0fa", color: "#2a5a8a", padding: "2px 8px", borderRadius: 20, fontSize: 11 }}>NF {a.numero_nota_fiscal || "emitida"}</span>}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "4px 20px", fontSize: 12, color: "#6a7a6a" }}>
                        <span>📦 {NUM(a.quantidade_sacas)} sc × {BRL(a.valor_por_saca)}/sc</span>
                        <span>💰 Bruto: <strong style={{ color: "#1a2e1a" }}>{BRL(a.valor_bruto)}</strong></span>
                        <span>✅ Líquido: <strong style={{ color: "#2a6a3a" }}>{BRL(a.valor_liquido)}</strong></span>
                        <span>📊 Base IRPF: <strong style={{ color: "#3a5a9a" }}>{BRL(a.base_tributavel_irpf)}</strong> ({a.pct_base_tributavel}%)</span>
                        {a.funrural_retido > 0 && <span>🏛️ FUNRURAL: {BRL(a.funrural_retido)}</span>}
                        {a.pct_desconto_prod > 0 && <span>📉 PROD: -{a.pct_desconto_prod}% ({BRL(a.valor_desconto_prod)})</span>}
                        {a.data_pagamento && <span>📅 Pgto: {fmtDate(a.data_pagamento)}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <button onClick={() => setDetalhe(detalhe?.id === a.id ? null : a)} style={{ background: "#f0f8ea", color: "#2a5a1a", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {detalhe?.id === a.id ? "▲ Fechar" : "▼ Detalhes"}
                      </button>
                      {a.status === "registrado" && (
                        <>
                          <button onClick={() => atualizarStatus(a.id, "conferido")} style={{ background: "#e8f0fa", color: "#2a5a8a", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✓ Conferir</button>
                          <button onClick={() => deletar(a.id)} style={{ background: "#fce8e8", color: "#8a2a2a", border: "none", padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>🗑️</button>
                        </>
                      )}
                      {a.status === "conferido" && (
                        <button onClick={() => atualizarStatus(a.id, "lancado_livro_caixa")} style={{ background: "#e8f5e9", color: "#2a6a3a", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📒 Lançar no Livro Caixa</button>
                      )}
                      {a.status === "lancado_livro_caixa" && (
                        <button onClick={() => atualizarStatus(a.id, "declarado")} style={{ background: "#f3e5f5", color: "#6a2a8a", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📋 Marcar Declarado</button>
                      )}
                    </div>
                  </div>

                  {/* Painel de detalhes expandido */}
                  {detalhe?.id === a.id && (
                    <div style={{ borderTop: "1px solid #e8e0d0", padding: "16px 24px", background: "#faf8f4" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                        {/* Coluna 1: Cálculo */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#3a4a3a", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Cálculo do Acerto</div>
                          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                            <tbody>
                              {[
                                ["Qtd. Sacas", `${NUM(a.quantidade_sacas)} sc`],
                                ["Valor/Saca", BRL(a.valor_por_saca)],
                                ["Valor Bruto", BRL(a.valor_bruto), true],
                                [`Desc. PROD (${a.pct_desconto_prod}%)`, `- ${BRL(a.valor_desconto_prod)}`],
                                ["Valor Líquido", BRL(a.valor_liquido), true, "#2a6a3a"],
                              ].map(([l, v, bold, color]) => (
                                <tr key={String(l)}>
                                  <td style={{ padding: "3px 0", color: "#6a7a6a" }}>{l}</td>
                                  <td style={{ padding: "3px 0", textAlign: "right", fontWeight: bold ? 700 : 400, color: (color as string) || "#1a2e1a" }}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Coluna 2: Fiscal */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#3a4a3a", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Informações Fiscais</div>
                          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                            <tbody>
                              {[
                                ["FUNRURAL retido", BRL(a.funrural_retido)],
                                ["SENAR retido", BRL(a.senar_retido)],
                                ["Base tributável (20%)", BRL(a.base_tributavel_irpf), true, "#3a5a9a"],
                                ["NF emitida", a.nota_fiscal_emitida ? `Sim — ${a.numero_nota_fiscal || "s/nº"}` : "Não"],
                                ["Comprovante FUNRURAL", a.comprovante_funrural || "Não informado"],
                              ].map(([l, v, bold, color]) => (
                                <tr key={String(l)}>
                                  <td style={{ padding: "3px 0", color: "#6a7a6a" }}>{l}</td>
                                  <td style={{ padding: "3px 0", textAlign: "right", fontWeight: bold ? 700 : 400, color: (color as string) || "#1a2e1a" }}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Coluna 3: Orientação DIRPF */}
                        <div style={{ background: "#e8f0fa", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1a3a6a", marginBottom: 8 }}>📋 Como lançar na DIRPF</div>
                          <div style={{ fontSize: 11, color: "#2a4a7a", lineHeight: 1.6 }}>
                            <p style={{ margin: "0 0 6px" }}><strong>Receita bruta:</strong> {BRL(a.valor_bruto)}<br />Lançar em <em>Atividade Rural → Receitas</em></p>
                            <p style={{ margin: "0 0 6px" }}><strong>Despesas dedutíveis:</strong><br />• FUNRURAL: {BRL(a.funrural_retido)}<br />• SENAR: {BRL(a.senar_retido)}<br />• PROD: {BRL(a.valor_desconto_prod)}</p>
                            <p style={{ margin: 0 }}><strong>Base tributável:</strong> {BRL(a.base_tributavel_irpf)}<br />(20% da receita bruta)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL: Novo Acerto ── */}
      {showModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); reset(); } }}
        >
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            {/* Header modal */}
            <div style={{ background: "#1a2e1a", color: "#e8e0d0", padding: "18px 24px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Registrar Acerto de Contrato</div>
                <div style={{ fontSize: 12, color: "#7a9a6a" }}>Arrendamento pago em produto · RIR/2018 art. 59</div>
              </div>
              <button onClick={() => { setShowModal(false); reset(); }} style={{ background: "none", border: "none", color: "#a0b890", fontSize: 24, cursor: "pointer" }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              {/* ── Seção 1: Identificação ── */}
              <SectionTitle>1. Identificação do Acerto</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <FieldLabel>Safra *</FieldLabel>
                  <input value={safra} onChange={e => setSafra(e.target.value)} placeholder="25/26" style={INP} />
                </div>
                <div style={{ gridColumn: "2/-1" }}>
                  <FieldLabel>Nome do Arrendatário *</FieldLabel>
                  <input value={arrendNome} onChange={e => setArrendNome(e.target.value)} placeholder="Nome completo" style={INP} />
                </div>
                <div>
                  <FieldLabel>CPF/CNPJ</FieldLabel>
                  <input value={arrendDoc} onChange={e => setArrendDoc(e.target.value)} placeholder="000.000.000-00" style={INP} />
                </div>
                <div>
                  <FieldLabel>WhatsApp</FieldLabel>
                  <input value={arrendTel} onChange={e => setArrendTel(e.target.value)} placeholder="(00) 00000-0000" style={INP} />
                </div>
              </div>

              {/* ── Seção 2: Produto e Valores ── */}
              <SectionTitle>2. Produto e Valores do Acerto</SectionTitle>
              {/* Seletor de produto */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 16 }}>
                {PRODUTOS.map(p => (
                  <button key={p.value} onClick={() => setProduto(p.value)} style={{ padding: "8px 4px", borderRadius: 10, border: "1.5px solid", borderColor: produto === p.value ? "#4a7a3a" : "#d8d0c0", background: produto === p.value ? "#f0f8ea" : "#faf8f4", cursor: "pointer", fontSize: 11, fontWeight: produto === p.value ? 700 : 400, color: produto === p.value ? "#2a5a1a" : "#4a5a4a", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 18 }}>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel>Quantidade de Sacas *</FieldLabel>
                  <input type="number" min={0} step={0.001} value={qtdSacas} onChange={e => setQtdSacas(e.target.value)} placeholder="6.212,000" style={INP} />
                </div>
                <div>
                  <FieldLabel>Valor por Saca (R$) *</FieldLabel>
                  <input type="number" min={0} step={0.01} value={vlrSaca} onChange={e => setVlrSaca(e.target.value)} placeholder="113,50" style={INP} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <FieldLabel>Desconto PROD (%)</FieldLabel>
                  <input type="number" min={0} max={100} step={0.01} value={pctProd} onChange={e => setPctProd(e.target.value)} placeholder="1,63" style={INP} />
                  <div style={{ fontSize: 10, color: "#8a9a8a", marginTop: 3 }}>Taxa de classificação e limpeza</div>
                </div>
                <div>
                  <FieldLabel>Desconto Frete (%)</FieldLabel>
                  <input type="number" min={0} max={100} step={0.01} value={pctFrete} onChange={e => setPctFrete(e.target.value)} placeholder="0,00" style={INP} />
                </div>
                <div>
                  <FieldLabel>Outros Descontos (R$)</FieldLabel>
                  <input type="number" min={0} step={0.01} value={outrosDesc} onChange={e => setOutrosDesc(e.target.value)} placeholder="0,00" style={INP} />
                  {parseFloat(outrosDesc) > 0 && (
                    <input value={descOutros} onChange={e => setDescOutros(e.target.value)} placeholder="Descrição" style={{ ...INP, marginTop: 6, fontSize: 11 }} />
                  )}
                </div>
              </div>

              {/* ── Preview de cálculo em tempo real ── */}
              {(calculo || calculando) && (
                <div style={{ background: "#1a2e1a", borderRadius: 12, padding: "16px 20px", marginBottom: 20, color: "#e8e0d0" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: "#7a9a6a", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {calculando ? "⏳ Calculando..." : "📊 Preview do Acerto"}
                  </div>
                  {calculo && !calculando && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
                      {[
                        { label: "Valor Bruto", value: BRL(calculo.valor_bruto), color: "#e8e0d0" },
                        { label: `PROD (-${pctProd || 0}%)`, value: `- ${BRL(calculo.valor_desconto_prod)}`, color: "#ffb74d" },
                        { label: "Valor Líquido", value: BRL(calculo.valor_liquido), color: "#81c784" },
                        { label: "Base IRPF (20%)", value: BRL(calculo.base_tributavel_irpf), color: "#90caf9" },
                      ].map(c => (
                        <div key={c.label} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.value}</div>
                          <div style={{ fontSize: 10, color: "#7a9a6a", marginTop: 2 }}>{c.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Seção 3: Retenções Fiscais ── */}
              <SectionTitle>3. Retenções Fiscais (feitas pelo arrendatário)</SectionTitle>
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#7a5a00" }}>
                ℹ️ O arrendatário (comprador da soja) deve reter e recolher o FUNRURAL. PF: 2,5% (1,2% FUNRURAL + 0,1% SENAR + 1,2% RAT). PJ: 1,7%. Base: Lei 8.212/1991 art. 25.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <FieldLabel>FUNRURAL Retido (R$)</FieldLabel>
                  <input type="number" min={0} step={0.01} value={funrural} onChange={e => setFunrural(e.target.value)} placeholder={calculo ? calculo.funrural_sugerido_pf.toFixed(2) : "0,00"} style={INP} />
                  {calculo && <div style={{ fontSize: 10, color: "#8a9a8a", marginTop: 3 }}>Sugerido PF (2,5%): {BRL(calculo.funrural_sugerido_pf)}</div>}
                </div>
                <div>
                  <FieldLabel>SENAR Retido (R$)</FieldLabel>
                  <input type="number" min={0} step={0.01} value={senar} onChange={e => setSenar(e.target.value)} placeholder={calculo ? calculo.senar_sugerido.toFixed(2) : "0,00"} style={INP} />
                  {calculo && <div style={{ fontSize: 10, color: "#8a9a8a", marginTop: 3 }}>Sugerido (0,2%): {BRL(calculo.senar_sugerido)}</div>}
                </div>
                <div>
                  <FieldLabel>Comprovante de Retenção FUNRURAL</FieldLabel>
                  <input value={comprovante} onChange={e => setComprovante(e.target.value)} placeholder="Nº do comprovante / referência" style={INP} />
                </div>
                <div>
                  <FieldLabel>Data do Pagamento</FieldLabel>
                  <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)} style={INP} />
                </div>
              </div>

              {/* ── Seção 4: Nota Fiscal ── */}
              <SectionTitle>4. Nota Fiscal de Produtor Rural</SectionTitle>
              <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#2a6a3a" }}>
                ℹ️ A emissão da NF de Produtor Rural é recomendável para escrituração correta na DIRPF e para que o arrendatário possa deduzir o custo. Verifique a legislação do seu estado.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#3a4a3a" }}>
                  <input type="checkbox" checked={nfEmitida} onChange={e => setNfEmitida(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  Nota Fiscal emitida
                </label>
              </div>
              {nfEmitida && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <FieldLabel>Número da NF</FieldLabel>
                    <input value={nfNumero} onChange={e => setNfNumero(e.target.value)} placeholder="000.000" style={INP} />
                  </div>
                  <div>
                    <FieldLabel>Data de Emissão</FieldLabel>
                    <input type="date" value={nfData} onChange={e => setNfData(e.target.value)} style={INP} />
                  </div>
                </div>
              )}

              {/* ── Observações ── */}
              <div style={{ marginBottom: 20 }}>
                <FieldLabel>Observações</FieldLabel>
                <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} placeholder="Informações adicionais sobre o acerto..." style={{ ...INP, resize: "vertical" }} />
              </div>

              {erro && <div style={{ background: "#fce8e8", border: "1px solid #ef9a9a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#8a2a2a", fontSize: 13 }}>❌ {erro}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowModal(false); reset(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={salvar} disabled={salvando} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: salvando ? "#8a9a8a" : "#4a7a3a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: salvando ? "not-allowed" : "pointer" }}>
                  {salvando ? "Salvando..." : "✅ Registrar Acerto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2e1a", marginBottom: 12, marginTop: 4, paddingBottom: 6, borderBottom: "2px solid #e8e0d0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 4 }}>
      {children}
    </label>
  );
}
