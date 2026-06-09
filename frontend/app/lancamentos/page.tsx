"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const PRODUTOR_ID = 1;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

type Lancamento = {
  id: string | number;
  tipo: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  produto: string | null;
  atividade: string | null;
  documento_url: string | null;
  confirmado: boolean;
};

const CONTAS_RECEITA = [
  "Venda de bovinos",
  "Venda de ovinos",
  "Venda de suínos",
  "Venda de produtos agrícolas",
  "Serviços prestados",
  "Arrendamento recebido",
  "Outras receitas",
];
const CONTAS_DESPESA = [
  "Custeio agrícola",
  "Combustíveis",
  "Mão de obra",
  "Manutenção",
  "Energia elétrica",
  "Arrendamento pago",
  "Medicamentos / Sanidade",
  "Alimentação animal",
  "Outras despesas",
];

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "receita" | "despesa" | "investimento">("todos");
  const [filtroMes, setFiltroMes] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipo: "despesa",
    descricao: "",
    valor: "",
    data: new Date().toISOString().slice(0, 10),
    atividade: "rural",
  });
  const [successMsg, setSuccessMsg] = useState("");

  function carregarLancamentos(mes?: string) {
    setLoading(true);
    const mesParam = mes ? `?mes=${mes}` : "";
    fetch(`${API}/produtores/${PRODUTOR_ID}/lancamentos${mesParam}`)
      .then(r => r.json())
      .then(data => {
        setLancamentos(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    carregarLancamentos(filtroMes || undefined);
  }, [filtroMes]);

  const filtrados = lancamentos.filter(l =>
    filtroTipo === "todos" ? true : l.tipo === filtroTipo
  );

  const totalReceitas = lancamentos.filter(l => l.tipo === "receita").reduce((s, l) => s + l.valor, 0);
  const totalDespesas = lancamentos.filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
  const saldo = totalReceitas - totalDespesas;

  async function handleSalvar() {
    if (!form.descricao || !form.valor || !form.data) return;
    setSaving(true);
    try {
      const payload = {
        produtor_id: PRODUTOR_ID,
        valor: parseFloat(form.valor.replace(",", ".")),
        data: form.data,
        origem: form.atividade,
        tipo: form.tipo,
        descricao: form.descricao,
        confirmado: true,
        atividade: form.atividade,
      };
      const res = await fetch(`${API}/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowModal(false);
        setForm({ tipo: "despesa", descricao: "", valor: "", data: new Date().toISOString().slice(0, 10), atividade: "rural" });
        setSuccessMsg("Lançamento salvo com sucesso!");
        setTimeout(() => setSuccessMsg(""), 3000);
        carregarLancamentos(filtroMes || undefined);
      }
    } finally {
      setSaving(false);
    }
  }

  const contasSugeridas = form.tipo === "receita" ? CONTAS_RECEITA : CONTAS_DESPESA;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e4dc", padding: "16px 28px", display: "flex", alignItems: "center", gap: 16 }}>
        <a href="/" style={{ color: "#5a8a3a", textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Dashboard
        </a>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a2e1a" }}>Lançamentos Financeiros</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            marginLeft: "auto", background: "#3a6a2a", color: "#fff", border: "none",
            padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Lançamento
        </button>
      </div>

      <div style={{ padding: "24px 28px" }}>
        {/* Mensagem de sucesso */}
        {successMsg && (
          <div style={{ background: "#d4edda", border: "1px solid #c3e6cb", color: "#155724", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ✅ {successMsg}
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Receitas", value: fmtBRL(totalReceitas), color: "#2d7a2d", bg: "#f0faf0", icon: "📈" },
            { label: "Despesas", value: fmtBRL(totalDespesas), color: "#c0392b", bg: "#fff5f5", icon: "📉" },
            { label: "Saldo", value: fmtBRL(saldo), color: saldo >= 0 ? "#2d7a2d" : "#c0392b", bg: saldo >= 0 ? "#f0faf0" : "#fff5f5", icon: "💰" },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 12, color: "#7a8a6a", marginBottom: 4 }}>{k.icon} {k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["todos", "receita", "despesa", "investimento"] as const).map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)} style={{
                padding: "6px 14px", borderRadius: 20, border: "1.5px solid",
                borderColor: filtroTipo === t ? "#3a6a2a" : "#e0dbd0",
                background: filtroTipo === t ? "#3a6a2a" : "#fff",
                color: filtroTipo === t ? "#fff" : "#5a6a5a",
                fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
              }}>
                {t === "todos" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#7a8a6a" }}>Mês:</label>
            <input
              type="month"
              value={filtroMes}
              onChange={e => setFiltroMes(e.target.value)}
              style={{ border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#1a2e1a" }}
            />
            {filtroMes && (
              <button onClick={() => setFiltroMes("")} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12 }}>
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e8e4dc" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#7a8a6a", fontSize: 14 }}>
              Carregando lançamentos...
            </div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a2e1a", marginBottom: 6 }}>Nenhum lançamento encontrado</div>
              <div style={{ fontSize: 13, color: "#7a8a6a", marginBottom: 20 }}>
                {filtroMes ? "Tente outro mês ou " : ""}Envie uma mensagem pelo WhatsApp ou clique em "Novo Lançamento".
              </div>
              <button onClick={() => setShowModal(true)} style={{
                background: "#3a6a2a", color: "#fff", border: "none",
                padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                + Novo Lançamento
              </button>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f6f2", borderBottom: "1px solid #e8e4dc" }}>
                  {["Data", "Descrição", "Tipo", "Valor", "Atividade", "Doc"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#7a8a6a", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #f0ece4", background: i % 2 === 0 ? "#fff" : "#fdfcfa" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#5a6a5a", whiteSpace: "nowrap" }}>
                      {fmtDate(l.data_lancamento)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#1a2e1a", maxWidth: 220 }}>
                      {l.descricao || l.produto || "-"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: l.tipo === "receita" ? "#d4edda" : l.tipo === "despesa" ? "#f8d7da" : "#fff3cd",
                        color: l.tipo === "receita" ? "#155724" : l.tipo === "despesa" ? "#721c24" : "#856404",
                      }}>
                        {l.tipo?.toUpperCase() || "-"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: l.tipo === "receita" ? "#2d7a2d" : "#c0392b", whiteSpace: "nowrap" }}>
                      {l.tipo === "receita" ? "+" : "-"}{fmtBRL(l.valor)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#7a8a6a" }}>
                      {l.atividade || "rural"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {l.documento_url ? (
                        <a href={l.documento_url} target="_blank" rel="noreferrer" style={{ color: "#3a6a2a", fontSize: 12 }}>📎 Ver</a>
                      ) : (
                        <span style={{ color: "#ccc", fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#9a9a8a" }}>
          {filtrados.length} lançamento{filtrados.length !== 1 ? "s" : ""} {filtroMes ? `em ${filtroMes}` : "no mês atual"}
        </div>
      </div>

      {/* Modal Novo Lançamento */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 480,
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1a2e1a" }}>Novo Lançamento</h2>
              <button onClick={() => setShowModal(false)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9a9a8a" }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Tipo */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 6 }}>TIPO</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["receita", "despesa", "investimento"].map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, tipo: t, descricao: "" }))} style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid",
                      borderColor: form.tipo === t ? "#3a6a2a" : "#e0dbd0",
                      background: form.tipo === t ? "#3a6a2a" : "#fff",
                      color: form.tipo === t ? "#fff" : "#5a6a5a",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                    }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 6 }}>DESCRIÇÃO / CONTA</label>
                <input
                  list="contas-sugeridas"
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Venda de bovinos, Combustíveis..."
                  style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box" }}
                />
                <datalist id="contas-sugeridas">
                  {contasSugeridas.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              {/* Valor */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 6 }}>VALOR (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder="0,00"
                  style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box" }}
                />
              </div>

              {/* Data */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 6 }}>DATA</label>
                <input
                  type="date"
                  value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box" }}
                />
              </div>

              {/* Atividade */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a5a", display: "block", marginBottom: 6 }}>ATIVIDADE</label>
                <select
                  value={form.atividade}
                  onChange={e => setForm(f => ({ ...f, atividade: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a2e1a", boxSizing: "border-box" }}
                >
                  <option value="rural">Rural</option>
                  <option value="pecuaria">Pecuária</option>
                  <option value="agricultura">Agricultura</option>
                  <option value="investimento">Investimento</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowModal(false)} style={{
                flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid #e0dbd0",
                background: "#fff", color: "#5a6a5a", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={saving || !form.descricao || !form.valor || !form.data}
                style={{
                  flex: 2, padding: "10px 0", borderRadius: 8, border: "none",
                  background: saving ? "#8ab88a" : "#3a6a2a", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Salvando..." : "Salvar Lançamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
