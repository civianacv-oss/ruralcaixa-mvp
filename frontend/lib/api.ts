/**
 * API Helper - Centralized fetch with authentication
 */

/**
 * Get JWT token from localStorage
 */
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

/**
 * Grava o token e os dados do produtor apos login bem-sucedido.
 * Tambem grava rc_produtor (JSON) e rc_produtor_id (numero), ja
 * lidos por outras telas (ImovelSelector, lancamentos).
 */
export function setToken(token: string, produtor?: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('token', token);
    if (produtor) {
      localStorage.setItem('rc_produtor', JSON.stringify(produtor));
      if (produtor.id != null) {
        localStorage.setItem('rc_produtor_id', String(produtor.id));
      }
    }
  } catch {
    // localStorage indisponivel (modo privado, etc.) - ignora
  }
}

/**
 * Remove token e dados do produtor (logout).
 */
export function clearToken() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('rc_produtor');
    localStorage.removeItem('rc_produtor_id');
    localStorage.removeItem('rc_imovel_id');
  } catch {
    // ignora
  }
}

/**
 * Authenticated fetch wrapper
 * Automatically includes JWT Bearer token in Authorization header
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();

  // Uploads (FormData) nao podem ter Content-Type manual - o browser
  // precisa definir o boundary do multipart sozinho.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };

  // Add Bearer token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

/**
 * Fetch and parse JSON with error handling
 */
export async function apiFetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(url, options);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
    throw new Error(error.detail || `Erro na requisição: ${response.status}`);
  }

  return response.json();
}
