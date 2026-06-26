"use client"
import { apiFetch } from "@/lib/api";
export const dynamic = 'force-dynamic'

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app"

type Lancamento = {
  id: string
  contrato_id: string
  tipo: string
  descricao: string
  valor: number
  data_lancamento: string
  status: string
  votos_aprovacao: number
  votos_rejeicao: number
  total_votantes: number
  expira_em: string
  autor_nome: string
  votos_detalhe: Array<{
    participante: string
    voto: string
    votado_em: string
    justificativa: string | null
  }> | null
}

type Step = "carregando" | "votacao" | "justificativa" | "sucesso" | "erro" | "ja_votou" | "expirado"

const TIPO_LABEL: Record<string, string> = {
  receita: "Receita",
  despesa: "Despesa",
  aporte: "Aporte de capital",
  retirada: "Retirada",
}

const TIPO_COR: Record<string, string> = {
  receita: "#27500A",
  despesa: "#A32D2D",
  aporte: "#1B4D2E",
  retirada: "#854F0B",
}

const TIPO_BG: Record<string, string> = {
  receita: "#EAF3DE",
  despesa: "#FCEBEB",
  aporte: "#EAF3DE",
  retirada: "#FAEEDA",
}

function fmtData(d: string) {
  if (!d) return "—"
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  })
}

function fmtValor(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL"
  }).format(v)
}

