"use client";
// frontend/lib/AuthGuard.tsx — RuralCaixa MVP
// Envolve qualquer página e redireciona para /login se não autenticado.
// Uso: export default function MinhaPage() {
//        return <AuthGuard><ConteudoDaPagina /></AuthGuard>
//      }

import { useAuth } from "@/lib/useAuth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { produtor, carregando } = useAuth();

  if (carregando) {
    return (
      <div style={{
        minHeight: "100vh", background: "#f5f0e8",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌾</div>
          <div style={{ fontSize: 14, color: "#7a9a6a" }}>Verificando acesso...</div>
        </div>
      </div>
    );
  }

  if (!produtor) return null; // redirect já foi disparado pelo useAuth

  return <>{children}</>;
}
