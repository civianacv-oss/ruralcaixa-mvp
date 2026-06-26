"use client";
// frontend/app/login/page.tsx — RuralCaixa MVP
import { useState } from "react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const [token, setTokenInput] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleLogin() {
    if (!token.trim()) return setErro("Informe seu token de acesso.");
    setCarregando(true);
    setErro("");
    const ok = await login(token.trim());
    if (ok) {
      window.location.href = "/";
    } else {
      setErro("Token inválido. Verifique com o administrador.");
    }
    setCarregando(false);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#f5f0e8",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 40,
        width: "100%", maxWidth: 400,
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        border: "1px solid #e8e0d0",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌾</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: "#1a2e1a" }}>RuralCaixa</div>
          <div style={{ fontSize: 13, color: "#7a9a6a", marginTop: 4 }}>
            Gestão Rural Inteligente
          </div>
        </div>

        {/* Campo de token */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block", fontSize: 13, fontWeight: 600,
            color: "#3a4a3a", marginBottom: 6,
          }}>
            Token de acesso
          </label>
          <input
            type="password"
            placeholder="rc_..."
            value={token}
            onChange={e => setTokenInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              border: "1.5px solid #d8d0c0", fontSize: 14,
              background: "#faf8f4", color: "#1a2e1a",
              boxSizing: "border-box", outline: "none",
            }}
          />
        </div>

        {erro && (
          <div style={{
            background: "#fce8e8", border: "1px solid #ef9a9a",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            color: "#8a2a2a", fontSize: 13,
          }}>
            ⚠️ {erro}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={carregando}
          style={{
            width: "100%", padding: "13px", borderRadius: 10,
            border: "none", background: carregando ? "#a0b890" : "#3a6a2a",
            color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: carregando ? "not-allowed" : "pointer",
          }}
        >
          {carregando ? "Verificando..." : "Entrar"}
        </button>

        <div style={{
          marginTop: 24, padding: "14px", borderRadius: 10,
          background: "#f0f8ea", border: "1px solid #c8e0b8",
          fontSize: 12, color: "#3a5a2a", lineHeight: 1.6,
        }}>
          <strong>Como obter seu token:</strong><br />
          Seu token foi enviado via Telegram/WhatsApp no cadastro.<br />
          Dúvidas? Contate o administrador.
        </div>
      </div>
    </div>
  );
}
