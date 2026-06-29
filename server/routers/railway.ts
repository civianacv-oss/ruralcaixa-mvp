/**
 * railway.ts — tRPC router that proxies Railway API calls server-side.
 *
 * Every procedure:
 *  1. Reads the signed rc_claims cookie (produtorId, imovelId, cpf)
 *  2. Validates that the requested resource belongs to the authenticated producer
 *  3. Fetches from Railway and returns typed data
 *
 * This prevents any client-side tampering of produtorId / imovelId.
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  getClaimsFromRequest,
  assertImovel,
  assertProdutor,
  railwayFetch,
  RAILWAY_API,
} from "../railwayProxy";
import { TRPCError } from "@trpc/server";

// ─── Types (mirrored from client/src/lib/api.ts) ─────────────────────────────

interface Animal {
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

interface OvinoDashboard {
  rebanho: { total_ativo: number; matrizes: number; reprodutores: number };
  abates_30d: { total_abatidos: number; receita_total_rs?: number };
  partos_30d: { total_partos: number; cordeiros_vivos?: number };
  alertas_7d: { total_alertas: number };
}

interface ProdutorResumo {
  receita: number;
  despesa: number;
  total_lancamentos: number;
  pendentes: number;
}

interface Lancamento {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_lancamento: string;
  confirmado: boolean;
  atividade?: string;
  produto?: string;
}

interface SanitarioRecord {
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

interface ReproducaoRecord {
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

interface Imovel {
  id: number;
  nome: string;
  municipio?: string;
  uf?: string;
  area_ha?: number;
  total_produtores?: number;
}

// ─── Helper: require claims or throw ─────────────────────────────────────────

async function requireClaims(req: Parameters<typeof getClaimsFromRequest>[0]) {
  const claims = await getClaimsFromRequest(req);
  if (!claims) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sessão inválida ou expirada. Faça login novamente.",
    });
  }
  return claims;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const railwayRouter = router({

  // ── Imóveis ────────────────────────────────────────────────────────────────
  imoveis: publicProcedure.query(async ({ ctx }) => {
    const claims = await requireClaims(ctx.req);
    const list = await railwayFetch<Imovel[]>(`/imoveis/buscar?cpf=${claims.cpf}`);
    return list;
  }),

  // ── Animals ────────────────────────────────────────────────────────────────
  animais: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const path: Record<string, string> = {
        ovinos: `/ovino/animais/${input.imovelId}`,
        caprinos: `/caprino/animais/${input.imovelId}`,
        suinos: `/suino/animais/${input.imovelId}`,
        bovinos: `/bovino/animais/${input.imovelId}`,
      };
      return railwayFetch<Animal[]>(path[input.especie]);
    }),

  // ── Dashboard ──────────────────────────────────────────────────────────────
  ovinoDashboard: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return railwayFetch<OvinoDashboard>(`/ovino/dashboard/${input.imovelId}`);
    }),

  // ── Financial ──────────────────────────────────────────────────────────────
  produtorResumo: publicProcedure
    .input(z.object({ produtorId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      return railwayFetch<ProdutorResumo>(`/produtores/${input.produtorId}/resumo`);
    }),

  lancamentos: publicProcedure
    .input(z.object({ produtorId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      return railwayFetch<Lancamento[]>(`/produtores/${input.produtorId}/lancamentos`);
    }),

  // ── Sanitary ───────────────────────────────────────────────────────────────
  sanitario: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const path: Record<string, string> = {
        ovinos: `/ovino/sanitario/${input.imovelId}/proximos`,
        caprinos: `/caprino/sanitario/${input.imovelId}/proximos`,
        bovinos: `/bovino/sanitario/${input.imovelId}/proximos`,
      };
      return railwayFetch<SanitarioRecord[]>(path[input.especie]);
    }),

  // ── Reproduction ───────────────────────────────────────────────────────────
  reproducao: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const path: Record<string, string> = {
        ovinos: `/ovino/reproducao/${input.imovelId}/prenhas`,
        caprinos: `/caprino/reproducao/${input.imovelId}/prenhas`,
        bovinos: `/bovino/reproducao/${input.imovelId}/prenhas`,
      };
      return railwayFetch<ReproducaoRecord[]>(path[input.especie]);
    }),

  // ── Lancamento mutations (write through server) ────────────────────────────
  createLancamento: publicProcedure
    .input(z.object({
      produtorId: z.number(),
      tipo: z.string(),
      descricao: z.string(),
      valor: z.number(),
      data_lancamento: z.string(),
      confirmado: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      const res = await fetch(`${RAILWAY_API}/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as { detail?: string }).detail ?? "Erro ao criar lançamento" });
      }
      return res.json() as Promise<Lancamento>;
    }),

  deleteLancamento: publicProcedure
    .input(z.object({ produtorId: z.number(), lancamentoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      const res = await fetch(`${RAILWAY_API}/lancamentos/${input.lancamentoId}`, { method: "DELETE" });
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao deletar lançamento" });
      return { success: true };
    }),
});
