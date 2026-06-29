/**
 * railwayProxy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side proxy for Railway API calls.
 * Every request is validated against the signed rc_claims cookie so that a
 * producer can only access data belonging to their own produtorId / imovelId.
 *
 * Flow:
 *  1. Client calls a tRPC procedure (e.g. railway.animais)
 *  2. Procedure reads claims from the verified rc_claims cookie
 *  3. Procedure enforces that the requested imovelId / produtorId matches claims
 *  4. Procedure fetches from Railway and returns the result
 */

import * as jose from "jose";
import { parse as parseCookieHeader } from "cookie";
import { ENV } from "./_core/env";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";

export const RAILWAY_API = "https://ruralcaixa-mvp-production.up.railway.app";

// ─── Claims ───────────────────────────────────────────────────────────────────

export interface RcClaims {
  produtorId: number;
  cpf: string;
  imovelId: number | null;
  /** 'admin' = contador (sees all properties); 'user' = produtor (sees only own) */
  role: "user" | "admin";
}

/**
 * Parse and verify the rc_claims cookie from the request.
 * Returns null if the cookie is absent or invalid.
 */
export async function getClaimsFromRequest(req: Request): Promise<RcClaims | null> {
  try {
    // 1. Try X-Rc-Claims header (sent by client when cookies are blocked cross-site)
    let raw: string | undefined;
    const xRcClaims = req.headers["x-rc-claims"] as string | undefined;
    if (xRcClaims) {
      raw = xRcClaims;
    } else {
      // 2. Fall back to cookie (works in same-site / deployed environments)
      const cookies = parseCookieHeader(req.headers.cookie ?? "");
      raw = cookies.rc_claims;
    }
    if (!raw) return null;
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jose.jwtVerify(raw, secret);
    if (
      typeof payload.produtorId !== "number" ||
      typeof payload.cpf !== "string"
    ) return null;
    return {
      produtorId: payload.produtorId as number,
      cpf: payload.cpf as string,
      imovelId: (payload.imovelId as number | null) ?? null,
      role: (payload.role as "user" | "admin") ?? "user",
    };
  } catch {
    return null;
  }
}

// ─── Guard helpers ────────────────────────────────────────────────────────────

/** Throws FORBIDDEN if the requested imovelId is not the one bound to the session. */
export function assertImovel(claims: RcClaims, requestedImovelId: number) {
  // If the session was created before imovel selection (imovelId null), allow any
  // property that belongs to the producer (validated by the endpoint itself).
  if (claims.imovelId !== null && claims.imovelId !== requestedImovelId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso negado: imóvel não pertence à sessão ativa.",
    });
  }
}

/** Throws FORBIDDEN if the requested produtorId is not the one bound to the session. */
export function assertProdutor(claims: RcClaims, requestedProdutorId: number) {
  if (claims.produtorId !== requestedProdutorId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso negado: produtor não corresponde à sessão ativa.",
    });
  }
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────

export async function railwayFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${RAILWAY_API}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: (err as { detail?: string }).detail ?? `Railway API error ${res.status}`,
    });
  }
  return res.json() as Promise<T>;
}
