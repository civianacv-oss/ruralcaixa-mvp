// ─── RuralCaixa API Client ────────────────────────────────────────────────────
// Connects to the existing Railway backend

export const API_BASE = "https://ruralcaixa-mvp-production.up.railway.app";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export function getProdutorId(): number | null {
  const v = localStorage.getItem("rc_produtor_id");
  return v ? Number(v) : null;
}

export function getProdutorNome(): string {
  return localStorage.getItem("rc_produtor_nome") ?? "";
}

export function getImovelId(): number | null {
  const v = localStorage.getItem("rc_imovel_id");
  return v ? Number(v) : null;
}

export function getImovelNome(): string {
  return localStorage.getItem("rc_imovel_nome") ?? "";
}

export function setImovelNome(nome: string) {
  localStorage.setItem("rc_imovel_nome", nome);
}

export function setSession(produtorId: number, nome: string, imovelId?: number, cpf?: string) {
  localStorage.setItem("rc_produtor_id", String(produtorId));
  localStorage.setItem("rc_produtor_nome", nome);
  if (imovelId) localStorage.setItem("rc_imovel_id", String(imovelId));
  if (cpf) localStorage.setItem("rc_produtor_cpf", cpf.replace(/\D/g, ""));
}

export function getRole(): string {
  return localStorage.getItem("rc_role") ?? "user";
}

export function setRole(role: string) {
  localStorage.setItem("rc_role", role);
}

export function isAdmin(): boolean {
  return getRole() === "admin";
}

export function clearSession() {
  localStorage.removeItem("rc_produtor_id");
  localStorage.removeItem("rc_produtor_nome");
  localStorage.removeItem("rc_imovel_id");
  localStorage.removeItem("rc_imovel_nome");
  localStorage.removeItem("rc_produtor_cpf");
  localStorage.removeItem("rc_role");
  localStorage.removeItem("rc_claims_token");
  localStorage.removeItem("rc_api_token");
}

export function isAuthenticated(): boolean {
  return Boolean(getProdutorId());
}

// ─── rc_claims JWT token (sent as Authorization header when cookies are blocked) ─
// This is a tRPC/Vercel-session JWT — do NOT send this directly to the Railway
// FastAPI backend, it will never match produtores.api_token there.

export function getRcToken(): string | null {
  return localStorage.getItem("rc_claims_token");
}

export function setRcToken(token: string) {
  localStorage.setItem("rc_claims_token", token);
}

export function clearRcToken() {
  localStorage.removeItem("rc_claims_token");
}

// ─── Real FastAPI api_token (sent as Authorization header to the Railway backend) ─
// This is the actual value stored in produtores.api_token, distinct from the JWT above.

export function getApiToken(): string | null {
  return localStorage.getItem("rc_api_token");
}

export function setApiToken(token: string) {
  localStorage.setItem("rc_api_token", token);
}

export function clearApiToken() {
  localStorage.removeItem("rc_api_token");
}

// ─── Generic fetch wrapper ────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Produtor {
  id: number;
  nome: string;
  cpf: string;
  email?: string;
}

export interface Imovel {
  id: number;
  nome: string;
  municipio?: string;
  uf?: string;
  area_ha?: number;
  total_produtores?: number;
}

export interface Animal {
  id: number;
  imovel_id: number;
  brinco: string;
  nome?: string;
  raca?: string;
  raca_nome?: string;
  sexo: "M" | "F";
  status: string;
  data_nascimento?: string;
  peso_nascimento?: number;
  ultimo_peso?: number;
  lote_nome?: string;
  categoria?: string;
  observacoes?: string;
}

export interface OvinoDashboard {
  rebanho: { total_ativo: number; matrizes: number; reprodutores: number };
  abates_30d: { total_abatidos: number; receita_total_rs?: number };
  partos_30d: { total_partos: number; cordeiros_vivos?: number };
  alertas_7d: { total_alertas: number };
}

export interface ProdutorResumo {
  receita: number;
  despesa: number;
  total_lancamentos: number;
  pendentes: number;
}

export interface Lancamento {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  confirmado: boolean;
  atividade?: string;
  produto?: string;
}

