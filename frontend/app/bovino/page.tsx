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

const TABS_BASE = ["Rebanho", "Lotes", "Pesagens", "SanitÃ¡rio", "ReproduÃ§Ã£o", "Abates"] as const;
const TABS_LEITE = ["Ordenha", "IATF", "Dieta TransiÃ§Ã£o"] as const;
const TABS_CORTE = ["Confinamento", "TipificaÃ§Ã£o", "Custo ProduÃ§Ã£o"] as const;
type Tab = typeof TABS_BASE[number] | typeof TABS_LEITE[number] | typeof TABS_CORTE[number];

export default function BovinoPage() {
  const [tab, setTab] = useState<Tab>("Rebanho");
  const [tipoBovino, setTipoBovino] = useState<"leite" | "corte" | "misto">("corte");
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

  // SanitÃ¡rio
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

  // ReproduÃ§Ã£o
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
      const tipoRes = await fetch(`${API}/bovino/tipo/${IMOVEL_ID}`).then(r => r.json()).catch(() => null);
      if (tipoRes?.tipo_bovino) setTipoBovino(tipoRes.tipo_bovino);
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
    if (!brinco || !sexo || !aptidao || !categoria) { setMsg("Preencha brinco, sexo, aptidÃ£o e categoria."); return; }
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
        setMsg("âœ… Animal cadastrado!");
        setBrinco(""); setNome(""); setPesoNasc(""); setValorAquis(""); setDataNasc("");
        setShowCadastro(false);
        loadData();
      } else {
        const err = await res.json();
        setMsg("Erro: " + (err.detail || res.status));
      }
    } catch (e) { setMsg("Erro de conexÃ£o"); }
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
      setMsgSan("âœ… Registro salvo!");
      setSanProduto(""); setSanDose(""); setSanReforco(""); setSanResponsavel(""); setSanCusto("");
      setShowSanitario(false);
      loadData();
    } else { setMsgSan("Erro ao salvar."); }
  }

  async function registrarReproducao() {
    if (!repFemeaId || !repMetodo) { setMsgRep("Selecione a fÃªmea e o mÃ©todo."); return; }
    const body = {
      femea_id: Number(repFemeaId),
      touro_id: repTouroId ? Number(repTouroId) : null,
      metodo: repMetodo,
      data_cobertura: repData,
      observacoes: repObs || null,
    };
    const res = await fetch(`${API}/bovino/reproducao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      setMsgRep("âœ… Cobertura registrada!");
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
        <div style={{ fontSize: 48 }}>ðŸ„</div>
        <p style={{ color: green, fontWeight: 600, marginTop: 12 }}>Carregando mÃ³dulo bovino...</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: green, color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{display:"flex",gap:8}}><a href="/" style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"white",fontSize:13,fontWeight:600,textDecoration:"none",borderRadius:8,padding:"6px 14px"}}>ðŸ  Painel Principal</a><button onClick={() => window.history.back()} style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"white",fontSize:13,fontWeight:600,cursor:"pointer",borderRadius:8,padding:"6px 14px"}}>â† Voltar</button></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 28 }}>ðŸ„</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Bovino â€” Leite & Corte</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Fazenda Boa EsperanÃ§a â€” ImÃ³vel #1</div>
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
            { icon: "ðŸ„", val: dashboard.totais.total_geral, label: "Rebanho Ativo" },
            { icon: "ðŸ¥©", val: dashboard.totais.total_corte, label: "Corte" },
            { icon: "ðŸ¥›", val: dashboard.totais.total_leite, label: "Leite" },
            { icon: "âš ï¸", val: dashboard?.alertas?.reforcos_sanitarios, label: "ReforÃ§os SanitÃ¡rios" },
          ].map((c, i) => (
            <div key={i} style={{ background: "white", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 28 }}>{c.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: green, lineHeight: 1.2 }}>{c.val}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Seletor de tipo de exploraÃ§Ã£o */}
      <div style={{ padding: "10px 24px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>ExploraÃ§Ã£o:</span>
        {(["corte", "leite", "misto"] as const).map(t => (
          <button key={t} onClick={() => {
            setTipoBovino(t);
            fetch(`${API}/bovino/tipo/${IMOVEL_ID}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tipo_bovino: t })
            }).catch(() => {});
          }}
            style={{ padding: "4px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: tipoBovino === t ? 700 : 400,
              background: tipoBovino === t ? (t === "leite" ? "#1565c0" : t === "corte" ? "#b71c1c" : "#6a1b9a") : "#f0f0f0",
              color: tipoBovino === t ? "white" : "#555" }}>
            {t === "leite" ? "ðŸ¥› Leiteiro" : t === "corte" ? "ðŸ¥© Corte" : "ðŸ”€ Misto"}
          </button>
        ))}
      </div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "10px 24px 0", overflowX: "auto", flexWrap: "wrap" }}>
        {/* Abas compartilhadas */}
        {TABS_BASE.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: tab === t ? 700 : 400, fontSize: 13,
              background: tab === t ? green : "white", color: tab === t ? "white" : "#444",
              boxShadow: tab === t ? "0 2px 8px rgba(45,90,39,0.3)" : "0 1px 3px rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
            {t}
          </button>
        ))}
        {/* Abas Leiteiro */}
        {(tipoBovino === "leite" || tipoBovino === "misto") && (
          <>
            <span style={{ alignSelf: "center", color: "#ccc", fontSize: 16, margin: "0 2px" }}>|</span>
            {TABS_LEITE.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: tab === t ? 700 : 400, fontSize: 13,
                  background: tab === t ? "#1565c0" : "#e3f2fd", color: tab === t ? "white" : "#1565c0",
                  boxShadow: tab === t ? "0 2px 8px rgba(21,101,192,0.3)" : "0 1px 3px rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
                {t === "Ordenha" ? "ðŸ¥› Ordenha" : t === "IATF" ? "ðŸ”¬ IATF" : "ðŸŒ¿ Dieta TransiÃ§Ã£o"}
              </button>
            ))}
          </>
        )}
        {/* Abas Corte */}
        {(tipoBovino === "corte" || tipoBovino === "misto") && (
          <>
            <span style={{ alignSelf: "center", color: "#ccc", fontSize: 16, margin: "0 2px" }}>|</span>
            {TABS_CORTE.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: tab === t ? 700 : 400, fontSize: 13,
                  background: tab === t ? "#b71c1c" : "#ffebee", color: tab === t ? "white" : "#b71c1c",
                  boxShadow: tab === t ? "0 2px 8px rgba(183,28,28,0.3)" : "0 1px 3px rgba(0,0,0,0.08)", whiteSpace: "nowrap" }}>
                {t === "Confinamento" ? "ðŸ  Confinamento" : t === "TipificaÃ§Ã£o" ? "ðŸ¥© TipificaÃ§Ã£o" : "ðŸ’° Custo ProduÃ§Ã£o"}
              </button>
            ))}
          </>
        )}
      </div>

      <div style={{ padding: "16px 24px 40px" }}>

        {/* â”€â”€ CADASTRO FORM â”€â”€ */}
        {showCadastro && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${accent}` }}>
            <h3 style={{ margin: "0 0 16px", color: green, fontSize: 16 }}>ðŸ„ Cadastrar Novo Animal</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {[
                { label: "Brinco *", comp: <input value={brinco} onChange={e => setBrinco(e.target.value)} placeholder="Ex: BOV001" style={inputStyle} /> },
                { label: "Nome", comp: <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Opcional" style={inputStyle} /> },
                { label: "Sexo *", comp: <select value={sexo} onChange={e => setSexo(e.target.value)} style={inputStyle}><option value="M">Macho</option><option value="F">FÃªmea</option></select> },
                { label: "AptidÃ£o *", comp: <select value={aptidao} onChange={e => { setAptidao(e.target.value); setCategoria("bezerro"); }} style={inputStyle}><option value="corte">Corte</option><option value="leite">Leite</option><option value="misto">Misto</option></select> },
                { label: "Categoria *", comp: <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle}>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select> },
                { label: "RaÃ§a", comp: <select value={racaId} onChange={e => setRacaId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{racas.filter(r => aptidao === "todos" || r.aptidao === aptidao || r.aptidao === "misto" || r.aptidao === "dupla").map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}</select> },
                { label: "Lote", comp: <select value={loteId} onChange={e => setLoteId(e.target.value)} style={inputStyle}><option value="">Sem lote</option>{lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select> },
                { label: "Origem", comp: <select value={origem} onChange={e => setOrigem(e.target.value)} style={inputStyle}><option value="nascimento">Nascimento</option><option value="compra">Compra</option><option value="transferencia">TransferÃªncia</option></select> },
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
            {msg && <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: msg.startsWith("âœ…") ? "#e8f5e9" : "#fce8e8", color: msg.startsWith("âœ…") ? "#2d5a27" : "#c00", fontSize: 13 }}>{msg}</div>}
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

        {/* â”€â”€ ABA REBANHO â”€â”€ */}
        {tab === "Rebanho" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["todos", "corte", "leite"] as const).map(f => (
                <button key={f} onClick={() => setAptidaoFiltro(f)}
                  style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${aptidaoFiltro === f ? green : "#ddd"}`,
                    background: aptidaoFiltro === f ? lightGreen : "white", color: aptidaoFiltro === f ? green : "#555",
                    fontWeight: aptidaoFiltro === f ? 700 : 400, cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>
                  {f === "todos" ? "Todos" : f === "corte" ? "ðŸ¥© Corte" : "ðŸ¥› Leite"}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 13, color: "#666", alignSelf: "center" }}>{animaisFiltrados.length} animais</span>
            </div>
            <div style={{ background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: lightGreen }}>
                    {["Brinco", "Nome", "Sexo", "RaÃ§a", "Categoria", "AptidÃ£o", "Lote", "Ãšltimo Peso", "Data Peso", "Status", "AÃ§Ãµes"].map(h => (
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
                      <td style={{ padding: "10px 12px", color: "#555" }}>{a.nome || "â€”"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.sexo === "M" ? "â™‚ Macho" : "â™€ FÃªmea"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.raca_nome || "â€”"}</td>
                      <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>{a.categoria}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: a.aptidao_manejo === "corte" ? "#fff3e0" : "#e3f2fd",
                          color: a.aptidao_manejo === "corte" ? "#e65100" : "#1565c0" }}>
                          {a.aptidao_manejo === "corte" ? "ðŸ¥© Corte" : "ðŸ¥› Leite"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{a.lote_nome || "â€”"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.ultimo_peso ? `${a.ultimo_peso} kg` : "â€”"}</td>
                      <td style={{ padding: "10px 12px", color: "#888" }}>{a.data_ultimo_peso ? a.data_ultimo_peso.slice(0, 10) : "â€”"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#e8f5e9", color: "#2e7d32", fontWeight: 600 }}>{a.status}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button onClick={() => { carregarPesagens(a); setTab("Pesagens"); }}
                          style={{ background: lightGreen, color: green, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          âš–ï¸ Pesar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* â”€â”€ ABA LOTES â”€â”€ */}
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

        {/* â”€â”€ ABA PESAGENS â”€â”€ */}
        {tab === "Pesagens" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h3 style={{ margin: "0 0 16px", color: green, fontSize: 15 }}>âš–ï¸ Registrar Pesagem</h3>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>Animal</div>
                <select value={animalPesagem?.id || ""} onChange={e => { const a = animais.find(x => x.id === Number(e.target.value)); if (a) carregarPesagens(a); }} style={inputStyle}>
                  <option value="">Selecione</option>
                  {animais.map(a => <option key={a.id} value={a.id}>{a.brinco} {a.nome ? `â€” ${a.nome}` : ""}</option>)}
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
                  <option value="saida">SaÃ­da</option>
                  <option value="pre_abate">PrÃ©-abate</option>
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
                HistÃ³rico {animalPesagem ? `â€” ${animalPesagem.brinco}` : ""}
              </h3>
              {pesagens.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13 }}>Selecione um animal para ver o histÃ³rico</p>
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

        {/* â”€â”€ ABA LEITE â”€â”€ */}
        {tab === "Ordenha" && (
          <div style={{ background: "white", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 8px", color: green }}>ðŸ¥› ProduÃ§Ã£o de Leite</h3>
            <p style={{ color: "#888", fontSize: 13 }}>Registre a produÃ§Ã£o diÃ¡ria de leite por animal ou lote.</p>
            {dashboard?.leite_30d && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                <div style={{ background: lightGreen, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Volume Ãºltimos 30d</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: green }}>{dashboard.leite_30d.volume_l?.toFixed(1) || 0} L</div>
                </div>
                <div style={{ background: lightGreen, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Receita Ãºltimos 30d</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: green }}>R$ {dashboard.leite_30d.receita?.toFixed(2) || "0,00"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ ABA SANITÃRIO â”€â”€ */}
        {tab === "SanitÃ¡rio" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: green }}>ðŸ’‰ Controle SanitÃ¡rio</h3>
              <button onClick={() => setShowSanitario(!showSanitario)}
                style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                + Registrar VacinaÃ§Ã£o / Tratamento
              </button>
            </div>

            {showSanitario && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${accent}` }}>
                <h4 style={{ margin: "0 0 12px", color: green }}>Novo Registro SanitÃ¡rio</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                  {[
                    { label: "Tipo *", comp: <select value={sanTipo} onChange={e => setSanTipo(e.target.value)} style={inputStyle}><option value="vacinacao">VacinaÃ§Ã£o</option><option value="vermifugacao">VermifugaÃ§Ã£o</option><option value="tratamento">Tratamento</option><option value="carrapaticida">Carrapaticida</option><option value="vitamina">Vitamina/Suplemento</option></select> },
                    { label: "Produto *", comp: <input value={sanProduto} onChange={e => setSanProduto(e.target.value)} placeholder="Nome do produto" style={inputStyle} /> },
                    { label: "Animal", comp: <select value={sanAnimalId} onChange={e => { setSanAnimalId(e.target.value); if(e.target.value) setSanLoteId(""); }} style={inputStyle}><option value="">Selecione (ou lote)</option>{animais.map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` â€” ${a.nome}` : ""}</option>)}</select> },
                    { label: "Lote (em vez de animal)", comp: <select value={sanLoteId} onChange={e => { setSanLoteId(e.target.value); if(e.target.value) setSanAnimalId(""); }} style={inputStyle}><option value="">Selecione (ou animal)</option>{lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select> },
                    { label: "Dose (ml)", comp: <input type="number" value={sanDose} onChange={e => setSanDose(e.target.value)} placeholder="ml" style={inputStyle} /> },
                    { label: "Via", comp: <select value={sanVia} onChange={e => setSanVia(e.target.value)} style={inputStyle}><option value="intramuscular">Intramuscular</option><option value="subcutanea">SubcutÃ¢nea</option><option value="oral">Oral</option><option value="topica">TÃ³pica</option><option value="intravenosa">Intravenosa</option></select> },
                    { label: "Data AplicaÃ§Ã£o *", comp: <input type="date" value={sanData} onChange={e => setSanData(e.target.value)} style={inputStyle} /> },
                    { label: "Data ReforÃ§o", comp: <input type="date" value={sanReforco} onChange={e => setSanReforco(e.target.value)} style={inputStyle} /> },
                    { label: "ResponsÃ¡vel", comp: <input value={sanResponsavel} onChange={e => setSanResponsavel(e.target.value)} placeholder="Nome" style={inputStyle} /> },
                    { label: "Custo Total (R$)", comp: <input type="number" value={sanCusto} onChange={e => setSanCusto(e.target.value)} placeholder="R$" style={inputStyle} /> },
                  ].map((f, i) => <div key={i}><div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>{f.label}</div>{f.comp}</div>)}
                </div>
                {msgSan && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: msgSan.startsWith("âœ…") ? "#e8f5e9" : "#fce8e8", color: msgSan.startsWith("âœ…") ? green : "#c00", fontSize: 13 }}>{msgSan}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={registrarSanitario} style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>Salvar</button>
                  <button onClick={() => { setShowSanitario(false); setMsgSan(""); }} style={{ background: "#eee", color: "#444", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            )}

            {proxReforcos.length > 0 && (
              <div style={{ background: "#fff8e1", border: "1px solid #ffc107", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <strong style={{ color: "#e65100", fontSize: 14 }}>âš ï¸ ReforÃ§os nos prÃ³ximos 30 dias ({proxReforcos.length})</strong>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {proxReforcos.map(r => (
                    <div key={r.id} style={{ fontSize: 13, color: "#555" }}>
                      <strong>{r.produto}</strong> â€” {r.brinco || r.lote_nome || "â€”"} â€” reforÃ§o em {r.data_reforco ? new Date(r.data_reforco).toLocaleDateString("pt-BR") : "â€”"}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h4 style={{ margin: "0 0 12px", color: green, fontSize: 14 }}>HistÃ³rico (Ãºltimos 90 dias)</h4>
              {sanitarios.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Nenhum registro sanitÃ¡rio nos Ãºltimos 90 dias.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: lightGreen }}>
                        {["Data", "Tipo", "Produto", "Animal/Lote", "Via", "Dose", "ReforÃ§o"].map(h => (
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
                          <td style={{ padding: "8px 10px" }}>{s.brinco || s.lote_nome || "â€”"}</td>
                          <td style={{ padding: "8px 10px", textTransform: "capitalize" }}>{s.via_aplicacao || "â€”"}</td>
                          <td style={{ padding: "8px 10px" }}>{s.dose_ml ? `${s.dose_ml} ml` : "â€”"}</td>
                          <td style={{ padding: "8px 10px" }}>{s.data_reforco ? new Date(s.data_reforco).toLocaleDateString("pt-BR") : "â€”"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* â”€â”€ ABA REPRODUÃ‡ÃƒO â”€â”€ */}
        {tab === "ReproduÃ§Ã£o" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: green }}>ðŸ® ReproduÃ§Ã£o</h3>
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
                    { label: "FÃªmea *", comp: <select value={repFemeaId} onChange={e => setRepFemeaId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{animais.filter(a => a.sexo === "F").map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` â€” ${a.nome}` : ""}</option>)}</select> },
                    { label: "MÃ©todo *", comp: <select value={repMetodo} onChange={e => setRepMetodo(e.target.value)} style={inputStyle}><option value="monta_natural">Monta Natural</option><option value="iatf">IATF</option><option value="ia">IA (InseminaÃ§Ã£o Artificial)</option><option value="te">TE (TransferÃªncia de EmbriÃ£o)</option></select> },
                    { label: "Touro / SÃªmen", comp: <select value={repTouroId} onChange={e => setRepTouroId(e.target.value)} style={inputStyle}><option value="">Selecione (opcional)</option>{animais.filter(a => a.sexo === "M").map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` â€” ${a.nome}` : ""}</option>)}</select> },
                    { label: "Data Cobertura *", comp: <input type="date" value={repData} onChange={e => setRepData(e.target.value)} style={inputStyle} /> },
                    { label: "ObservaÃ§Ãµes", comp: <input value={repObs} onChange={e => setRepObs(e.target.value)} placeholder="Opcional" style={inputStyle} /> },
                  ].map((f, i) => <div key={i}><div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 4 }}>{f.label}</div>{f.comp}</div>)}
                </div>
                {msgRep && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: msgRep.startsWith("âœ…") ? "#e8f5e9" : "#fce8e8", color: msgRep.startsWith("âœ…") ? green : "#c00", fontSize: 13 }}>{msgRep}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={registrarReproducao} style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>Salvar</button>
                  <button onClick={() => { setShowReproducao(false); setMsgRep(""); }} style={{ background: "#eee", color: "#444", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            )}

            {prenhas.length > 0 && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <h4 style={{ margin: "0 0 12px", color: green, fontSize: 14 }}>ðŸ¤° FÃªmeas Prenhas ({prenhas.length})</h4>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: lightGreen }}>
                        {["Brinco", "Nome", "MÃ©todo", "Cobertura", "PrevisÃ£o Parto", "Dias Restantes"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: green, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prenhas.map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.brinco}</td>
                          <td style={{ padding: "8px 10px" }}>{r.femea_nome || "â€”"}</td>
                          <td style={{ padding: "8px 10px", textTransform: "uppercase", fontSize: 11 }}>{r.metodo.replace("_", " ")}</td>
                          <td style={{ padding: "8px 10px" }}>{new Date(r.data_cobertura).toLocaleDateString("pt-BR")}</td>
                          <td style={{ padding: "8px 10px" }}>{r.data_parto_prev ? new Date(r.data_parto_prev).toLocaleDateString("pt-BR") : "â€”"}</td>
                          <td style={{ padding: "8px 10px" }}>
                            {r.dias_para_parto != null ? (
                              <span style={{ fontWeight: 700, color: r.dias_para_parto <= 14 ? "#dc2626" : r.dias_para_parto <= 30 ? "#ea580c" : green }}>
                                {r.dias_para_parto}d
                              </span>
                            ) : "â€”"}
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
                <div style={{ fontSize: 36, marginBottom: 8 }}>ðŸ®</div>
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Nenhuma fÃªmea prenha registrada. Use o botÃ£o acima para registrar coberturas.</p>
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ ABA ABATES â”€â”€ */}
        {tab === "Abates" && (
          <div>
            <button onClick={() => setShowAbate(!showAbate)}
              style={{ background: green, color: "white", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
              + Registrar Abate / Venda
            </button>
            {showAbate && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                <h3 style={{ margin: "0 0 16px", color: green, fontSize: 15 }}>ðŸ¥© Registrar Abate / Venda</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                  {[
                    { label: "Animal *", comp: <select value={abateAnimalId} onChange={e => setAbateAnimalId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{animais.map(a => <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` â€” ${a.nome}` : ""}</option>)}</select> },
                    { label: "Data", comp: <input type="date" value={abateData} onChange={e => setAbateData(e.target.value)} style={inputStyle} /> },
                    { label: "Tipo", comp: <select value={abateTipo} onChange={e => setAbateTipo(e.target.value)} style={inputStyle}><option value="venda_em_pe">Venda em PÃ©</option><option value="abate_proprio">Abate PrÃ³prio</option><option value="abate_frigorifico">Abate FrigorÃ­fico</option></select> },
                    { label: "Peso Vivo (kg)", comp: <input type="number" value={abatePesoVivo} onChange={e => setAbatePesoVivo(e.target.value)} placeholder="kg" style={inputStyle} /> },
                    { label: "Peso CarcaÃ§a (kg)", comp: <input type="number" value={abatePesoCarcaca} onChange={e => setAbatePesoCarcaca(e.target.value)} placeholder="kg" style={inputStyle} /> },
                    { label: "PreÃ§o/@", comp: <input type="number" value={abatePrecoArroba} onChange={e => setAbatePrecoArroba(e.target.value)} placeholder="R$/@" style={inputStyle} /> },
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
              <h4 style={{ margin: "0 0 12px", color: green, fontSize: 14 }}>HistÃ³rico (Ãºltimos 90 dias)</h4>
              {abates.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Nenhum abate ou venda registrado nos Ãºltimos 90 dias.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: lightGreen }}>
                        {["Data", "Brinco", "Tipo", "Peso Vivo", "Peso CarcaÃ§a", "R$/@", "Total", "Comprador"].map(h => (
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
                          <td style={{ padding: "8px 10px" }}>{ab.peso_vivo_kg ? `${ab.peso_vivo_kg} kg` : "â€”"}</td>
                          <td style={{ padding: "8px 10px" }}>{ab.peso_carcaca_kg ? `${ab.peso_carcaca_kg} kg` : "â€”"}</td>
                          <td style={{ padding: "8px 10px" }}>{ab.preco_arroba ? `R$ ${Number(ab.preco_arroba).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "â€”"}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 700, color: green }}>{ab.valor_total ? `R$ ${Number(ab.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "â€”"}</td>
                          <td style={{ padding: "8px 10px" }}>{ab.comprador || "â€”"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* â”€â”€ ABA ORDENHA (Leiteiro) â”€â”€ */}
        {tab === "Ordenha" && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#1565c0", fontSize: 16 }}>ðŸ¥› Controle de Ordenha</h3>
            <OrdenhaTab imovelId={IMOVEL_ID} api={API} animais={animais} lotes={lotes} />
          </div>
        )}

        {/* â”€â”€ ABA IATF (Leiteiro) â”€â”€ */}
        {tab === "IATF" && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#1565c0", fontSize: 16 }}>ðŸ”¬ Protocolo IATF</h3>
            <IatfTab imovelId={IMOVEL_ID} api={API} animais={animais.filter(a => a.sexo === "F")} lotes={lotes} touros={animais.filter(a => a.sexo === "M")} />
          </div>
        )}

        {/* â”€â”€ ABA DIETA TRANSIÃ‡ÃƒO (Leiteiro) â”€â”€ */}
        {tab === "Dieta TransiÃ§Ã£o" && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#1565c0", fontSize: 16 }}>ðŸŒ¿ Dieta de TransiÃ§Ã£o</h3>
            <DietaTab imovelId={IMOVEL_ID} api={API} animais={animais.filter(a => a.sexo === "F")} />
          </div>
        )}

        {/* â”€â”€ ABA CONFINAMENTO (Corte) â”€â”€ */}
        {tab === "Confinamento" && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#b71c1c", fontSize: 16 }}>ðŸ  Confinamento</h3>
            <ConfinamentoTab imovelId={IMOVEL_ID} api={API} lotes={lotes} />
          </div>
        )}

        {/* â”€â”€ ABA TIPIFICAÃ‡ÃƒO (Corte) â”€â”€ */}
        {tab === "TipificaÃ§Ã£o" && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#b71c1c", fontSize: 16 }}>ðŸ¥© TipificaÃ§Ã£o de CarcaÃ§a</h3>
            <TipificacaoTab imovelId={IMOVEL_ID} api={API} animais={animais} />
          </div>
        )}

        {/* â”€â”€ ABA CUSTO PRODUÃ‡ÃƒO (Corte) â”€â”€ */}
        {tab === "Custo ProduÃ§Ã£o" && (
          <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#b71c1c", fontSize: 16 }}>ðŸ’° Custo de ProduÃ§Ã£o</h3>
            <CustoTab imovelId={IMOVEL_ID} api={API} lotes={lotes} />
          </div>
        )}

      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Sub-componentes das abas exclusivas
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function OrdenhaTab({ imovelId, api, animais, lotes }: { imovelId: number; api: string; animais: Animal[]; lotes: Lote[] }) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [show, setShow] = useState(false);
  const [animalId, setAnimalId] = useState("");
  const [loteId, setLoteId] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [turno, setTurno] = useState("total");
  const [volume, setVolume] = useState("");
  const [gordura, setGordura] = useState("");
  const [proteina, setProteina] = useState("");
  const [destinacao, setDestinacao] = useState("venda");
  const [preco, setPreco] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${api}/bovino/leiteiro/ordenha/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
  }, [imovelId]);

  async function salvar() {
    if (!volume) { setMsg("Informe o volume."); return; }
    const res = await fetch(`${api}/bovino/leiteiro/ordenha`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: imovelId,
        animal_id: animalId ? Number(animalId) : null,
        lote_id: loteId ? Number(loteId) : null,
        data, turno, volume_l: Number(volume),
        gordura_pct: gordura ? Number(gordura) : null,
        proteina_pct: proteina ? Number(proteina) : null,
        destinacao, preco_litro: preco ? Number(preco) : null,
      })
    });
    if (res.ok) {
      setMsg("âœ… Ordenha registrada!");
      setVolume(""); setGordura(""); setProteina(""); setPreco(""); setShow(false);
      fetch(`${api}/bovino/leiteiro/ordenha/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
    } else { setMsg("Erro ao salvar."); }
  }

  const totalLitros = registros.reduce((s, r) => s + Number((r as Record<string, unknown>).volume_l || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#e3f2fd", borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1565c0" }}>{totalLitros.toFixed(1)} L</div>
          <div style={{ fontSize: 11, color: "#666" }}>Total 30 dias</div>
        </div>
        <div style={{ background: "#e3f2fd", borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1565c0" }}>{registros.length}</div>
          <div style={{ fontSize: 11, color: "#666" }}>Registros</div>
        </div>
      </div>
      <button onClick={() => setShow(!show)} style={{ background: "#1565c0", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
        + Registrar Ordenha
      </button>
      {show && (
        <div style={{ background: "#f8f9ff", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #bbdefb" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {[{l:"Animal",c:<select value={animalId} onChange={e=>setAnimalId(e.target.value)} style={inputStyle}><option value="">Lote/Todos</option>{animais.map(a=><option key={a.id} value={a.id}>{a.brinco}{a.nome?" â€” "+a.nome:""}</option>)}</select>},
              {l:"Lote",c:<select value={loteId} onChange={e=>setLoteId(e.target.value)} style={inputStyle}><option value="">Sem lote</option>{lotes.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}</select>},
              {l:"Data",c:<input type="date" value={data} onChange={e=>setData(e.target.value)} style={inputStyle}/>},
              {l:"Turno",c:<select value={turno} onChange={e=>setTurno(e.target.value)} style={inputStyle}><option value="manha">ManhÃ£</option><option value="tarde">Tarde</option><option value="total">Total</option></select>},
              {l:"Volume (L)*",c:<input type="number" value={volume} onChange={e=>setVolume(e.target.value)} placeholder="L" style={inputStyle}/>},
              {l:"Gordura (%)",c:<input type="number" value={gordura} onChange={e=>setGordura(e.target.value)} placeholder="%" style={inputStyle}/>},
              {l:"ProteÃ­na (%)",c:<input type="number" value={proteina} onChange={e=>setProteina(e.target.value)} placeholder="%" style={inputStyle}/>},
              {l:"DestinaÃ§Ã£o",c:<select value={destinacao} onChange={e=>setDestinacao(e.target.value)} style={inputStyle}><option value="venda">Venda</option><option value="autoconsumo">Autoconsumo</option><option value="bezerros">Bezerros</option><option value="descarte">Descarte</option><option value="queijo">Queijo</option></select>},
              {l:"PreÃ§o/L (R$)",c:<input type="number" value={preco} onChange={e=>setPreco(e.target.value)} placeholder="R$" style={inputStyle}/>},
            ].map((f,i)=>(<div key={i}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:3}}>{f.l}</div>{f.c}</div>))}
          </div>
          {msg && <div style={{marginTop:10,padding:"6px 10px",borderRadius:6,background:msg.startsWith("âœ…")?"#e8f5e9":"#fce8e8",color:msg.startsWith("âœ…")?"#2d5a27":"#c00",fontSize:12}}>{msg}</div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={salvar} style={{background:"#1565c0",color:"white",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700,cursor:"pointer",fontSize:13}}>Salvar</button>
            <button onClick={()=>setShow(false)} style={{background:"#eee",color:"#444",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#e3f2fd" }}>
            {["Data","Turno","Animal/Lote","Volume (L)","Gordura","ProteÃ­na","DestinaÃ§Ã£o","Valor (R$)"].map(h=>(<th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:600,color:"#1565c0",fontSize:12}}>{h}</th>))}
          </tr></thead>
          <tbody>
            {registros.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f0f0f0",background:i%2===0?"white":"#fafafa"}}>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).data||"")} </td>
              <td style={{padding:"7px 10px",textTransform:"capitalize"}}>{String((r as Record<string, unknown>).turno||"")} </td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).nome_animal||(r as Record<string, unknown>).nome_lote||"Geral")} </td>
              <td style={{padding:"7px 10px",fontWeight:600}}>{Number((r as Record<string, unknown>).volume_l||0).toFixed(1)}</td>
              <td style={{padding:"7px 10px"}}>{(r as Record<string, unknown>).gordura_pct!=null?Number((r as Record<string, unknown>).gordura_pct).toFixed(1)+"%":"-"}</td>
              <td style={{padding:"7px 10px"}}>{(r as Record<string, unknown>).proteina_pct!=null?Number((r as Record<string, unknown>).proteina_pct).toFixed(1)+"%":"-"}</td>
              <td style={{padding:"7px 10px",textTransform:"capitalize"}}>{String((r as Record<string, unknown>).destinacao||"")} </td>
              <td style={{padding:"7px 10px",fontWeight:600,color:"#1565c0"}}>{(r as Record<string, unknown>).valor_total!=null?"R$ "+Number((r as Record<string, unknown>).valor_total).toFixed(2):"-"}</td>
            </tr>))}
            {registros.length===0&&<tr><td colSpan={8} style={{padding:"20px",textAlign:"center",color:"#999"}}>Nenhum registro de ordenha nos Ãºltimos 30 dias.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IatfTab({ imovelId, api, animais, lotes, touros }: { imovelId: number; api: string; animais: Animal[]; lotes: Lote[]; touros: Animal[] }) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [show, setShow] = useState(false);
  const [femeaId, setFemeaId] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [dataIatf, setDataIatf] = useState("");
  const [touroId, setTouroId] = useState("");
  const [semen, setSemen] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${api}/bovino/leiteiro/iatf/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
  }, [imovelId]);

  async function salvar() {
    if (!femeaId || !protocolo) { setMsg("Selecione a fÃªmea e informe o protocolo."); return; }
    const res = await fetch(`${api}/bovino/leiteiro/iatf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: imovelId, femea_id: Number(femeaId), protocolo,
        data_inicio: dataInicio, data_iatf: dataIatf || null,
        touro_id: touroId ? Number(touroId) : null,
        semen_touro: semen || null, tecnico: tecnico || null,
      })
    });
    if (res.ok) {
      setMsg("âœ… Protocolo registrado!");
      setFemeaId(""); setProtocolo(""); setDataIatf(""); setTouroId(""); setSemen(""); setTecnico(""); setShow(false);
      fetch(`${api}/bovino/leiteiro/iatf/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
    } else { setMsg("Erro ao salvar."); }
  }

  const aguardando = registros.filter(r => (r as Record<string, unknown>).resultado === "aguardando").length;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#e3f2fd", borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1565c0" }}>{aguardando}</div>
          <div style={{ fontSize: 11, color: "#666" }}>Aguardando diagnÃ³stico</div>
        </div>
        <div style={{ background: "#e8f5e9", borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#2d5a27" }}>{registros.filter(r=>(r as Record<string, unknown>).resultado==="positivo").length}</div>
          <div style={{ fontSize: 11, color: "#666" }}>Positivos</div>
        </div>
      </div>
      <button onClick={() => setShow(!show)} style={{ background: "#1565c0", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
        + Novo Protocolo IATF
      </button>
      {show && (
        <div style={{ background: "#f8f9ff", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #bbdefb" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {[{l:"FÃªmea *",c:<select value={femeaId} onChange={e=>setFemeaId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{animais.map(a=><option key={a.id} value={a.id}>{a.brinco}{a.nome?" â€” "+a.nome:""}</option>)}</select>},
              {l:"Protocolo *",c:<input value={protocolo} onChange={e=>setProtocolo(e.target.value)} placeholder="Ex: Ovsynch 48h" style={inputStyle}/>},
              {l:"Inicio Protocolo",c:<input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} style={inputStyle}/>},
              {l:"Data IATF",c:<input type="date" value={dataIatf} onChange={e=>setDataIatf(e.target.value)} style={inputStyle}/>},
              {l:"Touro (semen)",c:<select value={touroId} onChange={e=>setTouroId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{touros.map(a=><option key={a.id} value={a.id}>{a.brinco}{a.nome?" â€” "+a.nome:""}</option>)}</select>},
              {l:"CÃ³d. SÃªmen",c:<input value={semen} onChange={e=>setSemen(e.target.value)} placeholder="CÃ³digo" style={inputStyle}/>},
              {l:"TÃ©cnico",c:<input value={tecnico} onChange={e=>setTecnico(e.target.value)} placeholder="Nome" style={inputStyle}/>},
            ].map((f,i)=>(<div key={i}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:3}}>{f.l}</div>{f.c}</div>))}
          </div>
          {msg && <div style={{marginTop:10,padding:"6px 10px",borderRadius:6,background:msg.startsWith("âœ…")?"#e8f5e9":"#fce8e8",color:msg.startsWith("âœ…")?"#2d5a27":"#c00",fontSize:12}}>{msg}</div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={salvar} style={{background:"#1565c0",color:"white",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700,cursor:"pointer",fontSize:13}}>Salvar</button>
            <button onClick={()=>setShow(false)} style={{background:"#eee",color:"#444",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#e3f2fd" }}>
            {["FÃªmea","Protocolo","InÃ­cio","Data IATF","Resultado"].map(h=>(<th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:600,color:"#1565c0",fontSize:12}}>{h}</th>))}
          </tr></thead>
          <tbody>
            {registros.map((r,i)=>{
              const res = String((r as Record<string, unknown>).resultado||"");
              const cor = res==="positivo"?"#2d5a27":res==="negativo"?"#c00":"#e65100";
              return (<tr key={i} style={{borderBottom:"1px solid #f0f0f0",background:i%2===0?"white":"#fafafa"}}>
                <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).brinco||"")} {(r as Record<string, unknown>).nome_femea?"â€” "+String((r as Record<string, unknown>).nome_femea):""}</td>
                <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).protocolo||"")} </td>
                <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).data_inicio||"")} </td>
                <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).data_iatf||"-")} </td>
                <td style={{padding:"7px 10px",fontWeight:600,color:cor,textTransform:"capitalize"}}>{res||"aguardando"}</td>
              </tr>);
            })}
            {registros.length===0&&<tr><td colSpan={5} style={{padding:"20px",textAlign:"center",color:"#999"}}>Nenhum protocolo IATF registrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DietaTab({ imovelId, api, animais }: { imovelId: number; api: string; animais: Animal[] }) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [show, setShow] = useState(false);
  const [animalId, setAnimalId] = useState("");
  const [fase, setFase] = useState("pre_parto");
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [descricao, setDescricao] = useState("");
  const [volumoso, setVolumoso] = useState("");
  const [concentrado, setConcentrado] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${api}/bovino/leiteiro/dieta-transicao/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
  }, [imovelId]);

  async function salvar() {
    if (!animalId || !descricao) { setMsg("Selecione o animal e informe a dieta."); return; }
    const res = await fetch(`${api}/bovino/leiteiro/dieta-transicao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: imovelId, animal_id: Number(animalId), fase,
        data_inicio: dataInicio, dieta_descricao: descricao,
        volumoso_kg_dia: volumoso ? Number(volumoso) : null,
        concentrado_kg_dia: concentrado ? Number(concentrado) : null,
      })
    });
    if (res.ok) {
      setMsg("âœ… Dieta registrada!");
      setAnimalId(""); setDescricao(""); setVolumoso(""); setConcentrado(""); setShow(false);
      fetch(`${api}/bovino/leiteiro/dieta-transicao/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
    } else { setMsg("Erro ao salvar."); }
  }

  return (
    <div>
      <button onClick={() => setShow(!show)} style={{ background: "#1565c0", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
        + Nova Dieta de TransiÃ§Ã£o
      </button>
      {show && (
        <div style={{ background: "#f8f9ff", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #bbdefb" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {[{l:"Animal *",c:<select value={animalId} onChange={e=>setAnimalId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{animais.map(a=><option key={a.id} value={a.id}>{a.brinco}{a.nome?" â€” "+a.nome:""}</option>)}</select>},
              {l:"Fase *",c:<select value={fase} onChange={e=>setFase(e.target.value)} style={inputStyle}><option value="pre_parto">PrÃ©-parto</option><option value="pos_parto">PÃ³s-parto</option><option value="secagem">Secagem</option><option value="alta_producao">Alta ProduÃ§Ã£o</option></select>},
              {l:"InÃ­cio",c:<input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} style={inputStyle}/>},
              {l:"Volumoso (kg/dia)",c:<input type="number" value={volumoso} onChange={e=>setVolumoso(e.target.value)} placeholder="kg" style={inputStyle}/>},
              {l:"Concentrado (kg/dia)",c:<input type="number" value={concentrado} onChange={e=>setConcentrado(e.target.value)} placeholder="kg" style={inputStyle}/>},
            ].map((f,i)=>(<div key={i}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:3}}>{f.l}</div>{f.c}</div>))}
            <div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:3}}>DescriÃ§Ã£o da Dieta *</div><textarea value={descricao} onChange={e=>setDescricao(e.target.value)} rows={2} placeholder="Descreva a dieta..." style={{...inputStyle,resize:"vertical"}}/></div>
          </div>
          {msg && <div style={{marginTop:10,padding:"6px 10px",borderRadius:6,background:msg.startsWith("âœ…")?"#e8f5e9":"#fce8e8",color:msg.startsWith("âœ…")?"#2d5a27":"#c00",fontSize:12}}>{msg}</div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={salvar} style={{background:"#1565c0",color:"white",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700,cursor:"pointer",fontSize:13}}>Salvar</button>
            <button onClick={()=>setShow(false)} style={{background:"#eee",color:"#444",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#e3f2fd" }}>
            {["Animal","Fase","InÃ­cio","Volumoso (kg)","Concentrado (kg)","Dieta"].map(h=>(<th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:600,color:"#1565c0",fontSize:12}}>{h}</th>))}
          </tr></thead>
          <tbody>
            {registros.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f0f0f0",background:i%2===0?"white":"#fafafa"}}>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).brinco||"")} {(r as Record<string, unknown>).nome_animal?"â€” "+String((r as Record<string, unknown>).nome_animal):""}</td>
              <td style={{padding:"7px 10px",textTransform:"capitalize"}}>{String((r as Record<string, unknown>).fase||"").replace("_"," ")}</td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).data_inicio||"")} </td>
              <td style={{padding:"7px 10px"}}>{(r as Record<string, unknown>).volumoso_kg_dia!=null?Number((r as Record<string, unknown>).volumoso_kg_dia).toFixed(1):"-"}</td>
              <td style={{padding:"7px 10px"}}>{(r as Record<string, unknown>).concentrado_kg_dia!=null?Number((r as Record<string, unknown>).concentrado_kg_dia).toFixed(1):"-"}</td>
              <td style={{padding:"7px 10px",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String((r as Record<string, unknown>).dieta_descricao||"")} </td>
            </tr>))}
            {registros.length===0&&<tr><td colSpan={6} style={{padding:"20px",textAlign:"center",color:"#999"}}>Nenhuma dieta de transiÃ§Ã£o registrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfinamentoTab({ imovelId, api, lotes }: { imovelId: number; api: string; lotes: Lote[] }) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [show, setShow] = useState(false);
  const [loteId, setLoteId] = useState("");
  const [dataEntrada, setDataEntrada] = useState(new Date().toISOString().split("T")[0]);
  const [pesoEntrada, setPesoEntrada] = useState("");
  const [dieta, setDieta] = useState("");
  const [custoDiario, setCustoDiario] = useState("");
  const [objetivo, setObjetivo] = useState("terminacao");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${api}/bovino/corte/confinamento/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
  }, [imovelId]);

  async function salvar() {
    if (!loteId) { setMsg("Selecione o lote."); return; }
    const res = await fetch(`${api}/bovino/corte/confinamento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: imovelId, lote_id: Number(loteId),
        data_entrada: dataEntrada,
        peso_entrada_kg: pesoEntrada ? Number(pesoEntrada) : null,
        dieta: dieta || null,
        custo_diario_cab: custoDiario ? Number(custoDiario) : null,
        objetivo,
      })
    });
    if (res.ok) {
      setMsg("âœ… Confinamento iniciado!");
      setLoteId(""); setPesoEntrada(""); setDieta(""); setCustoDiario(""); setShow(false);
      fetch(`${api}/bovino/corte/confinamento/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
    } else { setMsg("Erro ao salvar."); }
  }

  const ativos = registros.filter(r => (r as Record<string, unknown>).status === "ativo").length;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "#ffebee", borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#b71c1c" }}>{ativos}</div>
          <div style={{ fontSize: 11, color: "#666" }}>Lotes em confinamento</div>
        </div>
      </div>
      <button onClick={() => setShow(!show)} style={{ background: "#b71c1c", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
        + Iniciar Confinamento
      </button>
      {show && (
        <div style={{ background: "#fff8f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #ffcdd2" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {[{l:"Lote *",c:<select value={loteId} onChange={e=>setLoteId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{lotes.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}</select>},
              {l:"Data Entrada",c:<input type="date" value={dataEntrada} onChange={e=>setDataEntrada(e.target.value)} style={inputStyle}/>},
              {l:"Peso MÃ©dio Entrada (kg)",c:<input type="number" value={pesoEntrada} onChange={e=>setPesoEntrada(e.target.value)} placeholder="kg" style={inputStyle}/>},
              {l:"Objetivo",c:<select value={objetivo} onChange={e=>setObjetivo(e.target.value)} style={inputStyle}><option value="terminacao">TerminaÃ§Ã£o</option><option value="recria">Recria</option><option value="engorda">Engorda</option></select>},
              {l:"Custo DiÃ¡rio/Cab (R$)",c:<input type="number" value={custoDiario} onChange={e=>setCustoDiario(e.target.value)} placeholder="R$" style={inputStyle}/>},
              {l:"Dieta",c:<input value={dieta} onChange={e=>setDieta(e.target.value)} placeholder="DescriÃ§Ã£o" style={inputStyle}/>},
            ].map((f,i)=>(<div key={i}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:3}}>{f.l}</div>{f.c}</div>))}
          </div>
          {msg && <div style={{marginTop:10,padding:"6px 10px",borderRadius:6,background:msg.startsWith("âœ…")?"#e8f5e9":"#fce8e8",color:msg.startsWith("âœ…")?"#2d5a27":"#c00",fontSize:12}}>{msg}</div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={salvar} style={{background:"#b71c1c",color:"white",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700,cursor:"pointer",fontSize:13}}>Iniciar</button>
            <button onClick={()=>setShow(false)} style={{background:"#eee",color:"#444",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#ffebee" }}>
            {["Lote","Entrada","Objetivo","Peso Entrada","GMD (kg/dia)","Status"].map(h=>(<th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:600,color:"#b71c1c",fontSize:12}}>{h}</th>))}
          </tr></thead>
          <tbody>
            {registros.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f0f0f0",background:i%2===0?"white":"#fafafa"}}>
              <td style={{padding:"7px 10px",fontWeight:600}}>{String((r as Record<string, unknown>).nome_lote||"")} </td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).data_entrada||"")} </td>
              <td style={{padding:"7px 10px",textTransform:"capitalize"}}>{String((r as Record<string, unknown>).objetivo||"")} </td>
              <td style={{padding:"7px 10px"}}>{(r as Record<string, unknown>).peso_entrada_kg!=null?Number((r as Record<string, unknown>).peso_entrada_kg).toFixed(1)+" kg":"-"}</td>
              <td style={{padding:"7px 10px",fontWeight:600,color:"#b71c1c"}}>{(r as Record<string, unknown>).gmd_kg!=null?Number((r as Record<string, unknown>).gmd_kg).toFixed(3):"-"}</td>
              <td style={{padding:"7px 10px"}}><span style={{padding:"2px 8px",borderRadius:12,fontSize:11,fontWeight:600,background:(r as Record<string, unknown>).status==="ativo"?"#e8f5e9":"#f5f5f5",color:(r as Record<string, unknown>).status==="ativo"?"#2d5a27":"#666"}}>{String((r as Record<string, unknown>).status||"")} </span></td>
            </tr>))}
            {registros.length===0&&<tr><td colSpan={6} style={{padding:"20px",textAlign:"center",color:"#999"}}>Nenhum confinamento registrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TipificacaoTab({ imovelId, api, animais }: { imovelId: number; api: string; animais: Animal[] }) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [show, setShow] = useState(false);
  const [animalId, setAnimalId] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [frigorifico, setFrigorifico] = useState("");
  const [maturidade, setMaturidade] = useState("");
  const [acabamento, setAcabamento] = useState("");
  const [pesoCarcaca, setPesoCarcaca] = useState("");
  const [rendimento, setRendimento] = useState("");
  const [precoArroba, setPrecoArroba] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${api}/bovino/corte/classificacao-carcaca/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
  }, [imovelId]);

  async function salvar() {
    if (!animalId) { setMsg("Selecione o animal."); return; }
    const res = await fetch(`${api}/bovino/corte/classificacao-carcaca`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: imovelId, animal_id: Number(animalId), data,
        frigorifico: frigorifico || null, maturidade: maturidade || null,
        acabamento: acabamento || null,
        peso_carcaca_kg: pesoCarcaca ? Number(pesoCarcaca) : null,
        rendimento_pct: rendimento ? Number(rendimento) : null,
        preco_arroba: precoArroba ? Number(precoArroba) : null,
      })
    });
    if (res.ok) {
      setMsg("âœ… TipificaÃ§Ã£o registrada!");
      setAnimalId(""); setFrigorifico(""); setMaturidade(""); setAcabamento(""); setPesoCarcaca(""); setRendimento(""); setPrecoArroba(""); setShow(false);
      fetch(`${api}/bovino/corte/classificacao-carcaca/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
    } else { setMsg("Erro ao salvar."); }
  }

  return (
    <div>
      <button onClick={() => setShow(!show)} style={{ background: "#b71c1c", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
        + Registrar TipificaÃ§Ã£o
      </button>
      {show && (
        <div style={{ background: "#fff8f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #ffcdd2" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {[{l:"Animal *",c:<select value={animalId} onChange={e=>setAnimalId(e.target.value)} style={inputStyle}><option value="">Selecione</option>{animais.map(a=><option key={a.id} value={a.id}>{a.brinco}{a.nome?" â€” "+a.nome:""}</option>)}</select>},
              {l:"Data",c:<input type="date" value={data} onChange={e=>setData(e.target.value)} style={inputStyle}/>},
              {l:"FrigorÃ­fico",c:<input value={frigorifico} onChange={e=>setFrigorifico(e.target.value)} placeholder="Nome" style={inputStyle}/>},
              {l:"Maturidade",c:<select value={maturidade} onChange={e=>setMaturidade(e.target.value)} style={inputStyle}><option value="">Selecione</option><option value="0d">0 dente</option><option value="2d">2 dentes</option><option value="4d">4 dentes</option><option value="6d">6 dentes</option><option value="8d">8 dentes</option><option value="adulto">Adulto</option></select>},
              {l:"Acabamento",c:<select value={acabamento} onChange={e=>setAcabamento(e.target.value)} style={inputStyle}><option value="">Selecione</option><option value="ausente">Ausente</option><option value="escasso">Escasso</option><option value="mediano">Mediano</option><option value="uniforme">Uniforme</option><option value="excessivo">Excessivo</option></select>},
              {l:"Peso CarcaÃ§a (kg)",c:<input type="number" value={pesoCarcaca} onChange={e=>setPesoCarcaca(e.target.value)} placeholder="kg" style={inputStyle}/>},
              {l:"Rendimento (%)",c:<input type="number" value={rendimento} onChange={e=>setRendimento(e.target.value)} placeholder="%" style={inputStyle}/>},
              {l:"PreÃ§o/@",c:<input type="number" value={precoArroba} onChange={e=>setPrecoArroba(e.target.value)} placeholder="R$" style={inputStyle}/>},
            ].map((f,i)=>(<div key={i}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:3}}>{f.l}</div>{f.c}</div>))}
          </div>
          {msg && <div style={{marginTop:10,padding:"6px 10px",borderRadius:6,background:msg.startsWith("âœ…")?"#e8f5e9":"#fce8e8",color:msg.startsWith("âœ…")?"#2d5a27":"#c00",fontSize:12}}>{msg}</div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={salvar} style={{background:"#b71c1c",color:"white",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700,cursor:"pointer",fontSize:13}}>Salvar</button>
            <button onClick={()=>setShow(false)} style={{background:"#eee",color:"#444",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#ffebee" }}>
            {["Animal","Data","FrigorÃ­fico","Maturidade","Acabamento","Peso CarcaÃ§a","Rendimento","R$/@"].map(h=>(<th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:600,color:"#b71c1c",fontSize:12}}>{h}</th>))}
          </tr></thead>
          <tbody>
            {registros.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f0f0f0",background:i%2===0?"white":"#fafafa"}}>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).brinco||"")} {(r as Record<string, unknown>).nome_animal?"â€” "+String((r as Record<string, unknown>).nome_animal):""}</td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).data||"")} </td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).frigorifico||"-")} </td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).maturidade||"-")} </td>
              <td style={{padding:"7px 10px",textTransform:"capitalize"}}>{String((r as Record<string, unknown>).acabamento||"-")} </td>
              <td style={{padding:"7px 10px"}}>{(r as Record<string, unknown>).peso_carcaca_kg!=null?Number((r as Record<string, unknown>).peso_carcaca_kg).toFixed(1)+" kg":"-"}</td>
              <td style={{padding:"7px 10px"}}>{(r as Record<string, unknown>).rendimento_pct!=null?Number((r as Record<string, unknown>).rendimento_pct).toFixed(1)+"%":"-"}</td>
              <td style={{padding:"7px 10px",fontWeight:600,color:"#b71c1c"}}>{(r as Record<string, unknown>).preco_arroba!=null?"R$ "+Number((r as Record<string, unknown>).preco_arroba).toFixed(2):"-"}</td>
            </tr>))}
            {registros.length===0&&<tr><td colSpan={8} style={{padding:"20px",textAlign:"center",color:"#999"}}>Nenhuma tipificaÃ§Ã£o registrada nos Ãºltimos 90 dias.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustoTab({ imovelId, api, lotes }: { imovelId: number; api: string; lotes: Lote[] }) {
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [resumo, setResumo] = useState<Record<string, unknown>[]>([]);
  const [show, setShow] = useState(false);
  const [loteId, setLoteId] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState(new Date().toISOString().split("T")[0]);
  const [categoria, setCategoria] = useState("racao");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${api}/bovino/corte/custo-producao/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${api}/bovino/corte/custo-producao/resumo/${imovelId}`).then(r => r.json()).then(d => setResumo(Array.isArray(d) ? d : [])).catch(() => {});
  }, [imovelId]);

  async function salvar() {
    if (!valor || !categoria) { setMsg("Informe categoria e valor."); return; }
    const res = await fetch(`${api}/bovino/corte/custo-producao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imovel_id: imovelId,
        lote_id: loteId ? Number(loteId) : null,
        periodo_inicio: periodoInicio,
        categoria, descricao: descricao || null,
        valor: Number(valor),
      })
    });
    if (res.ok) {
      setMsg("âœ… Custo registrado!");
      setLoteId(""); setDescricao(""); setValor(""); setShow(false);
      fetch(`${api}/bovino/corte/custo-producao/${imovelId}`).then(r => r.json()).then(d => setRegistros(Array.isArray(d) ? d : [])).catch(() => {});
      fetch(`${api}/bovino/corte/custo-producao/resumo/${imovelId}`).then(r => r.json()).then(d => setResumo(Array.isArray(d) ? d : [])).catch(() => {});
    } else { setMsg("Erro ao salvar."); }
  }

  const totalCusto = resumo.reduce((s, r) => s + Number((r as Record<string, unknown>).total || 0), 0);

  return (
    <div>
      {/* Resumo por categoria */}
      {resumo.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {resumo.map((r, i) => (
            <div key={i} style={{ background: "#ffebee", borderRadius: 8, padding: "10px 16px", textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#b71c1c" }}>R$ {Number((r as Record<string, unknown>).total || 0).toFixed(0)}</div>
              <div style={{ fontSize: 10, color: "#666", textTransform: "capitalize" }}>{String((r as Record<string, unknown>).categoria || "").replace("_", " ")}</div>
            </div>
          ))}
          <div style={{ background: "#b71c1c", borderRadius: 8, padding: "10px 16px", textAlign: "center", minWidth: 100 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>R$ {totalCusto.toFixed(0)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)" }}>Total Geral</div>
          </div>
        </div>
      )}
      <button onClick={() => setShow(!show)} style={{ background: "#b71c1c", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>
        + Registrar Custo
      </button>
      {show && (
        <div style={{ background: "#fff8f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #ffcdd2" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {[{l:"Lote",c:<select value={loteId} onChange={e=>setLoteId(e.target.value)} style={inputStyle}><option value="">Geral (sem lote)</option>{lotes.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}</select>},
              {l:"PerÃ­odo",c:<input type="date" value={periodoInicio} onChange={e=>setPeriodoInicio(e.target.value)} style={inputStyle}/>},
              {l:"Categoria *",c:<select value={categoria} onChange={e=>setCategoria(e.target.value)} style={inputStyle}><option value="racao">RaÃ§Ã£o</option><option value="sal_mineral">Sal Mineral</option><option value="sanidade">Sanidade</option><option value="mao_de_obra">MÃ£o de Obra</option><option value="pasto">Pasto</option><option value="agua">Ãgua</option><option value="energia">Energia</option><option value="outros">Outros</option></select>},
              {l:"DescriÃ§Ã£o",c:<input value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Opcional" style={inputStyle}/>},
              {l:"Valor (R$) *",c:<input type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="R$" style={inputStyle}/>},
            ].map((f,i)=>(<div key={i}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:3}}>{f.l}</div>{f.c}</div>))}
          </div>
          {msg && <div style={{marginTop:10,padding:"6px 10px",borderRadius:6,background:msg.startsWith("âœ…")?"#e8f5e9":"#fce8e8",color:msg.startsWith("âœ…")?"#2d5a27":"#c00",fontSize:12}}>{msg}</div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={salvar} style={{background:"#b71c1c",color:"white",border:"none",borderRadius:8,padding:"8px 20px",fontWeight:700,cursor:"pointer",fontSize:13}}>Salvar</button>
            <button onClick={()=>setShow(false)} style={{background:"#eee",color:"#444",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#ffebee" }}>
            {["PerÃ­odo","Lote","Categoria","DescriÃ§Ã£o","Valor (R$)"].map(h=>(<th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:600,color:"#b71c1c",fontSize:12}}>{h}</th>))}
          </tr></thead>
          <tbody>
            {registros.map((r,i)=>(<tr key={i} style={{borderBottom:"1px solid #f0f0f0",background:i%2===0?"white":"#fafafa"}}>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).periodo_inicio||"")} </td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).nome_lote||"-")} </td>
              <td style={{padding:"7px 10px",textTransform:"capitalize"}}>{String((r as Record<string, unknown>).categoria||"").replace("_"," ")}</td>
              <td style={{padding:"7px 10px"}}>{String((r as Record<string, unknown>).descricao||"-")} </td>
              <td style={{padding:"7px 10px",fontWeight:600,color:"#b71c1c"}}>R$ {Number((r as Record<string, unknown>).valor||0).toFixed(2)}</td>
            </tr>))}
            {registros.length===0&&<tr><td colSpan={5} style={{padding:"20px",textAlign:"center",color:"#999"}}>Nenhum custo registrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd",
  fontSize: 13, background: "white", boxSizing: "border-box",
};

