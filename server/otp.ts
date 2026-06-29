/**
 * OTP (One-Time Password) module for RuralCaixa two-factor authentication.
 *
 * Channel priority (configurable per-produtor via produtor_config table):
 *   - Default: Telegram (group broadcast via /telegram/alerta/generico)
 *   - If produtor has telegram_chat_id: Telegram direct message via /telegram/mensagem-direta
 *   - If produtor has whatsappPriority=true: WhatsApp first, Telegram as fallback
 *   - Once Meta approves WhatsApp Business: set whatsappPriority=true globally or per-produtor
 */

import { getProdutorConfig } from "./db";

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
  imovelCount: number;
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

export function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export function maskPhone(phone: string): string {
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

export async function fetchProdutor(cpf: string): Promise<ProdutorRaw | null> {
  const res = await fetch(`${RAILWAY_API}/produtores`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Falha ao consultar produtores");
  const list: ProdutorRaw[] = await res.json();
  return list.find((p) => cleanCpf(p.cpf) === cleanCpf(cpf)) ?? null;
}

async function fetchImoveis(cpf: string): Promise<ImovelRaw[]> {
  try {
    const res = await fetch(`${RAILWAY_API}/imoveis/buscar?cpf=${cleanCpf(cpf)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

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

/**
 * Send OTP via Telegram direct message (requires telegram_chat_id).
 * Uses /telegram/mensagem-direta endpoint.
 */
async function sendTelegramDirect(telegramChatId: string, code: string, nome: string): Promise<boolean> {
  try {
    const body = {
      telegram_chat_id: telegramChatId,
      mensagem: `🔐 Olá, ${nome}!\n\nSeu código de acesso ao *RuralCaixa* é:\n\n*${code}*\n\nVálido por 5 minutos. Não compartilhe com ninguém.`,
    };
    const res = await fetch(`${RAILWAY_API}/telegram/mensagem-direta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send OTP via Telegram group broadcast (fallback when no chat_id configured).
 * Uses /telegram/alerta/generico endpoint.
 */
async function sendTelegramGroup(code: string, nome: string): Promise<boolean> {
  try {
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

/**
 * Smart send: chooses the best available channel based on per-produtor config.
 *
 * Priority logic:
 *   1. If whatsappPriority=true → try WhatsApp first, then Telegram
 *   2. Else → try Telegram first (direct if chat_id available, else group), then WhatsApp
 *
 * Returns the channel that succeeded, or throws if all fail.
 */
async function smartSend(
  produtorId: number,
  telefone: string,
  code: string,
  nome: string
): Promise<"whatsapp" | "telegram_direct" | "telegram_group"> {
  // Load per-produtor config (may be null if not yet configured)
  const config = await getProdutorConfig(produtorId).catch(() => null);
  const whatsappPriority = config?.whatsappPriority ?? false;
  const telegramChatId = config?.telegramChatId ?? null;

  if (whatsappPriority) {
    // WhatsApp first (Meta approved)
    const wappOk = await sendWhatsApp(telefone, code);
    if (wappOk) return "whatsapp";
    // Fallback to Telegram
    if (telegramChatId) {
      const tgOk = await sendTelegramDirect(telegramChatId, code, nome);
      if (tgOk) return "telegram_direct";
    }
    const tgGroupOk = await sendTelegramGroup(code, nome);
    if (tgGroupOk) return "telegram_group";
    throw new Error("Não foi possível enviar o código. Tente novamente em instantes.");
  } else {
    // Telegram first (default — WhatsApp pending Meta approval)
    if (telegramChatId) {
      const tgOk = await sendTelegramDirect(telegramChatId, code, nome);
      if (tgOk) return "telegram_direct";
    }
    const tgGroupOk = await sendTelegramGroup(code, nome);
    if (tgGroupOk) return "telegram_group";
    // Fallback to WhatsApp
    const wappOk = await sendWhatsApp(telefone, code);
    if (wappOk) return "whatsapp";
    throw new Error("Não foi possível enviar o código. Tente novamente em instantes.");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SendOtpResult {
  success: true;
  channel: "whatsapp" | "telegram_direct" | "telegram_group";
  maskedPhone: string;
  produtorNome: string;
}

export async function sendOtp(cpf: string): Promise<SendOtpResult> {
  const cpfClean = cleanCpf(cpf);

  // Find produtor in Railway
  const produtor = await fetchProdutor(cpfClean);
  if (!produtor) {
    throw new Error("CPF não encontrado. Verifique ou entre em contato.");
  }

  // Get imoveis (single fetch)
  const imovelList = await fetchImoveis(cpfClean);
  const imovelId = imovelList?.[0]?.id;
  const imovelCount = imovelList.length;

  // Generate code
  const code = generateCode();
  const entry: OtpEntry = {
    code,
    cpf: cpfClean,
    produtorId: produtor.id,
    produtorNome: produtor.nome,
    telefone: produtor.telefone,
    imovelId,
    imovelCount,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  };

  // Send via best available channel
  const channel = await smartSend(produtor.id, produtor.telefone, code, produtor.nome);

  // Store OTP only after successful send
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
  imovelCount: number;
  openId: string;
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
    throw new Error(
      `Código incorreto. ${remaining} tentativa${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`
    );
  }

  // Valid — remove from store (single use)
  otpStore.delete(cpfClean);

  const openId = `rc_${entry.produtorId}`;

  return {
    success: true,
    produtorId: entry.produtorId,
    produtorNome: entry.produtorNome,
    imovelId: entry.imovelId,
    imovelCount: entry.imovelCount ?? 1,
    openId,
  };
}
