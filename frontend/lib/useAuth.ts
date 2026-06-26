// frontend/lib/useAuth.ts — RuralCaixa MVP
// Hook que verifica token e redireciona para /login se inválido.
// Uso: const { produtor, carregando } = useAuth()

"use client";
import { useEffect, useState } from "react";
import { getToken, getProdutorLocal, clearToken } from "@/lib/api";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

export interface Produtor {
  id: number;
  nome: string;
  cpf: string;
  telefone?: string;
}

export function useAuth() {
  const [produtor, setProdutor] = useState<Produtor | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function verificar() {
      const token = getToken();

      if (!token) {
        window.location.href = "/login";
        return;
      }

      // Tenta usar cache local primeiro para resposta instantânea
      const cache = getProdutorLocal();
      if (cache) setProdutor(cache as Produtor);

      // Valida token no backend
      try {
        const r = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          clearToken();
          window.location.href = "/login";
          return;
        }
        const data = await r.json();
        setProdutor(data);
      } catch {
        // Sem conexão — usa cache local se disponível
        if (!cache) {
          window.location.href = "/login";
        }
      } finally {
        setCarregando(false);
      }
    }

    verificar();
  }, []);

  return { produtor, carregando };
}

export function useLogout() {
  return function logout() {
    clearToken();
    window.location.href = "/login";
  };
}
