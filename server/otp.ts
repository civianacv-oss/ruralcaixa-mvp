/**
 * OTP (One-Time Password) module for RuralCaixa two-factor authentication.
 *
 * Flow:
 *   1. Client calls `auth.sendOtp` with CPF
 *   2. Backend finds the produtor via Railway API, generates a 6-digit code,
 *      stores it in-memory with a 5-minute TTL, and sends it via WhatsApp
 *      (falling back to Telegram if the WhatsApp endpoint fails).
 *   3. Client calls `auth.verifyOtp` with CPF + code
 *   4. Backend validates, then creates a proper session cookie.
 */

import { ENV } from "./_core/env";

const RAILWAY_API = "https://ruralcaixa-mvp-production.up.railway.app";
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

// ─── In-memory OTP store ──────────────────────────────────────────────────────

interface OtpEntry {
  code: string;
  cpf: string;
  produtorId: number;
  produtorNome: string;
  telefone: string;
  imovelId?: number;
  expiresAt: number;
  attempts: number;
}

// Map keyed by CPF (digits only)
const otpStore = new Map<string, OtpEntry>();

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  Array.from(otpStore.entries()).forEach(([key, entry]) => {
    if (entry.expiresAt < now) otpStore.delete(key);
  });
}, 60_000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function maskPhone(phone: string): string {
  // Show last 4 digits: (**) *****-1234
  const digits = phone.replace(/\D/g, "").slice(-11);
  if (digits.length < 4) return "****";
  return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
}

// ─── Railway API helpers ──────────────────────────────────────────────────────

interface ProdutorRaw {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
}

interface ImovelRaw {
  id: number;
  nome: string;
}

async function fetchProdutor(cpf: string): Promise<ProdutorRaw | null> {
  const res = await fetch(`${RAILWAY_API}/produtores`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Falha ao consultar produtores");
  const list: ProdutorRaw[] = await res.json();
  return list.find((p) => cleanCpf(p.cpf) === cleanCpf(cpf)) ?? null;
}

async function fetchImovelId(cpf: string): Promise<number | undefined> {
  try {
    const res = await fetch(`${RAILWAY_API}/imoveis/buscar?cpf=${cleanCpf(cpf)}`);
    if (!res.ok) return undefined;
    const list: ImovelRaw[] = await res.json();
    return list?.[0]?.id;
  } catch {
    return undefined;
  }
}

async function sendWhatsApp(telefone: string, code: string): Promise<boolean> {
  try {
    const body = {
      telefone,
      tipo_midia: "texto",
      conteudo: `🔐 *RuralCaixa* — Seu código de acesso é:\n\n*${code}*\n\nVálido por 5 minutos. Não compartilhe com ninguém.`,
      imovel_id: null,
    };
    const res = await fetch(`${RAILWAY_API}/ovino/webhook/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendTelegram(code: string, nome: string): Promise<boolean> {
  try {
    // Use the generic alert endpoint (broadcasts to configured group)
    const body = {
      titulo: "Código de Acesso RuralCaixa",
      mensagem: `🔐 Olá, ${nome}!\n\nSeu código de acesso é: *${code}*\n\nVálido por 5 minutos. Não compartilhe com ninguém.`,
      nivel: "info",
    };
    const res = await fetch(`${RAILWAY_API}/telegram/alerta/generico`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SendOtpResult {
  success: true;
  channel: "whatsapp" | "telegram";
  maskedPhone: string;
  produtorNome: string;
}

export async function sendOtp(cpf: string): Promise<SendOtpResult> {
  const cpfClean = cleanCpf(cpf);

  // Find produtor
  const produtor = await fetchProdutor(cpfClean);
  if (!produtor) {
    throw new Error("CPF não encontrado. Verifique ou entre em contato.");
  }

  // Get imovel
  const imovelId = await fetchImovelId(cpfClean);

  // Generate code
  const code = generateCode();
  const entry: OtpEntry = {
    code,
    cpf: cpfClean,
    produtorId: produtor.id,
    produtorNome: produtor.nome,
    telefone: produtor.telefone,
    imovelId,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  };

  // Try WhatsApp first, fallback to Telegram
  let channel: "whatsapp" | "telegram" = "whatsapp";
  const wappOk = await sendWhatsApp(produtor.telefone, code);
  if (!wappOk) {
    const tgOk = await sendTelegram(code, produtor.nome);
    if (!tgOk) {
      throw new Error("Não foi possível enviar o código. Tente novamente em instantes.");
    }
    channel = "telegram";
  }

  // Store OTP
  otpStore.set(cpfClean, entry);

  console.log(`[OTP] Code sent to ${produtor.nome} via ${channel} (${maskPhone(produtor.telefone)})`);

  return {
    success: true,
    channel,
    maskedPhone: maskPhone(produtor.telefone),
    produtorNome: produtor.nome,
  };
}

export interface VerifyOtpResult {
  success: true;
  produtorId: number;
  produtorNome: string;
  imovelId?: number;
  openId: string; // used to create session
}

export async function verifyOtp(cpf: string, code: string): Promise<VerifyOtpResult> {
  const cpfClean = cleanCpf(cpf);
  const entry = otpStore.get(cpfClean);

  if (!entry) {
    throw new Error("Código expirado ou não solicitado. Solicite um novo código.");
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cpfClean);
    throw new Error("Código expirado. Solicite um novo código.");
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(cpfClean);
    throw new Error("Muitas tentativas incorretas. Solicite um novo código.");
  }

  if (entry.code !== code.trim()) {
    const remaining = MAX_ATTEMPTS - entry.attempts;
    throw new Error(`Código incorreto. ${remaining} tentativa${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`);
  }

  // Valid — remove from store
  otpStore.delete(cpfClean);

  // openId for this produtor: use "rc_<produtorId>" as a stable identifier
  const openId = `rc_${entry.produtorId}`;

  return {
    success: true,
    produtorId: entry.produtorId,
    produtorNome: entry.produtorNome,
    imovelId: entry.imovelId,
    openId,
  };
}
