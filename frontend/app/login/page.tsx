"use client";
import { useState } from "react";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleLogin() {
    if (!token.trim()) return;
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`${API}/produtores/me?token=${token.trim()}`);
      if (!res.ok) { setErro("Token inválido. Verifique e tente novamente."); return; }
      const data = await res.json();
      localStorage.setItem("rc_token", token.trim());
      localStorage.setItem("rc_produtor_id", String(data.id));
      localStorage.setItem("rc_produtor_nome", data.nome);
      window.location.href = "/";
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌱</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a2e1a" }}>RuralCaixa</h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#7a8a6a" }}>Digite seu token de acesso</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8a6a", display: "block", marginBottom: 6, letterSpacing: "0.5px" }}>TOKEN</label>
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="rc_..."
            style={{ width: "100%", border: "1.5px solid #e0dbd0", borderRadius: 8, padding: "10px 12px", fontSize: 13, boxSizing: "border-box", outline: "none" }}
          />
        </div>

        {erro && (
          <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#dc2626", marginBottom: 16 }}>
            {erro}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading || !token.trim()}
          style={{
            width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
            background: loading || !token.trim() ? "#8ab88a" : "#3a6a2a",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading || !token.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p style={{ textAlign: "center", fontSize: 12, color: "#9a9a8a", marginTop: 20 }}>
          Seu token foi enviado pelo Telegram ao se cadastrar.
        </p>
      </div>
    </div>
  );
}