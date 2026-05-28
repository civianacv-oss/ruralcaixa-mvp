"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const IMOVEL_ID = 1;

type Animal = {
  id: number;
  brinco: string;
  sexo: string;
  raca: string | null;
  status: string;
  lote_nome: string | null;
  ultimo_peso: number | null;
  data_ultimo_peso: string | null;
  data_nascimento: string | null;
};

type Lote = {
  id: number;
  nome: string;
  fase: string;
  total_animais: number;
};

type Dashboard = {
  rebanho: { total_ativo: number; matrizes: number; reprodutores: number };
  abates_30d: { total_abatidos: number; media_carcaca_kg: number | null; media_rendimento_pct: number | null; receita_total_rs: number | null };
  partos_30d: { total_partos: number; cordeiros_vivos: number | null; cordeiros_mortos: number | null };
  alertas_7d: { total_alertas: number };
};

type Alerta = {
  id: number;
  tipo: string;
  data_evento: string;
  produto: string | null;
  proximo_em: string;
  animal_brinco: string | null;
  lote_nome: string | null;
};

export default function OvinoDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [aba, setAba] = useState<"rebanho" | "lotes" | "alertas">("rebanho");
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [novoAnimal, setNovoAnimal] = useState({ brinco: "", sexo: "F", raca: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [dash, anim, lots, alert] = await Promise.all([
        fetch(`${API}/ovino/dashboard/${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/ovino/animais?imovel_id=${IMOVEL_ID}&status=ativo`).then(r => r.json()),
        fetch(`${API}/ovino/lotes?imovel_id=${IMOVEL_ID}`).then(r => r.json()),
        fetch(`${API}/ovino/saude/alertas?imovel_id=${IMOVEL_ID}&dias_antecedencia=14`).then(r => r.json()),
      ]);
      setDashboard(dash);
      setAnimais(anim);
      setLotes(lots);
      setAlertas(alert);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function cadastrarAnimal() {
    if (!novoAnimal.brinco) return;
    setSalvando(true);
    try {
      const r = await fetch(`${API}/ovino/animais`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imovel_id: IMOVEL_ID, brinco: novoAnimal.brinco, sexo: novoAnimal.sexo, raca: novoAnimal.raca || null }),
      });
      if (r.ok) {
        setMsg("Animal cadastrado com sucesso!");
        setNovoAnimal({ brinco: "", sexo: "F", raca: "" });
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

  const faseLabel: Record<string, string> = {
    cria: "🐑 Cria", recria: "📈 Recria", engorda: "💪 Engorda",
    reprodução: "❤️ Reprodução", descarte: "⚠️ Descarte",
  };

  const tipoLabel: Record<string, string> = {
    vacinacao: "💉 Vacinação", vermifugacao: "🧪 Vermifugação",
    famacha: "👁️ FAMACHA", tratamento: "🏥 Tratamento",
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", color: "#6b7280", fontSize: 16 }}>
      Carregando módulo ovino...
    </div>
  );

  return (
    <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 20, borderBottom: "2px solid #16a34a", paddingBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#15803d", margin: 0 }}>🐑 Ovino de Corte</h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>Fazenda Boa Esperança — Imóvel #{IMOVEL_ID}</p>
      </div>

      {/* KPI Cards */}
      {dashboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Rebanho Ativo", value: dashboard.rebanho.total_ativo, icon: "🐑", color: "#16a34a" },
            { label: "Matrizes", value: dashboard.rebanho.matrizes, icon: "♀️", color: "#9333ea" },
            { label: "Partos 30d", value: dashboard.partos_30d.total_partos, icon: "🍼", color: "#ea580c" },
            { label: "Alertas", value: dashboard.alertas_7d.total_alertas, icon: "⚠️", color: dashboard.alertas_7d.total_alertas > 0 ? "#dc2626" : "#16a34a" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 24 }}>{k.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Abates 30d */}
      {dashboard && dashboard.abates_30d.total_abatidos > 0 && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 24 }}>
          <div><span style={{ fontWeight: 600, color: "#15803d" }}>Abates (30d): </span>{dashboard.abates_30d.total_abatidos}</div>
          {dashboard.abates_30d.media_rendimento_pct && <div><span style={{ fontWeight: 600, color: "#15803d" }}>Rendimento médio: </span>{dashboard.abates_30d.media_rendimento_pct}%</div>}
          {dashboard.abates_30d.receita_total_rs && <div><span style={{ fontWeight: 600, color: "#15803d" }}>Receita: </span>R$ {Number(dashboard.abates_30d.receita_total_rs).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>}
        </div>
      )}

      {/* Abas */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["rebanho", "lotes", "alertas"] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
            background: aba === a ? "#16a34a" : "#f3f4f6", color: aba === a ? "#fff" : "#374151",
          }}>
            {a === "rebanho" ? "🐑 Rebanho" : a === "lotes" ? "📦 Lotes" : `⚠️ Alertas${alertas.length > 0 ? ` (${alertas.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Aba Rebanho */}
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
              <input placeholder="Raça" value={novoAnimal.raca} onChange={e => setNovoAnimal(p => ({ ...p, raca: e.target.value }))}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14, width: 140 }} />
              <button onClick={cadastrarAnimal} disabled={salvando || !novoAnimal.brinco}
                style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                {salvando ? "..." : "Cadastrar"}
              </button>
              {msg && <span style={{ alignSelf: "center", fontSize: 13, color: msg.includes("sucesso") ? "#16a34a" : "#dc2626" }}>{msg}</span>}
            </div>
          </div>

          {/* Lista de animais */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                  {["Brinco", "Sexo", "Raça", "Lote", "Último Peso", "Data Peso", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {animais.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#15803d" }}>{a.brinco}</td>
                    <td style={{ padding: "10px 12px" }}>{a.sexo === "F" ? "♀️ Fêmea" : "♂️ Macho"}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>{a.raca || "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>{a.lote_nome || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{a.ultimo_peso ? `${a.ultimo_peso} kg` : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>{a.data_ultimo_peso ? new Date(a.data_ultimo_peso).toLocaleDateString("pt-BR") : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: a.status === "ativo" ? "#dcfce7" : "#fee2e2", color: a.status === "ativo" ? "#15803d" : "#dc2626" }}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {animais.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Nenhum animal cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aba Lotes */}
      {aba === "lotes" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {lotes.map(l => (
            <div key={l.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{l.nome}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{faseLabel[l.fase] || l.fase}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>{l.total_animais}</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>animais ativos</div>
            </div>
          ))}
          {lotes.length === 0 && <p style={{ color: "#9ca3af", gridColumn: "1/-1" }}>Nenhum lote cadastrado.</p>}
        </div>
      )}

      {/* Aba Alertas */}
      {aba === "alertas" && (
        <div>
          {alertas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#16a34a", fontSize: 15 }}>
              ✅ Nenhum manejo pendente nos próximos 14 dias.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {alertas.map(a => (
                <div key={a.id} style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{tipoLabel[a.tipo] || a.tipo}</div>
                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                      {a.animal_brinco ? `Animal: ${a.animal_brinco}` : a.lote_nome ? `Lote: ${a.lote_nome}` : "Rebanho geral"}
                      {a.produto && ` — ${a.produto}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#dc2626" }}>
                      {new Date(a.proximo_em).toLocaleDateString("pt-BR")}
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>próximo manejo</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
