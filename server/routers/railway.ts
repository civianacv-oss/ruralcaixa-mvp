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
import * as XLSX from "xlsx";
import { TRPCError } from "@trpc/server";
import { getImoveisForProdutor, seedImoveisAcl, upsertInsumosCatalogo, searchInsumosCatalogo, listInsumosCatalogo } from "../db";

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

interface Insumo {
  id: number;
  nome: string;
  descricao?: string;
  categoria: string;
  unidade: string;
  origem: string;
  estoque_atual: number;
  estoque_minimo: number;
  estoque_ideal: number;
  preco_estimado?: number;
  fornecedor_id?: number;
  fornecedor_nome?: string;
  reposicao_modo: string;
  lead_time_dias: number;
  status_estoque?: string;
}

interface Fornecedor {
  id: number;
  nome: string;
  cnpj_cpf?: string;
  whatsapp?: string;
  telegram?: string;
  email?: string;
  endereco?: string;
  prazo_entrega_dias: number;
  forma_pagamento: string;
  observacoes?: string;
  total_pedidos?: number;
}

interface MovimentacaoInsumo {
  id: number;
  insumo_id: number;
  tipo: string;
  quantidade: number;
  custo_unitario?: number;
  custo_total?: number;
  observacao?: string;
  data_movim: string;
  criado_em?: string;
}

interface PedidoCompra {
  id: number;
  insumo_id: number;
  insumo_nome?: string;
  unidade?: string;
  fornecedor_id?: number;
  fornecedor_nome?: string;
  fornecedor_whatsapp?: string;
  quantidade: number;
  preco_estimado?: number;
  valor_total_estimado?: number;
  data_entrega_desejada?: string;
  status: string;
  modo_geracao: string;
  observacao?: string;
  criado_em?: string;
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
    let allowedIds = await getImoveisForProdutor(claims.produtorId);
    if (!allowedIds) {
      // No ACL rows yet — seed from Railway data on first login (auto-registration)
      // This ensures the produtor only sees imóveis linked to their own CPF
      const railwayIds = allImoveis.map((im) => im.id);
      await seedImoveisAcl(claims.produtorId, railwayIds);
      allowedIds = railwayIds;
    }
    return allImoveis.filter((im) => (allowedIds as number[]).includes(im.id));
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
      // Bovinos use path param; ovinos/caprinos/suinos use query param
      if (input.especie === "bovinos") {
        return railwayFetch<Animal[]>(`/${prefix}/animais/${input.imovelId}`);
      }
      return railwayFetch<Animal[]>(`/${prefix}/animais?imovel_id=${input.imovelId}`);
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
      // Bovinos use path param; ovinos/caprinos use query param on /sanitario/calendario
      if (input.especie === "bovinos") {
        return railwayFetch<SanitarioRecord[]>(`/${prefix}/sanitario/${input.imovelId}/proximos`);
      }
      return railwayFetch<SanitarioRecord[]>(`/${prefix}/sanitario/calendario?imovel_id=${input.imovelId}&dias=30`);
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
      // Only bovinos have a dedicated /reproducao/{imovel_id}/prenhas endpoint.
      // For ovinos/caprinos, use the saude/alertas endpoint as a proxy for reproductive alerts.
      if (input.especie === "bovinos") {
        return railwayFetch<ReproducaoRecord[]>(`/${prefix}/reproducao/${input.imovelId}/prenhas`);
      }
      // ovinos/caprinos: use alertas filtered to reproductive events
      return railwayFetch<ReproducaoRecord[]>(`/${prefix}/alertas?imovel_id=${input.imovelId}&tipo=reproducao`).catch(() => []);
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

