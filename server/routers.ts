import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as jose from "jose";
import { ENV } from "./_core/env";
import * as otp from "./otp";
import { sdk } from "./_core/sdk";
import { railwayRouter } from "./routers/railway";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const speciesEnum = z.enum(["ovinos", "caprinos", "suinos", "bovinos"]);
const sexEnum = z.enum(["macho", "femea"]);
const statusEnum = z.enum(["ativo", "vendido", "morto", "transferido"]);
const healthTypeEnum = z.enum(["vacina", "medicamento", "ocorrencia"]);
const reproTypeEnum = z.enum(["cobertura", "gestacao", "parto", "aborto"]);
const financialTypeEnum = z.enum(["receita", "despesa"]);
const movementTypeEnum = z.enum(["entrada", "saida", "transferencia", "nascimento", "morte", "venda"]);

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  railway: railwayRouter,

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    loginWithCpf: publicProcedure
      .input(z.object({ cpf: z.string().min(11), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.verifyUserPassword(input.cpf, input.password);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "CPF ou senha inválidos." });
        }
        const token = await signJwt({ sub: user.openId, userId: user.id, role: user.role });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
        return { success: true, user: { id: user.id, name: user.name, cpf: user.cpf, role: user.role } };
      }),

    registerWithCpf: publicProcedure
      .input(z.object({
        name: z.string().min(2),
        cpf: z.string().min(11),
        password: z.string().min(6),
        role: z.enum(["user", "admin"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getUserByCpf(input.cpf);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "CPF já cadastrado." });
        const user = await db.createUserWithCpf({ name: input.name, cpf: input.cpf, password: input.password, role: input.role });
        return { success: true, user: { id: user.id, name: user.name, cpf: user.cpf } };
      }),

    // Step 1: Send OTP via WhatsApp/Telegram
    sendOtp: publicProcedure
      .input(z.object({ cpf: z.string().min(11) }))
      .mutation(async ({ input }) => {
        return otp.sendOtp(input.cpf);
      }),

    // Step 2: Verify OTP and create session
    verifyOtp: publicProcedure
      .input(z.object({ cpf: z.string().min(11), code: z.string().length(6) }))
      .mutation(async ({ input, ctx }) => {
        const result = await otp.verifyOtp(input.cpf, input.code);
        // Create session token with Manus SDK (for ctx.user resolution)
        const token = await sdk.createSessionToken(result.openId, {
          name: result.produtorNome,
          expiresInMs: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
        // Also set a signed rc_claims cookie binding produtorId + allowed imovelIds to this session
        const claimsToken = await signJwt({
          produtorId: result.produtorId,
          cpf: input.cpf.replace(/\D/g, ""),
          imovelId: result.imovelId ?? null,
          role: result.role ?? "user",
        });
        ctx.res.cookie("rc_claims", claimsToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
        return {
          success: true as const,
          produtorId: result.produtorId,
          produtorNome: result.produtorNome,
          imovelId: result.imovelId,
          imovelCount: result.imovelCount,
          cpf: input.cpf,
        };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie("rc_claims", { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Re-emit rc_claims when producer switches property
    switchImovel: publicProcedure
      .input(z.object({ imovelId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getClaimsFromRequest } = await import("./railwayProxy");
        const claims = await getClaimsFromRequest(ctx.req);
        if (!claims) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        const claimsToken = await signJwt({
          produtorId: claims.produtorId,
          cpf: claims.cpf,
          imovelId: input.imovelId,
          role: claims.role ?? "user",
        });
        ctx.res.cookie("rc_claims", claimsToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
        return { success: true, imovelId: input.imovelId };
      }),
  }),

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const [herd, financial] = await Promise.all([
        db.getHerdSummary(ctx.user.id),
        db.getFinancialSummary(ctx.user.id),
      ]);
      return { herd, financial };
    }),
  }),

  // ── Animals ───────────────────────────────────────────────────────────────
  animals: router({
    list: protectedProcedure
      .input(z.object({ species: speciesEnum.optional() }).optional())
      .query(({ ctx, input }) => db.getAnimalsByUser(ctx.user.id, input?.species)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const animal = await db.getAnimalById(input.id, ctx.user.id);
        if (!animal) throw new TRPCError({ code: "NOT_FOUND" });
        return animal;
      }),

    create: protectedProcedure
      .input(z.object({
        identifier: z.string().min(1),
        name: z.string().optional(),
        species: speciesEnum,
        breed: z.string().optional(),
        sex: sexEnum,
        birthDate: z.string().optional(),
        weight: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.createAnimal({ ...input, userId: ctx.user.id, birthDate: input.birthDate as unknown as Date | undefined, weight: input.weight as unknown as string | undefined })
      ),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        identifier: z.string().min(1).optional(),
        name: z.string().optional(),
        species: speciesEnum.optional(),
        breed: z.string().optional(),
        sex: sexEnum.optional(),
        birthDate: z.string().optional(),
        weight: z.string().optional(),
        status: statusEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateAnimal(id, ctx.user.id, data as Parameters<typeof db.updateAnimal>[2]);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteAnimal(input.id, ctx.user.id)),
  }),

  // ── Health ────────────────────────────────────────────────────────────────
  health: router({
    list: protectedProcedure
      .input(z.object({ animalId: z.number().optional() }).optional())
      .query(({ ctx, input }) => db.getHealthRecords(ctx.user.id, input?.animalId)),

    create: protectedProcedure
      .input(z.object({
        animalId: z.number(),
        type: healthTypeEnum,
        description: z.string().min(1),
        date: z.string(),
        nextDueDate: z.string().optional(),
        dosage: z.string().optional(),
        veterinarian: z.string().optional(),
        cost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.createHealthRecord({ ...input, userId: ctx.user.id, date: input.date as unknown as Date, nextDueDate: input.nextDueDate as unknown as Date | undefined, cost: input.cost as unknown as string | undefined })
      ),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        date: z.string().optional(),
        nextDueDate: z.string().optional(),
        dosage: z.string().optional(),
        veterinarian: z.string().optional(),
        cost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateHealthRecord(id, ctx.user.id, data as Parameters<typeof db.updateHealthRecord>[2]);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteHealthRecord(input.id, ctx.user.id)),
  }),

  // ── Reproduction ──────────────────────────────────────────────────────────
  reproduction: router({
    list: protectedProcedure
      .input(z.object({ animalId: z.number().optional() }).optional())
      .query(({ ctx, input }) => db.getReproductiveRecords(ctx.user.id, input?.animalId)),

    create: protectedProcedure
      .input(z.object({
        femaleId: z.number(),
        maleId: z.number().optional(),
        type: reproTypeEnum,
        date: z.string(),
        expectedBirthDate: z.string().optional(),
        actualBirthDate: z.string().optional(),
        offspringCount: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.createReproductiveRecord({ ...input, userId: ctx.user.id, date: input.date as unknown as Date, expectedBirthDate: input.expectedBirthDate as unknown as Date | undefined, actualBirthDate: input.actualBirthDate as unknown as Date | undefined })
      ),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteReproductiveRecord(input.id, ctx.user.id)),
  }),

  // ── Financial ─────────────────────────────────────────────────────────────
  financial: router({
    list: protectedProcedure
      .input(z.object({ from: z.string().optional(), to: z.string().optional(), type: financialTypeEnum.optional() }).optional())
      .query(({ ctx, input }) => db.getFinancialRecords(ctx.user.id, input)),

    summary: protectedProcedure.query(({ ctx }) => db.getFinancialSummary(ctx.user.id)),

    create: protectedProcedure
      .input(z.object({
        type: financialTypeEnum,
        category: z.string().min(1),
        description: z.string().min(1),
        amount: z.string(),
        date: z.string(),
        animalId: z.number().optional(),
        species: speciesEnum.optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.createFinancialRecord({ ...input, userId: ctx.user.id, date: input.date as unknown as Date, amount: input.amount as unknown as string })
      ),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteFinancialRecord(input.id, ctx.user.id)),
  }),

  // ── Produtor Config (Telegram / WhatsApp settings)
  produtorConfig: router({
    get: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest } = await import("./railwayProxy");
      const claims = await getClaimsFromRequest(ctx.req);
      if (!claims) return null;
      return db.getProdutorConfig(claims.produtorId);
    }),
    save: publicProcedure
      .input(z.object({
        telegramChatId: z.string().nullable().optional(),
        whatsappPriority: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getClaimsFromRequest } = await import("./railwayProxy");
        const claims = await getClaimsFromRequest(ctx.req);
        if (!claims) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
        await db.upsertProdutorConfig(claims.produtorId, {
          telegramChatId: input.telegramChatId ?? undefined,
          whatsappPriority: input.whatsappPriority,
        });
        return { success: true };
      }),
  }),

  // ── Procurações ────────────────────────────────────────────────────────────────────────────────────
  procuracao: router({
    /** Verifica o status da procuração do procurador logado */
    status: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest } = await import("./railwayProxy");
      const claims = await getClaimsFromRequest(ctx.req);
      if (!claims) return null;
      // Busca pelo CPF formatado do claims
      const cpf = claims.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      return db.getProcuracaoByProcurador(cpf);
    }),

    /** Upload de procuração: recebe base64 do arquivo e salva no S3 */
    upload: publicProcedure
      .input(z.object({
        procuradorCpf: z.string().min(11),
        procuradorNome: z.string().optional(),
        produtorCpf: z.string().min(11),
        fileBase64: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import("./storage");
        const cpfClean = input.procuradorCpf.replace(/\D/g, "");
        const ext = input.fileName.split(".").pop() ?? "pdf";
        const key = `procuracoes/${cpfClean}/${Date.now()}.${ext}`;
        const buffer = Buffer.from(input.fileBase64, "base64");
        const { url } = await storagePut(key, buffer, input.mimeType);
        const proc = await db.createProcuracao({
          procuradorCpf: input.procuradorCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"),
          procuradorNome: input.procuradorNome,
          produtorCpf: input.produtorCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"),
          arquivoUrl: url,
          arquivoKey: key,
        });
        return { success: true, id: proc.id, status: proc.status };
      }),

    /** Lista todas as procurações (admin only) */
    list: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest } = await import("./railwayProxy");
      const claims = await getClaimsFromRequest(ctx.req);
      if (!claims || claims.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador." });
      }
      return db.listProcuracoes();
    }),

    /** Aprova ou rejeita uma procuração (admin only) */
    updateStatus: publicProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["aprovado", "rejeitado"]),
        adminNota: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getClaimsFromRequest } = await import("./railwayProxy");
        const claims = await getClaimsFromRequest(ctx.req);
        if (!claims || claims.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador." });
        }
        await db.updateProcuracaoStatus(input.id, input.status, input.adminNota);
        return { success: true };
      }),
  }),

  // ── Movements ─────────────────────────────────────────────────────────────
  movements: router({
    list: protectedProcedure
      .input(z.object({ from: z.string().optional(), to: z.string().optional(), species: speciesEnum.optional() }).optional())
      .query(({ ctx, input }) => db.getMovements(ctx.user.id, input)),

    create: protectedProcedure
      .input(z.object({
        animalId: z.number(),
        type: movementTypeEnum,
        date: z.string(),
        fromLocation: z.string().optional(),
        toLocation: z.string().optional(),
        weight: z.string().optional(),
        value: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.createMovement({ ...input, userId: ctx.user.id, date: input.date as unknown as Date, weight: input.weight as unknown as string | undefined, value: input.value as unknown as string | undefined })
      ),
  }),
});

export type AppRouter = typeof appRouter;
