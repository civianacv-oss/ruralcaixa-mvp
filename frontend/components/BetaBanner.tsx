"use client";
// frontend/components/BetaBanner.tsx — RuralCaixa MVP
// Badge beta sticky no topo + modal de reporte de problemas.
// Aparece no primeiro acesso do dia; fecha por 7 dias.

import { useState, useEffect } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";
const COOKIE_KEY = "rc_beta_dismissed";
const DISMISS_DAYS = 7;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[2]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${exp};path=/`;
}

export default function BetaBanner() {
  const [visivel, setVisivel] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState("");

  useEffect(() => {
    const dismissed = getCookie(COOKIE_KEY);
    if (!dismissed) setVisivel(true);
    setPaginaAtual(window.location.pathname);
  }, []);

  function fechar() {
    setCookie(COOKIE_KEY, "1", DISMISS_DAYS);
    setVisivel(false);
  }

  async function enviarFeedback() {
    if (!descricao.trim()) return;
    setEnviando(true);
    try {
      await fetch(`${API}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao,
          pagina: paginaAtual,
          origem: "badge_beta",
        }),
      });
      setEnviado(true);
      setDescricao("");
      setTimeout(() => { setModalAberto(false); setEnviado(false); }, 2000);
    } catch {
      alert("Erro ao enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (!visivel) return null;

  return (
    <>
      {/* Banner */}
      <div style={{
        position: "sticky", top: 0, zIndex: 999,
        background: "linear-gradient(90deg, #1a3a1a 0%, #2a5a2a 100%)",
        color: "#e8f5e8", padding: "8px 20px",
        display: "flex", alignItems: "center", gap: 12,
        fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}>
        {/* Badge */}
        <span style={{
          background: "#4a9a3a", color: "#fff",
          padding: "2px 8px", borderRadius: 20,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
          flexShrink: 0,
        }}>
          🌾 BETA v0.1
        </span>

        <span style={{ flex: 1, opacity: 0.9 }}>
          Você está usando uma versão de teste. Seu feedback é essencial!
        </span>

        <button
          onClick={() => setModalAberto(true)}
          style={{
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff", padding: "5px 14px", borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          🐛 Reportar problema
        </button>

        <button
          onClick={fechar}
          style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.6)",
            fontSize: 18, cursor: "pointer", padding: "0 4px", flexShrink: 0,
            lineHeight: 1,
          }}
          title="Fechar (reaparece em 7 dias)"
        >
          ×
        </button>
      </div>

      {/* Modal de feedback */}
      {modalAberto && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) setModalAberto(false); }}
        >
          <div style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460,
            padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#1a2e1a" }}>🐛 Reportar problema</div>
                <div style={{ fontSize: 12, color: "#8a9a8a", marginTop: 2 }}>Página: {paginaAtual}</div>
              </div>
              <button onClick={() => setModalAberto(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8a9a8a" }}>×</button>
            </div>

            {enviado ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 600, color: "#2a6a3a" }}>Feedback enviado!</div>
                <div style={{ fontSize: 13, color: "#6a7a6a", marginTop: 4 }}>Obrigado por ajudar a melhorar o RuralCaixa.</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#3a4a3a", display: "block", marginBottom: 6 }}>
                    Descreva o problema *
                  </label>
                  <textarea
                    value={descricao}
                    onChange={e => setDescricao(e.target.value)}
                    placeholder="Ex: Ao clicar em 'Confirmar' na página de contratos, aparece erro 500..."
                    rows={4}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10,
                      border: "1.5px solid #d8d0c0", fontSize: 13,
                      background: "#faf8f4", color: "#1a2e1a",
                      boxSizing: "border-box", resize: "vertical", outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <div style={{
                  background: "#f0f8ea", border: "1px solid #c8e0b8",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 20,
                  fontSize: 12, color: "#3a5a2a",
                }}>
                  💡 Dica: inclua o que você fez antes do erro aparecer e o resultado esperado.
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setModalAberto(false)} style={{
                    flex: 1, padding: "10px", borderRadius: 10,
                    border: "1.5px solid #d8d0c0", background: "transparent",
                    color: "#5a6a5a", fontSize: 13, cursor: "pointer",
                  }}>
                    Cancelar
                  </button>
                  <button onClick={enviarFeedback} disabled={!descricao.trim() || enviando} style={{
                    flex: 2, padding: "10px", borderRadius: 10, border: "none",
                    background: descricao.trim() && !enviando ? "#3a6a2a" : "#a0b890",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: descricao.trim() && !enviando ? "pointer" : "not-allowed",
                  }}>
                    {enviando ? "Enviando..." : "Enviar feedback →"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