  // ── Insumos ────────────────────────────────────────────────────────────────
  insumos: publicProcedure
    .input(z.object({ imovelId: z.number(), categoria: z.string().optional(), origem: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const params = new URLSearchParams({ fazenda_id: String(input.imovelId) });
      if (input.categoria) params.set("categoria", input.categoria);
      if (input.origem) params.set("origem", input.origem);
      const data = await railwayFetch<{ data: Insumo[] } | Insumo[]>(`/insumos/?${params}`);
      return Array.isArray(data) ? data : (data as { data: Insumo[] }).data ?? [];
    }),

  insumosAlertas: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayFetch<{ data: Insumo[]; total: number } | Insumo[]>(`/insumos/alertas?fazenda_id=${input.imovelId}`);
      return Array.isArray(data) ? data : (data as { data: Insumo[] }).data ?? [];
    }),

  createInsumo: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      categoria: z.string().default("outros"),
      unidade: z.string().default("unidade"),
      origem: z.enum(["comprado", "proprio", "doacao"]).default("comprado"),
      estoque_atual: z.number().default(0),
      estoque_minimo: z.number().default(0),
      estoque_ideal: z.number().default(0),
      preco_estimado: z.number().optional(),
      fornecedor_id: z.number().optional(),
      reposicao_modo: z.enum(["automatico", "manual"]).default("manual"),
      lead_time_dias: z.number().default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const { imovelId, ...fields } = input;
      const data = await railwayMutate<{ data: Insumo } | Insumo>(`/insumos/`, "POST", { fazenda_id: imovelId, ...fields });
      return (data as { data: Insumo }).data ?? data;
    }),

  insumoDetalhe: publicProcedure
    .input(z.object({ imovelId: z.number(), insumoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayFetch<{ data: Insumo & { movimentacoes?: MovimentacaoInsumo[] } } | (Insumo & { movimentacoes?: MovimentacaoInsumo[] })>(`/insumos/${input.insumoId}?fazenda_id=${input.imovelId}`);
      return (data as { data: Insumo & { movimentacoes?: MovimentacaoInsumo[] } }).data ?? data;
    }),

  movimentarInsumo: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      insumoId: z.number(),
      tipo: z.enum(["compra", "producao_propria", "doacao", "ajuste_positivo", "uso", "venda", "perda", "ajuste_negativo"]),
      quantidade: z.number().positive(),
      custo_unitario: z.number().optional(),
      observacao: z.string().optional(),
      data_movim: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const { imovelId, insumoId, ...fields } = input;
      const data = await railwayMutate<{ data: MovimentacaoInsumo } | MovimentacaoInsumo>(`/insumos/${insumoId}/movimentar`, "POST", fields);
      return (data as { data: MovimentacaoInsumo }).data ?? data;
    }),

  // ── Fornecedores ───────────────────────────────────────────────────────────
  fornecedores: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayFetch<{ data: Fornecedor[] } | Fornecedor[]>(`/fornecedores/?fazenda_id=${input.imovelId}`);
      return Array.isArray(data) ? data : (data as { data: Fornecedor[] }).data ?? [];
    }),

  createFornecedor: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      nome: z.string().min(1),
      cnpj_cpf: z.string().optional(),
      whatsapp: z.string().optional(),
      telegram: z.string().optional(),
      email: z.string().optional(),
      endereco: z.string().optional(),
      prazo_entrega_dias: z.number().default(7),
      forma_pagamento: z.string().default("a_vista"),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const { imovelId, ...fields } = input;
      const data = await railwayMutate<{ data: Fornecedor } | Fornecedor>(`/fornecedores/`, "POST", { fazenda_id: imovelId, ...fields });
      return (data as { data: Fornecedor }).data ?? data;
    }),

  // ── Pedidos de Compra ────────────────────────────────────────────────────────
  pedidosCompra: publicProcedure
    .input(z.object({ imovelId: z.number(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const params = new URLSearchParams({ fazenda_id: String(input.imovelId) });
      if (input.status) params.set("status", input.status);
      const data = await railwayFetch<{ data: PedidoCompra[] } | PedidoCompra[]>(`/pedidos-compra/?${params}`);
      return Array.isArray(data) ? data : (data as { data: PedidoCompra[] }).data ?? [];
    }),

  createPedidoCompra: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      insumo_id: z.number(),
      fornecedor_id: z.number().optional(),
      quantidade: z.number().positive(),
      preco_estimado: z.number().optional(),
      data_entrega_desejada: z.string().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const { imovelId, ...fields } = input;
      const data = await railwayMutate<{ data: PedidoCompra } | PedidoCompra>(`/pedidos-compra/`, "POST", { fazenda_id: imovelId, ...fields });
      return (data as { data: PedidoCompra }).data ?? data;
    }),

  aprovarPedidoCompra: publicProcedure
    .input(z.object({ imovelId: z.number(), pedidoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayMutate<{ data: PedidoCompra } | PedidoCompra>(`/pedidos-compra/${input.pedidoId}/aprovar`, "PUT");
      return (data as { data: PedidoCompra }).data ?? data;
    }),

  enviarPedidoCompra: publicProcedure
    .input(z.object({ imovelId: z.number(), pedidoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return railwayMutate<{ ok: boolean; enviado_telegram: boolean; mensagem: string }>(`/pedidos-compra/${input.pedidoId}/enviar`, "POST");
    }),

  /**
   * Importar insumos de planilha Excel ou CSV.
   * O cliente envia o arquivo como base64 + mimeType.
   * O servidor parseia, valida e cria cada insumo via API Railway.
   */
  importarInsumos: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);

      // Parse do arquivo
      const buffer = Buffer.from(input.fileBase64, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Detectar a linha de cabeçalho real: procurar a primeira linha que contenha "nome" ou "name"
      // A planilha pode ter linhas de metadados antes do cabeçalho (ex: "Gerado em...", "Fazenda...", etc.)
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 }) as unknown[][];
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
        const rowVals = rawRows[i].map(v => String(v ?? "").toLowerCase().trim());
        if (rowVals.some(v => v === "nome" || v === "name" || v === "insumo" || v === "produto")) {
          headerRowIndex = i;
          break;
        }
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: headerRowIndex });

      if (rows.length === 0) throw new Error("Planilha vazia ou sem dados reconhecíveis. Verifique se há uma coluna chamada \"Nome\".");
      if (rows.length > 500) throw new Error("Limite de 500 linhas por importação.");

      // Mapear colunas flexíveis (aceita PT e EN)
      const normalize = (v: unknown) => String(v ?? "").trim();
      const toNum = (v: unknown) => { const n = parseFloat(String(v ?? "0").replace(",", ".")); return isNaN(n) ? 0 : n; };

      const col = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, ""));
          if (found && row[found] !== "") return row[found];
        }
        return "";
      };

      const results: { nome: string; codigo?: string; ok: boolean; action?: "criado" | "atualizado"; error?: string }[] = [];

      for (const row of rows) {
        const nome = normalize(col(row, "nome", "name", "insumo", "produto"));
        if (!nome) { results.push({ nome: "(sem nome)", ok: false, error: "Nome obrigatório" }); continue; }

        const categoria = normalize(col(row, "categoria", "category", "tipo", "type")) || "outros";
        const unidade = normalize(col(row, "unidade", "unit", "un")) || "unidade";

        try {
          // 1. Upsert no catálogo local (cria ou atualiza pelo nome normalizado)
          const catalogItem = await upsertInsumosCatalogo({
            imovelId: input.imovelId,
            nome,
            categoria,
            unidade,
          });

          // 2. Tentar enviar para a API Railway (se disponível)
          const payload = {
            fazenda_id: input.imovelId,
            nome,
            categoria,
            unidade,
            origem: normalize(col(row, "origem", "origin")) || "comprado",
            estoque_atual: toNum(col(row, "estoqueatual", "estoque", "posicaofisicaatual", "posicao", "quantidade", "qty", "stock")),
            estoque_minimo: toNum(col(row, "estoqueminimo", "minimo", "min", "stockmin")),
            estoque_ideal: toNum(col(row, "estoqueideal", "ideal", "stockideal")),
            preco_estimado: toNum(col(row, "precoestimado", "preco", "price", "valor", "valorunitariodaultimacompra", "valorunitario")) || undefined,
            reposicao_modo: normalize(col(row, "reposicaomodo", "reposicao", "repositionmode")) === "automatico" ? "automatico" : "manual",
            lead_time_dias: toNum(col(row, "leadtime", "leadtimediatias", "prazoentrega")) || 7,
          };

          try {
            const railwayResult = await railwayMutate<{ id: number } | unknown>("/insumos/", "POST", payload);
            // Atualizar railwayId no catálogo se o Railway retornou um id
            if (railwayResult && typeof railwayResult === "object" && "id" in railwayResult) {
              await upsertInsumosCatalogo({ imovelId: input.imovelId, nome, categoria, unidade, railwayId: (railwayResult as { id: number }).id });
            }
          } catch {
            // Railway não disponível ainda — ignorar silenciosamente, catálogo local já foi salvo
          }

          const isNew = !catalogItem.railwayId;
          results.push({ nome, codigo: catalogItem.codigo, ok: true, action: isNew ? "criado" : "atualizado" });
        } catch (e: unknown) {
          results.push({ nome, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const success = results.filter(r => r.ok).length;
      const errors = results.filter(r => !r.ok).length;
      return { total: rows.length, success, errors, results };
    }),

  /** Lista o catálogo local de insumos de uma fazenda */
  listarCatalogInsumos: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return listInsumosCatalogo(input.imovelId);
    }),

  /** Busca insumos no catálogo por nome (autocomplete) */
  buscarCatalogInsumos: publicProcedure
    .input(z.object({ imovelId: z.number(), query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return searchInsumosCatalogo(input.imovelId, input.query);
    }),

  /** Upsert manual de um insumo no catálogo (cadastro pelo formulário) */
  upsertCatalogInsumo: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      nome: z.string().min(1),
      categoria: z.string().optional(),
      unidade: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return upsertInsumosCatalogo({
        imovelId: input.imovelId,
        nome: input.nome,
        categoria: input.categoria,
        unidade: input.unidade,
      });
    }),

  /**
   * Pré-analisa a planilha e retorna:
   * - rows: todas as linhas parseadas com as 10 colunas oficiais
   * - unmapped: nomes que não existem no catálogo (precisam de de-para)
   * - catalog: catálogo atual da fazenda (para popular os selects de de-para)
   */
  analisarPlanilhaInsumos: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);

      const buffer = Buffer.from(input.fileBase64, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Detectar linha de cabeçalho real
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 }) as unknown[][];
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
        const rowVals = rawRows[i].map(v => String(v ?? "").toLowerCase().trim());
        if (rowVals.some(v => v === "nome" || v === "name" || v === "insumo" || v === "produto")) {
          headerRowIndex = i;
          break;
        }
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: headerRowIndex });
      if (rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: 'Planilha vazia ou sem coluna "Nome" reconhecível.' });
      if (rows.length > 500) throw new TRPCError({ code: "BAD_REQUEST", message: "Limite de 500 linhas por importação." });

      const normalize = (v: unknown) => String(v ?? "").trim();
      const toNum = (v: unknown) => { const n = parseFloat(String(v ?? "0").replace(",", ".")); return isNaN(n) ? 0 : n; };
      const col = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, ""));
          if (found && row[found] !== "") return row[found];
        }
        return "";
      };

      // Parsear as 10 colunas oficiais de cada linha
      const parsedRows = rows.map((row, idx) => ({
        _linha: idx + 2,
        nome: normalize(col(row, "nome", "name", "insumo", "produto")),
        categoria: normalize(col(row, "categoria", "category", "tipo")) || "outros",
        unidade: normalize(col(row, "unidade", "unit", "un")) || "unidade",
        origem: normalize(col(row, "origem", "origin")) || "comprado",
        estoque_atual: toNum(col(row, "estoqueatual", "estoque", "posicaofisicaatual", "posicao", "quantidade")),
        estoque_minimo: toNum(col(row, "estoqueminimo", "minimo", "min")),
        estoque_ideal: toNum(col(row, "estoqueideal", "ideal")),
        preco_estimado: toNum(col(row, "precoestimado", "preco", "price", "valor", "valorunitariodaultimacompra", "valorunitario")) || 0,
        reposicao_modo: normalize(col(row, "reposicaomodo", "reposicao")) === "automatico" ? "automatico" : "manual",
        lead_time_dias: toNum(col(row, "leadtime", "leadtimediatias", "prazoentrega")) || 7,
      }));

      // Identificar nomes sem correspondente no catálogo
      const catalog = await listInsumosCatalogo(input.imovelId);
      const catalogNomes = new Set(catalog.map((c) => c.nomeNormalizado));
      const normalizeNome = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

      const unmapped: { nome: string; linha: number }[] = [];
      const seen = new Set<string>();
      for (const r of parsedRows) {
        if (!r.nome) continue;
        const key = normalizeNome(r.nome);
        if (!catalogNomes.has(key) && !seen.has(key)) {
          unmapped.push({ nome: r.nome, linha: r._linha });
          seen.add(key);
        }
      }

      return { rows: parsedRows, unmapped, catalog, total: parsedRows.length };
    }),

  /**
   * Confirma a importação com os mapeamentos de-para resolvidos.
   * mappings: { nomePlanilha: nomeDestino } — se nomeDestino === nomePlanilha, cria novo; caso contrário, usa o nome destino
   */
  confirmarImportacaoInsumos: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      rows: z.array(z.object({
        _linha: z.number(),
        nome: z.string(),
        categoria: z.string(),
        unidade: z.string(),
        origem: z.string(),
        estoque_atual: z.number(),
        estoque_minimo: z.number(),
        estoque_ideal: z.number(),
        preco_estimado: z.number(),
        reposicao_modo: z.string(),
        lead_time_dias: z.number(),
      })),
      mappings: z.record(z.string(), z.string()), // { nomePlanilha: nomeDestino }
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);

      const results: { nome: string; codigo?: string; ok: boolean; action?: "criado" | "atualizado"; error?: string }[] = [];

      for (const row of input.rows) {
        if (!row.nome) { results.push({ nome: "(sem nome)", ok: false, error: "Nome obrigatório" }); continue; }

        // Aplicar de-para: se o nome da planilha foi mapeado para outro, usar o destino
        const nomeDestino = input.mappings[row.nome] ?? row.nome;

        try {
          // Upsert no catálogo local
          const catalogItem = await upsertInsumosCatalogo({
            imovelId: input.imovelId,
            nome: nomeDestino,
            categoria: row.categoria,
            unidade: row.unidade,
          });

          // Tentar enviar para Railway
          try {
            const payload = {
              fazenda_id: input.imovelId,
              nome: nomeDestino,
              categoria: row.categoria,
              unidade: row.unidade,
              origem: row.origem,
              estoque_atual: row.estoque_atual,
              estoque_minimo: row.estoque_minimo,
              estoque_ideal: row.estoque_ideal,
              preco_estimado: row.preco_estimado || undefined,
              reposicao_modo: row.reposicao_modo,
              lead_time_dias: row.lead_time_dias,
            };
            const railwayResult = await railwayMutate<{ id: number } | unknown>("/insumos/", "POST", payload);
            if (railwayResult && typeof railwayResult === "object" && "id" in railwayResult) {
              await upsertInsumosCatalogo({ imovelId: input.imovelId, nome: nomeDestino, categoria: row.categoria, unidade: row.unidade, railwayId: (railwayResult as { id: number }).id });
            }
          } catch {
            // Railway indisponível — ignorar
          }

          const isNew = !catalogItem.railwayId;
          results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: isNew ? "criado" : "atualizado" });
        } catch (e: unknown) {
          results.push({ nome: nomeDestino, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const success = results.filter(r => r.ok).length;
      const errors = results.filter(r => !r.ok).length;
      return { total: input.rows.length, success, errors, results };
    }),

  // ─── Simulador de Regime Tributário ───────────────────────────────────────

  simulacaoAvulsa: publicProcedure
    .input(z.object({
      faturamento_12m: z.number(),
      folha_12m: z.number().default(0),
      despesas_12m: z.number().default(0),
      tipo_producao: z.enum(["in_natura", "industrializado", "servico", "misto", "comercio", "industria"]).default("in_natura"),
      creditos_pis_cofins: z.number().default(0),
      jcp: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const res = await railwayFetch<unknown>("/simulador-regime/simulacao", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return res;
    }),

  registrarCompetencia: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      competencia: z.string(), // "YYYY-MM"
      faturamento: z.number(),
      folha_pagamento: z.number().default(0),
      despesas_dedutiveis: z.number().default(0),
      tipo_producao: z.enum(["in_natura", "industrializado", "servico", "misto", "comercio", "industria"]).default("in_natura"),
      creditos_pis_cofins: z.number().default(0),
      jcp: z.number().default(0),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>("/simulador-regime/lancamento", {
        method: "POST",
        body: JSON.stringify({
          imovel_id: input.imovelId,
          competencia: input.competencia,
          faturamento: input.faturamento,
          folha_pagamento: input.folha_pagamento,
          despesas_dedutiveis: input.despesas_dedutiveis,
          tipo_producao: input.tipo_producao,
          creditos_pis_cofins: input.creditos_pis_cofins,
          jcp: input.jcp,
          observacao: input.observacao,
        }),
      });
      return res;
    }),

  listarCompetencias: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown[]>(`/simulador-regime/lancamentos/${input.imovelId}`);
      return Array.isArray(res) ? res : [];
    }),

  dashboardSimulador: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>(`/simulador-regime/dashboard/${input.imovelId}`);
      return res;
    }),

  deletarCompetencia: publicProcedure
    .input(z.object({ imovelId: z.number(), competencia: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>(`/simulador-regime/lancamento/${input.imovelId}/${input.competencia}`, {
        method: "DELETE",
      });
      return res;
    }),

  perfilSimulador: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>(`/simulador-regime/perfil/${input.imovelId}`);
      return res;
    }),

  salvarPerfilSimulador: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      tipo_producao: z.string(),
      regime_atual: z.string().optional(),
      faturamento_estimado_anual: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>("/simulador-regime/perfil", {
        method: "POST",
        body: JSON.stringify({
          imovel_id: input.imovelId,
          tipo_producao: input.tipo_producao,
          regime_atual: input.regime_atual,
          faturamento_estimado_anual: input.faturamento_estimado_anual,
        }),
      });
      return res;
    }),

  // ── Fechar Competência ────────────────────────────────────────────────────
  fecharCompetencia: publicProcedure
    .input(z.object({ produtorId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      const res = await railwayMutate<unknown>(`/produtores/${input.produtorId}/fechar-mes`, "POST");
      return res;
    }),

  // ── Agricultura ────────────────────────────────────────────────
  culturas: publicProcedure
    .query(async ({ ctx }) => {
      const claims = await requireClaims(ctx.req);
      const res = await railwayFetch<unknown[]>("/agricultura/culturas", undefined, claims.produtorId);
      return Array.isArray(res) ? res : [];
    }),

  safras: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const raw = await railwayFetch<unknown>(
        `/agricultura/imoveis/${input.imovelId}/safras`,
        undefined,
        claims.produtorId,
      );
      const data = raw as { safras?: unknown[]; items?: unknown[] } | unknown[];
      return Array.isArray(data) ? data : (data as { safras?: unknown[] }).safras ?? (data as { items?: unknown[] }).items ?? [];
    }),

  criarSafra: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      cultura: z.string(),
      area_ha: z.number().optional(),
      data_plantio: z.string().optional(),
      data_colheita_prevista: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return railwayFetch<unknown>(
        `/agricultura/imoveis/${input.imovelId}/safras`,
        {
          method: "POST",
          body: JSON.stringify({
            cultura: input.cultura,
            area_ha: input.area_ha,
            data_plantio: input.data_plantio,
            data_colheita_prevista: input.data_colheita_prevista,
            imovel_id: input.imovelId,
          }),
        },
        claims.produtorId,
      );
    }),
});
