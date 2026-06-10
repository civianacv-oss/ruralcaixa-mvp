// v2 - bovino leite e corte - fix nome
"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Animal = {
  id: number;
  brinco: string;
  nome: string | null;
  sexo: string;
  raca_nome: string | null;
  aptidao_manejo: string;
  categoria: string;
  status: string;
  lote_id: number | null;
  lote_nome: string | null;
  ultimo_peso: number | null;
  data_ultimo_peso: string | null;
  data_nascimento: string | null;
  observacoes: string | null;
};

type Lote = {
  id: number;
  nome: string;
  aptidao: string;
  qtd_animais: number;
};

type Raca = {
  id: number;
  nome: string;
  aptidao: string;
};

type Dashboard = {
  totais: { total_corte: number; total_leite: number; total_geral: number };
  leite_30d: { volume_l: number; receita: number };
  alertas: { reforcos_sanitarios: number; femeas_prenhas: number };
  rebanho_por_categoria: { categoria: string; aptidao_manejo: string; sexo: string; qtd: number }[];
};

type Pesagem = {
  id: number;
  data: string;
  peso_kg: number;
  motivo: string;
};

type AbateIn = {
  animal_id: number;
  data: string;
  tipo: string;
  peso_vivo_kg: string;
  peso_carcaca_kg: string;
  preco_arroba: string;
  comprador: string;
};

type AbateRecord = {
  id: number;
  data: string;
  tipo: string;
  peso_vivo_kg: number | null;
  peso_carcaca_kg: number | null;
  preco_arroba: number | null;
  valor_total: number | null;
  comprador: string | null;
  brinco: string;
  animal_nome: string | null;
  categoria: string;
};

type SanitarioRecord = {
  id: number;
  tipo: string;
  produto: string;
  dose_ml: number | null;
  via_aplicacao: string | null;
  data_aplicacao: string;
  data_reforco: string | null;
  responsavel: string | null;
  custo_total: number | null;
  brinco: string | null;
  animal_nome: string | null;
  lote_nome: string | null;
};

type ReproducaoRecord = {
  id: number;
  metodo: string;
  data_cobertura: string;
  data_parto_prev: string | null;
  data_parto_real: string | null;
  resultado: string | null;
  dias_para_parto: number | null;
  brinco: string;
  femea_nome: string | null;
};

const TABS = ["Rebanho", "Lotes", "Pesagens", "Leite", "Sanitário", "Reprodução", "Abates"] as const;
type Tab = typeof TABS[number];

