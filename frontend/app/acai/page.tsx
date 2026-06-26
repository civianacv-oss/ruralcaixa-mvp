"use client";
import { apiFetch } from "@/lib/api";
import ImportarModal from "@/components/ImportarModal";
import { useState, useEffect } from "react";
import BannerOrientacao from "@/components/BannerOrientacao";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

// ── helpers ────────────────────────────────────────────────────
function fmtBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}
function fmtNum(v: number | null | undefined, dec = 2) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── types ──────────────────────────────────────────────────────
type Talhao = {
  id: number; nome: string; area_ha: number;
  sistema: string; especie: string; fase: string;
  data_plantio: string | null; espacamento_m: number | null;
  num_plantas: number | null; observacoes: string | null;
  total_kg_colhido: number; receita_total: number;
  num_colheitas: number; produtividade_kg_ha: number;
  dias_desde_plantio: number | null; ativo: boolean;
};
type Safra = {
  id: number; talhao_id: number; talhao_nome: string;
  data_colheita: string; quantidade_kg: number;
  preco_kg: number; valor_total: number;
  comprador: string | null; tipo_venda: string;
  kg_por_ha: number | null;
};
type Insumo = {
  id: number; talhao_id: number | null; talhao_nome: string | null;
  data_lancamento: string; descricao: string;
  categoria: string; valor_total: number;
  quantidade: number | null; unidade: string | null;
};
type Dashboard = {
  ano: number; receita_bruta: number; total_custos: number;
  lucro_liquido: number; margem_pct: number;
  total_kg: number; preco_medio_kg: number;
  num_colheitas: number; area_total_ha: number;
  num_talhoes: number; produtividade_kg_ha: number;
  custo_por_kg: number; custo_por_ha: number;
  custos_por_categoria: Record<string, number>;
};
type ProdTalhao = {
  id: number; talhao: string; area_ha: number;
  sistema: string; fase: string; ano: number;
  total_kg: number; receita: number; preco_medio: number;
  colheitas: number; kg_por_ha: number;
};
type DRE = {
  ano: number; receita_bruta: number; total_kg: number;
  custos_por_categoria: Record<string, number>;
  total_custos: number; resultado_liquido: number; margem_pct: number;
};

// ── labels ─────────────────────────────────────────────────────
const sistemaLabel: Record<string, string> = {
  varzea: "🌊 Várzea", terra_firme: "🌳 Terra Firme",
  igapo: "🌿 Igapó", outro: "📍 Outro",
};
const especieLabel: Record<string, string> = {
  euterpe_oleracea: "🌴 E. oleracea (açaí-do-pará)",
  euterpe_precatoria: "🌴 E. precatoria (açaí-solteiro)",
  outro: "🌱 Outro",
};
const faseLabel: Record<string, { label: string; color: string; bg: string }> = {
  implantacao: { label: "🌱 Implantação", color: "#0284c7", bg: "#e0f2fe" },
  crescimento: { label: "🌿 Crescimento", color: "#16a34a", bg: "#dcfce7" },
  producao:    { label: "🍇 Produção",    color: "#7c3aed", bg: "#ede9fe" },
  reforma:     { label: "🔧 Reforma",     color: "#d97706", bg: "#fef3c7" },
  abandonado:  { label: "⚠️ Abandonado",  color: "#dc2626", bg: "#fee2e2" },
};
const tipoVendaLabel: Record<string, string> = {
  in_natura: "In Natura", polpa: "Polpa", cooperativa: "Cooperativa",
  industria: "Indústria", outro: "Outro",
};
const categoriaLabel: Record<string, string> = {
  insumo: "🧪 Insumo", mao_de_obra: "👷 Mão de Obra",
  maquinario: "🚜 Maquinário", frete: "🚛 Frete",
  irrigacao: "💧 Irrigação", outros: "📦 Outros",
};

const COR = "#1a5c2e";
const COR_LIGHT = "#f0f7f2";

