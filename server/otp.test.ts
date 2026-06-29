import { describe, expect, it } from "vitest";

// ─── Pure OTP logic tests (no network calls) ──────────────────────────────────

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-11);
  if (digits.length < 4) return "****";
  return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
}

function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

// Simulate in-memory OTP store
interface OtpEntry {
  code: string;
  cpf: string;
  expiresAt: number;
  attempts: number;
}

function createStore() {
  const store = new Map<string, OtpEntry>();

  function set(cpf: string, code: string, ttlMs = 300_000) {
    store.set(cleanCpf(cpf), { code, cpf: cleanCpf(cpf), expiresAt: Date.now() + ttlMs, attempts: 0 });
  }

  function verify(cpf: string, code: string): { ok: boolean; error?: string } {
    const entry = store.get(cleanCpf(cpf));
    if (!entry) return { ok: false, error: "Código expirado ou não solicitado." };
    if (Date.now() > entry.expiresAt) { store.delete(cleanCpf(cpf)); return { ok: false, error: "Código expirado." }; }
    entry.attempts += 1;
    if (entry.attempts > 5) { store.delete(cleanCpf(cpf)); return { ok: false, error: "Muitas tentativas." }; }
    if (entry.code !== code.trim()) return { ok: false, error: `Código incorreto. ${5 - entry.attempts} tentativas restantes.` };
    store.delete(cleanCpf(cpf));
    return { ok: true };
  }

  return { set, verify, store };
}

describe("OTP code generation", () => {
  it("generates a 6-digit numeric code", () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("generates codes in range 100000-999999", () => {
    for (let i = 0; i < 50; i++) {
      const n = Number(generateCode());
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("generates different codes on successive calls (probabilistic)", () => {
    const codes = new Set(Array.from({ length: 10 }, generateCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("Phone masking", () => {
  it("masks a Brazilian mobile number correctly", () => {
    expect(maskPhone("5598992002705")).toBe("(98) *****-2705");
    expect(maskPhone("5531983100834")).toBe("(31) *****-0834");
  });

  it("handles short phone strings", () => {
    expect(maskPhone("123")).toBe("****");
  });
});

describe("OTP store — verify flow", () => {
  it("accepts a correct code", () => {
    const { set, verify } = createStore();
    set("74032526672", "123456");
    expect(verify("74032526672", "123456")).toEqual({ ok: true });
  });

  it("rejects an incorrect code", () => {
    const { set, verify } = createStore();
    set("74032526672", "123456");
    const result = verify("74032526672", "000000");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("incorreto");
  });

  it("rejects when no code was requested", () => {
    const { verify } = createStore();
    const result = verify("74032526672", "123456");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expirado");
  });

  it("rejects an expired code", () => {
    const { set, verify } = createStore();
    set("74032526672", "123456", -1); // already expired
    const result = verify("74032526672", "123456");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expirado");
  });

  it("blocks after 5 failed attempts", () => {
    const { set, verify } = createStore();
    set("74032526672", "999999");
    for (let i = 0; i < 5; i++) verify("74032526672", "000000");
    const result = verify("74032526672", "000000");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tentativas");
  });

  it("removes the code after successful verification (single-use)", () => {
    const { set, verify, store } = createStore();
    set("74032526672", "123456");
    verify("74032526672", "123456");
    expect(store.has("74032526672")).toBe(false);
  });

  it("normalizes CPF with formatting before lookup", () => {
    const { set, verify } = createStore();
    set("740.325.266-72", "654321");
    expect(verify("74032526672", "654321")).toEqual({ ok: true });
  });
});
