/**
 * railwayProxy.test.ts
 * Tests for the server-side isolation guards that prevent producers from
 * accessing data belonging to other producers or properties.
 */

import { describe, it, expect } from "vitest";
import { assertImovel, assertProdutor, type RcClaims } from "./railwayProxy";
import { TRPCError } from "@trpc/server";

// ─── assertImovel ─────────────────────────────────────────────────────────────

describe("assertImovel", () => {
  it("allows access when requested imovelId matches session imovelId", () => {
    const claims: RcClaims = { produtorId: 1, cpf: "12345678901", imovelId: 42 };
    expect(() => assertImovel(claims, 42)).not.toThrow();
  });

  it("throws FORBIDDEN when requested imovelId does not match session imovelId", () => {
    const claims: RcClaims = { produtorId: 1, cpf: "12345678901", imovelId: 42 };
    expect(() => assertImovel(claims, 99)).toThrow(TRPCError);
  });

  it("throws FORBIDDEN with correct code when imovelId mismatch", () => {
    const claims: RcClaims = { produtorId: 1, cpf: "12345678901", imovelId: 42 };
    try {
      assertImovel(claims, 99);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("FORBIDDEN");
    }
  });

  it("allows any imovelId when session imovelId is null (pre-selection state)", () => {
    const claims: RcClaims = { produtorId: 1, cpf: "12345678901", imovelId: null };
    // Should not throw — producer hasn't selected a property yet
    expect(() => assertImovel(claims, 42)).not.toThrow();
    expect(() => assertImovel(claims, 99)).not.toThrow();
  });

  it("prevents producer A from accessing producer B's imovel", () => {
    const producerAClaims: RcClaims = { produtorId: 1, cpf: "11111111111", imovelId: 10 };
    const producerBImovelId = 20; // belongs to producer B
    expect(() => assertImovel(producerAClaims, producerBImovelId)).toThrow(TRPCError);
  });
});

// ─── assertProdutor ───────────────────────────────────────────────────────────

describe("assertProdutor", () => {
  it("allows access when requested produtorId matches session produtorId", () => {
    const claims: RcClaims = { produtorId: 5, cpf: "12345678901", imovelId: 42 };
    expect(() => assertProdutor(claims, 5)).not.toThrow();
  });

  it("throws FORBIDDEN when requested produtorId does not match session produtorId", () => {
    const claims: RcClaims = { produtorId: 5, cpf: "12345678901", imovelId: 42 };
    expect(() => assertProdutor(claims, 99)).toThrow(TRPCError);
  });

  it("throws FORBIDDEN with correct code when produtorId mismatch", () => {
    const claims: RcClaims = { produtorId: 5, cpf: "12345678901", imovelId: 42 };
    try {
      assertProdutor(claims, 99);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("FORBIDDEN");
      expect((err as TRPCError).message).toContain("produtor");
    }
  });

  it("prevents producer A from accessing producer B's financial data", () => {
    const producerAClaims: RcClaims = { produtorId: 1, cpf: "11111111111", imovelId: 10 };
    const producerBId = 2; // producer B's ID
    expect(() => assertProdutor(producerAClaims, producerBId)).toThrow(TRPCError);
  });

  it("prevents tampering: same producer ID but different CPF still validates by produtorId", () => {
    const claims: RcClaims = { produtorId: 7, cpf: "99999999999", imovelId: 1 };
    expect(() => assertProdutor(claims, 7)).not.toThrow();
    expect(() => assertProdutor(claims, 8)).toThrow(TRPCError);
  });
});

// ─── Isolation scenario: two producers ───────────────────────────────────────

describe("Data isolation between two producers", () => {
  const producerA: RcClaims = { produtorId: 100, cpf: "11111111111", imovelId: 200 };
  const producerB: RcClaims = { produtorId: 101, cpf: "22222222222", imovelId: 201 };

  it("producer A can access their own imovel", () => {
    expect(() => assertImovel(producerA, 200)).not.toThrow();
  });

  it("producer A cannot access producer B's imovel", () => {
    expect(() => assertImovel(producerA, 201)).toThrow(TRPCError);
  });

  it("producer B can access their own imovel", () => {
    expect(() => assertImovel(producerB, 201)).not.toThrow();
  });

  it("producer B cannot access producer A's imovel", () => {
    expect(() => assertImovel(producerB, 200)).toThrow(TRPCError);
  });

  it("producer A can access their own financial data", () => {
    expect(() => assertProdutor(producerA, 100)).not.toThrow();
  });

  it("producer A cannot access producer B's financial data", () => {
    expect(() => assertProdutor(producerA, 101)).toThrow(TRPCError);
  });

  it("producer B can access their own financial data", () => {
    expect(() => assertProdutor(producerB, 101)).not.toThrow();
  });

  it("producer B cannot access producer A's financial data", () => {
    expect(() => assertProdutor(producerB, 100)).toThrow(TRPCError);
  });
});
