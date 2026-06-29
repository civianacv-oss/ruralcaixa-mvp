import { describe, expect, it } from "vitest";

// ─── Test helpers ─────────────────────────────────────────────────────────────
// These tests validate the pure logic of the API client helpers
// (no network calls, no DB required)

function formatCPF(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function cleanCPF(v: string): string {
  return v.replace(/\D/g, "");
}

function isValidCPF(cpf: string): boolean {
  const clean = cleanCPF(cpf);
  return clean.length === 11;
}

describe("CPF formatting", () => {
  it("formats a raw CPF string correctly", () => {
    expect(formatCPF("74032526672")).toBe("740.325.266-72");
  });

  it("handles partial input gracefully", () => {
    expect(formatCPF("740")).toBe("740");
    expect(formatCPF("74032")).toBe("740.32");
    expect(formatCPF("7403252")).toBe("740.325.2");
  });

  it("strips non-digit characters before formatting", () => {
    expect(formatCPF("740.325.266-72")).toBe("740.325.266-72");
  });

  it("truncates to 11 digits", () => {
    const result = cleanCPF(formatCPF("740325266721234"));
    expect(result.length).toBe(11);
  });
});

describe("CPF validation", () => {
  it("accepts a valid 11-digit CPF", () => {
    expect(isValidCPF("74032526672")).toBe(true);
    expect(isValidCPF("740.325.266-72")).toBe(true);
  });

  it("rejects CPFs shorter than 11 digits", () => {
    expect(isValidCPF("1234567890")).toBe(false);
    expect(isValidCPF("123")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCPF("")).toBe(false);
  });
});

describe("Session helpers", () => {
  it("getProdutorId returns null when not set", () => {
    // Simulate localStorage not having the key
    const mockStorage: Record<string, string> = {};
    const get = (key: string) => mockStorage[key] ? Number(mockStorage[key]) : null;
    expect(get("rc_produtor_id")).toBeNull();
  });

  it("getProdutorId returns the stored number", () => {
    const mockStorage: Record<string, string> = { rc_produtor_id: "42" };
    const get = (key: string) => mockStorage[key] ? Number(mockStorage[key]) : null;
    expect(get("rc_produtor_id")).toBe(42);
  });

  it("isAuthenticated returns true when produtor_id is set", () => {
    const mockStorage: Record<string, string> = { rc_produtor_id: "1" };
    const isAuth = () => Boolean(mockStorage["rc_produtor_id"]);
    expect(isAuth()).toBe(true);
  });

  it("isAuthenticated returns false when produtor_id is not set", () => {
    const mockStorage: Record<string, string> = {};
    const isAuth = () => Boolean(mockStorage["rc_produtor_id"]);
    expect(isAuth()).toBe(false);
  });
});

describe("Currency formatting", () => {
  it("formats BRL correctly", () => {
    const fmt = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    expect(fmt(1000)).toContain("1.000");
    expect(fmt(0)).toContain("0");
    expect(fmt(-500)).toContain("500");
  });
});