function tempoRestante(expira: string) {
  const diff = new Date(expira).getTime() - Date.now()
  if (diff <= 0) return "Expirado"
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}min`
  return `${m} minutos`
}

export default function VotarPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const lancamentoId = params.lancamento_id as string
  const contratoId = searchParams.get("contrato") || ""
  const papel = searchParams.get("papel") || ""

  const [step, setStep] = useState<Step>("carregando")
  const [lancamento, setLancamento] = useState<Lancamento | null>(null)
  const [votoEscolhido, setVotoEscolhido] = useState<"aprovar" | "rejeitar" | null>(null)
  const [justificativa, setJustificativa] = useState("")
  const [erro, setErro] = useState("")
  const [loading, setLoading] = useState(false)

  // Buscar lançamento
  useEffect(() => {
    apiFetch(`${API}/contratos/${contratoId}/lancamentos?status=em_votacao`)
      .then(r => r.json())
      .then(data => {
        const lanc = data.data?.find((l: Lancamento) => l.id === lancamentoId)
        if (!lanc) { setErro("Lançamento não encontrado ou já encerrado."); setStep("erro"); return }

        // Verificar se já votou
        const jaVotou = lanc.votos_detalhe?.some(
          (v: { participante: string }) => v.participante === papel
        )
        if (jaVotou) { setLancamento(lanc); setStep("ja_votou"); return }

        // Verificar se expirou
        if (new Date(lanc.expira_em) < new Date()) { setLancamento(lanc); setStep("expirado"); return }

        setLancamento(lanc)
        setStep("votacao")
      })
      .catch(() => { setErro("Erro ao carregar lançamento."); setStep("erro") })
  }, [lancamentoId, contratoId, papel])

  function escolherVoto(v: "aprovar" | "rejeitar") {
    setVotoEscolhido(v)
    if (v === "rejeitar") {
      setStep("justificativa")
    } else {
      confirmarVoto(v, "")
    }
  }

  async function confirmarVoto(voto: string, just: string) {
    setLoading(true); setErro("")
    try {
      // Determinar se é produtor ou parceiro
      const body: Record<string, unknown> = {
        voto,
        justificativa: just || null,
      }
      // Tentar como produtor primeiro, depois parceiro
      if (papel.startsWith("p-")) {
        body.parceiro_id = papel.replace("p-", "")
      } else {
        body.produtor_id = parseInt(papel)
      }

      const r = await fetch(
        `${API}/contratos/${contratoId}/lancamentos/${lancamentoId}/votar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      const data = await r.json()
      if (!r.ok) { setErro(data.detail || "Erro ao registrar voto."); setLoading(false); return }
      setStep("sucesso")
    } catch { setErro("Erro de conexão. Tente novamente.") }
    setLoading(false)
  }

  const pct = lancamento
    ? Math.round(((lancamento.votos_aprovacao + lancamento.votos_rejeicao) / Math.max(lancamento.total_votantes, 1)) * 100)
    : 0

  return (

    <AuthGuard>
    <main style={s.main}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logo}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#1B4D2E"/>
            <path d="M8 22 L16 10 L24 22" stroke="#EAF3DE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 18 L20 18" stroke="#EAF3DE" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span style={s.logoText}>RuralCaixa</span>
        </div>

        {/* CARREGANDO */}
        {step === "carregando" && (
          <div style={s.center}>
            <div style={s.spinner}/>
            <p style={s.muted}>Carregando lançamento...</p>
          </div>
        )}

        {/* ERRO */}
        {step === "erro" && (
          <div style={s.center}>
            <div style={iconCircle("#FCEBEB")}>
              <span style={{ color: "#A32D2D", fontSize: 28 }}>✕</span>
            </div>
            <h2 style={s.h2}>Não encontrado</h2>
            <p style={s.muted}>{erro}</p>
          </div>
        )}

        {/* JÁ VOTOU */}
        {step === "ja_votou" && lancamento && (
          <div style={s.center}>
            <div style={iconCircle("#EAF3DE")}>
              <span style={{ color: "#3B6D11", fontSize: 28 }}>✓</span>
            </div>
            <h2 style={s.h2}>Voto já registrado</h2>
            <p style={s.muted}>Você já votou neste lançamento.</p>
            <LancamentoCard lancamento={lancamento}/>
          </div>
        )}

        {/* EXPIRADO */}
        {step === "expirado" && lancamento && (
          <div style={s.center}>
            <div style={iconCircle("#FAEEDA")}>
              <span style={{ color: "#854F0B", fontSize: 28 }}>⏱</span>
            </div>
            <h2 style={s.h2}>Prazo encerrado</h2>
            <p style={s.muted}>O prazo de votação deste lançamento expirou.</p>
            <LancamentoCard lancamento={lancamento}/>
          </div>
        )}

        {/* VOTAÇÃO */}
        {step === "votacao" && lancamento && (
          <>
            <div style={s.badge}>Aprovação de lançamento</div>
            <h1 style={s.h1}>Sua votação é necessária</h1>
            <p style={s.papel}>
              <strong>{lancamento.autor_nome}</strong> registrou um lançamento que precisa da sua aprovação.
            </p>

            <LancamentoCard lancamento={lancamento}/>

            {/* Progresso de votos */}
            <div style={s.progressWrap}>
              <div style={s.progressLabel}>
                <span>Votos recebidos</span>
                <span>{lancamento.votos_aprovacao + lancamento.votos_rejeicao}/{lancamento.total_votantes}</span>
              </div>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${pct}%` }}/>
              </div>
              <div style={{ ...s.progressLabel, marginTop: 4 }}>
                <span style={{ color: "#3B6D11" }}>✓ {lancamento.votos_aprovacao} aprovação</span>
                <span style={{ color: "#A32D2D" }}>✕ {lancamento.votos_rejeicao} rejeição</span>
              </div>
            </div>

            {/* Prazo */}
            <div style={s.prazoBox}>
              <span style={{ fontSize: 12, color: "#888" }}>Prazo para votação</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#854F0B" }}>
                ⏱ {tempoRestante(lancamento.expira_em)}
              </span>
            </div>

            {erro && <p style={s.erroText}>{erro}</p>}

            {/* Botões de voto */}
            <div style={s.botoesVoto}>
              <button
                style={{ ...s.btnRejeitar, opacity: loading ? 0.7 : 1 }}
                onClick={() => escolherVoto("rejeitar")}
                disabled={loading}
              >
                ✕ Rejeitar
              </button>
              <button
                style={{ ...s.btnAprovar, opacity: loading ? 0.7 : 1 }}
                onClick={() => escolherVoto("aprovar")}
                disabled={loading}
              >
                ✓ Aprovar
              </button>
            </div>

            <p style={{ ...s.muted, fontSize: 12, marginTop: 12 }}>
              Se todos aprovarem, o lançamento será efetivado automaticamente.
              Se o prazo expirar sem votos suficientes, será aprovado automaticamente.
            </p>
          </>
        )}

        {/* JUSTIFICATIVA */}
        {step === "justificativa" && lancamento && (
          <>
            <div style={iconCircle("#FCEBEB")}>
              <span style={{ color: "#A32D2D", fontSize: 28 }}>✕</span>
            </div>
            <h2 style={s.h2}>Rejeitar lançamento</h2>
            <p style={s.muted}>Informe o motivo da rejeição (opcional).</p>

            <LancamentoCard lancamento={lancamento}/>

            <textarea
              placeholder="Ex: Valor incorreto, despesa não autorizada..."
              value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
              style={s.textarea}
              rows={3}
            />

            {erro && <p style={s.erroText}>{erro}</p>}

            <button
              style={{ ...s.btnRejeitar, width: "100%", opacity: loading ? 0.7 : 1 }}
              onClick={() => confirmarVoto("rejeitar", justificativa)}
              disabled={loading}
            >
              {loading ? "Registrando..." : "✕ Confirmar rejeição"}
            </button>

            <button
              style={{ ...s.btnSecondary, marginTop: 8 }}
              onClick={() => { setStep("votacao"); setJustificativa("") }}
            >
              ← Voltar
            </button>
          </>
        )}

        {/* SUCESSO */}
        {step === "sucesso" && (
          <>
            <div style={iconCircle(votoEscolhido === "aprovar" ? "#EAF3DE" : "#FCEBEB")}>
              <span style={{ fontSize: 36, color: votoEscolhido === "aprovar" ? "#3B6D11" : "#A32D2D" }}>
                {votoEscolhido === "aprovar" ? "✓" : "✕"}
              </span>
            </div>
            <h2 style={{ ...s.h2, color: votoEscolhido === "aprovar" ? "#1B4D2E" : "#A32D2D" }}>
              {votoEscolhido === "aprovar" ? "Aprovação registrada!" : "Rejeição registrada!"}
            </h2>
            <p style={s.muted}>
              {votoEscolhido === "aprovar"
                ? "Seu voto de aprovação foi registrado. O lançamento será efetivado quando todos aprovarem."
                : "Seu voto de rejeição foi registrado. Os demais condôminos ainda podem votar."}
            </p>
            {lancamento && (
              <div style={s.successBox}>
                <div style={s.successRow}>
                  <span style={s.successLabel}>Lançamento</span>
                  <span style={s.successValue}>{lancamento.descricao}</span>
                </div>
                <div style={s.successRow}>
                  <span style={s.successLabel}>Valor</span>
                  <span style={s.successValue}>{fmtValor(lancamento.valor)}</span>
                </div>
                <div style={{ ...s.successRow, borderBottom: "none" }}>
                  <span style={s.successLabel}>Seu voto</span>
                  <span style={{
                    ...s.successValue,
                    color: votoEscolhido === "aprovar" ? "#3B6D11" : "#A32D2D",
                    fontWeight: 700
                  }}>
                    {votoEscolhido === "aprovar" ? "✓ Aprovado" : "✕ Rejeitado"}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <div style={s.footer}>
          <span>RuralCaixa © 2026</span><span>•</span><span>Votação segura</span>
        </div>
      </div>
    </main>
  )
}

function LancamentoCard({ lancamento }: { lancamento: Lancamento }) {
  return (
    <div style={s.lancamentoCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
          background: TIPO_BG[lancamento.tipo] || "#F0F0F0",
          color: TIPO_COR[lancamento.tipo] || "#333",
          fontFamily: "sans-serif", textTransform: "uppercase" as const, letterSpacing: "0.05em"
        }}>
          {TIPO_LABEL[lancamento.tipo] || lancamento.tipo}
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: TIPO_COR[lancamento.tipo] || "#333", fontFamily: "sans-serif" }}>
          {fmtValor(lancamento.valor)}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", marginBottom: 4, fontFamily: "sans-serif" }}>
        {lancamento.descricao}
      </div>
      <div style={{ fontSize: 12, color: "#999", fontFamily: "sans-serif" }}>
        Lançado por <strong>{lancamento.autor_nome}</strong> · {fmtData(lancamento.data_lancamento)}
      </div>
    </div>
  )
}

function iconCircle(bg: string): React.CSSProperties {
  return {
    width: 64, height: 64, borderRadius: "50%", background: bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 12px",
  }
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: "#F4F1EA", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px 48px", fontFamily: "'Georgia', serif" },
  card: { background: "#fff", borderRadius: 16, padding: "28px 22px", width: "100%", maxWidth: 480, boxShadow: "0 2px 24px rgba(0,0,0,0.08)" },
  logo: { display: "flex", alignItems: "center", gap: 8, marginBottom: 20 },
  logoText: { fontSize: 16, fontWeight: 700, color: "#1B4D2E", letterSpacing: "-0.5px" },
  badge: { display: "inline-block", background: "#FAEEDA", color: "#854F0B", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, marginBottom: 10, fontFamily: "sans-serif", letterSpacing: "0.03em" },
  h1: { fontSize: 20, fontWeight: 700, color: "#1A1A1A", margin: "0 0 4px", lineHeight: 1.2 },
  h2: { fontSize: 18, fontWeight: 700, color: "#1A1A1A", margin: "12px 0 8px", textAlign: "center" as const },
  papel: { fontSize: 14, color: "#666", margin: "0 0 16px", fontFamily: "sans-serif", lineHeight: 1.5 },
  muted: { fontSize: 13, color: "#888", textAlign: "center" as const, lineHeight: 1.6, fontFamily: "sans-serif" },
  center: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 10, padding: "20px 0" },
  spinner: { width: 32, height: 32, border: "3px solid #EAF3DE", borderTop: "3px solid #1B4D2E", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  lancamentoCard: { background: "#FAFAF7", border: "1px solid #E8E5DC", borderRadius: 12, padding: "14px 16px", marginBottom: 16 },
  progressWrap: { marginBottom: 12 },
  progressLabel: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999", marginBottom: 5, fontFamily: "sans-serif" },
  progressBar: { height: 6, background: "#F0EDE4", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", background: "#1B4D2E", borderRadius: 99, transition: "width 0.4s ease" },
  prazoBox: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFBF0", border: "1px solid #F5E6C0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontFamily: "sans-serif" },
  botoesVoto: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 },
  btnAprovar: { background: "#1B4D2E", color: "#fff", border: "none", borderRadius: 10, padding: "15px 10px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif" },
  btnRejeitar: { background: "#FCEBEB", color: "#A32D2D", border: "2px solid #F5C6C6", borderRadius: 10, padding: "15px 10px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif" },
  btnSecondary: { width: "100%", background: "transparent", color: "#666", border: "1px solid #ddd", borderRadius: 10, padding: "12px", fontSize: 14, cursor: "pointer", fontFamily: "sans-serif" },
  textarea: { width: "100%", border: "1.5px solid #E8E5DC", borderRadius: 10, padding: "12px 14px", fontSize: 14, fontFamily: "sans-serif", resize: "none" as const, outline: "none", boxSizing: "border-box" as const, marginBottom: 12, color: "#333" },
  erroText: { color: "#A32D2D", fontSize: 13, textAlign: "center" as const, marginBottom: 12, fontFamily: "sans-serif", background: "#FCEBEB", padding: "8px 12px", borderRadius: 8 },
  successBox: { background: "#FAFAF7", border: "1px solid #C0DD97", borderRadius: 12, padding: "4px 0", marginTop: 16, width: "100%", fontFamily: "sans-serif" },
  successRow: { display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #EAF3DE" },
  successLabel: { fontSize: 12, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  successValue: { fontSize: 14, color: "#222", fontWeight: 500, maxWidth: "60%", textAlign: "right" as const },
  footer: { display: "flex", gap: 8, justifyContent: "center", marginTop: 28, fontSize: 11, color: "#bbb", fontFamily: "sans-serif" },
}

