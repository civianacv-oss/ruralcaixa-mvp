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
import { getImoveisForProdutor } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface Raca {
  id: number;
  nome: string;
  aptidao?: string;
  ativo?: boolean;
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

// ─── Generic Railway mutation helper ─────────────────────────────────────────

async function railwayMutate<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(`${RAILWAY_API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: (err as { detail?: string }).detail ?? `Railway API error ${res.status}`,
    });
  }
  // Some DELETE endpoints return 204 No Content
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ─── Species path map ─────────────────────────────────────────────────────────

const especiePrefix: Record<string, string> = {
  ovinos: "ovino",
  caprinos: "caprino",
  suinos: "suino",
  bovinos: "bovino",
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const railwayRouter = router({

  // ── Imóveis ────────────────────────────────────────────────────────────────
  imoveis: publicProcedure.query(async ({ ctx }) => {
    const claims = await requireClaims(ctx.req);
    // Fetch all imóveis from Railway for this CPF
    const allImoveis = await railwayFetch<Imovel[]>(`/imoveis/buscar?cpf=${claims.cpf}`);
    // Admin (contador) sees ALL properties; user (produtor) is filtered by local ACL
    if (claims.role === "admin") {
      return allImoveis;
    }
    // Filter by local ACL table (produtor_imovel) so each produtor sees only their property
    const allowedIds = await getImoveisForProdutor(claims.produtorId);
    if (!allowedIds) {
      // No ACL rows configured — return all (fallback for new producers)
      return allImoveis;
    }
    return allImoveis.filter((im) => allowedIds.includes(im.id));
  }),

  // ── Raças por espécie ──────────────────────────────────────────────────────
  racas: publicProcedure
    .input(z.object({ especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      await requireClaims(ctx.req);
      const prefix = especiePrefix[input.especie];
      return railwayFetch<Raca[]>(`/${prefix}/racas`).catch(() => [] as Raca[]);
    }),

  // ── Animals ────────────────────────────────────────────────────────────────
  animais: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      return railwayFetch<Animal[]>(`/${prefix}/animais/${input.imovelId}`);
    }),

  createAnimal: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      brinco: z.string().min(1),
      nome: z.string().optional(),
      raca: z.string().optional(),
      sexo: z.enum(["M", "F"]),
      data_nascimento: z.string().optional(),
      peso_nascimento: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { imovelId, especie, ...fields } = input;
      return railwayMutate<Animal>(`/${prefix}/animais`, "POST", {
        imovel_id: imovelId,
        ...fields,
      });
    }),

  updateAnimal: publicProcedure
    .input(z.object({
      animalId: z.number(),
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      brinco: z.string().optional(),
      nome: z.string().optional(),
      raca: z.string().optional(),
      sexo: z.enum(["M", "F"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { animalId, imovelId, especie, ...fields } = input;
      return railwayMutate<Animal>(`/${prefix}/animais/${animalId}`, "PATCH", fields);
    }),

  updateAnimalStatus: publicProcedure
    .input(z.object({
      animalId: z.number(),
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      status: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { animalId, imovelId, especie, ...fields } = input;
      return railwayMutate<Animal>(`/${prefix}/animais/${animalId}/status`, "PATCH", fields);
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

  createLancamento: publicProcedure
    .input(z.object({
      produtorId: z.number(),
      tipo: z.enum(["receita", "despesa"]),
      descricao: z.string().min(1),
      valor: z.number().positive(),
      data_lancamento: z.string(),
      confirmado: z.boolean().optional(),
      atividade: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      const { produtorId, ...fields } = input;
      return railwayMutate<Lancamento>(`/lancamentos`, "POST", {
        produtor_id: produtorId,
        ...fields,
      });
    }),

  updateLancamento: publicProcedure
    .input(z.object({
      lancamentoId: z.string(),
      produtorId: z.number(),
      tipo: z.enum(["receita", "despesa"]).optional(),
      descricao: z.string().optional(),
      valor: z.number().positive().optional(),
      data_lancamento: z.string().optional(),
      confirmado: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      const { lancamentoId, produtorId, ...fields } = input;
      return railwayMutate<Lancamento>(`/lancamentos/${lancamentoId}`, "PUT", {
        produtor_id: produtorId,
        ...fields,
      });
    }),

  deleteLancamento: publicProcedure
    .input(z.object({ produtorId: z.number(), lancamentoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      await railwayMutate<unknown>(`/lancamentos/${input.lancamentoId}`, "DELETE");
      return { success: true };
    }),

  // ── Sanitary ───────────────────────────────────────────────────────────────
  sanitario: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      return railwayFetch<SanitarioRecord[]>(`/${prefix}/sanitario/${input.imovelId}/proximos`);
    }),

  createSanitario: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      insumo_id: z.number().optional(),
      descricao: z.string().min(1),
      tipo: z.string(),
      data_aplicacao: z.string(),
      animal_id: z.number().optional(),
      dose_ml: z.number().optional(),
      responsavel_nome: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { imovelId, especie, ...fields } = input;
      return railwayMutate<SanitarioRecord>(`/${prefix}/saude`, "POST", {
        imovel_id: imovelId,
        ...fields,
      });
    }),

  // ── Reproduction ───────────────────────────────────────────────────────────
  reproducao: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      return railwayFetch<ReproducaoRecord[]>(`/${prefix}/reproducao/${input.imovelId}/prenhas`);
    }),

  createReproducao: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "bovinos"]),
      tipo: z.string(),
      data_evento: z.string(),
      matriz_id: z.number().optional(),
      reprodutor_id: z.number().optional(),
      cordeiros_vivos: z.number().optional(),
      cordeiros_mortos: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { imovelId, especie, ...fields } = input;
      return railwayMutate<ReproducaoRecord>(`/${prefix}/reproducao`, "POST", {
        imovel_id: imovelId,
        ...fields,
      });
    }),
});
