// =============================================================
// RURALCAIXA — Tela de Assinatura Eletrônica
// Arquivo: frontend/app/assinar/[contrato_id]/page.tsx
// =============================================================
// Acessada via link WhatsApp:
//   https://ruralcaixa-mvp.vercel.app/assinar/{contrato_id}?parte=outorgante
// =============================================================

"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app"

// ------------------------------------------------------------------
// TYPES
// ------------------------------------------------------------------
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
  condominio: "Condomínio Rural",
}

const FREQ_LABEL: Record<string, string> = {
  mensal: "Mensal",
  safra: "Por Safra",
  anual: "Anual",
}

// ------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ------------------------------------------------------------------
export default function AssinarPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const contratoId   = params.contrato_id as string
  const papel        = searchParams.get("parte") || "outorgante"

  const [step, setStep]           = useState<Step>("carregando")
  const [contrato, setContrato]   = useState<Contrato | null>(null)
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([])
  const [otp, setOtp]             = useState("")
  const [erro, setErro]           = useState("")
  const [loading, setLoading]     = useState(false)
  const [consentiu, setConsentiu] = useState(false)

  // Buscar contrato
  useEffect(() => {
    fetch(`${API}/contratos/${contratoId}`)
      .then(r => r.json())
      .then(data => {
        if (data.detail) { setErro(data.detail); setStep("erro"); return }
        setContrato(data)
        setAssinaturas(data.assinaturas || [])

        // Verificar se já assinou
        const minha = (data.assinaturas || []).find((a: Assinatura) => a.papel === papel)
        if (minha?.status === "assinado") {
          setStep("ja_assinado")
        } else {
          setStep("revisao")
        }
      })
      .catch(() => { setErro("Não foi possível carregar o contrato."); setStep("erro") })
  }, [contratoId, papel])

  // Confirmar revisão → ir para OTP
  function confirmarRevisao() {
    if (!consentiu) { setErro("Confirme que leu e concordou com os termos."); return }
    setErro("")
    setStep("otp")
  }

  // Validar OTP e assinar
  async function assinar() {
    if (otp.length !== 6) { setErro("Digite o código de 6 dígitos."); return }
    setLoading(true)
    setErro("")

    // Geolocalização (melhor esforço)
    let geo = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      )
      geo = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch { /* opcional */ }

    try {
      const body: Record<string, unknown> = { papel, otp, geolocalizacao: geo }
      const r = await fetch(`${API}/contratos/${contratoId}/assinar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) { setErro(data.detail || "Erro ao assinar."); setLoading(false); return }
      setStep("sucesso")
    } catch {
      setErro("Erro de conexão. Tente novamente.")
    }
    setLoading(false)
  }

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <main style={styles.main}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#1B4D2E"/>
            <path d="M8 22 L16 10 L24 22" stroke="#EAF3DE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 18 L20 18" stroke="#EAF3DE" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={styles.logoText}>RuralCaixa</span>
        </div>

        {/* STEP: CARREGANDO */}
        {step === "carregando" && (
          <div style={styles.center}>
            <div style={styles.spinner}/>
            <p style={styles.muted}>Carregando contrato...</p>
          </div>
        )}

        {/* STEP: ERRO */}
        {step === "erro" && (
          <div style={styles.center}>
            <div style={styles.iconCircle("#FCEBEB")}>
              <span style={{ color: "#A32D2D", fontSize: 28 }}>✕</span>
            </div>
            <h2 style={styles.h2}>Contrato não encontrado</h2>
            <p style={styles.muted}>{erro || "Verifique o link e tente novamente."}</p>
          </div>
        )}

        {/* STEP: JÁ ASSINADO */}
        {step === "ja_assinado" && (
          <div style={styles.center}>
            <div style={styles.iconCircle("#EAF3DE")}>
              <span style={{ color: "#3B6D11", fontSize: 28 }}>✓</span>
            </div>
            <h2 style={styles.h2}>Já assinado</h2>
            <p style={styles.muted}>Você já assinou este contrato anteriormente.</p>
            {contrato && <ContratoResumo contrato={contrato} papel={papel}/>}
          </div>
        )}

        {/* STEP: REVISÃO */}
        {step === "revisao" && contrato && (
          <>
            <div style={styles.badge}>Assinatura Eletrônica — Lei 14.063/2020</div>
            <h1 style={styles.h1}>{TIPO_LABEL[contrato.tipo] || contrato.tipo}</h1>
            <p style={styles.papel}>
              Você está assinando como <strong>{papel === "outorgante" ? "Outorgante" : "Outorgado"}</strong>
            </p>

            <ContratoResumo contrato={contrato} papel={papel}/>

            {/* Progresso de assinaturas */}
            <div style={styles.progressWrap}>
              <div style={styles.progressLabel}>
                <span>Assinaturas</span>
                <span>{contrato.assinaturas_concluidas}/{contrato.assinaturas_total}</span>
              </div>
              <div style={styles.progressBar}>
                <div style={{
                  ...styles.progressFill,
                  width: `${contrato.assinaturas_total > 0
                    ? (contrato.assinaturas_concluidas / contrato.assinaturas_total) * 100
                    : 0}%`
                }}/>
              </div>
            </div>

            {/* Consentimento LGPD */}
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={consentiu}
                onChange={e => setConsentiu(e.target.checked)}
                style={{ marginRight: 10, width: 18, height: 18, accentColor: "#1B4D2E" }}
              />
              <span style={{ fontSize: 13, lineHeight: 1.5, color: "#444" }}>
                Li e concordo com os termos deste contrato. Autorizo a coleta do meu
                IP e localização para fins de assinatura eletrônica (Lei 14.063/2020 e LGPD).
              </span>
            </label>

            {erro && <p style={styles.erroText}>{erro}</p>}

            <button
              style={styles.btnPrimary}
              onClick={confirmarRevisao}
            >
              Continuar para assinatura →
            </button>
          </>
        )}

        {/* STEP: OTP */}
        {step === "otp" && contrato && (
          <>
            <div style={styles.iconCircle("#EAF3DE")}>
              <span style={{ fontSize: 28 }}>📱</span>
            </div>
            <h2 style={styles.h2}>Confirme sua identidade</h2>
            <p style={styles.muted}>
              Digite o código de 6 dígitos enviado para o seu WhatsApp.
            </p>

            <input
              type="number"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.slice(0, 6))}
              style={styles.otpInput}
              autoFocus
            />

            {erro && <p style={styles.erroText}>{erro}</p>}

            <button
              style={{ ...styles.btnPrimary, opacity: loading ? 0.7 : 1 }}
              onClick={assinar}
              disabled={loading}
            >
              {loading ? "Verificando..." : "Assinar contrato"}
            </button>

            <button
              style={styles.btnSecondary}
              onClick={() => { setStep("revisao"); setOtp(""); setErro("") }}
            >
              ← Voltar
            </button>

            <p style={{ ...styles.muted, fontSize: 12, marginTop: 16 }}>
              O código expira em 30 minutos. Não recebeu?
              Entre em contato com o gestor do contrato.
            </p>
          </>
        )}

        {/* STEP: SUCESSO */}
        {step === "sucesso" && (
          <>
            <div style={styles.iconCircle("#EAF3DE")}>
              <span style={{ color: "#3B6D11", fontSize: 36 }}>✓</span>
            </div>
            <h2 style={{ ...styles.h2, color: "#1B4D2E" }}>Assinatura registrada!</h2>
            <p style={styles.muted}>
              Sua assinatura eletrônica foi registrada com validade jurídica
              nos termos da Lei nº 14.063/2020.
            </p>

            {contrato && (
              <div style={styles.successBox}>
                <div style={styles.successRow}>
                  <span style={styles.successLabel}>Contrato</span>
                  <span style={styles.successValue}>{TIPO_LABEL[contrato.tipo]}</span>
                </div>
                <div style={styles.successRow}>
                  <span style={styles.successLabel}>Seu papel</span>
                  <span style={styles.successValue}>
                    {papel === "outorgante" ? "Outorgante" : "Outorgado"}
                  </span>
                </div>
                <div style={styles.successRow}>
                  <span style={styles.successLabel}>Data/hora</span>
                  <span style={styles.successValue}>
                    {new Date().toLocaleString("pt-BR")}
                  </span>
                </div>
                <div style={{ ...styles.successRow, borderBottom: "none" }}>
                  <span style={styles.successLabel}>Protocolo</span>
                  <span style={{ ...styles.successValue, fontFamily: "monospace", fontSize: 11 }}>
                    {contrato.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>
            )}

            <p style={{ ...styles.muted, fontSize: 12, marginTop: 16 }}>
              Guarde este protocolo. Você receberá uma cópia do contrato assinado pelo WhatsApp.
            </p>
          </>
        )}

        {/* Rodapé */}
        <div style={styles.footer}>
          <span>RuralCaixa © 2026</span>
          <span>•</span>
          <span>Assinatura segura</span>
          <span>•</span>
          <a href="https://ruralcaixa-mvp.vercel.app" style={{ color: "#1B4D2E" }}>
            ruralcaixa.app
          </a>
        </div>
      </div>
    </main>
  )
}

// ------------------------------------------------------------------
// SUB-COMPONENTE: resumo do contrato
// ------------------------------------------------------------------
function ContratoResumo({ contrato, papel }: { contrato: Contrato, papel: string }) {
  const meuPerc = papel === "outorgante"
    ? contrato.percentual_outorgante
    : contrato.percentual_outorgado

  return (
    <div style={styles.resumoBox}>
      <div style={styles.resumoRow}>
        <span style={styles.resumoLabel}>Outorgante</span>
        <span style={styles.resumoValue}>{contrato.outorgante_nome || "—"}</span>
      </div>
      <div style={styles.resumoRow}>
        <span style={styles.resumoLabel}>Outorgado</span>
        <span style={styles.resumoValue}>{contrato.outorgado_nome || "—"}</span>
      </div>
      <div style={styles.resumoRow}>
        <span style={styles.resumoLabel}>Vigência</span>
        <span style={styles.resumoValue}>
          {fmtData(contrato.data_inicio)} → {fmtData(contrato.data_fim)}
        </span>
      </div>
      {contrato.area_parceria_hectares && (
        <div style={styles.resumoRow}>
          <span style={styles.resumoLabel}>Área</span>
          <span style={styles.resumoValue}>{contrato.area_parceria_hectares} ha</span>
        </div>
      )}
      <div style={{ ...styles.resumoRow, borderBottom: "none" }}>
        <span style={styles.resumoLabel}>Sua participação</span>
        <span style={{ ...styles.resumoValue, fontWeight: 700, color: "#1B4D2E", fontSize: 18 }}>
          {Number(meuPerc).toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

function fmtData(d: string) {
  if (!d) return "—"
  return d.split("T")[0].split("-").reverse().join("/")
}

// ------------------------------------------------------------------
// STYLES
// ------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#F4F1EA",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px 48px",
    fontFamily: "'Georgia', serif",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "32px 24px",
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1B4D2E",
    letterSpacing: "-0.5px",
  },
  badge: {
    display: "inline-block",
    background: "#EAF3DE",
    color: "#3B6D11",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 999,
    marginBottom: 12,
    fontFamily: "sans-serif",
    letterSpacing: "0.03em",
  },
  h1: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1B4D2E",
    margin: "0 0 4px",
    lineHeight: 1.2,
  },
  h2: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1A1A1A",
    margin: "12px 0 8px",
    textAlign: "center" as const,
  },
  papel: {
    fontSize: 14,
    color: "#666",
    margin: "0 0 20px",
    fontFamily: "sans-serif",
  },
  muted: {
    fontSize: 14,
    color: "#888",
    textAlign: "center" as const,
    lineHeight: 1.6,
    fontFamily: "sans-serif",
  },
  center: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
    padding: "24px 0",
  },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid #EAF3DE",
    borderTop: "3px solid #1B4D2E",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  resumoBox: {
    background: "#FAFAF7",
    border: "1px solid #E8E5DC",
    borderRadius: 12,
    padding: "4px 0",
    marginBottom: 20,
  },
  resumoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    borderBottom: "1px solid #F0EDE4",
    fontFamily: "sans-serif",
  },
  resumoLabel: {
    fontSize: 12,
    color: "#999",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  resumoValue: {
    fontSize: 14,
    color: "#222",
    fontWeight: 500,
    textAlign: "right" as const,
    maxWidth: "60%",
  },
  progressWrap: {
    marginBottom: 20,
  },
  progressLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#999",
    marginBottom: 6,
    fontFamily: "sans-serif",
  },
  progressBar: {
    height: 4,
    background: "#EAF3DE",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#1B4D2E",
    borderRadius: 99,
    transition: "width 0.4s ease",
  },
  checkLabel: {
    display: "flex",
    alignItems: "flex-start",
    marginBottom: 20,
    cursor: "pointer",
    fontFamily: "sans-serif",
  },
  btnPrimary: {
    width: "100%",
    background: "#1B4D2E",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "15px 20px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 10,
    fontFamily: "sans-serif",
    letterSpacing: "-0.2px",
  },
  btnSecondary: {
    width: "100%",
    background: "transparent",
    color: "#666",
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: "13px 20px",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "sans-serif",
  },
  otpInput: {
    width: "100%",
    textAlign: "center" as const,
    fontSize: 32,
    letterSpacing: 16,
    fontWeight: 700,
    border: "2px solid #1B4D2E",
    borderRadius: 10,
    padding: "16px 0",
    margin: "16px 0",
    outline: "none",
    fontFamily: "monospace",
    color: "#1B4D2E",
    boxSizing: "border-box" as const,
  },
  erroText: {
    color: "#A32D2D",
    fontSize: 13,
    textAlign: "center" as const,
    marginBottom: 12,
    fontFamily: "sans-serif",
    background: "#FCEBEB",
    padding: "8px 12px",
    borderRadius: 8,
  },
  successBox: {
    background: "#FAFAF7",
    border: "1px solid #C0DD97",
    borderRadius: 12,
    padding: "4px 0",
    marginTop: 20,
    width: "100%",
    fontFamily: "sans-serif",
  },
  successRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid #EAF3DE",
  },
  successLabel: {
    fontSize: 12,
    color: "#999",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  successValue: {
    fontSize: 14,
    color: "#222",
    fontWeight: 500,
  },
  footer: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    marginTop: 32,
    fontSize: 11,
    color: "#bbb",
    fontFamily: "sans-serif",
  },
  iconCircle: (bg: string): React.CSSProperties => ({
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 12px",
  }),
}
