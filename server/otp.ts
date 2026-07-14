/**
 * OTP (One-Time Password) module for RuralCaixa two-factor authentication.
 *
 * Fluxo de PRODUTOR (o mais usado): delega geracao, persistencia e envio do
 * codigo ao backend FastAPI (/auth/solicitar, /auth/verificar), que grava em
 * auth_codigos (Postgres). Isso elimina a dependencia de estado em memoria
 * entre invocacoes serverless distintas na Vercel, que causava falhas
 * intermitentes ("codigo invalido ou nao solicitado") quando o "solicitar"
 * e o "verificar" caiam em instancias diferentes.
 *
 * Fluxo de CONTADOR: ainda usa o Map em memoria (otpStore) abaixo. Isso tem
 * o mesmo risco estrutural do fluxo de produtor antigo, mas foi deixado como
 * estava por ora (uso mais raro). TODO: migrar contadores para uma tabela
 * persistente tambem, se comecarem a reportar o mesmo sintoma.
 *
 * Channel priority (produtor):
 *   1. Telegram direto (chat_id do produtor), se configurado
 *   2. Telegram grupo (fallback)
 *   3. WhatsApp (ultimo fallback, pendente aprovacao Meta)
 */

import { getUserByCpf, getImoveisForProdutor, getVinculosPorContador } from "./db";

const RAILWAY_API = "https://ruralcaixa-mvp-production.up.railway.app";
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

// ─── In-memory OTP store (usado apenas para o fluxo de CONTADOR) ───────────

interface OtpEntry {
  code: string;
  cpf: string;
  produtorId: number;
  produtorNome: string;
  telefone: string;
  imovelId?: number;
  imovelCount: number;
  role: "user" | "admin";
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

// ─── Helpers ─────────────────────────────────────────────────────────────

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

// ─── Railway API helpers ─────────────────────────────────────────────────

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

// ─── Send helpers (usados apenas pelo fluxo de CONTADOR) ────────────────

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

// ─── Public API ──────────────────────────────────────────────────────────

export interface SendOtpResult {
  success: true;
  channel: "whatsapp" | "telegram_direct" | "telegram_group";
  maskedPhone: string;
  produtorNome: string;
}

export async function sendOtp(cpf: string): Promise<SendOtpResult> {
  const cpfClean = cleanCpf(cpf);

  // ── Verificar se é um contador cadastrado por algum produtor ────────────
  // (fluxo de contador: continua em memória por ora — ver nota no topo)
  const vinculos = await getVinculosPorContador(cpfClean).catch(() => [] as Awaited<ReturnType<typeof getVinculosPorContador>>);
  if (vinculos.length > 0) {
    const vinculo = vinculos[0];

    const allImovelIds: number[] = [];
    for (const v of vinculos) {
      const imovelList = await fetchImoveis(v.produtorCpf).catch(() => [] as ImovelRaw[]);
      for (const im of imovelList) {
        if (!allImovelIds.includes(im.id)) allImovelIds.push(im.id);
      }
    }

    const code = generateCode();
    const entry: OtpEntry = {
      code,
      cpf: cpfClean,
      produtorId: 0,
      produtorNome: vinculo.contadorNome,
      telefone: vinculo.contadorTelefone,
      imovelId: undefined,
      imovelCount: allImovelIds.length,
      role: "admin",
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    };

    let channel: SendOtpResult["channel"] = "telegram_group";
    const wappOk = await sendWhatsApp(vinculo.contadorTelefone, code).catch(() => false);
    if (wappOk) {
      channel = "whatsapp";
    } else {
      await sendTelegramGroup(code, vinculo.contadorNome);
    }

    otpStore.set(cpfClean, entry);
    console.log(`[OTP] Contador ${vinculo.contadorNome} via ${channel} (${maskPhone(vinculo.contadorTelefone)})`);

    return {
      success: true,
      channel,
      maskedPhone: maskPhone(vinculo.contadorTelefone),
      produtorNome: vinculo.contadorNome,
    };
  }

  // ── Fluxo normal: produtor ───────────────────────────────────────────────
  // Delega geracao, persistencia (Postgres/auth_codigos) e envio do codigo
  // ao backend FastAPI — elimina o Map em memoria para este fluxo.
  const produtor = await fetchProdutor(cpfClean);
  if (!produtor) {
    throw new Error("CPF não encontrado. Verifique ou entre em contato.");
  }

  const res = await fetch(`${RAILWAY_API}/auth/solicitar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf: cpfClean }),
  });

  if (!res.ok) {
    const errBody: { detail?: string } = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || "Não foi possível enviar o código. Tente novamente em instantes.");
  }

  const data: { status: string; canal: "telegram" | "telegram_grupo" | "whatsapp" } = await res.json();
  const channel: SendOtpResult["channel"] =
    data.canal === "whatsapp" ? "whatsapp" : data.canal === "telegram_grupo" ? "telegram_group" : "telegram_direct";

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
  role: "user" | "admin";
  openId: string;
}

export async function verifyOtp(cpf: string, code: string): Promise<VerifyOtpResult> {
  const cpfClean = cleanCpf(cpf);

  // ── Fluxo de contador: ainda validado via Map em memória ─────────────────
  const entry = otpStore.get(cpfClean);
  if (entry) {
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

    const openId = `rc_contador_${cpfClean}`;

    return {
      success: true,
      produtorId: entry.produtorId,
      produtorNome: entry.produtorNome,
      imovelId: entry.imovelId,
      imovelCount: entry.imovelCount ?? 1,
      role: entry.role ?? "admin",
      openId,
    };
  }

  // ── Fluxo normal: produtor — valida via FastAPI (Postgres, persistente) ──
  const res = await fetch(`${RAILWAY_API}/auth/verificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf: cpfClean, codigo: code.trim() }),
  });

  if (!res.ok) {
    const errBody: { detail?: string } = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || "Código expirado ou não solicitado. Solicite um novo código.");
  }

  const data: { status: string; token: string; produtor_id: number; nome: string } = await res.json();

  // Recalcula imoveis/role no momento da verificacao (reflete o estado atual)
  const imovelList = await fetchImoveis(cpfClean);
  const localUser = await getUserByCpf(cpfClean).catch(() => null);
  const role: "user" | "admin" = localUser?.role ?? "user";

  let allowedImoveis = imovelList;
  if (role === "user") {
    const allowedIds = await getImoveisForProdutor(data.produtor_id).catch(() => null);
    if (allowedIds) {
      allowedImoveis = imovelList.filter((im) => allowedIds.includes(im.id));
    }
  }

  const imovelId = allowedImoveis?.[0]?.id;
  const imovelCount = allowedImoveis.length;
  const openId = `rc_${data.produtor_id}`;

  return {
    success: true,
    produtorId: data.produtor_id,
    produtorNome: data.nome,
    rcClaimsToken: data.token,
    imovelId,
    imovelCount,
    role,
    openId,
  };
}
