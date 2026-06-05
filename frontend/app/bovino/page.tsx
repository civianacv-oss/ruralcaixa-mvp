"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Animal = {
  id: number;
  brinco: string;
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

  // Abate
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
      const [animRes, lotesRes, racasRes, dashRes] = await Promise.all([
        fetch(`${API}/bovino/animais/${IMOVEL_ID}?status=ativo`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/lotes/${IMOVEL_ID}`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/racas`).then(r => r.json()).catch(() => []),
        fetch(`${API}/bovino/dashboard/${IMOVEL_ID}`).then(r => r.json()).catch(() => null),
      ]);
      setAnimais(Array.isArray(animRes) ? animRes : []);
      setLotes(Array.isArray(lotesRes) ? lotesRes : []);
      setRacas(Array.isArray(racasRes) ? racasRes : []);
      setDashboard(dashRes);
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
    if (res.ok) { setShowAbate(false); loadData(); alert("Abate/venda registrado!"); }
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
          <a href="/" style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, textDecoration: "none" }}>← Painel Principal</a>
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
            { icon: "⚠️", val: dashboard.alertas.reforcos_sanitarios, label: "Reforços Sanitários" },
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
          <div style={{ background: "white", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 8px", color: green }}>💉 Sanitário</h3>
            <p style={{ color: "#888", fontSize: 13 }}>Controle de vacinações, vermifugações e tratamentos.</p>
            {dashboard?.alertas?.reforcos_sanitarios > 0 && (
              <div style={{ background: "#fff3e0", border: "1px solid #ff9800", borderRadius: 8, padding: 12, marginTop: 12 }}>
                <strong style={{ color: "#e65100" }}>⚠️ {dashboard.alertas.reforcos_sanitarios} reforço(s) sanitário(s) nos próximos 30 dias</strong>
              </div>
            )}
          </div>
        )}

        {/* ── ABA REPRODUÇÃO ── */}
        {tab === "Reprodução" && (
          <div style={{ background: "white", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 8px", color: green }}>🐮 Reprodução</h3>
            <p style={{ color: "#888", fontSize: 13 }}>Controle de coberturas, IATF e previsão de partos.</p>
            {dashboard?.alertas?.femeas_prenhas > 0 && (
              <div style={{ background: "#e8f5e9", border: "1px solid #4caf50", borderRadius: 8, padding: 12, marginTop: 12 }}>
                <strong style={{ color: green }}>🤰 {dashboard.alertas.femeas_prenhas} fêmea(s) prenha(s) com parto previsto</strong>
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
              <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Histórico de abates e vendas aparecerá aqui.</p>
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
