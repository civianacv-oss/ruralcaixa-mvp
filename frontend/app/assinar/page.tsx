"use client"
import { useEffect, useState } from "react"

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app"

const TIPO_LABEL: Record<string, string> = {
  agricola: "Parceria Agricola",
  pecuaria: "Parceria Pecuaria",
  agroindustrial: "Parceria Agroindustrial",
  extrativa: "Parceria Extrativa",
  condominio: "Condominio Rural",
}

const STATUS_COLOR: Record<string, string> = {
  pendente: "#f59e0b",
  ativo: "#16a34a",
  encerrado: "#6b7280",
  cancelado: "#dc2626",
}

type Contrato = {
  id: string
  tipo: string
  status: string
  outorgante_nome: string
  outorgado_nome: string
  data_inicio: string
  data_fim: string
  assinaturas_concluidas: number
  assinaturas_total: number
}

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState("")

  useEffect(() => {
    fetch(`${API}/contratos/`)
      .then(r => r.json())
      .then(data => { setContratos(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => { setErro("Erro ao carregar contratos."); setLoading(false) })
  }, [])

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 20, borderBottom: "2px solid #16a34a", paddingBottom: 12 }}>
        <a href="/" style={{ fontSize: 12, color: "#6b7280", textDecoration: "none", display: "block", marginBottom: 8 }}>
          &larr; Painel Principal
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#15803d", margin: 0 }}>Contratos Rurais</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Parceria agricola, pecuaria e condominio rural</p>
      </div>

      {loading && <div style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>Carregando contratos...</div>}
      {erro && <div style={{ color: "#dc2626", padding: 16, background: "#fee2e2", borderRadius: 8 }}>{erro}</div>}

      {!loading && !erro && contratos.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhum contrato cadastrado</div>
          <div style={{ fontSize: 13 }}>Os contratos rurais aparecerão aqui quando criados.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {contratos.map(c => (
          <div key={c.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
                  {TIPO_LABEL[c.tipo] || c.tipo}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                  {c.outorgante_nome} &rarr; {c.outorgado_nome}
                </div>
              </div>
              <span style={{
                padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                background: (STATUS_COLOR[c.status] || "#6b7280") + "22",
                color: STATUS_COLOR[c.status] || "#6b7280"
              }}>
                {c.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              <span>Inicio: {c.data_inicio ? new Date(c.data_inicio).toLocaleDateString("pt-BR") : "-"}</span>
              <span>Fim: {c.data_fim ? new Date(c.data_fim).toLocaleDateString("pt-BR") : "-"}</span>
              <span>Assinaturas: {c.assinaturas_concluidas}/{c.assinaturas_total}</span>
            </div>
            <a href={`/assinar/${c.id}`} style={{
              display: "inline-block", padding: "6px 16px", background: "#16a34a",
              color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none"
            }}>
              Ver contrato
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}