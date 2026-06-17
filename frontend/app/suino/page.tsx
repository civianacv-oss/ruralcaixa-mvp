"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Animal = {
  id: number;
  brinco: string;
  nome: string | null;
  sexo: string;
  raca: string | null;
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
  fase: string;
  total_animais: number;
};

type Dashboard = {
  rebanho: {
    total_ativo: number;
    matrizes: number;
    cachacos: number;
    terminacao: number;
    jovens: number;
  };
  abates_30d: {
    total_abatidos: number;
    media_carcaca_kg: number | null;
    media_rendimento_pct: number | null;
    receita_total_rs: number | null;
  };
  partos_30d: {
    total_partos: number;
    leitoes_vivos: number | null;
    leitoes_mortos: number | null;
    leitoes_mumificados: number | null;
  };
  alertas_pendentes: { total_alertas: number };
};

type IndicadorLote = {
  lote_id: number;
  lote_nome: string;
  fase: string;
  animais_ativos: number;
  mortes: number;
  abates: number;
  peso_medio_atual: number | null;
  dias_medio_lote: number | null;
};

type RacaoLote = {
  lote_nome: string;
  fase: string;
  animais: number;
  peso_medio: number | null;
  pct_consumo_dia: number;
  racao_dia_kg: number;
  racao_7d_kg: number;
  racao_30d_kg: number;
};

type RacaoPrevisao = {
  por_lote: RacaoLote[];
  totais: {
    racao_dia_kg: number;
    racao_7d_kg: number;
    racao_30d_kg: number;
  };
};

type Alerta = {
  id: number;
  tipo_alerta: string;
  titulo: string;
  prioridade: string;
  status: string;
  animal_brinco: string | null;
  lote_nome: string | null;
};

type SaudeEvento = {
  id: number;
  tipo: string;
  data_evento: string;
  produto: string | null;
  animal_brinco: string | null;
  lote_nome: string | null;
  proximo_em: string | null;
  observacoes: string | null;
};

