"use client"
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react"

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app"

const TIPO_OPTIONS = [
  { value: "agricola", label: "Parceria Agricola" },
  { value: "pecuaria", label: "Parceria Pecuaria" },
  { value: "agroindustrial", label: "Parceria Agroindustrial" },
  { value: "extrativa", label: "Parceria Extrativa" },
  { value: "condominio", label: "Condominio Rural" },
]

const FREQ_OPTIONS = [
  { value: "safra", label: "Por Safra" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
  { value: "semestral", label: "Semestral" },
]

const STATUS_COLOR: Record<string, string> = {
  pendente: "#f59e0b", ativo: "#16a34a", encerrado: "#6b7280", cancelado: "#dc2626",
}

type Contrato = {
  id: string; tipo: string; status: string
  outorgante_nome: string; outorgado_nome: string
  data_inicio: string; data_fim: string
  assinaturas_concluidas: number; assinaturas_total: number
}

type Socio = { id: number; nome: string }

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #d1d5db",
  borderRadius: 6, fontSize: 14, boxSizing: "border-box" as const,
}

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [socios, setSocios] = useState<Socio[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")
  const [form, setForm] = useState({
    tipo: "pecuaria", data_inicio: "", data_fim: "",
    percentual_outorgante: "50", percentual_outorgado: "50",
    frequencia_pagamento: "safra", area_parceria_hectares: "",
    outorgante_socio_id: "", outorgado_socio_id: "",
    outorgante_nome: "", outorgante_cpf: "",
    outorgado_nome: "", outorgado_cpf: "",
    outorgante_tipo: "socio", outorgado_tipo: "socio",
  })

  const carregar = () => {
    apiFetch(`${API}/contratos/`)
      .then(r => r.json())
      .then(data => { setContratos(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => { setLoading(false) })
  }

  useEffect(() => {
    carregar()
    apiFetch(`${API}/produtores`).then(r => r.json())
      .then(data => setSocios(Array.isArray(data) ? data.map((p: any) => ({ id: p.id, nome: p.nome })) : []))
      .catch(() => {})
  }, [])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const salvar = async () => {
    setSalvando(true); setErro("")
    try {
      const body: any = {
        fazenda_id: 1,
        tipo: form.tipo,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        percentual_outorgante: parseFloat(form.percentual_outorgante),
        percentual_outorgado: parseFloat(form.percentual_outorgado),
        frequencia_pagamento: form.frequencia_pagamento,
        area_parceria_hectares: form.area_parceria_hectares ? parseFloat(form.area_parceria_hectares) : null,
      }
      if (form.outorgante_tipo === "socio") body.outorgante_socio_id = parseInt(form.outorgante_socio_id)
      else body.outorgante_externo = { nome: form.outorgante_nome, cpf_cnpj: form.outorgante_cpf }
      if (form.outorgado_tipo === "socio") body.outorgado_socio_id = parseInt(form.outorgado_socio_id)
      else body.outorgado_externo = { nome: form.outorgado_nome, cpf_cnpj: form.outorgado_cpf }

      const r = await apiFetch(`${API}/contratos/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Erro ao salvar") }
      setModal(false); carregar()
    } catch (e: any) { setErro(e.message) }
    setSalvando(false)
  }

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 20, borderBottom: "2px solid #16a34a", paddingBottom: 12 }}>
        <a href="/" style={{ fontSize: 12, color: "#6b7280", textDecoration: "none", display: "block", marginBottom: 8 }}>
          &larr; Painel Principal
        </a>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#15803d", margin: 0 }}>Contratos Rurais</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Parceria agricola, pecuaria e condominio rural</p>
          </div>
          <button onClick={() => setModal(true)} style={{
            padding: "8px 16px", background: "#16a34a", color: "#fff",
            border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14,
          }}>+ Novo Contrato</button>
        </div>
      </div>

      {loading && <div style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>Carregando...</div>}

      {!loading && contratos.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhum contrato cadastrado</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Clique em "+ Novo Contrato" para comecar.</div>
          <button onClick={() => setModal(true)} style={{
            padding: "10px 24px", background: "#16a34a", color: "#fff",
            border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer",
          }}>+ Novo Contrato</button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {contratos.map(c => (
          <div key={c.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{TIPO_OPTIONS.find(t => t.value === c.tipo)?.label || c.tipo}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{c.outorgante_nome} &rarr; {c.outorgado_nome}</div>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                background: (STATUS_COLOR[c.status] || "#6b7280") + "22", color: STATUS_COLOR[c.status] || "#6b7280" }}>
                {c.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              <span>{c.data_inicio ? new Date(c.data_inicio).toLocaleDateString("pt-BR") : "-"} ate {c.data_fim ? new Date(c.data_fim).toLocaleDateString("pt-BR") : "-"}</span>
              <span>Assinaturas: {c.assinaturas_concluidas}/{c.assinaturas_total}</span>
            </div>
            <a href={`/assinar/${c.id}`} style={{ display: "inline-block", padding: "6px 16px", background: "#16a34a",
              color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Ver contrato
            </a>
          </div>
        ))}
      </div>

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 500,
            maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Novo Contrato Rural</h2>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>x</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Tipo de Contrato</label>
                <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={inp}>
                  {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Data Inicio</label>
                  <input type="date" value={form.data_inicio} onChange={e => set("data_inicio", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Data Fim</label>
                  <input type="date" value={form.data_fim} onChange={e => set("data_fim", e.target.value)} style={inp} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>% Outorgante</label>
                  <input type="number" value={form.percentual_outorgante} onChange={e => set("percentual_outorgante", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>% Outorgado</label>
                  <input type="number" value={form.percentual_outorgado} onChange={e => set("percentual_outorgado", e.target.value)} style={inp} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Frequencia Pagamento</label>
                  <select value={form.frequencia_pagamento} onChange={e => set("frequencia_pagamento", e.target.value)} style={inp}>
                    {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Area (hectares)</label>
                  <input type="number" placeholder="Opcional" value={form.area_parceria_hectares} onChange={e => set("area_parceria_hectares", e.target.value)} style={inp} />
                </div>
              </div>

              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Outorgante (quem cede)</label>
                <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
                  <button onClick={() => set("outorgante_tipo", "socio")} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: form.outorgante_tipo === "socio" ? "#16a34a" : "#fff", color: form.outorgante_tipo === "socio" ? "#fff" : "#374151", cursor: "pointer", fontSize: 13 }}>Produtor cadastrado</button>
                  <button onClick={() => set("outorgante_tipo", "externo")} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: form.outorgante_tipo === "externo" ? "#16a34a" : "#fff", color: form.outorgante_tipo === "externo" ? "#fff" : "#374151", cursor: "pointer", fontSize: 13 }}>Externo</button>
                </div>
                {form.outorgante_tipo === "socio" ? (
                  <select value={form.outorgante_socio_id} onChange={e => set("outorgante_socio_id", e.target.value)} style={inp}>
                    <option value="">Selecione...</option>
                    {socios.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Nome completo" value={form.outorgante_nome} onChange={e => set("outorgante_nome", e.target.value)} style={inp} />
                    <input placeholder="CPF/CNPJ" value={form.outorgante_cpf} onChange={e => set("outorgante_cpf", e.target.value)} style={{ ...inp, width: 140 }} />
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Outorgado (quem recebe)</label>
                <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
                  <button onClick={() => set("outorgado_tipo", "socio")} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: form.outorgado_tipo === "socio" ? "#16a34a" : "#fff", color: form.outorgado_tipo === "socio" ? "#fff" : "#374151", cursor: "pointer", fontSize: 13 }}>Produtor cadastrado</button>
                  <button onClick={() => set("outorgado_tipo", "externo")} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: form.outorgado_tipo === "externo" ? "#16a34a" : "#fff", color: form.outorgado_tipo === "externo" ? "#fff" : "#374151", cursor: "pointer", fontSize: 13 }}>Externo</button>
                </div>
                {form.outorgado_tipo === "socio" ? (
                  <select value={form.outorgado_socio_id} onChange={e => set("outorgado_socio_id", e.target.value)} style={inp}>
                    <option value="">Selecione...</option>
                    {socios.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Nome completo" value={form.outorgado_nome} onChange={e => set("outorgado_nome", e.target.value)} style={inp} />
                    <input placeholder="CPF/CNPJ" value={form.outorgado_cpf} onChange={e => set("outorgado_cpf", e.target.value)} style={{ ...inp, width: 140 }} />
                  </div>
                )}
              </div>

              {erro && <div style={{ color: "#dc2626", fontSize: 13, background: "#fee2e2", padding: "8px 12px", borderRadius: 6 }}>{erro}</div>}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setModal(false)} style={{ flex: 1, padding: "10px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: "10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                  {salvando ? "Salvando..." : "Criar Contrato"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
