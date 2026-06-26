"use client";
import React from "react";
// v2-condominio
"use client"
// página pública — usa fetch sem token

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app"

type Contrato = {
  id: string
  tipo: string
  status: string
  outorgante_nome: string
  outorgado_nome: string
  percentual_outorgante: number
  percentual_outorgado: number
  data_inicio: string
  data_fim: string
  area_parceria_hectares: number | null
  frequencia_pagamento: string
  assinaturas_concluidas: number
  assinaturas_total: number
  pdf_url: string | null
}

type Assinatura = {
  papel: string
  status: string
  assinado_em: string | null
  socio_nome: string | null
  parceiro_nome: string | null
}

type Step = "carregando" | "revisao" | "otp" | "sucesso" | "erro" | "ja_assinado"

const TIPO_LABEL: Record<string, string> = {
  agricola: "Parceria Agrícola",
  pecuaria: "Parceria Pecuária",
  agroindustrial: "Parceria Agroindustrial",
  extrativa: "Parceria Extrativa",
  condominio: "Constituição de Condomínio Rural",
}

function iconCircle(bg: string): React.CSSProperties {
  return {
    width: 64, height: 64, borderRadius: "50%", background: bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 12px",
  }
}

function fmtData(d: string) {
  if (!d) return "—"
  return d.split("T")[0].split("-").reverse().join("/")
}

function ContratoResumo({ contrato, papel }: { contrato: Contrato; papel: string }) {
  const meuPerc = papel === "outorgante" ? contrato.percentual_outorgante : contrato.percentual_outorgado
  return (
    <div style={s.resumoBox}>
      <div style={s.resumoRow}><span style={s.resumoLabel}>Outorgante</span><span style={s.resumoValue}>{contrato.outorgante_nome || "—"}</span></div>
      <div style={s.resumoRow}><span style={s.resumoLabel}>Outorgado</span><span style={s.resumoValue}>{contrato.outorgado_nome || "—"}</span></div>
      <div style={s.resumoRow}><span style={s.resumoLabel}>Vigência</span><span style={s.resumoValue}>{fmtData(contrato.data_inicio)} → {fmtData(contrato.data_fim)}</span></div>
      {contrato.area_parceria_hectares && (
        <div style={s.resumoRow}><span style={s.resumoLabel}>Área</span><span style={s.resumoValue}>{contrato.area_parceria_hectares} ha</span></div>
      )}
      <div style={{ ...s.resumoRow, borderBottom: "none" }}>
        <span style={s.resumoLabel}>Sua participação</span>
        <span style={{ ...s.resumoValue, fontWeight: 700, color: "#1B4D2E", fontSize: 18 }}>{Number(meuPerc).toFixed(2)}%</span>
      </div>
    </div>
  )
}

