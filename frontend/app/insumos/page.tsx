"use client";
import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const PRODUTOR_ID = typeof window !== "undefined" ? Number(localStorage.getItem("rc_produtor_id") || 1) : 1;

type Insumo = {
  id: number; nome: string; categoria: string; origem: string;
  unidade: string; estoque_atual: number; estoque_minimo: number;
  preco_unitario: number; fornecedor_id: number | null;
};

const CATEGORIAS = ["semente","fertilizante","defensivo","medicamento","racao","combustivel","outros"];

export default function InsumosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nome: "", categoria: "racao", origem: "comprado", unidade: "kg", estoque_atual: "", estoque_minimo: "", preco_unitario: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{text: string; tipo: "ok"|"err"} | null>(null);

  function showMsg(text: string, tipo: "ok"|"err" = "ok") {
    setMsg({ text, tipo });
    setTimeout(() => setMsg(null), 3000);
  }

  function carregar() {
    setLoading(true);
    fetch(`${API}/insumos/`, { headers: { "X-Produtor-ID": String(PRODUTOR_ID) } })
      .then(r => r.json())
      .then(d => { setInsumos(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/insumos/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Produtor-ID": String(PRODUTOR_ID) },
        body: JSON.stringify({
          nome: form.nome,
          categoria: form.categoria,
          origem: form.origem,
          unidade: form.unidade,
          estoque_atual: Number(form.estoque_atual) || 0,
          estoque_minimo: Number(form.estoque_minimo) || 0,
          preco_unitario: Number(form.preco_unitario) || 0,
        }),
      });
      if (res.ok) { setShowModal(false); showMsg("Insumo cadastrado!"); carregar(); }
      else showMsg("Erro ao salvar.", "err");
    } finally { setSaving(false); }
  }

  const alertas = insumos.filter(i => i.estoque_atual <= i.estoque_minimo);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e4dc", padding: "14px 28px", display: "flex", alignItems: "center", gap: 12 }}>
        <a href="/" style={{ color: "#5a8a3a", fontSize: 13, textDecoration: "none", border: "1px solid #d0e8c0", borderRadius: 8, padding: "4px 10px" }}>🏠 Painel</a>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a2e1a" }}>Gestão de Insumos</h1>
        <button onClick={() => setShowModal(true)} style={{ marginLeft: "auto", background: "#3a6a2a", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + Novo Insumo
        </button>
      </div>

      <div style={{ padding: "24px 28px" }}>
        {msg && (
          <div style={{ background: msg.tipo === "ok" ? "#d4edda" : "#f8d7da", border: `1px solid ${msg.tipo === "ok" ? "#c3e6cb" : "#f5c6cb"}`, color: msg.tipo === "ok" ? "#155724" : "#721c24", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {msg.tipo === "ok" ? "✅" : "⚠️"} {msg.text}
          </div>
        )}

        {alertas.length > 0 && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 12, padding: "12px 20px", marginBottom: 20 }}>
            <strong>⚠️ {alertas.length} insumo(s) abaixo do estoque mínimo:</strong>{" "}
            {alertas.map(a => a.nome).join(", ")}
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e8e4dc" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#7a8a6a" }}>Carregando...</div>
          ) : insumos.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a2e1a" }}>Nenhum insumo cadastrado</div>
              <button onClick={() => setShowModal(true)} style={{ marginTop: 16, background: "#3a6a2a", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Cadastrar Primeiro Insumo
              </button>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8f6f2", borderBottom: "1px solid #e8e4dc" }}>
                  {["Nome", "Categoria", "Estoque", "Mínimo", "Preço/Un", "Status"].map((h, i) => (
                    <th key={i} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#7a8a6a", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insumos.map((ins, i) => (
                  <tr key={ins.id} style={{ borderBottom: "1px solid #f0ece4", background: i % 2 === 0 ? "#fff" : "#fdfcfa" }}>
                    <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: "#1a2e1a" }}>{ins.nome}</td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: "#5a6a5a" }}>{ins.categoria}</td>
                    <td style={{ padding: "11px 16px", fontSize: 13 }}>{ins.estoque_atual} {ins.unidade}</td>
                    <td style={{ padding: "11px 16px", fontSize: 13, color: "#7a8a6a" }}>{ins.estoque_minimo} {ins.unidade}</td>
                    <td style={{ padding: "11px 16px", fontSize: 13 }}>R$ {Number(ins.preco_unitario).toFixed(2)}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: ins.estoque_atual <= ins.estoque_minimo ? "#f8d7da" : "#d4edda", color: ins.estoque_atual <= ins.estoque_minimo ? "#721c24" : "#155724" }}>
                        {ins.estoque_atual <= ins.estoque_minimo ? "⚠️ Baixo" : "✅ OK"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Novo Insumo</h2>
              <button onClick={() => setShowModal(false)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9a9a8a" }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "NOME", key: "nome", type: "text", placeholder: "Ex: Ração bovino adulto" },
                { label: "ESTOQUE ATUAL", key: "estoque_atual", type: "number", placeholder: "0" },
                { label: "ESTOQUE MÍNIMO", key: "estoque_minimo", type: "number", placeholder: "0" },
                { label: "PREÇO UNITÁRIO (R$)", key: "preco_unitario", type: "number", placeholder: "0.00" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 4 }}>CATEGORIA</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 4 }}>UNIDADE</label>
                <select value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
                  {["kg","sc","L","un","cx","t"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid #e0dbd0", background: "#fff", color: "#5a6a5a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvar} disabled={saving || !form.nome} style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: saving || !form.nome ? "#8ab88a" : "#3a6a2a", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}