export default function BovinoPage() {
  const [tab, setTab] = useState<Tab>("Rebanho");
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [racas, setRacas] = useState<Raca[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [aptidaoFiltro, setAptidaoFiltro] = useState<"todos" | "corte" | "leite">("todos");

  // Cadastro animal
  const [showCadastro, setShowCadastro] = useState(false);
  const [brinco, setBrinco] = useState("");
  const [nome, setNome] = useState("");
  const [sexo, setSexo] = useState("M");
  const [aptidao, setAptidao] = useState("corte");
  const [categoria, setCategoria] = useState("bezerro");
  const [racaId, setRacaId] = useState("");
  const [loteId, setLoteId] = useState("");
  const [dataNasc, setDataNasc] = useState("");
  const [pesoNasc, setPesoNasc] = useState("");
  const [origem, setOrigem] = useState("nascimento");
  const [valorAquis, setValorAquis] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Pesagem
  const [animalPesagem, setAnimalPesagem] = useState<Animal | null>(null);
  const [pesagens, setPesagens] = useState<Pesagem[]>([]);
  const [pesagemData, setPesagemData] = useState(new Date().toISOString().split("T")[0]);
  const [pesagemPeso, setPesagemPeso] = useState("");
  const [pesagemMotivo, setPesagemMotivo] = useState("rotina");

  // Sanitário
  const [sanitarios, setSanitarios] = useState<SanitarioRecord[]>([]);
  const [proxReforcos, setProxReforcos] = useState<SanitarioRecord[]>([]);
  const [showSanitario, setShowSanitario] = useState(false);
  const [sanTipo, setSanTipo] = useState("vacinacao");
  const [sanProduto, setSanProduto] = useState("");
  const [sanAnimalId, setSanAnimalId] = useState("");
  const [sanLoteId, setSanLoteId] = useState("");
  const [sanDose, setSanDose] = useState("");
  const [sanVia, setSanVia] = useState("intramuscular");
  const [sanData, setSanData] = useState(new Date().toISOString().split("T")[0]);
  const [sanReforco, setSanReforco] = useState("");
  const [sanResponsavel, setSanResponsavel] = useState("");
  const [sanCusto, setSanCusto] = useState("");
  const [msgSan, setMsgSan] = useState("");

  // Reprodução
  const [prenhas, setPrenhas] = useState<ReproducaoRecord[]>([]);
  const [showReproducao, setShowReproducao] = useState(false);
  const [repFemeaId, setRepFemeaId] = useState("");
  const [repTouroId, setRepTouroId] = useState("");
  const [repMetodo, setRepMetodo] = useState("monta_natural");
  const [repData, setRepData] = useState(new Date().toISOString().split("T")[0]);
  const [repObs, setRepObs] = useState("");
  const [msgRep, setMsgRep] = useState("");

  // Abate
  const [abates, setAbates] = useState<AbateRecord[]>([]);
  const [showAbate, setShowAbate] = useState(false);
  const [abateAnimalId, setAbateAnimalId] = useState("");
  const [abateData, setAbateData] = useState(new Date().toISOString().split("T")[0]);
  const [abateTipo, setAbateTipo] = useState("venda_em_pe");
  const [abatePesoVivo, setAbatePesoVivo] = useState("");
  const [abatePesoCarcaca, setAbatePesoCarcaca] = useState("");
  const [abatePrecoArroba, setAbatePrecoArroba] = useState("");
  const [abateComprador, setAbateComprador] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [animRes, lotesRes, racasRes, dashRes, abatesRes, sanRes, reforcoRes, prenhasRes] = await Promise.all([
        fetch(`${API}/bovino/animais/${IMOVEL_ID}?status=ativo`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/lotes/${IMOVEL_ID}`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/racas`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/dashboard/${IMOVEL_ID}`).then(r => r.json()).catch(() => null),
        fetch(`${API}/bovino/abates/${IMOVEL_ID}`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/sanitario/${IMOVEL_ID}/proximos?dias=90`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/sanitario/${IMOVEL_ID}/proximos?dias=30`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/reproducao/${IMOVEL_ID}/prenhas`).then(r => r.json()).catch(() => []),
      ]);
      setAnimais(Array.isArray(animRes) ? animRes : []);
      setLotes(Array.isArray(lotesRes) ? lotesRes : []);
      setRacas(Array.isArray(racasRes) ? racasRes : []);
      setDashboard(dashRes);
      setAbates(Array.isArray(abatesRes) ? abatesRes : []);
      setSanitarios(Array.isArray(sanRes) ? sanRes : []);
      setProxReforcos(Array.isArray(reforcoRes) ? reforcoRes : []);
      setPrenhas(Array.isArray(prenhasRes) ? prenhasRes : []);
    } finally {
      setLoading(false);
    }
  }

  async function cadastrarAnimal() {
    if (!brinco || !sexo || !aptidao || !categoria) { setMsg("Preencha brinco, sexo, aptidão e categoria."); return; }
    setSaving(true); setMsg("");
    try {
      const body: Record<string, unknown> = {
        imovel_id: IMOVEL_ID, brinco, nome: nome || null,
        sexo, aptidao_manejo: aptidao, categoria,
        raca_id: racaId ? Number(racaId) : null,
        lote_id: loteId ? Number(loteId) : null,
        data_nascimento: dataNasc || null,
        peso_nascimento: pesoNasc ? Number(pesoNasc) : null,
        origem,
        valor_aquisicao: valorAquis ? Number(valorAquis) : null,
      };
      const res = await fetch(`${API}/bovino/animais`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setMsg("✅ Animal cadastrado!");
        setBrinco(""); setNome(""); setPesoNasc(""); setValorAquis(""); setDataNasc("");
        setShowCadastro(false);
        loadData();
      } else {
        const err = await res.json();
        setMsg("Erro: " + (err.detail || res.status));
      }
    } catch (e) { setMsg("Erro de conexão"); }
    setSaving(false);
  }

  async function carregarPesagens(animal: Animal) {
    setAnimalPesagem(animal);
    const res = await fetch(`${API}/bovino/pesagens/${animal.id}`).then(r => r.json()).catch(() => []);
    setPesagens(Array.isArray(res) ? res : []);
  }

  async function registrarPesagem() {
    if (!animalPesagem || !pesagemPeso) return;
    const res = await fetch(`${API}/bovino/pesagens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ animal_id: animalPesagem.id, data: pesagemData, peso_kg: Number(pesagemPeso), motivo: pesagemMotivo })
    });
    if (res.ok) {
      setPesagemPeso("");
      carregarPesagens(animalPesagem);
      loadData();
    }
  }

  async function registrarAbate() {
    if (!abateAnimalId) { alert("Selecione um animal"); return; }
    const body = {
      animal_id: Number(abateAnimalId), data: abateData, tipo: abateTipo,
      peso_vivo_kg: abatePesoVivo ? Number(abatePesoVivo) : null,
      peso_carcaca_kg: abatePesoCarcaca ? Number(abatePesoCarcaca) : null,
      preco_arroba: abatePrecoArroba ? Number(abatePrecoArroba) : null,
      comprador: abateComprador || null,
    };
    const res = await fetch(`${API}/bovino/abates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { setShowAbate(false); loadData(); }
  }

  async function registrarSanitario() {
    if (!sanProduto || !sanTipo) { setMsgSan("Preencha tipo e produto."); return; }
    if (!sanAnimalId && !sanLoteId) { setMsgSan("Selecione um animal ou lote."); return; }
    const body = {
      animal_id: sanAnimalId ? Number(sanAnimalId) : null,
      lote_id: sanLoteId ? Number(sanLoteId) : null,
      tipo: sanTipo, produto: sanProduto,
      dose_ml: sanDose ? Number(sanDose) : null,
      via_aplicacao: sanVia || null,
      data_aplicacao: sanData,
      data_reforco: sanReforco || null,
      responsavel: sanResponsavel || null,
      custo_total: sanCusto ? Number(sanCusto) : null,
    };
    const res = await fetch(`${API}/bovino/sanitario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      setMsgSan("✅ Registro salvo!");
      setSanProduto(""); setSanDose(""); setSanReforco(""); setSanResponsavel(""); setSanCusto("");
      setShowSanitario(false);
      loadData();
    } else { setMsgSan("Erro ao salvar."); }
  }

  async function registrarReproducao() {
    if (!repFemeaId || !repMetodo) { setMsgRep("Selecione a fêmea e o método."); return; }
    const body = {
      femea_id: Number(repFemeaId),
      touro_id: repTouroId ? Number(repTouroId) : null,
      metodo: repMetodo,
      data_cobertura: repData,
      observacoes: repObs || null,
    };
    const res = await fetch(`${API}/bovino/reproducao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      setMsgRep("✅ Cobertura registrada!");
      setRepFemeaId(""); setRepTouroId(""); setRepObs("");
      setShowReproducao(false);
      loadData();
    } else { setMsgRep("Erro ao salvar."); }
  }

  const animaisFiltrados = aptidaoFiltro === "todos" ? animais : animais.filter(a => a.aptidao_manejo === aptidaoFiltro);
  const categorias = aptidao === "corte"
    ? ["bezerro", "novilho", "novilha", "boi", "vaca", "touro", "reprodutor"]
    : ["bezerra", "novilha", "vaca_solteira", "vaca_lactante", "touro", "reprodutor"];

  const green = "#2d5a27";
  const lightGreen = "#e8f0e6";
  const accent = "#5a8c52";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f5f0e8" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>🐄</div>
        <p style={{ color: green, fontWeight: 600, marginTop: 12 }}>Carregando módulo bovino...</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: green, color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", color:"white", fontSize:13, fontWeight:600, textDecoration:"none", borderRadius:8, padding:"6px 14px", backdropFilter:"blur(4px)" }}>← Painel Principal</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 28 }}>🐄</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Bovino — Leite & Corte</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Fazenda Boa Esperança — Imóvel #1</div>
          </div>
        </div>
        <button onClick={() => setShowCadastro(!showCadastro)}
          style={{ background: "white", color: green, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          + Cadastrar Animal
        </button>
      </div>

      {/* Dashboard Cards */}
      {dashboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: "16px 24px 0" }}>
          {[
            { icon: "🐄", val: dashboard.totais.total_geral, label: "Rebanho Ativo" },
            { icon: "🥩", val: dashboard.totais.total_corte, label: "Corte" },
            { icon: "🥛", val: dashboard.totais.total_leite, label: "Leite" },
            { icon: "⚠️", val: dashboard?.alertas?.reforcos_sanitarios, label: "Reforços Sanitários" },
          ].map((c, i) => (
            <div key={i} style={{ background: "white", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 28 }}>{c.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: green, lineHeight: 1.2 }}>{c.val}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "16px 24px 0", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: tab === t ? 700 : 400, fontSize: 13,
              background: tab === t ? green : "white", color: tab === t ? "white" : "#444",
              boxShadow: tab === t ? "0 2px 8px rgba(45,90,39,0.3)" : "0 1px 3px rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 24px 40px" }}>

        {/* ── CADASTRO FORM ── */}
        {showCadastro && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${accent}` }}>
            <h3 style={{ margin: "0 0 16px", color: green, fontSize: 16 }}>🐄 Cadastrar Novo Animal</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {[
                { label: "Brinco *", comp: <input value={brinco} onChange={e => setBrinco(e.target.value)} placeholder="Ex: BOV001" style={inputStyle} /> },
                { label: "Nome", comp: <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Opcional" style={inputStyle} /> },
                { label: "Sexo *", comp: <select value={sexo} onChange={e => setSexo(e.target.value)} style={inputStyle}><option value="M">Macho</option><option value="F">Fêmea</option></select> },
                { label: "Aptidão *", comp: <select value={aptidao} onChange={e => { setAptidao(e.target.value); setCategoria("bezerro"); }} style={inputStyle}><option value="corte">Corte</option><option value="leite">Leite</option><option value="misto">Misto</option></select> },
                { label: "Categoria *", comp: <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle}>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select> },
                { label: "Raça", comp: <select value={racaId} onChange={e => setRacaId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{racas.filter(r => aptidao === "todos" || r.aptidao === aptidao || r.aptidao === "misto" || r.aptidao === "dupla").map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}</select> },
                { label: "Lote", comp: <select value={loteId} onChange={e => setLoteId(e.target.value)} style={inputStyle}><option value="">Sem lote</option>{lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select> },
                { label: "Origem", comp: <select value={origem} onChange={e => setOrigem(e.target.value)} style={inputStyle}><option value="nascimento">Nascimento</option><option value="compra">Compra</option><option value="transferencia">Transferência</option></select> },
                { label: "Nasc.", comp: <input type="date" value={dataNasc} onChange={e => setDataNasc(e.target.value)} style={inputStyle} /> },
                { label: "Peso Nasc. (kg)", comp: <input type="number" value={pesoNasc} onChange={e => setPesoNasc(e.target.value)} placeholder="kg" style={inputStyle} /> },
                { label: "Valor Aquis. (R$)", comp: <input type="number" value={valorAquis} onChange={e => setValorAquis(e.target.value)} placeholder="R$" style={inputStyle} /> },
              ].map((f, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>{f.label}</div>
                  {f.comp}
                </div>
              ))}
            </div>
            {msg && <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: msg.startsWith("✅") ? "#e8f5e9" : "#fce8e8", color: msg.startsWith("✅") ? "#2d5a27" : "#c00", fontSize: 13 }}>{msg}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={cadastrarAnimal} disabled={saving} style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                {saving ? "Salvando..." : "Cadastrar"}
              </button>
              <button onClick={() => { setShowCadastro(false); setMsg(""); }} style={{ background: "#eee", color: "#444", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── ABA REBANHO ── */}
        {tab === "Rebanho" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["todos", "corte", "leite"] as const).map(f => (
                <button key={f} onClick={() => setAptidaoFiltro(f)}
                  style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${aptidaoFiltro === f ? green : "#ddd"}`,
                    background: aptidaoFiltro === f ? lightGreen : "white", color: aptidaoFiltro === f ? green : "#555",
                    fontWeight: aptidaoFiltro === f ? 700 : 400, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                  {f === "todos" ? "Todos" : f === "corte" ? "🥩 Corte" : "🥛 Leite"}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 13, color: "#666", alignSelf: "center" }}>{animaisFiltrados.length} animais</span>
            </div>
            <div style={{ background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: lightGreen }}>
                    {["Brinco", "Nome", "Sexo", "Raça", "Categoria", "Aptidão", "Lote", "Último Peso", "Data Peso", "Status", "Ações"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: green, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {animaisFiltrados.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", color: "#999" }}>Nenhum animal cadastrado</td></tr>
                  ) : animaisFiltrados.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: accent }}>{a.brinco}</td>
                      <td style={{ padding: "10px 12px", color: "#555" }}>{a.nome || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.sexo === "M" ? "♂ Macho" : "♀ Fêmea"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.raca_nome || "—"}</td>
                      <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>{a.categoria}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: a.aptidao_manejo === "corte" ? "#fff3e0" : "#e3f2fd",
                          color: a.aptidao_manejo === "corte" ? "#e65100" : "#1565c0" }}>
                          {a.aptidao_manejo === "corte" ? "🥩 Corte" : "🥛 Leite"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{a.lote_nome || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.ultimo_peso ? `${a.ultimo_peso} kg` : "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#888" }}>{a.data_ultimo_peso ? a.data_ultimo_peso.slice(0, 10) : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#e8f5e9", color: "#2e7d32", fontWeight: 600 }}>{a.status}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button onClick={() => { carregarPesagens(a); setTab("Pesagens"); }}
                          style={{ background: lightGreen, color: green, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          ⚖️ Pesar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA LOTES ── */}
        {tab === "Lotes" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
              {lotes.length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#999" }}>Nenhum lote cadastrado</div>
              ) : lotes.map(l => (
                <div key={l.id} style={{ background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  <div style={{ fontWeight: 700, color: green, fontSize: 15 }}>{l.nome}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2, textTransform: "capitalize" }}>{l.aptidao}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: accent, marginTop: 8 }}>{l.qtd_animais}</div>
                  <div style={{ fontSize: 11, color: "#999" }}>animais</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ABA PESAGENS ── */}
        {tab === "Pesagens" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h3 style={{ margin: "0 0 16px", color: green, fontSize: 15 }}>⚖️ Registrar Pesagem</h3>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>Animal</div>
                <select value={animalPesagem?.id || ""} onChange={e => { const a = animais.find(x => x.id === Number(e.target.value)); if (a) carregarPesagens(a); }} style={inputStyle}>
                  <option value="">Selecione</option>
                  {animais.map(a => <option key={a.id} value={a.id}>{a.brinco} {a.nome ? `— ${a.nome}` : ""}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>Data</div>
                  <input type="date" value={pesagemData} onChange={e => setPesagemData(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>Peso (kg)</div>
                  <input type="number" value={pesagemPeso} onChange={e => setPesagemPeso(e.target.value)} placeholder="kg" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>Motivo</div>
                <select value={pesagemMotivo} onChange={e => setPesagemMotivo(e.target.value)} style={inputStyle}>
                  <option value="rotina">Rotina</option>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="pre_abate">Pré-abate</option>
                  <option value="tratamento">Tratamento</option>
                </select>
              </div>
              <button onClick={registrarPesagem} disabled={!animalPesagem || !pesagemPeso}
                style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", width: "100%", opacity: (!animalPesagem || !pesagemPeso) ? 0.5 : 1 }}>
                Registrar Pesagem
              </button>
            </div>
            <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h3 style={{ margin: "0 0 16px", color: green, fontSize: 15 }}>
                Histórico {animalPesagem ? `— ${animalPesagem.brinco}` : ""}
              </h3>
              {pesagens.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13 }}>Selecione um animal para ver o histórico</p>
              ) : (
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: lightGreen }}>
                    {["Data", "Peso (kg)", "Motivo"].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: green, fontSize: 12 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{pesagens.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "8px 10px" }}>{p.data?.slice(0, 10)}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: accent }}>{p.peso_kg} kg</td>
                      <td style={{ padding: "8px 10px", color: "#666", textTransform: "capitalize" }}>{p.motivo}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── ABA LEITE ── */}
        {tab === "Leite" && (
          <div style={{ background: "white", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 8px", color: green }}>🥛 Produção de Leite</h3>
            <p style={{ color: "#888", fontSize: 13 }}>Registre a produção diária de leite por animal ou lote.</p>
            {dashboard?.leite_30d && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                <div style={{ background: lightGreen, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Volume últimos 30d</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: green }}>{dashboard.leite_30d.volume_l?.toFixed(1) || 0} L</div>
                </div>
                <div style={{ background: lightGreen, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Receita últimos 30d</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: green }}>R$ {dashboard.leite_30d.receita?.toFixed(2) || "0,00"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA SANITÁRIO ── */}
        {tab === "Sanitário" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: green }}>💉 Controle Sanitário</h3>
              <button onClick={() => setShowSanitario(!showSanitario)}
                style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                + Registrar Vacinação / Tratamento
              </button>
            </div>

            {showSanitario && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${accent}` }}>
                <h4 style={{ margin: "0 0 12px", color: green }}>Novo Registro Sanitário</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                  {[
                    { label: "Tipo *", comp: <select value={sanTipo} onChange={e => setSanTipo(e.target.value)} style={inputStyle}><option value="vacinacao">Vacinação</option><option value="vermifugacao">Vermifugação</option><option value="tratamento">Tratamento</option><option value="carrapaticida">Carrapaticida</option><option value="vitamina">Vitamina/Suplemento</option></select> },
                    { label: "Produto *", comp: <input value={sanProduto} onChange={e => setSanProduto(e.target.value)} placeholder="Nome do produto" style={inputStyle} /> },
                    { label: "Animal", comp: <select value={sanAnimalId} onChange={e => { setSanAnimalId(e.target.value); if(e.target.value) setSanLoteId(""); }} style={inputStyle}><option value="">Selecione (ou lote)</option>{animais.map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` — ${a.nome}` : ""}</option>)}</select> },
                    { label: "Lote (em vez de animal)", comp: <select value={sanLoteId} onChange={e => { setSanLoteId(e.target.value); if(e.target.value) setSanAnimalId(""); }} style={inputStyle}><option value="">Selecione (ou animal)</option>{lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select> },
                    { label: "Dose (ml)", comp: <input type="number" value={sanDose} onChange={e => setSanDose(e.target.value)} placeholder="ml" style={inputStyle} /> },
                    { label: "Via", comp: <select value={sanVia} onChange={e => setSanVia(e.target.value)} style={inputStyle}><option value="intramuscular">Intramuscular</option><option value="subcutanea">Subcutânea</option><option value="oral">Oral</option><option value="topica">Tópica</option><option value="intravenosa">Intravenosa</option></select> },
                    { label: "Data Aplicação *", comp: <input type="date" value={sanData} onChange={e => setSanData(e.target.value)} style={inputStyle} /> },
                    { label: "Data Reforço", comp: <input type="date" value={sanReforco} onChange={e => setSanReforco(e.target.value)} style={inputStyle} /> },
                    { label: "Responsável", comp: <input value={sanResponsavel} onChange={e => setSanResponsavel(e.target.value)} placeholder="Nome" style={inputStyle} /> },
                    { label: "Custo Total (R$)", comp: <input type="number" value={sanCusto} onChange={e => setSanCusto(e.target.value)} placeholder="R$" style={inputStyle} /> },
                  ].map((f, i) => <div key={i}><div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>{f.label}</div>{f.comp}</div>)}
                </div>
                {msgSan && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: msgSan.startsWith("✅") ? "#e8f5e9" : "#fce8e8", color: msgSan.startsWith("✅") ? green : "#c00", fontSize: 13 }}>{msgSan}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={registrarSanitario} style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>Salvar</button>
                  <button onClick={() => { setShowSanitario(false); setMsgSan(""); }} style={{ background: "#eee", color: "#444", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            )}

            {proxReforcos.length > 0 && (
              <div style={{ background: "#fff8e1", border: "1px solid #ffc107", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <strong style={{ color: "#e65100", fontSize: 14 }}>⚠️ Reforços nos próximos 30 dias ({proxReforcos.length})</strong>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {proxReforcos.map(r => (
                    <div key={r.id} style={{ fontSize: 13, color: "#555" }}>
                      <strong>{r.produto}</strong> — {r.brinco || r.lote_nome || "—"} — reforço em {r.data_reforco ? new Date(r.data_reforco).toLocaleDateString("pt-BR") : "—"}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h4 style={{ margin: "0 0 12px", color: green, fontSize: 14 }}>Histórico (últimos 90 dias)</h4>
              {sanitarios.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Nenhum registro sanitário nos últimos 90 dias.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: lightGreen }}>
                        {["Data", "Tipo", "Produto", "Animal/Lote", "Via", "Dose", "Reforço"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: green, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sanitarios.map((s, i) => (
                        <tr key={s.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "8px 10px" }}>{new Date(s.data_aplicacao).toLocaleDateString("pt-BR")}</td>
                          <td style={{ padding: "8px 10px", textTransform: "capitalize" }}>{s.tipo.replace("_", " ")}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 600 }}>{s.produto}</td>
                          <td style={{ padding: "8px 10px" }}>{s.brinco || s.lote_nome || "—"}</td>
                          <td style={{ padding: "8px 10px", textTransform: "capitalize" }}>{s.via_aplicacao || "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{s.dose_ml ? `${s.dose_ml} ml` : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{s.data_reforco ? new Date(s.data_reforco).toLocaleDateString("pt-BR") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA REPRODUÇÃO ── */}
        {tab === "Reprodução" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: green }}>🐮 Reprodução</h3>
              <button onClick={() => setShowReproducao(!showReproducao)}
                style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                + Registrar Cobertura / IATF
              </button>
            </div>

            {showReproducao && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${accent}` }}>
                <h4 style={{ margin: "0 0 12px", color: green }}>Registrar Cobertura / IATF</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                  {[
                    { label: "Fêmea *", comp: <select value={repFemeaId} onChange={e => setRepFemeaId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{animais.filter(a => a.sexo === "F").map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` — ${a.nome}` : ""}</option>)}</select> },
                    { label: "Método *", comp: <select value={repMetodo} onChange={e => setRepMetodo(e.target.value)} style={inputStyle}><option value="monta_natural">Monta Natural</option><option value="iatf">IATF</option><option value="ia">IA (Inseminação Artificial)</option><option value="te">TE (Transferência de Embrião)</option></select> },
                    { label: "Touro / Sêmen", comp: <select value={repTouroId} onChange={e => setRepTouroId(e.target.value)} style={inputStyle}><option value="">Selecione (opcional)</option>{animais.filter(a => a.sexo === "M").map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` — ${a.nome}` : ""}</option>)}</select> },
                    { label: "Data Cobertura *", comp: <input type="date" value={repData} onChange={e => setRepData(e.target.value)} style={inputStyle} /> },
                    { label: "Observações", comp: <input value={repObs} onChange={e => setRepObs(e.target.value)} placeholder="Opcional" style={inputStyle} /> },
                  ].map((f, i) => <div key={i}><div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>{f.label}</div>{f.comp}</div>)}
                </div>
                {msgRep && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: msgRep.startsWith("✅") ? "#e8f5e9" : "#fce8e8", color: msgRep.startsWith("✅") ? green : "#c00", fontSize: 13 }}>{msgRep}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={registrarReproducao} style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>Salvar</button>
                  <button onClick={() => { setShowReproducao(false); setMsgRep(""); }} style={{ background: "#eee", color: "#444", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            )}

            {prenhas.length > 0 && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <h4 style={{ margin: "0 0 12px", color: green, fontSize: 14 }}>🤰 Fêmeas Prenhas ({prenhas.length})</h4>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: lightGreen }}>
                        {["Brinco", "Nome", "Método", "Cobertura", "Previsão Parto", "Dias Restantes"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: green, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prenhas.map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.brinco}</td>
                          <td style={{ padding: "8px 10px" }}>{r.femea_nome || "—"}</td>
                          <td style={{ padding: "8px 10px", textTransform: "uppercase", fontSize: 11 }}>{r.metodo.replace("_", " ")}</td>
                          <td style={{ padding: "8px 10px" }}>{new Date(r.data_cobertura).toLocaleDateString("pt-BR")}</td>
                          <td style={{ padding: "8px 10px" }}>{r.data_parto_prev ? new Date(r.data_parto_prev).toLocaleDateString("pt-BR") : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>
                            {r.dias_para_parto != null ? (
                              <span style={{ fontWeight: 700, color: r.dias_para_parto <= 14 ? "#dc2626" : r.dias_para_parto <= 30 ? "#ea580c" : green }}>
                                {r.dias_para_parto}d
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {prenhas.length === 0 && (
              <div style={{ background: "white", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🐮</div>
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Nenhuma fêmea prenha registrada. Use o botão acima para registrar coberturas.</p>
              </div>
            )}
          </div>
        )}

        {/* ── ABA ABATES ── */}
        {tab === "Abates" && (
          <div>
            <button onClick={() => setShowAbate(!showAbate)}
              style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
              + Registrar Abate / Venda
            </button>
            {showAbate && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                <h3 style={{ margin: "0 0 16px", color: green, fontSize: 15 }}>🥩 Registrar Abate / Venda</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                  {[
                    { label: "Animal *", comp: <select value={abateAnimalId} onChange={e => setAbateAnimalId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{animais.map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` — ${a.nome}` : ""}</option>)}</select> },
                    { label: "Data", comp: <input type="date" value={abateData} onChange={e => setAbateData(e.target.value)} style={inputStyle} /> },
                    { label: "Tipo", comp: <select value={abateTipo} onChange={e => setAbateTipo(e.target.value)} style={inputStyle}><option value="venda_em_pe">Venda em Pé</option><option value="abate_proprio">Abate Próprio</option><option value="abate_frigorifico">Abate Frigorífico</option></select> },
                    { label: "Peso Vivo (kg)", comp: <input type="number" value={abatePesoVivo} onChange={e => setAbatePesoVivo(e.target.value)} placeholder="kg" style={inputStyle} /> },
                    { label: "Peso Carcaça (kg)", comp: <input type="number" value={abatePesoCarcaca} onChange={e => setAbatePesoCarcaca(e.target.value)} placeholder="kg" style={inputStyle} /> },
                    { label: "Preço/@", comp: <input type="number" value={abatePrecoArroba} onChange={e => setAbatePrecoArroba(e.target.value)} placeholder="R$/@" style={inputStyle} /> },
                    { label: "Comprador", comp: <input value={abateComprador} onChange={e => setAbateComprador(e.target.value)} placeholder="Nome" style={inputStyle} /> },
                  ].map((f, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>{f.label}</div>
                      {f.comp}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button onClick={registrarAbate} style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>Registrar</button>
                  <button onClick={() => setShowAbate(false)} style={{ background: "#eee", color: "#444", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            )}
            <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h4 style={{ margin: "0 0 12px", color: green, fontSize: 14 }}>Histórico (últimos 90 dias)</h4>
              {abates.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Nenhum abate ou venda registrado nos últimos 90 dias.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: lightGreen }}>
                        {["Data", "Brinco", "Tipo", "Peso Vivo", "Peso Carcaça", "R$/@", "Total", "Comprador"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: green, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {abates.map((ab, i) => (
                        <tr key={ab.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "8px 10px" }}>{new Date(ab.data).toLocaleDateString("pt-BR")}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 600 }}>{ab.brinco}</td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textTransform: "uppercase" }}>{ab.tipo.replace(/_/g, " ")}</td>
                          <td style={{ padding: "8px 10px" }}>{ab.peso_vivo_kg ? `${ab.peso_vivo_kg} kg` : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{ab.peso_carcaca_kg ? `${ab.peso_carcaca_kg} kg` : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{ab.preco_arroba ? `R$ ${Number(ab.preco_arroba).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 700, color: green }}>{ab.valor_total ? `R$ ${Number(ab.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{ab.comprador || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd",
  fontSize: 13, background: "white", boxSizing: "border-box",
};