export default function AssinarPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const contratoId = params.contrato_id as string
  const papel = searchParams.get("parte") || "outorgante"

  const [step, setStep] = useState<Step>("carregando")
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [telMascarado, setTelMascarado] = useState("")
  const [otp, setOtp] = useState("")
  const [erro, setErro] = useState("")
  const [loading, setLoading] = useState(false)
  const [consentiu, setConsentiu] = useState(false)

  useEffect(() => {
    fetch(`${API}/contratos/${contratoId}`).then(async r => {
        if (!r.ok) return r;
        const data = await r.json();
        // Busca condôminos se for condomínio
        if (data.tipo === "condominio") {
          try {
            const rc = await fetch(`${API}/contratos/${contratoId}/condominos`);
            if (rc.ok) { const rcd = await rc.json(); data.condominos = rcd.data || []; }
          } catch {}
        }
        return { ok: true, json: () => Promise.resolve(data) };
      })
      .then(r => r.json())
      .then(data => {
        if (data.detail) { setErro(data.detail); setStep("erro"); return }
        setContrato(data)
        const minha = (data.assinaturas || []).find((a: Assinatura) => a.papel === papel)
        setStep(minha?.status === "assinado" ? "ja_assinado" : "revisao")
      })
      .catch(() => { setErro("Não foi possível carregar o contrato."); setStep("erro") })
  }, [contratoId, papel])

  async function confirmarRevisao() {
    if (!consentiu) { setErro("Confirme que leu e concordou com os termos."); return }
    setErro("")
    try {
      const r = await fetch(`${API}/contratos/${contratoId}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const data = await r.json()
      const minha = data.partes_notificadas?.find((p: { papel: string; telefone_mascarado: string }) => p.papel === papel)
      if (minha?.telefone_mascarado) setTelMascarado(minha.telefone_mascarado)
    } catch { /* continua mesmo sem telefone mascarado */ }
    setStep("otp")
  }

  async function assinar() {
    if (otp.length !== 6) { setErro("Digite o código de 6 dígitos."); return }
    setLoading(true); setErro("")
    let geo = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      )
      geo = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch { /* opcional */ }
    try {
      const r = await fetch(`${API}/contratos/${contratoId}/assinar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papel, otp, geolocalizacao: geo }),
      })
      const data = await r.json()
      if (!r.ok) { setErro(data.detail || "Erro ao assinar."); setLoading(false); return }
      setStep("sucesso")
    } catch { setErro("Erro de conexão. Tente novamente.") }
    setLoading(false)
  }

  return (
    <main style={s.main}>
      <div style={s.card}>
        <div style={s.logo}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#1B4D2E"/>
            <path d="M8 22 L16 10 L24 22" stroke="#EAF3DE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 18 L20 18" stroke="#EAF3DE" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={s.logoText}>RuralCaixa</span>
        </div>

        {step === "carregando" && (
          <div style={s.center}>
            <div style={s.spinner} />
            <p style={s.muted}>Carregando contrato...</p>
          </div>
        )}

        {step === "erro" && (
          <div style={s.center}>
            <div style={iconCircle("#FCEBEB")}><span style={{ color: "#A32D2D", fontSize: 28 }}>✕</span></div>
            <h2 style={s.h2}>Contrato não encontrado</h2>
            <p style={s.muted}>{erro || "Verifique o link e tente novamente."}</p>
          </div>
        )}

        {step === "ja_assinado" && (
          <div style={s.center}>
            <div style={iconCircle("#EAF3DE")}><span style={{ color: "#3B6D11", fontSize: 28 }}>✓</span></div>
            <h2 style={s.h2}>Já assinado</h2>
            <p style={s.muted}>Você já assinou este contrato anteriormente.</p>
            {contrato && <ContratoResumo contrato={contrato} papel={papel} />}
          </div>
        )}

        {step === "revisao" && contrato && (
          <>
            <div style={s.badge}>Assinatura Eletrônica — Lei 14.063/2020</div>
            <h1 style={s.h1}>{TIPO_LABEL[contrato.tipo] || contrato.tipo}</h1>
            <p style={s.papel}>Você está assinando como <strong>{papel === "outorgante" ? "Outorgante" : "Outorgado"}</strong></p>
            <ContratoResumo contrato={contrato} papel={papel} />
            <div style={s.progressWrap}>
              <div style={s.progressLabel}>
                <span>Assinaturas</span>
                <span>{contrato.assinaturas_concluidas}/{contrato.assinaturas_total}</span>
              </div>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${contrato.assinaturas_total > 0 ? (contrato.assinaturas_concluidas / contrato.assinaturas_total) * 100 : 0}%` }} />
              </div>
            </div>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={consentiu} onChange={e => setConsentiu(e.target.checked)} style={{ marginRight: 10, width: 18, height: 18, accentColor: "#1B4D2E" }} />
              <span style={{ fontSize: 13, lineHeight: 1.5, color: "#444" }}>Li e concordo com os termos deste contrato. Autorizo a coleta do meu IP e localização para fins de assinatura eletrônica (Lei 14.063/2020 e LGPD).</span>
            </label>
            {erro && <p style={s.erroText}>{erro}</p>}
            <button style={s.btnPrimary} onClick={confirmarRevisao}>Continuar para assinatura →</button>
          </>
        )}

        {step === "otp" && (
          <>
            <div style={iconCircle("#EAF3DE")}><span style={{ fontSize: 28 }}>📱</span></div>
            <h2 style={s.h2}>Confirme sua identidade</h2>
            <p style={s.muted}>
              Código enviado para o WhatsApp <strong style={{ color: "#1B4D2E" }}>{telMascarado || "número cadastrado"}</strong>
            </p>
            <input type="number" inputMode="numeric" placeholder="000000" value={otp} onChange={e => setOtp(e.target.value.slice(0, 6))} style={s.otpInput} autoFocus />
            {erro && <p style={s.erroText}>{erro}</p>}
            <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} onClick={assinar} disabled={loading}>{loading ? "Verificando..." : "Assinar contrato"}</button>
            <button style={s.btnSecondary} onClick={() => { setStep("revisao"); setOtp(""); setErro("") }}>← Voltar</button>
            <p style={{ ...s.muted, fontSize: 12, marginTop: 16 }}>O código expira em 30 minutos.</p>
          </>
        )}

        {step === "sucesso" && (
          <>
            <div style={iconCircle("#EAF3DE")}><span style={{ color: "#3B6D11", fontSize: 36 }}>✓</span></div>
            <h2 style={{ ...s.h2, color: "#1B4D2E" }}>Assinatura registrada!</h2>
            <p style={s.muted}>Sua assinatura eletrônica foi registrada com validade jurídica nos termos da Lei nº 14.063/2020.</p>
            {contrato && (
              <div style={s.successBox}>
                <div style={s.successRow}><span style={s.successLabel}>Contrato</span><span style={s.successValue}>{TIPO_LABEL[contrato.tipo]}</span></div>
                <div style={s.successRow}><span style={s.successLabel}>Papel</span><span style={s.successValue}>{papel === "outorgante" ? "Outorgante" : "Outorgado"}</span></div>
                <div style={s.successRow}><span style={s.successLabel}>Data/hora</span><span style={s.successValue}>{new Date().toLocaleString("pt-BR")}</span></div>
                <div style={{ ...s.successRow, borderBottom: "none" }}><span style={s.successLabel}>Protocolo</span><span style={{ ...s.successValue, fontFamily: "monospace", fontSize: 11 }}>{contrato.id.slice(0, 8).toUpperCase()}</span></div>
              </div>
            )}
            <p style={{ ...s.muted, fontSize: 12, marginTop: 16 }}>Você receberá uma cópia do contrato assinado pelo WhatsApp.</p>
          </>
        )}

        <div style={s.footer}>
          <span>RuralCaixa © 2026</span><span>•</span><span>Assinatura segura</span>
        </div>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: "#F4F1EA", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px 48px", fontFamily: "'Georgia', serif" },
  card: { background: "#fff", borderRadius: 16, padding: "32px 24px", width: "100%", maxWidth: 480, boxShadow: "0 2px 24px rgba(0,0,0,0.08)" },
  logo: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  logoText: { fontSize: 18, fontWeight: 700, color: "#1B4D2E", letterSpacing: "-0.5px" },
  badge: { display: "inline-block", background: "#EAF3DE", color: "#3B6D11", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, marginBottom: 12, fontFamily: "sans-serif" },
  h1: { fontSize: 22, fontWeight: 700, color: "#1B4D2E", margin: "0 0 4px", lineHeight: 1.2 },
  h2: { fontSize: 20, fontWeight: 700, color: "#1A1A1A", margin: "12px 0 8px", textAlign: "center" as const },
  papel: { fontSize: 14, color: "#666", margin: "0 0 20px", fontFamily: "sans-serif" },
  muted: { fontSize: 14, color: "#888", textAlign: "center" as const, lineHeight: 1.6, fontFamily: "sans-serif" },
  center: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12, padding: "24px 0" },
  spinner: { width: 36, height: 36, border: "3px solid #EAF3DE", borderTop: "3px solid #1B4D2E", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  resumoBox: { background: "#FAFAF7", border: "1px solid #E8E5DC", borderRadius: 12, padding: "4px 0", marginBottom: 20 },
  resumoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #F0EDE4", fontFamily: "sans-serif" },
  resumoLabel: { fontSize: 12, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  resumoValue: { fontSize: 14, color: "#222", fontWeight: 500, textAlign: "right" as const, maxWidth: "60%" },
  progressWrap: { marginBottom: 20 },
  progressLabel: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999", marginBottom: 6, fontFamily: "sans-serif" },
  progressBar: { height: 4, background: "#EAF3DE", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", background: "#1B4D2E", borderRadius: 99, transition: "width 0.4s ease" },
  checkLabel: { display: "flex", alignItems: "flex-start", marginBottom: 20, cursor: "pointer", fontFamily: "sans-serif" },
  btnPrimary: { width: "100%", background: "#1B4D2E", color: "#fff", border: "none", borderRadius: 10, padding: "15px 20px", fontSize: 16, fontWeight: 600, cursor: "pointer", marginBottom: 10, fontFamily: "sans-serif" },
  btnSecondary: { width: "100%", background: "transparent", color: "#666", border: "1px solid #ddd", borderRadius: 10, padding: "13px 20px", fontSize: 14, cursor: "pointer", fontFamily: "sans-serif" },
  otpInput: { width: "100%", textAlign: "center" as const, fontSize: 32, letterSpacing: 16, fontWeight: 700, border: "2px solid #1B4D2E", borderRadius: 10, padding: "16px 0", margin: "16px 0", outline: "none", fontFamily: "monospace", color: "#1B4D2E", boxSizing: "border-box" as const },
  erroText: { color: "#A32D2D", fontSize: 13, textAlign: "center" as const, marginBottom: 12, fontFamily: "sans-serif", background: "#FCEBEB", padding: "8px 12px", borderRadius: 8 },
  successBox: { background: "#FAFAF7", border: "1px solid #C0DD97", borderRadius: 12, padding: "4px 0", marginTop: 20, width: "100%", fontFamily: "sans-serif" },
  successRow: { display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #EAF3DE" },
  successLabel: { fontSize: 12, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  successValue: { fontSize: 14, color: "#222", fontWeight: 500 },
  footer: { display: "flex", gap: 8, justifyContent: "center", marginTop: 32, fontSize: 11, color: "#bbb", fontFamily: "sans-serif" },
}