export default function AcaiPage() {
  const [modalImportar, setModalImportar] = useState(false);
  const [aba, setAba] = useState<"talhoes" | "safra" | "insumos" | "produtividade" | "dre">("talhoes");
  const [loading, setLoading] = useState(true);
  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [safras, setSafras] = useState<Safra[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [produtividade, setProdutividade] = useState<{ por_talhao: ProdTalhao[]; evolucao_mensal: { mes: string; total_kg: number; receita: number }[] } | null>(null);
  const [dre, setDre] = useState<DRE | null>(null);

  // forms
  const [novoTalhao, setNovoTalhao] = useState({
    nome: "", area_ha: "", sistema: "varzea", especie: "euterpe_oleracea",
    data_plantio: "", espacamento_m: "", num_plantas: "", fase: "implantacao", observacoes: "",
  });
  const [novaSafra, setNovaSafra] = useState({
    talhao_id: "", data_colheita: new Date().toISOString().slice(0, 10),
    quantidade_kg: "", preco_kg: "", comprador: "", tipo_venda: "in_natura",
  });
  const [novoInsumo, setNovoInsumo] = useState({
    talhao_id: "", data_lancamento: new Date().toISOString().slice(0, 10),
    descricao: "", categoria: "insumo", quantidade: "", unidade: "", valor_total: "",
  });

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [anoFiltro] = useState(new Date().getFullYear());

  useEffect(() => { carregarTudo(); }, []);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [talRes, safRes, insRes, dashRes, prodRes, dreRes] = await Promise.allSettled([
        apiFetch(`${API}/acai/talhoes?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/acai/safras?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/acai/insumos?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        apiFetch(`${API}/acai/dashboard/${IMOVEL_ID}`).then(r => r.ok ? r.json() : null),
        apiFetch(`${API}/acai/produtividade/${IMOVEL_ID}`).then(r => r.ok ? r.json() : null),
        apiFetch(`${API}/acai/dre/${IMOVEL_ID}`).then(r => r.ok ? r.json() : null),
      ]);
      if (talRes.status === "fulfilled") setTalhoes(talRes.value || []);
      if (safRes.status === "fulfilled") setSafras(safRes.value || []);
      if (insRes.status === "fulfilled") setInsumos(insRes.value || []);
      if (dashRes.status === "fulfilled") setDashboard(dashRes.value);
      if (prodRes.status === "fulfilled") setProdutividade(prodRes.value);
      if (dreRes.status === "fulfilled") setDre(dreRes.value);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function showMsg(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function cadastrarTalhao() {
    if (!novoTalhao.nome || !novoTalhao.area_ha) return;
    setSalvando(true);
    try {
      const r = await apiFetch(`${API}/acai/talhoes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID,
          nome: novoTalhao.nome,
          area_ha: Number(novoTalhao.area_ha),
          sistema: novoTalhao.sistema,
          especie: novoTalhao.especie,
          data_plantio: novoTalhao.data_plantio || null,
          espacamento_m: novoTalhao.espacamento_m ? Number(novoTalhao.espacamento_m) : null,
          num_plantas: novoTalhao.num_plantas ? Number(novoTalhao.num_plantas) : null,
          fase: novoTalhao.fase,
          observacoes: novoTalhao.observacoes || null,
        }),
      });
      if (r.ok) {
        showMsg("Talhão cadastrado!", true);
        setNovoTalhao({ nome: "", area_ha: "", sistema: "varzea", especie: "euterpe_oleracea", data_plantio: "", espacamento_m: "", num_plantas: "", fase: "implantacao", observacoes: "" });
        carregarTudo();
      } else { const e = await r.json(); showMsg(e.detail || "Erro.", false); }
    } catch { showMsg("Erro de conexão.", false); }
    setSalvando(false);
  }

  async function registrarSafra() {
    if (!novaSafra.talhao_id || !novaSafra.quantidade_kg || !novaSafra.preco_kg) return;
    setSalvando(true);
    try {
      const r = await apiFetch(`${API}/acai/safras`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID,
          talhao_id: Number(novaSafra.talhao_id),
          data_colheita: novaSafra.data_colheita,
          quantidade_kg: Number(novaSafra.quantidade_kg),
          preco_kg: Number(novaSafra.preco_kg),
          comprador: novaSafra.comprador || null,
          tipo_venda: novaSafra.tipo_venda,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        showMsg(`Colheita registrada! Total: ${fmtBRL(d.valor_total)}`, true);
        setNovaSafra({ talhao_id: "", data_colheita: new Date().toISOString().slice(0, 10), quantidade_kg: "", preco_kg: "", comprador: "", tipo_venda: "in_natura" });
        carregarTudo();
      } else { const e = await r.json(); showMsg(e.detail || "Erro.", false); }
    } catch { showMsg("Erro de conexão.", false); }
    setSalvando(false);
  }

  async function registrarInsumo() {
    if (!novoInsumo.descricao || !novoInsumo.valor_total) return;
    setSalvando(true);
    try {
      const r = await apiFetch(`${API}/acai/insumos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel_id: IMOVEL_ID,
          talhao_id: novoInsumo.talhao_id ? Number(novoInsumo.talhao_id) : null,
          data_lancamento: novoInsumo.data_lancamento,
          descricao: novoInsumo.descricao,
          categoria: novoInsumo.categoria,
          quantidade: novoInsumo.quantidade ? Number(novoInsumo.quantidade) : null,
          unidade: novoInsumo.unidade || null,
          valor_total: Number(novoInsumo.valor_total),
        }),
      });
      if (r.ok) {
        showMsg("Custo registrado!", true);
        setNovoInsumo({ talhao_id: "", data_lancamento: new Date().toISOString().slice(0, 10), descricao: "", categoria: "insumo", quantidade: "", unidade: "", valor_total: "" });
        carregarTudo();
      } else { const e = await r.json(); showMsg(e.detail || "Erro.", false); }
    } catch { showMsg("Erro de conexão.", false); }
    setSalvando(false);
  }

  const abas = [
    { id: "talhoes",       label: "🌴 Talhões" },
    { id: "safra",         label: "🍇 Safra / Colheita" },
    { id: "insumos",       label: "🧪 Insumos e Manejo" },
    { id: "produtividade", label: "📈 Produtividade" },
    { id: "dre",           label: "📊 DRE Rural" },
  ] as const;

  const inputStyle = { padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 };
  const labelStyle = { fontSize: 11, fontWeight: 600 as const, color: "#6b7280" };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", color: "#6b7280", fontSize: 16 }}>
      Carregando módulo Açaí...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: COR_LIGHT, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: COR, color: "#fff", padding: "18px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 32 }}>🌴</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Cultivo de Açaí</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>Atividade Rural — Livro Caixa / LCDPR — Imóvel #{IMOVEL_ID}</p>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Banner Atividade Rural */}
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#15803d", marginBottom: 4 }}>
              Atividade Rural — Produção Própria de Açaí
            </div>
            <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.6 }}>
              A produção de açaí é <strong>atividade rural por natureza</strong> (RIR/2018, Decreto nº 9.580/2018, art. 2º).
              Toda a receita deve ser registrada no <strong>Livro Caixa da Atividade Rural (LCDPR)</strong>,
              independentemente do tempo de cultivo. Não há prazo mínimo para enquadramento.
            </div>
          </div>
        </div>

        <BannerOrientacao
          modulo="acai"
          titulo="Como usar o módulo de Cultivo de Açaí"
          descricao="Registre seus talhões (parcelas de cultivo), as colheitas por talhão e os custos de manejo. O sistema calcula automaticamente a produtividade (kg/ha), o lucro e gera o DRE da atividade para o seu contador."
          passos={[
            { icone: "🌴", texto: "1. Talhões: cadastre cada área de cultivo" },
            { icone: "🍇", texto: "2. Safra: registre cada colheita com kg e preço" },
            { icone: "🧪", texto: "3. Insumos: registre adubos, defensivos e mão de obra" },
            { icone: "📊", texto: "4. DRE: veja o resultado final da atividade" },
          ]}
          baseLegal="Decreto nº 9.580/2018 (RIR/2018), art. 2º — Cultivo de açaí é Atividade Rural por natureza"
        />
        {/* KPI Cards */}
        {dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Receita Bruta", value: fmtBRL(dashboard.receita_bruta), icon: "💵", color: COR },
              { label: "Custo Total", value: fmtBRL(dashboard.total_custos), icon: "💸", color: "#dc2626" },
              { label: "Lucro Líquido", value: fmtBRL(dashboard.lucro_liquido), icon: "💰", color: dashboard.lucro_liquido >= 0 ? "#16a34a" : "#dc2626" },
              { label: "Produtividade", value: `${fmtNum(dashboard.produtividade_kg_ha)} kg/ha`, icon: "📊", color: "#0284c7" },
              { label: "Total Colhido", value: `${fmtNum(dashboard.total_kg)} kg`, icon: "🍇", color: "#7c3aed" },
            ].map(k => (
              <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>{k.icon}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Toast */}
        {msg && (
          <div style={{ background: msg.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${msg.ok ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: msg.ok ? "#16a34a" : "#dc2626", fontWeight: 600, fontSize: 14 }}>
            {msg.ok ? "✓ " : "✗ "}{msg.text}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#fff", borderRadius: 10, padding: 6, border: "1px solid #e5e7eb", overflowX: "auto" }}>
          {abas.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              style={{ padding: "8px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
                background: aba === a.id ? COR : "transparent",
                color: aba === a.id ? "#fff" : "#6b7280",
              }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── ABA TALHÕES ── */}
        {aba === "talhoes" && (
          <div>
            {/* Formulário */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Cadastrar Talhão</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Nome *</label>
                  <input placeholder="Ex: Talhão A" value={novoTalhao.nome} onChange={e => setNovoTalhao(p => ({ ...p, nome: e.target.value }))} style={{ ...inputStyle, width: 160 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Área (ha) *</label>
                  <input type="number" placeholder="0.00" value={novoTalhao.area_ha} onChange={e => setNovoTalhao(p => ({ ...p, area_ha: e.target.value }))} style={{ ...inputStyle, width: 100 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Sistema</label>
                  <select value={novoTalhao.sistema} onChange={e => setNovoTalhao(p => ({ ...p, sistema: e.target.value }))} style={inputStyle}>
                    <option value="varzea">🌊 Várzea</option>
                    <option value="terra_firme">🌳 Terra Firme</option>
                    <option value="igapo">🌿 Igapó</option>
                    <option value="outro">📍 Outro</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Espécie</label>
                  <select value={novoTalhao.especie} onChange={e => setNovoTalhao(p => ({ ...p, especie: e.target.value }))} style={inputStyle}>
                    <option value="euterpe_oleracea">🌴 E. oleracea (açaí-do-pará)</option>
                    <option value="euterpe_precatoria">🌴 E. precatoria (açaí-solteiro)</option>
                    <option value="outro">🌱 Outro</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Fase</label>
                  <select value={novoTalhao.fase} onChange={e => setNovoTalhao(p => ({ ...p, fase: e.target.value }))} style={inputStyle}>
                    <option value="implantacao">🌱 Implantação</option>
                    <option value="crescimento">🌿 Crescimento</option>
                    <option value="producao">🍇 Produção</option>
                    <option value="reforma">🔧 Reforma</option>
                    <option value="abandonado">⚠️ Abandonado</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Data Plantio</label>
                  <input type="date" value={novoTalhao.data_plantio} onChange={e => setNovoTalhao(p => ({ ...p, data_plantio: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Espaçamento (m)</label>
                  <input type="number" placeholder="5.0" value={novoTalhao.espacamento_m} onChange={e => setNovoTalhao(p => ({ ...p, espacamento_m: e.target.value }))} style={{ ...inputStyle, width: 110 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Nº Plantas</label>
                  <input type="number" placeholder="400" value={novoTalhao.num_plantas} onChange={e => setNovoTalhao(p => ({ ...p, num_plantas: e.target.value }))} style={{ ...inputStyle, width: 100 }} />
                </div>
                <button onClick={cadastrarTalhao} disabled={salvando || !novoTalhao.nome || !novoTalhao.area_ha}
                  style={{ padding: "8px 18px", background: COR, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando || !novoTalhao.nome || !novoTalhao.area_ha ? 0.6 : 1, alignSelf: "flex-end" }}>
                  {salvando ? "..." : "+ Cadastrar"}
                </button>
          <button onClick={() => setModalImportar(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#f0f8ea", color: "#2a5a2a", fontSize: 13, fontWeight: 600, cursor: "pointer", marginLeft: 8 }}>📂 Importar planilha</button>
              </div>
            </div>

            {/* Tabela de talhões */}
            {talhoes.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhum talhão cadastrado. Cadastre o primeiro talhão acima.
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Talhão", "Área (ha)", "Sistema", "Espécie", "Fase", "Data Plantio", "Nº Plantas", "Total Colhido", "Produtividade", "Receita Total"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {talhoes.map((t, i) => {
                      const fase = faseLabel[t.fase] || { label: t.fase, color: "#6b7280", bg: "#f3f4f6" };
                      return (
                        <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: "#111827" }}>{t.nome}</td>
                          <td style={{ padding: "10px 12px", color: "#374151" }}>{fmtNum(t.area_ha, 4)}</td>
                          <td style={{ padding: "10px 12px", color: "#6b7280" }}>{sistemaLabel[t.sistema] || t.sistema}</td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>{especieLabel[t.especie] || t.especie}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ background: fase.bg, color: fase.color, borderRadius: 5, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{fase.label}</span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtDate(t.data_plantio)}</td>
                          <td style={{ padding: "10px 12px", color: "#374151" }}>{t.num_plantas ? t.num_plantas.toLocaleString("pt-BR") : "—"}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#7c3aed" }}>{fmtNum(t.total_kg_colhido)} kg</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0284c7" }}>{fmtNum(t.produtividade_kg_ha)} kg/ha</td>
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: COR }}>{fmtBRL(t.receita_total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA SAFRA / COLHEITA ── */}
        {aba === "safra" && (
          <div>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Registrar Colheita</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Talhão *</label>
                  <select value={novaSafra.talhao_id} onChange={e => setNovaSafra(p => ({ ...p, talhao_id: e.target.value }))} style={{ ...inputStyle, minWidth: 160 }}>
                    <option value="">Selecionar...</option>
                    {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome} ({fmtNum(t.area_ha, 2)} ha)</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Data Colheita</label>
                  <input type="date" value={novaSafra.data_colheita} onChange={e => setNovaSafra(p => ({ ...p, data_colheita: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Quantidade (kg) *</label>
                  <input type="number" placeholder="0.000" value={novaSafra.quantidade_kg} onChange={e => setNovaSafra(p => ({ ...p, quantidade_kg: e.target.value }))} style={{ ...inputStyle, width: 130 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Preço/kg (R$) *</label>
                  <input type="number" placeholder="0.00" value={novaSafra.preco_kg} onChange={e => setNovaSafra(p => ({ ...p, preco_kg: e.target.value }))} style={{ ...inputStyle, width: 120 }} />
                </div>
                {novaSafra.quantidade_kg && novaSafra.preco_kg && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={labelStyle}>Total Calculado</label>
                    <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, fontSize: 14, fontWeight: 700, color: COR }}>
                      {fmtBRL(Number(novaSafra.quantidade_kg) * Number(novaSafra.preco_kg))}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Tipo de Venda</label>
                  <select value={novaSafra.tipo_venda} onChange={e => setNovaSafra(p => ({ ...p, tipo_venda: e.target.value }))} style={inputStyle}>
                    <option value="in_natura">In Natura</option>
                    <option value="polpa">Polpa</option>
                    <option value="cooperativa">Cooperativa</option>
                    <option value="industria">Indústria</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Comprador</label>
                  <input placeholder="Nome do comprador" value={novaSafra.comprador} onChange={e => setNovaSafra(p => ({ ...p, comprador: e.target.value }))} style={{ ...inputStyle, width: 180 }} />
                </div>
                <button onClick={registrarSafra} disabled={salvando || !novaSafra.talhao_id || !novaSafra.quantidade_kg || !novaSafra.preco_kg}
                  style={{ padding: "8px 18px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando ? 0.6 : 1, alignSelf: "flex-end" }}>
                  {salvando ? "..." : "🍇 Registrar"}
                </button>
              </div>
            </div>

            {safras.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhuma colheita registrada ainda.
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Data", "Talhão", "Qtd (kg)", "Preço/kg", "Valor Total", "kg/ha", "Tipo Venda", "Comprador"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safras.map((s, i) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtDate(s.data_colheita)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#374151" }}>{s.talhao_nome}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#7c3aed" }}>{fmtNum(s.quantidade_kg, 3)}</td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>R$ {fmtNum(s.preco_kg, 4)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: COR }}>{fmtBRL(s.valor_total)}</td>
                        <td style={{ padding: "10px 12px", color: "#0284c7" }}>{s.kg_por_ha ? fmtNum(s.kg_por_ha) : "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: "#ede9fe", color: "#6d28d9", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{tipoVendaLabel[s.tipo_venda] || s.tipo_venda}</span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{s.comprador || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA INSUMOS E MANEJO ── */}
        {aba === "insumos" && (
          <div>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Registrar Custo / Insumo</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Talhão (opcional)</label>
                  <select value={novoInsumo.talhao_id} onChange={e => setNovoInsumo(p => ({ ...p, talhao_id: e.target.value }))} style={{ ...inputStyle, minWidth: 160 }}>
                    <option value="">Toda a propriedade</option>
                    {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Data</label>
                  <input type="date" value={novoInsumo.data_lancamento} onChange={e => setNovoInsumo(p => ({ ...p, data_lancamento: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Descrição *</label>
                  <input placeholder="Ex: Ureia 45%" value={novoInsumo.descricao} onChange={e => setNovoInsumo(p => ({ ...p, descricao: e.target.value }))} style={{ ...inputStyle, width: 200 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Categoria</label>
                  <select value={novoInsumo.categoria} onChange={e => setNovoInsumo(p => ({ ...p, categoria: e.target.value }))} style={inputStyle}>
                    <option value="insumo">🧪 Insumo</option>
                    <option value="mao_de_obra">👷 Mão de Obra</option>
                    <option value="maquinario">🚜 Maquinário</option>
                    <option value="frete">🚛 Frete</option>
                    <option value="irrigacao">💧 Irrigação</option>
                    <option value="outros">📦 Outros</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Quantidade</label>
                  <input type="number" placeholder="0" value={novoInsumo.quantidade} onChange={e => setNovoInsumo(p => ({ ...p, quantidade: e.target.value }))} style={{ ...inputStyle, width: 100 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Unidade</label>
                  <input placeholder="kg, sc, L..." value={novoInsumo.unidade} onChange={e => setNovoInsumo(p => ({ ...p, unidade: e.target.value }))} style={{ ...inputStyle, width: 80 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>Valor Total (R$) *</label>
                  <input type="number" placeholder="0.00" value={novoInsumo.valor_total} onChange={e => setNovoInsumo(p => ({ ...p, valor_total: e.target.value }))} style={{ ...inputStyle, width: 130 }} />
                </div>
                <button onClick={registrarInsumo} disabled={salvando || !novoInsumo.descricao || !novoInsumo.valor_total}
                  style={{ padding: "8px 18px", background: "#d97706", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando ? 0.6 : 1, alignSelf: "flex-end" }}>
                  {salvando ? "..." : "✚ Registrar"}
                </button>
              </div>
            </div>

            {/* Resumo por categoria */}
            {dashboard && Object.keys(dashboard.custos_por_categoria).length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                {Object.entries(dashboard.custos_por_categoria).map(([cat, val]) => (
                  <div key={cat} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", minWidth: 140 }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{categoriaLabel[cat] || cat}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#dc2626", marginTop: 2 }}>{fmtBRL(val)}</div>
                  </div>
                ))}
              </div>
            )}

            {insumos.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhum custo registrado ainda.
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Data", "Descrição", "Categoria", "Talhão", "Qtd", "Unid.", "Valor Total"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {insumos.map((ins, i) => (
                      <tr key={ins.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtDate(ins.data_lancamento)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#374151" }}>{ins.descricao}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: "#fef3c7", color: "#d97706", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{categoriaLabel[ins.categoria] || ins.categoria}</span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{ins.talhao_nome || "Propriedade toda"}</td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{ins.quantidade ? fmtNum(ins.quantidade, 2) : "—"}</td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{ins.unidade || "—"}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: "#dc2626" }}>{fmtBRL(ins.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA PRODUTIVIDADE ── */}
        {aba === "produtividade" && (
          <div>
            {!produtividade || (produtividade.por_talhao.length === 0 && produtividade.evolucao_mensal.length === 0) ? (
              <div style={{ padding: 48, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Nenhum dado de produtividade disponível</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Registre colheitas na aba Safra para visualizar os relatórios.</div>
              </div>
            ) : (
              <div>
                {/* Comparativo por talhão */}
                {produtividade.por_talhao.length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 14, color: "#374151" }}>
                      📊 Produtividade por Talhão / Ano
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                          {["Talhão", "Ano", "Área (ha)", "Sistema", "Fase", "Colheitas", "Total (kg)", "kg/ha", "Receita", "Preço Médio/kg"].map(h => (
                            <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {produtividade.por_talhao.map((p, i) => {
                          const fase = faseLabel[p.fase] || { label: p.fase, color: "#6b7280", bg: "#f3f4f6" };
                          return (
                            <tr key={`${p.id}-${p.ano}`} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: "#111827" }}>{p.talhao}</td>
                              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#374151" }}>{p.ano}</td>
                              <td style={{ padding: "10px 12px", color: "#6b7280" }}>{fmtNum(p.area_ha, 2)}</td>
                              <td style={{ padding: "10px 12px", color: "#6b7280" }}>{sistemaLabel[p.sistema] || p.sistema}</td>
                              <td style={{ padding: "10px 12px" }}>
                                <span style={{ background: fase.bg, color: fase.color, borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>{fase.label}</span>
                              </td>
                              <td style={{ padding: "10px 12px", color: "#374151" }}>{p.colheitas}</td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: "#7c3aed" }}>{fmtNum(p.total_kg)} kg</td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0284c7" }}>{fmtNum(p.kg_por_ha)} kg/ha</td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: COR }}>{fmtBRL(p.receita)}</td>
                              <td style={{ padding: "10px 12px", color: "#374151" }}>R$ {fmtNum(p.preco_medio, 4)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Evolução mensal */}
                {produtividade.evolucao_mensal.length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 14, color: "#374151" }}>
                      📅 Evolução Mensal da Produção
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                          {["Mês", "Total Colhido (kg)", "Receita"].map(h => (
                            <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {produtividade.evolucao_mensal.map((m, i) => (
                          <tr key={m.mes} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: "#374151" }}>{m.mes}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "#7c3aed" }}>{fmtNum(m.total_kg)} kg</td>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: COR }}>{fmtBRL(m.receita)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ABA DRE RURAL ── */}
        {aba === "dre" && (
          <div>
            {!dre ? (
              <div style={{ padding: 48, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhum dado disponível. Registre safras e insumos primeiro.
              </div>
            ) : (
              <div>
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 14, color: "#374151" }}>
                    📊 DRE Rural — Cultivo de Açaí — Ano {dre.ano}
                  </div>
                  <div style={{ padding: 20 }}>
                    {[
                      { label: "Receita Bruta da Atividade Rural", value: dre.receita_bruta, color: COR, bold: true, indent: 0 },
                      { label: `Total Colhido: ${fmtNum(dre.total_kg)} kg`, value: null, color: "#6b7280", bold: false, indent: 1 },
                      { label: "( - ) Custos e Despesas da Atividade", value: -dre.total_custos, color: "#dc2626", bold: true, indent: 0 },
                      ...Object.entries(dre.custos_por_categoria).map(([cat, val]) => ({
                        label: `${categoriaLabel[cat] || cat}`, value: -val, color: "#6b7280", bold: false, indent: 1,
                      })),
                      { label: "= Resultado Líquido da Atividade Rural", value: dre.resultado_liquido, color: dre.resultado_liquido >= 0 ? "#16a34a" : "#dc2626", bold: true, indent: 0 },
                      { label: `Margem: ${fmtNum(dre.margem_pct, 2)}%`, value: null, color: "#6b7280", bold: false, indent: 1 },
                    ].map((row, i) => (
                      <div key={i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: `${row.indent ? "6px 16px" : "10px 0"}`,
                        borderBottom: !row.indent ? "1px solid #e5e7eb" : "none",
                        marginLeft: row.indent ? 16 : 0,
                      }}>
                        <span style={{ fontSize: row.bold ? 14 : 13, fontWeight: row.bold ? 700 : 400, color: row.color }}>{row.label}</span>
                        {row.value !== null && (
                          <span style={{ fontSize: row.bold ? 16 : 13, fontWeight: row.bold ? 800 : 600, color: row.color }}>
                            {row.value < 0 ? `(${fmtBRL(Math.abs(row.value))})` : fmtBRL(row.value)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* KPIs do DRE */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Receita Bruta", value: fmtBRL(dre.receita_bruta), color: COR },
                    { label: "Total Custos", value: fmtBRL(dre.total_custos), color: "#dc2626" },
                    { label: "Resultado Líquido", value: fmtBRL(dre.resultado_liquido), color: dre.resultado_liquido >= 0 ? "#16a34a" : "#dc2626" },
                    { label: "Margem Líquida", value: `${fmtNum(dre.margem_pct, 2)}%`, color: dre.margem_pct >= 0 ? "#0284c7" : "#dc2626" },
                  ].map(k => (
                    <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#64748b" }}>
                  ⚖️ <strong>Base legal:</strong> Decreto nº 9.580/2018 (RIR/2018) — A produção de açaí é atividade rural por natureza. Toda a receita deve ser declarada no <strong>LCDPR (Livro Caixa Digital do Produtor Rural)</strong> e compõe a base de cálculo do IRPF sobre atividade rural.
                </div>
              </div>
            )}
          </div>
        )}

      </div>
      {modalImportar && (
        <ImportarModal
          modulo="acai"
          onClose={() => setModalImportar(false)}
          onSuccess={(qtd) => { setModalImportar(false); }}
        />
      )}
    </div>
  );
}
