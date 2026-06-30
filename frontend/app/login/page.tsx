"use client";
import { useState } from "react";
import { setToken } from "@/lib/api";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

const INP: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1.5px solid #d8d0c0", fontSize: 15,
  background: "#faf8f4", color: "#1a2e1a",
  boxSizing: "border-box", outline: "none",
  letterSpacing: "0.02em",
};

const BTN: React.CSSProperties = {
  width: "100%", padding: "13px", borderRadius: 10,
  border: "none", background: "#3a6a2a",
  color: "#fff", fontSize: 14, fontWeight: 700,
  cursor: "pointer",
};

export default function LoginPage() {
  const [etapa, setEtapa] = useState<"cpf" | "codigo">("cpf");
  const [cpf, setCpf] = useState("");
  const [codigo, setCodigo] = useState("");
  const [canal, setCanal] = useState("");
  const [telMascarado, setTelMascarado] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // ✅ VERSÃO 2 - MAIS ROBUSTA
  function formatarCpf(valor: string): string {
    // Remove tudo que não é número
    const apenasNumeros = valor.replace(/\D/g, "");
    
    // Limita a 11 dígitos
    const limitado = apenasNumeros.slice(0, 11);
    
    // Aplica a formatação conforme o comprimento
    if (limitado.length === 0) return "";
    if (limitado.length <= 3) return limitado;
    if (limitado.length <= 6) return `${limitado.slice(0, 3)}.${limitado.slice(3)}`;
    if (limitado.length <= 9) return `${limitado.slice(0, 3)}.${limitado.slice(3, 6)}.${limitado.slice(6)}`;
    return `${limitado.slice(0, 3)}.${limitado.slice(3, 6)}.${limitado.slice(6, 9)}-${limitado.slice(9)}`;
  }

  async function solicitarCodigo() {
    setErro("");
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) return setErro("Informe um CPF válido com 11 dígitos.");
    setCarregando(true);
    try {
      const r = await apiFetch(`${API}/auth/solicitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cpfLimpo }),
      });
      const data = await r.json();
      if (!r.ok) return setErro(data.detail || "Erro ao enviar código.");
      setCanal(data.canal || "");
      setTelMascarado(data.telefone_mascarado || "");
      setEtapa("codigo");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function verificarCodigo() {
    setErro("");
    if (codigo.replace(/\D/g, "").length !== 6) return setErro("O código tem 6 dígitos.");
    setCarregando(true);
    try {
      const r = await apiFetch(`${API}/auth/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cpf.replace(/\D/g, ""), codigo }),
      });
      const data = await r.json();
      if (!r.ok) return setErro(data.detail || "Código inválido.");
      setToken(data.token, data.produtor);
      window.location.href = "/";
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  const canalLabel = canal.includes("whatsapp") && canal.includes("telegram")
    ? "WhatsApp e Telegram"
    : canal.includes("whatsapp") ? "WhatsApp" : "Telegram";

  return (
    <div style={{
      minHeight: "100vh", background: "#f5f0e8",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', system-ui, sans-serif", padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 40,
        width: "100%", maxWidth: 400,
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        border: "1px solid #e8e0d0",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🌾</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: "#1a2e1a" }}>RuralCaixa</div>
          <div style={{ fontSize: 13, color: "#7a9a6a", marginTop: 4 }}>
            Gestão Rural Inteligente
          </div>
        </div>

        {etapa === "cpf" ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3a4a3a", marginBottom: 6 }}>
                CPF do produtor
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={e => setCpf(formatarCpf(e.target.value))}
                onKeyDown={e => e.key === "Enter" && solicitarCodigo()}
                style={INP}
                autoFocus
              />
            </div>

            {erro && <Erro texto={erro} />}

            <button onClick={solicitarCodigo} disabled={carregando} style={{ ...BTN, opacity: carregando ? 0.6 : 1, marginTop: 16 }}>
              {carregando ? "Enviando código..." : "Enviar código →"}
            </button>

            <div style={{ marginTop: 20, fontSize: 12, color: "#8a9a8a", textAlign: "center", lineHeight: 1.6 }}>
              Um código de 6 dígitos será enviado via WhatsApp ou Telegram.<br />
              Não possui cadastro? Fale com o administrador.
            </div>
          </>
        ) : (
          <>
            <div style={{
              background: "#e8f5e9", border: "1px solid #a5d6a7",
              borderRadius: 10, padding: "12px 16px", marginBottom: 20,
              fontSize: 13, color: "#2a6a3a", lineHeight: 1.6,
            }}>
              ✅ Código enviado via <strong>{canalLabel}</strong><br />
              para o número <strong>{telMascarado}</strong>.<br />
              Válido por <strong>10 minutos</strong>.
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#3a4a3a", marginBottom: 6 }}>
                Código de 6 dígitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={codigo}
                onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={e => e.key === "Enter" && verificarCodigo()}
                style={{ ...INP, fontSize: 24, letterSpacing: "0.3em", textAlign: "center" }}
                autoFocus
              />
            </div>

            {erro && <Erro texto={erro} />}

            <button onClick={verificarCodigo} disabled={carregando} style={{ ...BTN, opacity: carregando ? 0.6 : 1, marginTop: 16 }}>
              {carregando ? "Verificando..." : "Entrar →"}
            </button>

            <button
              onClick={() => { setEtapa("cpf"); setErro(""); setCodigo(""); }}
              style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 10, border: "1.5px solid #d8d0c0", background: "transparent", color: "#5a6a5a", fontSize: 13, cursor: "pointer" }}
            >
              ← Usar outro CPF
            </button>

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button
                onClick={solicitarCodigo}
                style={{ background: "none", border: "none", color: "#3a6a2a", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
              >
                Não recebi o código — reenviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Erro({ texto }: { texto: string }) {
  return (
    <div style={{
      background: "#fce8e8", border: "1px solid #ef9a9a",
      borderRadius: 8, padding: "10px 14px", marginTop: 10,
      color: "#8a2a2a", fontSize: 13,
    }}>
      ⚠️ {texto}
    </div>
  );
}
