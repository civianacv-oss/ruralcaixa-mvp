/**
 * Utilitário síncrono para obter/gravar o imovel_id ativo, lido do
 * localStorage. Fallback para 1 (imóvel padrão) enquanto o seletor de
 * propriedade (ImovelContext/ImovelSelector) não estiver conectado ao
 * layout — pendência separada, não bloqueia o build.
 */
const IMOVEL_ID_KEY = "rc_imovel_id";

export function getImovelId(): number {
  if (typeof window === "undefined") return 1;
  try {
    const stored = localStorage.getItem(IMOVEL_ID_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  } catch {
    return 1;
  }
}

export function setImovelId(id: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMOVEL_ID_KEY, String(id));
  } catch {
    // localStorage indisponível — ignora
  }
}