export default function SuinoDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadorLote[]>([]);
  const [racao, setRacao] = useState<RacaoPrevisao | null>(null);
  const [sanitario, setSanitario] = useState<SaudeEvento[]>([]);
  const [aba, setAba] = useState<"rebanho" | "lotes" | "indicadores" | "racao" | "sanitario" | "alertas">("rebanho");
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [novoAnimal, setNovoAnimal] = useState({ brinco: "", sexo: "F", raca: "", categoria: "leitao" });
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [msgEdit, setMsgEdit] = useState("");
  const [msg, setMsg] = useState("");
  const [novoLote, setNovoLote] = useState({ nome: "", fase: "leitao" });
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [msgLote, setMsgLote] = useState("");
  const [novaSaude, setNovaSaude] = useState({ tipo: "vacinacao", produto: "", lote_id: "", animal_id: "", proximo_em: "", observacoes: "" });
  const [salvandoSaude, setSalvandoSaude] = useState(false);
  const [msgSaude, setMsgSaude] = useState("");

  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [dashRes, animaisRes, lotesRes, alertasRes, indicRes, racaoRes, sanitRes] = await Promise.allSettled([
        fetch(`${API}/suino/dashboard/${IMOVEL_ID}`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/suino/animais?imovel_id=${IMOVEL_ID}&status=${filtroStatus}`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/suino/lotes?imovel_id=${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/suino/alertas?imovel_id=${IMOVEL_ID}&status=pendente`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/suino/indicadores/${IMOVEL_ID}`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/suino/racao/previsao/${IMOVEL_ID}`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/suino/sanitario/historico?imovel_id=${IMOVEL_ID}&limit=30`).then(r => r.ok ? r.json() : []),
      ]);
      if (dashRes.status === "fulfilled") setDashboard(dashRes.value);
      if (animaisRes.status === "fulfilled") setAnimais(animaisRes.value || []);
      if (lotesRes.status === "fulfilled") setLotes(lotesRes.value || []);
      if (alertasRes.status === "fulfilled") setAlertas(alertasRes.value || []);
      if (indicRes.status === "fulfilled") setIndicadores(indicRes.value || []);
      if (racaoRes.status === "fulfilled") setRacao(racaoRes.value);
      if (sanitRes.status === "fulfilled") setSanitario(sanitRes.value || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function carregarAnimais() {
    const r = await fetch(`${API}/suino/animais?imovel_id=${IMOVEL_ID}&status=${filtroStatus}`);
    if (r.ok) setAnimais(await r.json());
  }

  async function cadastrarAnimal() {
    if (!novoAnimal.brinco) return;
    setSalvando(true);
    try {
      const r = await fetch(`${API}/suino/animais`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imovel_id: IMOVEL_ID, ...novoAnimal, raca: novoAnimal.raca || null }),
      });
      if (r.ok) {
        setMsg("Animal cadastrado com sucesso!");
        setNovoAnimal({ brinco: "", sexo: "F", raca: "", categoria: "leitao" });
        carregarTudo();
      } else {
        const e = await r.json();
        setMsg(e.detail || "Erro ao cadastrar.");
      }
    } catch {
      setMsg("Erro de conexão.");
    }
    setSalvando(false);
    setTimeout(() => setMsg(""), 3000);
  }

  async function salvarEdicao() {
    if (!editando) return;
    setSalvandoEdit(true);
    try {
      const payload: any = {};
      if (editando.brinco) payload.brinco = editando.brinco;
      if (editando.nome !== undefined) payload.nome = editando.nome;
      if (editando.raca !== undefined) payload.raca = editando.raca;
      if (editando.sexo) payload.sexo = editando.sexo;
      if (editando.categoria) payload.categoria = editando.categoria;
      if (editando.lote_id !== undefined) payload.lote_id = editando.lote_id ? Number(editando.lote_id) : null;
      if (editando.novo_peso) payload.novo_peso = Number(editando.novo_peso);
      const r = await fetch(`${API}/suino/animais/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setMsgEdit("Salvo com sucesso!");
        carregarTudo();
        setTimeout(() => { setEditando(null); setMsgEdit(""); }, 1500);
      } else {
        const e = await r.json();
        setMsgEdit(e.detail || "Erro ao salvar.");
      }
    } catch {
      setMsgEdit("Erro de conexão.");
    }
    setSalvandoEdit(false);
  }

  async function criarLote() {
    if (!novoLote.nome) return;
    setSalvandoLote(true);
    try {
      const r = await fetch(`${API}/suino/lotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imovel_id: IMOVEL_ID, ...novoLote }),
      });
      if (r.ok) {
        setMsgLote("Lote criado com sucesso!");
        setNovoLote({ nome: "", fase: "leitao" });
        carregarTudo();
      } else {
        const e = await r.json();
        setMsgLote(e.detail || "Erro ao criar lote.");
      }
    } catch {
      setMsgLote("Erro de conexão.");
    }
    setSalvandoLote(false);
    setTimeout(() => setMsgLote(""), 3000);
  }

  async function registrarSaude() {
    setSalvandoSaude(true);
    try {
      const payload: any = {
        imovel_id: IMOVEL_ID,
        tipo: novaSaude.tipo,
        produto: novaSaude.produto || null,
        observacoes: novaSaude.observacoes || null,
        proximo_em: novaSaude.proximo_em || null,
      };
      if (novaSaude.lote_id) payload.lote_id = Number(novaSaude.lote_id);
      if (novaSaude.animal_id) payload.animal_id = Number(novaSaude.animal_id);
      const r = await fetch(`${API}/suino/saude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setMsgSaude("Evento sanitário registrado!");
        setNovaSaude({ tipo: "vacinacao", produto: "", lote_id: "", animal_id: "", proximo_em: "", observacoes: "" });
        carregarTudo();
      } else {
        const e = await r.json();
        setMsgSaude(e.detail || "Erro ao registrar.");
      }
    } catch {
      setMsgSaude("Erro de conexão.");
    }
    setSalvandoSaude(false);
    setTimeout(() => setMsgSaude(""), 3000);
  }

  async function resolverAlerta(id: number) {
    await fetch(`${API}/suino/alertas/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ novo_status: "resolvido" }),
    });
    carregarTudo();
  }

  const faseLabel: Record<string, string> = {
    leitao: "🐷 Leitão", creche: "🏠 Creche", recria: "📈 Recria",
    terminacao: "💪 Terminação", gestacao: "🤰 Gestação",
    maternidade: "🍼 Maternidade", reproducao: "❤️ Reprodução",
    descarte: "⚠️ Descarte",
  };

  const categoriaLabel: Record<string, string> = {
    leitao: "Leitão", creche: "Creche", recria: "Recria",
    terminacao: "Terminação", gestacao: "Gestação",
    maternidade: "Maternidade", reproducao: "Reprodução",
    matriz: "Matriz", "cachaço": "Cachaço", descarte: "Descarte",
  };

  const tipoSaudeLabel: Record<string, string> = {
    vacinacao: "💉 Vacinação", vermifugacao: "🧪 Vermifugação",
    tratamento: "🏥 Tratamento", exame: "🔬 Exame",
    cirurgia: "🔪 Cirurgia", outro: "📋 Outro",
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", color: "#6b7280", fontSize: 16 }}>
      Carregando módulo suíno...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f0e8", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#8a3a6a", color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8, padding: "6px 14px" }}>🏠 Painel Principal</a>
          <button onClick={() => window.history.back()} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, padding: "6px 14px" }}>← Voltar</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 28 }}>🐖</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Suíno de Corte</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Fazenda Boa Esperança — Imóvel #{IMOVEL_ID}</div>
          </div>
        </div>
        <div style={{ width: 160 }} />
      </div>

      <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto" }}>

        {/* KPI Cards */}
        {dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Rebanho Ativo", value: dashboard.rebanho.total_ativo, icon: "🐖", color: "#8a3a6a" },
              { label: "Matrizes", value: dashboard.rebanho.matrizes, icon: "♀️", color: "#9333ea" },
              { label: "Terminação", value: dashboard.rebanho.terminacao, icon: "💪", color: "#ea580c" },
              { label: "Partos 30d", value: dashboard.partos_30d.total_partos, icon: "🍼", color: "#0284c7" },
              { label: "Alertas", value: dashboard.alertas_pendentes.total_alertas, icon: "⚠️", color: dashboard.alertas_pendentes.total_alertas > 0 ? "#dc2626" : "#16a34a" },
            ].map(k => (
              <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>{k.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Abates 30d */}
        {dashboard && dashboard.abates_30d.total_abatidos > 0 && (
          <div style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div><span style={{ fontWeight: 600, color: "#8a3a6a" }}>Abates (30d): </span>{dashboard.abates_30d.total_abatidos}</div>
            {dashboard.abates_30d.media_carcaca_kg && <div><span style={{ fontWeight: 600, color: "#8a3a6a" }}>Carcaça média: </span>{dashboard.abates_30d.media_carcaca_kg} kg</div>}
            {dashboard.abates_30d.media_rendimento_pct && <div><span style={{ fontWeight: 600, color: "#8a3a6a" }}>Rendimento: </span>{dashboard.abates_30d.media_rendimento_pct}%</div>}
            {dashboard.abates_30d.receita_total_rs && <div><span style={{ fontWeight: 600, color: "#8a3a6a" }}>Receita: </span>R$ {Number(dashboard.abates_30d.receita_total_rs).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
          </div>
        )}

        {/* Partos 30d */}
        {dashboard && dashboard.partos_30d.total_partos > 0 && (
          <div style={{ background: "#fff0f6", border: "1px solid #fbc8e0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div><span style={{ fontWeight: 600, color: "#8a3a6a" }}>Partos (30d): </span>{dashboard.partos_30d.total_partos}</div>
            {dashboard.partos_30d.leitoes_vivos != null && <div><span style={{ fontWeight: 600, color: "#16a34a" }}>Leitões vivos: </span>{dashboard.partos_30d.leitoes_vivos}</div>}
            {dashboard.partos_30d.leitoes_mortos != null && dashboard.partos_30d.leitoes_mortos > 0 && <div><span style={{ fontWeight: 600, color: "#dc2626" }}>Mortos: </span>{dashboard.partos_30d.leitoes_mortos}</div>}
            {dashboard.partos_30d.leitoes_mumificados != null && dashboard.partos_30d.leitoes_mumificados > 0 && <div><span style={{ fontWeight: 600, color: "#f59e0b" }}>Mumificados: </span>{dashboard.partos_30d.leitoes_mumificados}</div>}
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {(["rebanho", "lotes", "indicadores", "racao", "sanitario", "alertas"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
              background: aba === a ? "#8a3a6a" : "#f3f4f6", color: aba === a ? "#fff" : "#374151",
            }}>
              {a === "rebanho" ? "🐖 Rebanho"
                : a === "lotes" ? "📦 Lotes"
                : a === "indicadores" ? "📊 Indicadores"
                : a === "racao" ? "🌾 Ração"
                : a === "sanitario" ? `💉 Sanitário${sanitario.length > 0 ? ` (${sanitario.length})` : ""}`
                : `⚠️ Alertas${alertas.length > 0 ? ` (${alertas.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* ── ABA REBANHO ── */}
        {aba === "rebanho" && (
          <div>
            {/* Cadastro rápido */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Cadastrar Animal</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Brinco *" value={novoAnimal.brinco} onChange={e => setNovoAnimal(p => ({ ...p, brinco: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 100 }} />
                <select value={novoAnimal.sexo} onChange={e => setNovoAnimal(p => ({ ...p, sexo: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="F">Fêmea</option>
                  <option value="M">Macho</option>
                </select>
                <select value={novoAnimal.categoria} onChange={e => setNovoAnimal(p => ({ ...p, categoria: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="leitao">Leitão</option>
                  <option value="creche">Creche</option>
                  <option value="recria">Recria</option>
                  <option value="terminacao">Terminação</option>
                  <option value="gestacao">Gestação</option>
                  <option value="maternidade">Maternidade</option>
                  <option value="matriz">Matriz</option>
                  <option value="cachaço">Cachaço</option>
                  <option value="descarte">Descarte</option>
                </select>
                <input placeholder="Raça" value={novoAnimal.raca} onChange={e => setNovoAnimal(p => ({ ...p, raca: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 130 }} />
                <button onClick={cadastrarAnimal} disabled={salvando || !novoAnimal.brinco}
                  style={{ padding: "8px 18px", background: "#8a3a6a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvando || !novoAnimal.brinco ? 0.6 : 1 }}>
                  {salvando ? "..." : "Cadastrar"}
                </button>
                {msg && <span style={{ alignSelf: "center", fontSize: 13, color: msg.includes("sucesso") ? "#16a34a" : "#dc2626" }}>{msg}</span>}
              </div>
            </div>

            {/* Filtro de status */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["ativo", "abatido", "morto", "vendido"].map(s => (
                <button key={s} onClick={() => { setFiltroStatus(s); setTimeout(carregarAnimais, 100); }}
                  style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: filtroStatus === s ? "#8a3a6a" : "#e5e7eb", color: filtroStatus === s ? "#fff" : "#374151" }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Tabela de animais */}
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Brinco", "Sexo", "Categoria", "Raça", "Lote", "Último Peso", "Ações"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {animais.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Nenhum animal encontrado.</td></tr>
                  ) : animais.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{a.brinco}</td>
                      <td style={{ padding: "10px 12px" }}>{a.sexo === "F" ? "♀️ F" : "♂️ M"}</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ background: "#fdf4ff", color: "#8a3a6a", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{categoriaLabel[a.categoria] || a.categoria}</span></td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{a.raca || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{a.lote_nome || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {a.ultimo_peso ? (
                          <span style={{ fontWeight: 600, color: "#374151" }}>{a.ultimo_peso} kg</span>
                        ) : <span style={{ color: "#9ca3af" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button onClick={() => setEditando({ ...a, novo_peso: "" })}
                          style={{ padding: "4px 10px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 5, cursor: "pointer", fontSize: 12 }}>
                          ✏️ Editar
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
        {aba === "lotes" && (
          <div>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Criar Lote</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Nome do lote *" value={novoLote.nome} onChange={e => setNovoLote(p => ({ ...p, nome: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 180 }} />
                <select value={novoLote.fase} onChange={e => setNovoLote(p => ({ ...p, fase: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="leitao">Leitão</option>
                  <option value="creche">Creche</option>
                  <option value="recria">Recria</option>
                  <option value="terminacao">Terminação</option>
                  <option value="gestacao">Gestação</option>
                  <option value="maternidade">Maternidade</option>
                  <option value="reproducao">Reprodução</option>
                  <option value="descarte">Descarte</option>
                </select>
                <button onClick={criarLote} disabled={salvandoLote || !novoLote.nome}
                  style={{ padding: "8px 18px", background: "#8a3a6a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvandoLote || !novoLote.nome ? 0.6 : 1 }}>
                  {salvandoLote ? "..." : "Criar Lote"}
                </button>
                {msgLote && <span style={{ alignSelf: "center", fontSize: 13, color: msgLote.includes("sucesso") ? "#16a34a" : "#dc2626" }}>{msgLote}</span>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {lotes.length === 0 ? (
                <div style={{ gridColumn: "1/-1", padding: 24, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  Nenhum lote cadastrado.
                </div>
              ) : lotes.map(l => (
                <div key={l.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{l.nome}</div>
                  <div style={{ fontSize: 12, color: "#8a3a6a", fontWeight: 600, marginBottom: 8 }}>{faseLabel[l.fase] || l.fase}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    <span style={{ fontWeight: 600, color: "#374151" }}>{l.total_animais}</span> animais
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ABA INDICADORES ── */}
        {aba === "indicadores" && (
          <div>
            {indicadores.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhum indicador disponível. Cadastre animais em lotes para visualizar.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {indicadores.map(ind => (
                  <div key={ind.lote_id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{ind.lote_nome}</span>
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#8a3a6a", background: "#fdf4ff", borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>{faseLabel[ind.fase] || ind.fase}</span>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                      {[
                        { label: "Ativos", value: ind.animais_ativos, color: "#16a34a" },
                        { label: "Mortes", value: ind.mortes, color: ind.mortes > 0 ? "#dc2626" : "#6b7280" },
                        { label: "Abates", value: ind.abates, color: "#ea580c" },
                        { label: "Peso Médio", value: ind.peso_medio_atual ? `${ind.peso_medio_atual} kg` : "—", color: "#0284c7" },
                      ].map(m => (
                        <div key={m.label} style={{ textAlign: "center", background: "#f9fafb", borderRadius: 8, padding: "10px 8px" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                    {ind.dias_medio_lote != null && (
                      <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                        Dias no lote: <span style={{ fontWeight: 600, color: "#374151" }}>{Math.round(Number(ind.dias_medio_lote))} dias</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA RAÇÃO ── */}
        {aba === "racao" && (
          <div>
            {!racao ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Nenhum dado de ração disponível. Cadastre animais com peso para calcular a previsão.
              </div>
            ) : (
              <>
                {/* Totais */}
                <div style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#8a3a6a" }}>📊 Consumo Total Estimado</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {[
                      { label: "Por Dia", value: `${racao.totais.racao_dia_kg} kg` },
                      { label: "7 Dias", value: `${racao.totais.racao_7d_kg} kg` },
                      { label: "30 Dias", value: `${racao.totais.racao_30d_kg} kg` },
                    ].map(t => (
                      <div key={t.label} style={{ textAlign: "center", background: "#fff", borderRadius: 8, padding: 12, border: "1px solid #e9d5ff" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#8a3a6a" }}>{t.value}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{t.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Por lote */}
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        {["Lote", "Fase", "Animais", "Peso Médio", "% Consumo/dia", "Ração/dia", "Ração/30d"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {racao.por_lote.map((l, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{l.lote_nome}</td>
                          <td style={{ padding: "10px 12px" }}><span style={{ background: "#fdf4ff", color: "#8a3a6a", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{faseLabel[l.fase] || l.fase}</span></td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>{l.animais}</td>
                          <td style={{ padding: "10px 12px" }}>{l.peso_medio ? `${l.peso_medio} kg` : "—"}</td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>{(l.pct_consumo_dia * 100).toFixed(1)}%</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#8a3a6a" }}>{l.racao_dia_kg} kg</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#374151" }}>{l.racao_30d_kg} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ABA SANITÁRIO ── */}
        {aba === "sanitario" && (
          <div>
            {/* Formulário de registro */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#374151" }}>+ Registrar Evento Sanitário</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={novaSaude.tipo} onChange={e => setNovaSaude(p => ({ ...p, tipo: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="vacinacao">💉 Vacinação</option>
                  <option value="vermifugacao">🧪 Vermifugação</option>
                  <option value="tratamento">🏥 Tratamento</option>
                  <option value="exame">🔬 Exame</option>
                  <option value="cirurgia">🔪 Cirurgia</option>
                  <option value="outro">📋 Outro</option>
                </select>
                <input placeholder="Produto/Medicamento" value={novaSaude.produto} onChange={e => setNovaSaude(p => ({ ...p, produto: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 180 }} />
                <select value={novaSaude.lote_id} onChange={e => setNovaSaude(p => ({ ...p, lote_id: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="">Lote (opcional)</option>
                  {lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
                <input placeholder="Próxima aplicação" type="date" value={novaSaude.proximo_em} onChange={e => setNovaSaude(p => ({ ...p, proximo_em: e.target.value }))}
                  style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }} />
                <button onClick={registrarSaude} disabled={salvandoSaude}
                  style={{ padding: "8px 18px", background: "#8a3a6a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvandoSaude ? 0.6 : 1 }}>
                  {salvandoSaude ? "..." : "Registrar"}
                </button>
                {msgSaude && <span style={{ alignSelf: "center", fontSize: 13, color: msgSaude.includes("registrado") ? "#16a34a" : "#dc2626" }}>{msgSaude}</span>}
              </div>
            </div>

            {/* Histórico */}
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Tipo", "Produto", "Animal/Lote", "Data", "Próxima Aplicação"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sanitario.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Nenhum evento sanitário registrado.</td></tr>
                  ) : sanitario.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px" }}><span style={{ background: "#fdf4ff", color: "#8a3a6a", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{tipoSaudeLabel[s.tipo] || s.tipo}</span></td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{s.produto || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{s.animal_brinco || s.lote_nome || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{new Date(s.data_evento).toLocaleDateString("pt-BR")}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {s.proximo_em ? (
                          <span style={{ color: new Date(s.proximo_em) < new Date() ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                            {new Date(s.proximo_em).toLocaleDateString("pt-BR")}
                          </span>
                        ) : <span style={{ color: "#9ca3af" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA ALERTAS ── */}
        {aba === "alertas" && (
          <div>
            {alertas.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#16a34a", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", fontWeight: 600 }}>
                ✅ Nenhum alerta pendente.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {alertas.map(al => (
                  <div key={al.id} style={{
                    background: "#fff", border: `1px solid ${al.prioridade === "alta" ? "#fca5a5" : al.prioridade === "media" ? "#fcd34d" : "#d1d5db"}`,
                    borderLeft: `4px solid ${al.prioridade === "alta" ? "#dc2626" : al.prioridade === "media" ? "#f59e0b" : "#6b7280"}`,
                    borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{al.titulo}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {al.animal_brinco && `Animal: ${al.animal_brinco} · `}
                        {al.lote_nome && `Lote: ${al.lote_nome} · `}
                        <span style={{ fontWeight: 600, color: al.prioridade === "alta" ? "#dc2626" : al.prioridade === "media" ? "#f59e0b" : "#6b7280" }}>
                          {al.prioridade.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => resolverAlerta(al.id)}
                      style={{ padding: "6px 14px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                      ✓ Resolver
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modal de edição */}
      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#111827" }}>✏️ Editar Animal — {editando.brinco}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Brinco</label>
                <input value={editando.brinco || ""} onChange={e => setEditando((p: any) => ({ ...p, brinco: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Sexo</label>
                <select value={editando.sexo || "F"} onChange={e => setEditando((p: any) => ({ ...p, sexo: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="F">Fêmea</option>
                  <option value="M">Macho</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Categoria</label>
                <select value={editando.categoria || "leitao"} onChange={e => setEditando((p: any) => ({ ...p, categoria: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="leitao">Leitão</option>
                  <option value="creche">Creche</option>
                  <option value="recria">Recria</option>
                  <option value="terminacao">Terminação</option>
                  <option value="gestacao">Gestação</option>
                  <option value="maternidade">Maternidade</option>
                  <option value="matriz">Matriz</option>
                  <option value="cachaço">Cachaço</option>
                  <option value="descarte">Descarte</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Raça</label>
                <input value={editando.raca || ""} onChange={e => setEditando((p: any) => ({ ...p, raca: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Lote</label>
                <select value={editando.lote_id || ""} onChange={e => setEditando((p: any) => ({ ...p, lote_id: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}>
                  <option value="">Sem lote</option>
                  {lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Registrar Pesagem (kg)</label>
                <input type="number" step="0.1" placeholder="Ex: 85.5" value={editando.novo_peso || ""} onChange={e => setEditando((p: any) => ({ ...p, novo_peso: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            {msgEdit && <div style={{ marginTop: 10, fontSize: 13, color: msgEdit.includes("sucesso") ? "#16a34a" : "#dc2626" }}>{msgEdit}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={salvarEdicao} disabled={salvandoEdit}
                style={{ flex: 1, padding: "10px", background: "#8a3a6a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: salvandoEdit ? 0.6 : 1 }}>
                {salvandoEdit ? "Salvando..." : "Salvar"}
              </button>
              <button onClick={() => { setEditando(null); setMsgEdit(""); }}
                style={{ flex: 1, padding: "10px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
