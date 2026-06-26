// frontend/lib/api.ts — RuralCaixa MVP
// Wrapper global de fetch que injeta o Bearer token em todas as chamadas à API.
// Uso: import { apiFetch } from "@/lib/api"
//      const r = await apiFetch(`${API}/endpoint`, { method: "POST", body: ... })

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
  "https://ruralcaixa-mvp-production.up.railway.app";

// Chave no localStorage onde o token fica salvo
const TOKEN_KEY = "rc_api_token";
const PRODUTOR_KEY = "rc_produtor";

// ── Gestão do token ───────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, produtor: object): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PRODUTOR_KEY, JSON.stringify(produtor));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PRODUTOR_KEY);
}

export function getProdutorLocal(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem(PRODUTOR_KEY);
  return s ? JSON.parse(s) : null;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ── apiFetch ──────────────────────────────────────────────────────────

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  // Token expirado ou inválido → redireciona para login
  if (response.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return response;
}

// ── Endpoint de login ─────────────────────────────────────────────────

export async function login(token: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const data = await r.json();
    setToken(token, data);
    return true;
  } catch {
    return false;
  }
}