export interface SanitarioRecord {
  id: number;
  animal_id?: number;
  imovel_id: number;
  tipo: string;
  descricao: string;
  data: string;
  proxima_data?: string;
  produto?: string;
  dose?: string;
  veterinario?: string;
  custo?: number;
}

export interface ReproducaoRecord {
  id: number;
  femea_id: number;
  macho_id?: number;
  tipo: string;
  data: string;
  data_parto_previsto?: string;
  data_parto_real?: string;
  crias_vivas?: number;
  observacoes?: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

// Auth
export async function loginByCpf(cpf: string): Promise<{ produtor: Produtor; imoveis: Imovel[] }> {
  const cpfClean = cpf.replace(/\D/g, "");
  // Get all produtores and find by CPF
  const produtores = await apiFetch<Produtor[]>("/produtores");
  const produtor = produtores.find((p) => p.cpf?.replace(/\D/g, "") === cpfClean);
  if (!produtor) throw new Error("CPF não encontrado. Verifique ou entre em contato.");
  // Get imoveis for this produtor
  const imoveis = await apiFetch<Imovel[]>(`/imoveis/buscar?cpf=${cpfClean}`);
  return { produtor, imoveis };
}

// Imoveis
export async function getImoveis(cpf: string): Promise<Imovel[]> {
  const cpfClean = cpf.replace(/\D/g, "");
  return apiFetch<Imovel[]>(`/imoveis/buscar?cpf=${cpfClean}`);
}

// Animals
export async function getOvinoAnimais(imovelId: number): Promise<Animal[]> {
  return apiFetch<Animal[]>(`/ovino/animais/${imovelId}`);
}
export async function getCaprinoAnimais(imovelId: number): Promise<Animal[]> {
  return apiFetch<Animal[]>(`/caprino/animais/${imovelId}`);
}
export async function getSuinoAnimais(imovelId: number): Promise<Animal[]> {
  return apiFetch<Animal[]>(`/suino/animais/${imovelId}`);
}
export async function getBovinoAnimais(imovelId: number): Promise<Animal[]> {
  return apiFetch<Animal[]>(`/bovino/animais/${imovelId}`);
}

// Dashboard
export async function getOvinoDashboard(imovelId: number): Promise<OvinoDashboard> {
  return apiFetch<OvinoDashboard>(`/ovino/dashboard/${imovelId}`);
}

// Financial
export async function getProdutorResumo(produtorId: number): Promise<ProdutorResumo> {
  return apiFetch<ProdutorResumo>(`/produtores/${produtorId}/resumo`);
}
export async function getLancamentos(produtorId: number): Promise<Lancamento[]> {
  return apiFetch<Lancamento[]>(`/produtores/${produtorId}/lancamentos`);
}
export async function createLancamento(data: Partial<Lancamento>): Promise<Lancamento> {
  return apiFetch<Lancamento>("/lancamentos", { method: "POST", body: JSON.stringify(data) });
}
export async function deleteLancamento(id: string): Promise<void> {
  await apiFetch(`/lancamentos/${id}`, { method: "DELETE" });
}

// Sanitario
export async function getSanitarioOvino(imovelId: number): Promise<SanitarioRecord[]> {
  return apiFetch<SanitarioRecord[]>(`/ovino/sanitario/${imovelId}/proximos`);
}
export async function getSanitarioCaprino(imovelId: number): Promise<SanitarioRecord[]> {
  return apiFetch<SanitarioRecord[]>(`/caprino/sanitario/${imovelId}/proximos`);
}
export async function getSanitarioBovino(imovelId: number): Promise<SanitarioRecord[]> {
  return apiFetch<SanitarioRecord[]>(`/bovino/sanitario/${imovelId}/proximos`);
}

// Reproducao
export async function getReproducaoOvino(imovelId: number): Promise<ReproducaoRecord[]> {
  return apiFetch<ReproducaoRecord[]>(`/ovino/reproducao/${imovelId}/prenhas`);
}
export async function getReproducaoCaprino(imovelId: number): Promise<ReproducaoRecord[]> {
  return apiFetch<ReproducaoRecord[]>(`/caprino/reproducao/${imovelId}/prenhas`);
}
export async function getReproducaoBovino(imovelId: number): Promise<ReproducaoRecord[]> {
  return apiFetch<ReproducaoRecord[]>(`/bovino/reproducao/${imovelId}/prenhas`);
}
