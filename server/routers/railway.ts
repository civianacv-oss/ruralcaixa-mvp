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
  estoque_reservado?: number;
  estoque_maximo?: number;
  estoque_disponivel?: number;
  consumo_medio_diario?: number;
  autonomia_dias?: number | null;
  lote?: string;
  validade?: string;
  local_armazenamento?: string;
  ultima_compra?: string;
  ultima_saida?: string;
  preco_estimado?: number;
  custo_medio?: number;
  valor_total_estoque?: number;
  entradas_mes?: number;
  saidas_mes?: number;
  estoque_inicial_mes?: number;
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
  // Validate that the imovelId in the cookie is still in the producer's ACL.
  // This prevents stale cookies from accessing properties the producer no longer owns.
  // Admins (contadores) skip this check — they can access any property.
  if (claims.role !== "admin" && claims.imovelId !== null) {
    const { getImoveisForProdutor } = await import("../db");
    const allowedIds = await getImoveisForProdutor(claims.produtorId);
    if (allowedIds !== null && !allowedIds.includes(claims.imovelId)) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Imóvel da sessão não autorizado. Selecione um imóvel válido.",
      });
    }
  }
  return claims;
}

// ─── Generic Railway mutation helper ─────────────────────────────────────────
// Extrai uma mensagem legível de qualquer formato de erro (Error, TRPCError,
// objeto de erro do fetch, string, objeto arbitrário) — nunca retorna
// "[object Object]", que era o que aparecia antes na importação.
function msgDeErro(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.detail === "string") return obj.detail;
    if (obj.cause) return msgDeErro(obj.cause);
    try { return JSON.stringify(obj); } catch { return "erro desconhecido"; }
  }
  return String(e);
}

async function railwayMutate<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  produtorId?: number,
): Promise<T> {
  // Resolve the Railway api_token for this produtor (if available)
  let authHeader: Record<string, string> = {};
  if (produtorId) {
    const { getRailwayToken } = await import("../db");
    const token = await getRailwayToken(produtorId).catch(() => null);
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  }
  const res = await fetch(`${RAILWAY_API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeader },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (err as { detail?: unknown }).detail;
    const detailStr = typeof detail === "string" ? detail
      : detail != null ? (() => { try { return JSON.stringify(detail); } catch { return String(detail); } })()
      : `Railway API error ${res.status}`;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: detailStr,
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

  // ── Criar Imóvel ──────────────────────────────────────────────────────────
  criarImovel: publicProcedure
    .input(z.object({
      nome: z.string().min(1),
      nirf: z.string().optional(),
      car: z.string().optional(),
      caepf: z.string().optional(),
      cnpj: z.string().optional(),
      municipio: z.string().optional(),
      uf: z.string().optional(),
      area_ha: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      const body: Record<string, unknown> = { nome: input.nome };
      if (input.nirf)      body.nirf       = input.nirf;
      if (input.car)       body.car        = input.car;
      if (input.caepf)     body.caepf      = input.caepf;
      if (input.cnpj)      body.cnpj       = input.cnpj;
      if (input.municipio) body.municipio  = input.municipio;
      if (input.uf)        body.uf         = input.uf;
      if (input.area_ha)   body.area_total = input.area_ha;
      const novo = await railwayMutate<{ id: number; nome: string }>(
        `/propriedades-rural/`, "POST", body, claims.produtorId
      );
      await seedImoveisAcl(claims.produtorId, [novo.id]);
      return novo;
    }),

  // ── Editar Imóvel ──────────────────────────────────────────────────────────
  editarImovel: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      nome: z.string().optional(),
      nirf: z.string().optional(),
      car: z.string().optional(),
      municipio: z.string().optional(),
      uf: z.string().optional(),
      area_ha: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const body: Record<string, unknown> = {};
      if (input.nome)      body.nome       = input.nome;
      if (input.nirf)      body.nirf       = input.nirf;
      if (input.car)       body.car        = input.car;
      if (input.municipio) body.municipio  = input.municipio;
      if (input.uf)        body.uf         = input.uf;
      if (input.area_ha)   body.area_total = input.area_ha;
      return railwayMutate(
        `/imoveis-rurais/${input.imovelId}`, "PUT", body, claims.produtorId
      );
    }),

  // ── Excluir Imóvel ───────────────────────────────────────────────────────────
  excluirImovel: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return railwayMutate(
        `/imoveis-rurais/${input.imovelId}`, "DELETE", undefined, claims.produtorId
      );
    }),

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
        return railwayFetch<Animal[]>(`/${prefix}/animais/${input.imovelId}`, undefined, claims.produtorId);
      }
      return railwayFetch<Animal[]>(`/${prefix}/animais?imovel_id=${input.imovelId}`, undefined, claims.produtorId);
    }),

  // ── Dar baixa no rebanho (venda / morte / abate / doacao / permuta) ──────
  registrarBaixaAnimal: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      animalId: z.number(),
      tipo: z.enum(["abate_proprio", "abate_frigorif", "venda", "morte", "doacao", "permuta"]),
      data: z.string(),
      pesoVivoKg: z.number().optional(),
      pesoCarcacaKg: z.number().optional(),
      valorTotal: z.number().optional(),
      comprador: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const body: Record<string, unknown> =
        input.especie === "bovinos"
          ? {
              animal_id: input.animalId,
              data: input.data,
              tipo: input.tipo,
              peso_vivo_kg: input.pesoVivoKg,
              peso_carcaca_kg: input.pesoCarcacaKg,
              valor_total: input.valorTotal,
              comprador: input.comprador,
              observacoes: input.observacoes,
            }
          : {
              animal_id: input.animalId,
              data_abate: input.data,
              peso_vivo_kg: input.pesoVivoKg,
              peso_carcaca_kg: input.pesoCarcacaKg,
              destino: input.tipo,
              valor_total_rs: input.valorTotal,
              comprador: input.comprador,
            };
      return railwayMutate(`/${prefix}/abates`, "POST", body, claims.produtorId);
    }),

  // ── Registrar pesagem (kg canonico; conversao de arroba feita no cliente) ─
  registrarPesagemAnimal: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      animalId: z.number(),
      data: z.string(),
      pesoKg: z.number(),
      motivo: z.string().default("rotina"),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const body: Record<string, unknown> =
        input.especie === "bovinos"
          ? {
              animal_id: input.animalId,
              data: input.data,
              peso_kg: input.pesoKg,
              motivo: input.motivo,
              observacoes: input.observacoes,
            }
          : {
              animal_id: input.animalId,
              data_pesagem: input.data,
              peso_kg: input.pesoKg,
              motivo: input.motivo,
            };
      return railwayMutate(`/${prefix}/pesagens`, "POST", body, claims.produtorId);
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
      // Campos específicos de bovinos (obrigatórios na API, opcionais aqui para outras espécies)
      categoria: z.string().optional(),
      aptidao_manejo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { imovelId, especie, ...fields } = input;
      return railwayMutate<Animal>(`/${prefix}/animais`, "POST", {
        imovel_id: imovelId,
        ...fields,
      }, claims.produtorId);
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
      return railwayMutate<Animal>(`/${prefix}/animais/${animalId}`, "PATCH", fields, claims.produtorId);
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
      return railwayMutate<Animal>(`/${prefix}/animais/${animalId}/status`, "PATCH", fields, claims.produtorId);
    }),

  deleteAnimal: publicProcedure
    .input(z.object({
      animalId: z.number(),
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      await railwayMutate<unknown>(`/${prefix}/animais/${input.animalId}`, "DELETE", undefined, claims.produtorId);
      return { success: true };
    }),

  analisarPlanilhaAnimais: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      rows: z.array(z.record(z.string(), z.any())),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];

      let existentes: Animal[] = [];
      try {
        if (input.especie === "bovinos") {
          existentes = await railwayFetch<Animal[]>(`/${prefix}/animais/${input.imovelId}`, undefined, claims.produtorId);
        } else {
          existentes = await railwayFetch<Animal[]>(`/${prefix}/animais?imovel_id=${input.imovelId}`, undefined, claims.produtorId);
        }
      } catch (_) { existentes = []; }

      const brincoExistente = new Set(existentes.map((a) => String(a.brinco ?? "").toLowerCase().trim()));

      const COL_BRINCO = ["brinco", "id", "identificacao", "identificador", "numero", "tag", "brinco/id"];
      const COL_NOME   = ["nome", "name"];
      const COL_RACA   = ["raca", "ra\u00e7a", "breed", "raca_nome"];
      const COL_SEXO   = ["sexo", "sex", "genero", "g\u00eanero"];
      const COL_NASC   = ["data_nascimento", "nascimento", "data nasc", "dt_nasc", "birth_date"];
      const COL_PESO   = ["peso", "peso_nascimento", "peso nasc", "peso_kg"];
      const COL_CAT    = ["categoria", "category"];
      const COL_APT    = ["aptidao_manejo", "aptidao", "aptid\u00e3o", "manejo"];

      // Normaliza chave de coluna: remove acentos (NFD) e caracteres não alfanuméricos
      // Garante que colunas com acentos (ex: Raça, Gênero, Aptidão) sejam encontradas
      const normColKey = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      // Quebra o nome da coluna em palavras (por espaço/underscore/hífen/barra) já normalizadas
      const colWords = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .split(/[^a-z0-9]+/).filter(Boolean);
      const findCol = (row: Record<string, any>, keys: string[]): string | undefined => {
        const cols = Object.keys(row);
        // 1ª passada: nome da coluna inteiro bate exatamente com o alias
        // (comportamento original — cobre "Brinco" === "brinco", "ID" === "id")
        for (const k of keys) {
          const found = cols.find((c) => normColKey(c) === normColKey(k));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        // 2ª passada: alguma PALAVRA do nome da coluna bate exatamente com o
        // alias — cobre "Nome Animal" (~ "nome"), "Identificador Animal"
        // (~ "identificador"), sem o risco de "Sobrenome" casar com "nome"
        // (substring cru casaria errado; por palavra, não).
        for (const k of keys) {
          const kn = normColKey(k);
          const found = cols.find((c) => colWords(c).includes(kn));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        return undefined;
      };

      const rows_novas: any[] = [];
      const conflitos: any[] = [];
      let ignoradas_count = 0;

      // Colunas de data partida em Dia/Mês/Ano (planilhas GISleite e afins).
      // Sem tratar isso, o alias "nascimento" casaria com "Data Nascimento
      // Dia" e o dia solto ("28") vazaria como se fosse a data inteira.
      const COL_NASC_DIA = ["datanascimentodia", "dianascimento"];
      const COL_NASC_MES = ["datanascimentomes", "mesnascimento"];
      const COL_NASC_ANO = ["datanascimentoano", "anonascimento"];

      // Só aceita como data um valor no formato completo (YYYY-MM-DD ou
      // DD/MM/YYYY) — um número solto tipo "28" (dia) é rejeitado.
      const dataCompletaOuNada = (v: string | undefined): string | undefined => {
        if (!v) return undefined;
        const s = v.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
        return undefined; // valor não é data completa (ex: "28" sozinho)
      };

      const montarData = (row: Record<string, any>): string | undefined => {
        const dia = findCol(row, COL_NASC_DIA);
        const mes = findCol(row, COL_NASC_MES);
        const ano = findCol(row, COL_NASC_ANO);
        if (dia && mes && ano) {
          const d = parseInt(dia, 10), m = parseInt(mes, 10), a = parseInt(ano, 10);
          if (!isNaN(d) && !isNaN(m) && !isNaN(a) && a > 1900)
            return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
        // Sem Dia/Mês/Ano separados: tenta a coluna única, mas só se for data completa
        return dataCompletaOuNada(findCol(row, COL_NASC));
      };

      for (const row of input.rows) {
        const brinco = findCol(row, COL_BRINCO);
        if (!brinco) { ignoradas_count++; continue; }

        const parsed = {
          brinco,
          nome:            findCol(row, COL_NOME),
          raca:            findCol(row, COL_RACA),
          sexo:            (findCol(row, COL_SEXO) ?? "M").toUpperCase().startsWith("F") ? "F" : "M",
          data_nascimento: montarData(row),
          peso_nascimento: findCol(row, COL_PESO) ? Number(findCol(row, COL_PESO)) : undefined,
          categoria:       findCol(row, COL_CAT),
          aptidao_manejo:  findCol(row, COL_APT) ?? "corte",
        };

        if (brincoExistente.has(brinco.toLowerCase())) {
          const existente = existentes.find((a) => String(a.brinco ?? "").toLowerCase().trim() === brinco.toLowerCase());
          conflitos.push({ brinco, parsed, existente_id: existente?.id, existente });
        } else {
          rows_novas.push(parsed);
        }
      }

      if (rows_novas.length === 0 && conflitos.length === 0 && input.rows.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nenhuma linha com brinco reconhecido. Verifique se a planilha tem uma coluna "Brinco" (ou ID/Identificação/Número/Tag) e se o cabeçalho está na primeira linha de dados.`,
        });
      }

      return { rows_novas, conflitos, ignoradas_count, total_planilha: input.rows.length };
    }),

  confirmarImportacaoAnimais: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      rows_novas: z.array(z.record(z.string(), z.any())),
      conflitos_decisoes: z.array(z.object({
        brinco: z.string(),
        existente_id: z.number().optional(),
        acao: z.enum(["atualizar", "ignorar"]),
        dados: z.record(z.string(), z.any()).optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];

      let criados = 0, atualizados = 0, ignorados = 0, erros = 0;
      const erros_detalhe: string[] = [];

      for (const row of input.rows_novas) {
        try {
          await railwayMutate<Animal>(`/${prefix}/animais`, "POST", { imovel_id: input.imovelId, ...row }, claims.produtorId);
          criados++;
        } catch (e) {
          erros++;
          const msg = msgDeErro(e);
          if (erros_detalhe.length < 10) erros_detalhe.push(`${row.brinco ?? "?"}: ${msg}`);
        }
      }

      for (const dec of (input.conflitos_decisoes ?? [])) {
        if (dec.acao === "atualizar" && dec.existente_id) {
          try {
            await railwayMutate<Animal>(`/${prefix}/animais/${dec.existente_id}`, "PATCH", dec.dados ?? {}, claims.produtorId);
            atualizados++;
          } catch (e) {
            erros++;
            const msg = msgDeErro(e);
            if (erros_detalhe.length < 10) erros_detalhe.push(`${dec.brinco}: ${msg}`);
          }
        } else {
          ignorados++;
        }
      }

      return {
        criados, atualizados, ignorados, erros,
        total: criados + atualizados + ignorados + erros,
        erros_detalhe: erros_detalhe.length > 0 ? erros_detalhe : undefined,
      };
    }),

  // ── Genealogia (Bovino) ──────────────────────────────────────────────────
  // Importa exportações de sistemas de genealogia (ex.: GISleite), que
  // frequentemente vêm como tabela HTML salva com extensão .xls e com nomes
  // de coluna diferentes do template padrão (ex.: "Identificador Animal" em
  // vez de "Brinco", data de nascimento partida em Dia/Mês/Ano, pai/mãe por
  // número de registro em vez de estarem no próprio rebanho).
  analisarPlanilhaGenealogiaBovino: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      rows: z.array(z.record(z.string(), z.any())),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);

      let existentes: Animal[] = [];
      try {
        existentes = await railwayFetch<Animal[]>(`/bovino/animais/${input.imovelId}`, undefined, claims.produtorId);
      } catch (_) { existentes = []; }
      const brincoExistente = new Set(existentes.map((a) => String(a.brinco ?? "").toLowerCase().trim()));

      const normColKey = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const colWords = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .split(/[^a-z0-9]+/).filter(Boolean);
      const findCol = (row: Record<string, any>, keys: string[]): string | undefined => {
        const cols = Object.keys(row);
        for (const k of keys) {
          const found = cols.find((c) => normColKey(c) === normColKey(k));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        for (const k of keys) {
          const kn = normColKey(k);
          const found = cols.find((c) => colWords(c).includes(kn));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        return undefined;
      };

      const COL_BRINCO = ["brinco", "id", "identificacao", "identificador", "numero", "tag"];
      const COL_NOME = ["nome", "name"];
      const COL_REG_PAI = ["registropai", "registro_pai", "regpai", "numero_pai"];
      const COL_NOME_PAI = ["nomepai", "nome_pai", "pai"];
      const COL_REG_MAE = ["registromae", "registro_mae", "regmae", "numero_mae"];
      const COL_NOME_MAE = ["nomemae", "nome_mae", "mae", "mãe"];
      const COL_SEXO = ["sexo", "sex", "genero", "gênero"];
      const COL_RACA = ["raca", "raça", "breed"];
      const COL_COMPOSICAO = ["composicaoracial", "composicao_racial", "composicao"];
      const COL_NASC_DIA = ["datanascimentodia", "diananscimento", "dia"];
      const COL_NASC_MES = ["datanascimentomes", "mesnascimento", "mes"];
      const COL_NASC_ANO = ["datanascimentoano", "anonascimento", "ano"];

      const rows_novas: any[] = [];
      const conflitos: any[] = [];
      let ignoradas_count = 0;

      for (const row of input.rows) {
        const brinco = findCol(row, COL_BRINCO);
        if (!brinco) { ignoradas_count++; continue; }

        // Data de nascimento: aceita tanto uma coluna única quanto Dia+Mês+Ano separados
        let data_nascimento: string | undefined;
        const dia = findCol(row, COL_NASC_DIA);
        const mes = findCol(row, COL_NASC_MES);
        const ano = findCol(row, COL_NASC_ANO);
        if (dia && mes && ano) {
          const diaNum = parseInt(dia, 10);
          const mesNum = parseInt(mes, 10);
          const anoNum = parseInt(ano, 10);
          if (!isNaN(diaNum) && !isNaN(mesNum) && !isNaN(anoNum)) {
            data_nascimento = `${anoNum}-${String(mesNum).padStart(2, "0")}-${String(diaNum).padStart(2, "0")}`;
          }
        }

        const sexoRaw = (findCol(row, COL_SEXO) ?? "").toUpperCase();
        const parsed: Record<string, any> = {
          brinco,
          nome: findCol(row, COL_NOME),
          sexo: sexoRaw.startsWith("F") ? "F" : "M",
          raca_nome: findCol(row, COL_RACA),        // resolvido pro raca_id no backend, se houver match
          composicao_racial: findCol(row, COL_COMPOSICAO),
          data_nascimento,
          nome_pai: findCol(row, COL_NOME_PAI),
          registro_pai_externo: findCol(row, COL_REG_PAI),
          nome_mae: findCol(row, COL_NOME_MAE),
          registro_mae_externo: findCol(row, COL_REG_MAE),
          // Constraint do banco (bovino_animais_categoria_check) só aceita:
          // bezerro/bezerra/novilho/novilha/garrote/garrotas/touro/vaca/boi.
          // Genealogia não informa idade, só sexo — usamos o valor adulto
          // genérico (vaca/touro), já que animais de pedigree/reprodução são
          // tipicamente adultos. Produtor pode ajustar depois na tela.
          categoria: sexoRaw.startsWith("F") ? "vaca" : "touro",
          aptidao_manejo: "leite",
          // Constraint do banco (bovino_animais_origem_check) só aceita:
          // nascimento / compra / transferencia. Animais importados via
          // genealogia vieram de fora do sistema (aquisição/registro
          // externo), então "compra" é o valor apropriado.
          origem: "compra",
        };

        if (brincoExistente.has(brinco.toLowerCase())) {
          const existente = existentes.find((a) => String(a.brinco ?? "").toLowerCase().trim() === brinco.toLowerCase());
          conflitos.push({ brinco, parsed, existente_id: existente?.id, existente });
        } else {
          rows_novas.push(parsed);
        }
      }

      if (rows_novas.length === 0 && conflitos.length === 0 && input.rows.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nenhuma linha com identificação de animal reconhecida. Colunas aceitas: Brinco, Identificador (Animal), ID, Número, Tag.`,
        });
      }

      return { rows_novas, conflitos, ignoradas_count, total_planilha: input.rows.length };
    }),

  // Segunda passada: depois que confirmarImportacaoAnimais criar os animais
  // (via /bovino/animais, que já aceita nome_pai/nome_mae/registro_*_externo/
  // composicao_racial desde a migração 017), chama isso pra tentar linkar
  // pai_id/mae_id de verdade sempre que o pai/mãe também estiver no rebanho.
  relinkGenealogiaBovino: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return railwayMutate(`/bovino/animais/relink-genealogia/${input.imovelId}`, "POST", {}, claims.produtorId);
    }),

  // ── Produção Leiteira (Bovino) ───────────────────────────────────────────────
  // Importa exportações de controle leiteiro oficial (ex.: GISleite), que vêm
  // em dois níveis: resumo por lactação ("producao") e controle dia a dia
  // ("controle" / "controle_todas_lactacoes"). Ambos usam "Identificador
  // Animal" para casar com o brinco já cadastrado no rebanho — igual à
  // genealogia.
  analisarPlanilhaLactacoesBovino: publicProcedure
    .input(z.object({ imovelId: z.number(), rows: z.array(z.record(z.string(), z.any())) }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);

      let existentes: Animal[] = [];
      try {
        existentes = await railwayFetch<Animal[]>(`/bovino/animais/${input.imovelId}`, undefined, claims.produtorId);
      } catch { existentes = []; }
      const brincoParaId = new Map<string, number>();
      for (const a of existentes) {
        if (a.brinco) brincoParaId.set(String(a.brinco).toLowerCase().trim(), a.id);
      }

      const normColKey = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const colWords = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .split(/[^a-z0-9]+/).filter(Boolean);
      const findCol = (row: Record<string, any>, keys: string[]): string | undefined => {
        const cols = Object.keys(row);
        for (const k of keys) {
          const found = cols.find((c) => normColKey(c) === normColKey(k));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        for (const k of keys) {
          const kn = normColKey(k);
          const found = cols.find((c) => colWords(c).includes(kn));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        return undefined;
      };
      const dataBr = (v?: string): string | undefined => {
        if (!v) return undefined;
        const s = v.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
        return undefined;
      };

      const COL_BRINCO = ["identificadoranimal", "identificador", "brinco"];
      const COL_DATA_PARTO = ["dataparto"];
      const COL_ORDEM_PARTO = ["ordemdeparto", "ordemparto"];
      const COL_DURACAO = ["duracaolactacao"];
      const COL_PROD_TOTAL = ["producaototalleite"];
      const COL_PROD_305 = ["producao305d"];
      const COL_PROD_GORD = ["producaoacumuladagordura"];
      const COL_PROD_PROT = ["producaoacumuladaproteina"];
      const COL_ESCORE = ["escorecorporal"];
      const COL_RACA = ["raca"];
      const COL_CCS = ["ccs"];
      const COL_DATA_ENC = ["dataencerramentolactacao"];
      const COL_CAUSA_ENC = ["causaencerramentolactacao"];

      const itens: any[] = [];
      const nao_encontrados: { brinco: string }[] = [];
      let ignoradas_count = 0;

      for (const row of input.rows) {
        const brinco = findCol(row, COL_BRINCO);
        const dataParto = dataBr(findCol(row, COL_DATA_PARTO));
        if (!brinco || !dataParto) { ignoradas_count++; continue; }

        const animalId = brincoParaId.get(brinco.toLowerCase());
        if (!animalId) { nao_encontrados.push({ brinco }); continue; }

        const n = (v?: string) => (v !== undefined ? Number(v.replace(",", ".")) : undefined);
        itens.push({
          animal_id: animalId,
          brinco,
          ordem_parto: n(findCol(row, COL_ORDEM_PARTO)),
          data_parto: dataParto,
          duracao_lactacao_dias: n(findCol(row, COL_DURACAO)),
          producao_total_litros: n(findCol(row, COL_PROD_TOTAL)),
          producao_305d_litros: n(findCol(row, COL_PROD_305)),
          producao_acumulada_gordura: n(findCol(row, COL_PROD_GORD)),
          producao_acumulada_proteina: n(findCol(row, COL_PROD_PROT)),
          escore_corporal: n(findCol(row, COL_ESCORE)),
          raca_registro: findCol(row, COL_RACA),
          ccs_media: n(findCol(row, COL_CCS)),
          data_encerramento: dataBr(findCol(row, COL_DATA_ENC)),
          causa_encerramento: findCol(row, COL_CAUSA_ENC),
        });
      }

      if (itens.length === 0 && input.rows.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhuma linha reconhecida. Verifique se a planilha tem 'Identificador Animal' e 'Data Parto', e se os animais já estão cadastrados no rebanho.",
        });
      }

      return { itens, nao_encontrados, ignoradas_count, total_planilha: input.rows.length };
    }),

  confirmarImportacaoLactacoesBovino: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      itens: z.array(z.record(z.string(), z.any())),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const itens = input.itens.map(({ brinco, ...rest }) => rest);
      return railwayMutate(`/bovino/leiteiro/lactacoes/importar`, "POST", {
        imovel_id: input.imovelId, itens,
      }, claims.produtorId);
    }),

  analisarPlanilhaControleLeiteiroBovino: publicProcedure
    .input(z.object({ imovelId: z.number(), rows: z.array(z.record(z.string(), z.any())) }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);

      let existentes: Animal[] = [];
      try {
        existentes = await railwayFetch<Animal[]>(`/bovino/animais/${input.imovelId}`, undefined, claims.produtorId);
      } catch { existentes = []; }
      const brincoParaId = new Map<string, number>();
      for (const a of existentes) {
        if (a.brinco) brincoParaId.set(String(a.brinco).toLowerCase().trim(), a.id);
      }

      const normColKey = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const colWords = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .split(/[^a-z0-9]+/).filter(Boolean);
      const findCol = (row: Record<string, any>, keys: string[]): string | undefined => {
        const cols = Object.keys(row);
        for (const k of keys) {
          const found = cols.find((c) => normColKey(c) === normColKey(k));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        for (const k of keys) {
          const kn = normColKey(k);
          const found = cols.find((c) => colWords(c).includes(kn));
          if (found && row[found] != null && String(row[found]).trim() !== "") return String(row[found]).trim();
        }
        return undefined;
      };
      const dataBr = (v?: string): string | undefined => {
        if (!v) return undefined;
        const s = v.trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
        return undefined;
      };

      const COL_BRINCO = ["identificadoranimal", "identificador", "brinco"];
      const COL_DATA_CONTROLE = ["datacontrole"];
      const COL_NUM_CONTROLE = ["numerocontrole"];
      const COL_NUM_ORDENHAS = ["numerodeordenhasnocontrole", "numeroordenhas"];
      const COL_PROD_CONTROLE = ["producaoleitecontrole"];
      const COL_GORDURA = ["percentualgordura"];
      const COL_PROTEINA = ["percentualproteina"];
      const COL_LACTOSE = ["percentuallactose"];
      const COL_ES = ["es"];
      const COL_CCS = ["ccs"];

      const itens: any[] = [];
      const nao_encontrados: { brinco: string }[] = [];
      let ignoradas_count = 0;

      for (const row of input.rows) {
        const brinco = findCol(row, COL_BRINCO);
        const dataControle = dataBr(findCol(row, COL_DATA_CONTROLE));
        const producaoControle = findCol(row, COL_PROD_CONTROLE);
        if (!brinco || !dataControle || !producaoControle) { ignoradas_count++; continue; }

        const animalId = brincoParaId.get(brinco.toLowerCase());
        if (!animalId) { nao_encontrados.push({ brinco }); continue; }

        const n = (v?: string) => (v !== undefined ? Number(v.replace(",", ".")) : undefined);
        itens.push({
          animal_id: animalId,
          brinco,
          data: dataControle,
          volume_l: n(producaoControle),
          gordura_pct: n(findCol(row, COL_GORDURA)),
          proteina_pct: n(findCol(row, COL_PROTEINA)),
          lactose_pct: n(findCol(row, COL_LACTOSE)),
          es_pct: n(findCol(row, COL_ES)),
          ccs: n(findCol(row, COL_CCS)),
          numero_ordenhas_dia: n(findCol(row, COL_NUM_ORDENHAS)),
          numero_controle_externo: n(findCol(row, COL_NUM_CONTROLE)),
        });
      }

      if (itens.length === 0 && input.rows.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhuma linha reconhecida. Verifique se a planilha tem 'Identificador Animal', 'Data Controle' e 'Producao Leite Controle', e se os animais já estão cadastrados no rebanho.",
        });
      }

      return { itens, nao_encontrados, ignoradas_count, total_planilha: input.rows.length };
    }),

  confirmarImportacaoControleLeiteiroBovino: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      itens: z.array(z.record(z.string(), z.any())),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const itens = input.itens.map(({ brinco, ...rest }) => rest);
      return railwayMutate(`/bovino/leiteiro/ordenha/importar`, "POST", {
        imovel_id: input.imovelId, itens,
      }, claims.produtorId);
    }),

  lactacoesBovino: publicProcedure
    .input(z.object({ imovelId: z.number(), animalId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const qs = input.animalId ? `?animal_id=${input.animalId}` : "";
      return railwayFetch<any[]>(`/bovino/leiteiro/lactacoes/${input.imovelId}${qs}`, undefined, claims.produtorId);
    }),

  controleLeiteiroBovino: publicProcedure
    .input(z.object({ imovelId: z.number(), animalId: z.number().optional(), dias: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const params = new URLSearchParams();
      params.set("dias", String(input.dias ?? 3650));
      params.set("fonte", "gisleite");
      if (input.animalId) params.set("animal_id", String(input.animalId));
      return railwayFetch<any[]>(`/bovino/leiteiro/ordenha/${input.imovelId}?${params.toString()}`, undefined, claims.produtorId);
    }),

  // ── Dashboard ──────────────────────────────────────────────────────────────
  ovinoDashboard: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return railwayFetch<OvinoDashboard>(`/ovino/dashboard/${input.imovelId}`, undefined, claims.produtorId);
    }),

  // ── Financial ──────────────────────────────────────────────────────────────
  produtorResumo: publicProcedure
    .input(z.object({ produtorId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      return railwayFetch<ProdutorResumo>(`/produtores/${input.produtorId}/resumo`, undefined, claims.produtorId);
    }),

  lancamentos: publicProcedure
    .input(z.object({ produtorId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      return railwayFetch<Lancamento[]>(`/produtores/${input.produtorId}/lancamentos`, undefined, claims.produtorId);
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
      }, claims.produtorId);
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
      }, claims.produtorId);
    }),

  deleteLancamento: publicProcedure
    .input(z.object({ produtorId: z.number(), lancamentoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      await railwayMutate<unknown>(`/lancamentos/${input.lancamentoId}`, "DELETE", undefined, claims.produtorId);
      return { success: true };
    }),

  importarLancamentos: publicProcedure
    .input(z.object({
      produtorId: z.number(),
      imovelId: z.number(),
      arquivo: z.string(), // base64
      nomeArquivo: z.string(),
      mapaData: z.string().optional(),
      mapaValor: z.string().optional(),
      mapaDescricao: z.string().optional(),
      mapaTipo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      const { getRailwayToken } = await import("../db");
      const token = await getRailwayToken(input.produtorId).catch(() => null);
      const buffer = Buffer.from(input.arquivo, "base64");
      const formData = new FormData();
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      formData.append("arquivo", blob, input.nomeArquivo);
      formData.append("produtor_id", String(input.produtorId));
      formData.append("imovel_id", String(input.imovelId));
      if (input.mapaData)      formData.append("mapa_data",      input.mapaData);
      if (input.mapaValor)     formData.append("mapa_valor",     input.mapaValor);
      if (input.mapaDescricao) formData.append("mapa_descricao", input.mapaDescricao);
      if (input.mapaTipo)      formData.append("mapa_tipo",      input.mapaTipo);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${RAILWAY_API}/importacao/lancamentos`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (err as { detail?: string }).detail ?? `Erro na importação: HTTP ${res.status}`,
        });
      }
      return res.json() as Promise<{ criados: number; erros: number; total: number; mensagem?: string }>;
    }),

  // ── Sanitary ───────────────────────────────────────────────────────────────
  // Histórico sanitário (ovinos/caprinos/suinos: /historico; bovinos: /proximos)
  sanitario: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      if (input.especie === "bovinos") {
        return railwayFetch<SanitarioRecord[]>(`/${prefix}/sanitario/${input.imovelId}/proximos`, undefined, claims.produtorId).catch(() => []);
      }
      return railwayFetch<SanitarioRecord[]>(`/${prefix}/sanitario/historico?imovel_id=${input.imovelId}`, undefined, claims.produtorId).catch(() => []);
    }),

  // Calendário sanitário (próximos eventos)
  sanitarioCalendario: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      if (input.especie === "bovinos") {
        return railwayFetch<any>(`/${prefix}/sanitario/${input.imovelId}/proximos`, undefined, claims.produtorId).catch(() => ({ reforcos_pendentes: [], tarefas_sanitarias: [], total: 0 }));
      }
      return railwayFetch<any>(`/${prefix}/sanitario/calendario?imovel_id=${input.imovelId}&dias=30`, undefined, claims.produtorId).catch(() => ({ reforcos_pendentes: [], tarefas_sanitarias: [], total: 0 }));
    }),

  // Insumos sanitários disponíveis por espécie
  sanitarioInsumos: publicProcedure
    .input(z.object({ imovelId: z.number(), especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]) }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      return railwayFetch<any[]>(`/${prefix}/sanitario/insumos?imovel_id=${input.imovelId}`, undefined, claims.produtorId).catch(() => []);
    }),

  // Criar aplicação sanitária
  createSanitario: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      insumo_id: z.number(),
      animal_id: z.number().optional(),
      lote_id: z.number().optional(),
      data_aplicacao: z.string(),
      dose_ml: z.number().optional(),
      via: z.string().optional(),
      responsavel_nome: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { imovelId, especie, ...fields } = input;
      // ovinos/caprinos/suinos usam /sanitario/aplicar; bovinos usam /sanitario (POST)
      const endpoint = input.especie === "bovinos"
        ? `/${prefix}/sanitario`
        : `/${prefix}/sanitario/aplicar`;
      return railwayMutate<SanitarioRecord>(endpoint, "POST", {
        imovel_id: imovelId,
        ...fields,
      }, claims.produtorId);
    }),

  // Excluir registro sanitário
  deleteSanitario: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      sanitarioId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      return railwayMutate<{ ok: boolean }>(`/${prefix}/sanitario/${input.sanitarioId}`, "DELETE", undefined, claims.produtorId).catch(() => ({ ok: true }));
    }),

  updateSanitario: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      sanitarioId: z.number(),
      data_aplicacao: z.string().optional(),
      dose_ml: z.number().optional(),
      via: z.string().optional(),
      responsavel_nome: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];
      const { imovelId, especie, sanitarioId, ...fields } = input;
      return railwayMutate<{ ok: boolean }>(
        `/${prefix}/sanitario/${sanitarioId}`,
        "PATCH",
        fields,
        claims.produtorId,
      ).catch(() => ({ ok: true }));
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
        return railwayFetch<ReproducaoRecord[]>(`/${prefix}/reproducao/${input.imovelId}/prenhas`, undefined, claims.produtorId);
      }
      // ovinos/caprinos: use alertas filtered to reproductive events
      return railwayFetch<ReproducaoRecord[]>(`/${prefix}/alertas?imovel_id=${input.imovelId}&tipo=reproducao`, undefined, claims.produtorId).catch(() => []);
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
      }, claims.produtorId);
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
      const data = await railwayFetch<{ data: Insumo[] } | Insumo[]>(`/insumos/?${params}`, undefined, claims.produtorId);
      return Array.isArray(data) ? data : (data as { data: Insumo[] }).data ?? [];
    }),

  insumosAlertas: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayFetch<{ data: Insumo[]; total: number } | Insumo[]>(`/insumos/alertas?fazenda_id=${input.imovelId}`, undefined, claims.produtorId);
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
      estoque_reservado: z.number().default(0),
      estoque_maximo: z.number().optional(),
      lote: z.string().optional(),
      validade: z.string().optional(),
      local_armazenamento: z.string().optional(),
      preco_estimado: z.number().optional(),
      fornecedor_id: z.number().optional(),
      reposicao_modo: z.enum(["automatico", "manual"]).default("manual"),
      lead_time_dias: z.number().default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const { imovelId, ...fields } = input;
      const data = await railwayMutate<{ data: Insumo } | Insumo>(`/insumos/`, "POST", { fazenda_id: imovelId, ...fields }, claims.produtorId);
      return (data as { data: Insumo }).data ?? data;
    }),

  // ── Editar Insumo (inclui vincular/trocar fornecedor) ────────────────────────
  atualizarInsumo: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      insumoId: z.number(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
      categoria: z.string(),
      unidade: z.string(),
      origem: z.enum(["comprado", "proprio", "doacao"]),
      estoque_minimo: z.number(),
      estoque_ideal: z.number(),
      preco_estimado: z.number().optional(),
      fornecedor_id: z.number().optional(),
      reposicao_modo: z.enum(["automatico", "manual"]),
      lead_time_dias: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const { imovelId, insumoId, ...fields } = input;
      const data = await railwayMutate<{ data: Insumo } | Insumo>(`/insumos/${insumoId}`, "PUT", fields, claims.produtorId);
      return (data as { data: Insumo }).data ?? data;
    }),

  resumoMovimentacoesInsumos: publicProcedure
    .input(z.object({ imovelId: z.number(), mes: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const qs = input.mes ? `&mes=${input.mes}` : "";
      return railwayFetch<{
        compras_mes: number; consumo_mes: number; qtd_compras: number; qtd_usos: number;
      }>(`/insumos/resumo-movimentacoes?fazenda_id=${input.imovelId}${qs}`, undefined, claims.produtorId);
    }),

  insumoDetalhe: publicProcedure
    .input(z.object({ imovelId: z.number(), insumoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayFetch<{ data: Insumo & { movimentacoes?: MovimentacaoInsumo[] } } | (Insumo & { movimentacoes?: MovimentacaoInsumo[] })>(`/insumos/${input.insumoId}?fazenda_id=${input.imovelId}`, undefined, claims.produtorId);
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
      // Rastreabilidade de saída
      motivo_saida: z.enum(["consumo_rebanho", "perda", "vencimento", "transferencia", "venda", "ajuste", "outro"]).optional(),
      lote_destino: z.string().optional(),
      atividade: z.enum(["pecuaria_corte", "pecuaria_leite", "suinocultura", "avicultura", "agricultura", "geral"]).optional(),
      // Vínculo real com o Rebanho (para GMD/custo por kg e litros/dia por animal)
      animal_id: z.number().optional(),
      lote_id: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const { imovelId, insumoId, ...fields } = input;
      // Enriquecer observação com motivo_saida e atividade para rastreabilidade
      const observacaoEnriquecida = [
        fields.observacao,
        fields.motivo_saida ? `motivo:${fields.motivo_saida}` : undefined,
        fields.atividade ? `atividade:${fields.atividade}` : undefined,
        fields.lote_destino ? `lote:${fields.lote_destino}` : undefined,
      ].filter(Boolean).join(" | ") || undefined;
      const payload = {
        tipo: fields.tipo,
        quantidade: fields.quantidade,
        custo_unitario: fields.custo_unitario,
        data_movim: fields.data_movim,
        observacao: observacaoEnriquecida,
        animal_id: fields.animal_id,
        lote_id: fields.lote_id,
        atividade: fields.atividade,
      };
      const data = await railwayMutate<{ data: MovimentacaoInsumo } | MovimentacaoInsumo>(`/insumos/${insumoId}/movimentar`, "POST", payload, claims.produtorId);
      return (data as { data: MovimentacaoInsumo }).data ?? data;
    }),

  // ── Produção integrada com Insumos (GMD/custo por kg, ou litros/dia e custo/litro) ──
  // Bovino tem endpoint dedicado (corte + leite); Ovino/Caprino reaproveitam o
  // endpoint de indicadores já existente; Suíno tem endpoint espelhado do de Bovino.
  producaoInsumosAnimal: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      animalId: z.number(),
      especie: z.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
      dias: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const prefix = especiePrefix[input.especie];

      if (input.especie === "bovinos") {
        return railwayFetch<{
          animal_id: number; tipo: "corte" | "leite"; periodo_dias: number;
          gmd_kg_dia?: number | null; ganho_total_kg?: number | null;
          litros_dia?: number; producao_total_l?: number;
          custo_insumos_periodo: number; custo_por_kg_ganho?: number | null;
          custo_por_litro?: number | null; aviso?: string | null;
        }>(`/${prefix}/animais/${input.animalId}/producao-insumos?dias=${input.dias}`, undefined, claims.produtorId);
      }

      if (input.especie === "suinos") {
        const r = await railwayFetch<{
          animal_id: number; periodo_dias: number; gmd_kg_dia?: number | null;
          ganho_total_kg?: number | null; custo_insumos_periodo: number;
          custo_por_kg_ganho?: number | null; aviso?: string | null;
        }>(`/${prefix}/animais/${input.animalId}/producao-insumos?dias=${input.dias}`, undefined, claims.produtorId);
        return { ...r, tipo: "corte" as const };
      }

      // Ovino/Caprino: reaproveita /indicadores/animal/{id} (não recebe `dias` — usa histórico completo de pesagens)
      const r = await railwayFetch<{
        gmd_geral?: number | null; ganho_total_kg?: number | null;
        custo_insumos_periodo?: number; custo_por_kg_ganho?: number | null;
      }>(`/${prefix}/indicadores/animal/${input.animalId}`, undefined, claims.produtorId);
      return {
        animal_id: input.animalId,
        tipo: "corte" as const,
        periodo_dias: input.dias,
        gmd_kg_dia: r.gmd_geral ?? null,
        ganho_total_kg: r.ganho_total_kg ?? null,
        custo_insumos_periodo: r.custo_insumos_periodo ?? 0,
        custo_por_kg_ganho: r.custo_por_kg_ganho ?? null,
        aviso: null,
      };
    }),

  deleteInsumo: publicProcedure
    .input(z.object({ imovelId: z.number(), insumoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayMutate<{ ok: boolean; id: number }>(`/insumos/${input.insumoId}`, "DELETE", undefined, claims.produtorId);
      return data;
    }),

  duplicadosInsumos: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayFetch<{ data: { nome_norm: string; total: number; ids: number[]; nomes: string[]; estoques: number[] }[]; total_grupos: number }>(`/insumos/duplicados?fazenda_id=${input.imovelId}`, undefined, claims.produtorId);
      return data;
    }),

  limparDuplicadosInsumos: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayMutate<{ ok: boolean; removidos: number; grupos_processados: number }>(`/insumos/limpar-duplicados?fazenda_id=${input.imovelId}`, "POST", undefined, claims.produtorId);
      return data;
    }),

  // ── Fornecedores ───────────────────────────────────────────────────────────
  fornecedores: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayFetch<{ data: Fornecedor[] } | Fornecedor[]>(`/fornecedores/?fazenda_id=${input.imovelId}`, undefined, claims.produtorId);
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
      const data = await railwayMutate<{ data: Fornecedor } | Fornecedor>(`/fornecedores/`, "POST", { fazenda_id: imovelId, ...fields }, claims.produtorId);
      return (data as { data: Fornecedor }).data ?? data;
    }),

  updateFornecedor: publicProcedure
    .input(z.object({
      imovelId: z.number(),
      fornecedorId: z.number(),
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
      const { imovelId, fornecedorId, ...fields } = input;
      const data = await railwayMutate<{ data: Fornecedor } | Fornecedor>(`/fornecedores/${fornecedorId}`, "PUT", { fazenda_id: imovelId, ...fields }, claims.produtorId);
      return (data as { data: Fornecedor }).data ?? data;
    }),

  deleteFornecedor: publicProcedure
    .input(z.object({ imovelId: z.number(), fornecedorId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayMutate<{ ok: boolean }>(`/fornecedores/${input.fornecedorId}`, "DELETE", undefined, claims.produtorId);
      return data;
    }),

  // ── Pedidos de Compra ────────────────────────────────────────────────────────
  pedidosCompra: publicProcedure
    .input(z.object({ imovelId: z.number(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const params = new URLSearchParams({ fazenda_id: String(input.imovelId) });
      if (input.status) params.set("status", input.status);
      const data = await railwayFetch<{ data: PedidoCompra[] } | PedidoCompra[]>(`/pedidos-compra/?${params}`, undefined, claims.produtorId);
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
      const data = await railwayMutate<{ data: PedidoCompra } | PedidoCompra>(`/pedidos-compra/`, "POST", { fazenda_id: imovelId, ...fields }, claims.produtorId);
      return (data as { data: PedidoCompra }).data ?? data;
    }),

  aprovarPedidoCompra: publicProcedure
    .input(z.object({ imovelId: z.number(), pedidoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const data = await railwayMutate<{ data: PedidoCompra } | PedidoCompra>(`/pedidos-compra/${input.pedidoId}/aprovar`, "PUT", undefined, claims.produtorId);
      return (data as { data: PedidoCompra }).data ?? data;
    }),

  enviarPedidoCompra: publicProcedure
    .input(z.object({ imovelId: z.number(), pedidoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      return railwayMutate<{ ok: boolean; enviado_telegram: boolean; mensagem: string }>(`/pedidos-compra/${input.pedidoId}/enviar`, "POST", undefined, claims.produtorId);
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

      // Normaliza chave de coluna: remove acentos (NFD) e caracteres não alfanuméricos
      const normKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const col = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find(rk => normKey(rk) === normKey(k));
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
            const railwayResult = await railwayMutate<{ id: number } | unknown>("/insumos/", "POST", payload, claims.produtorId);
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

      // Detectar linha de cabeçalho real (tolerante a acento e a variações
      // de nome de coluna — mesma lógica usada no import de animais)
      const HEADER_HINTS_INSUMO = ["nome", "name", "insumo", "produto", "descricao"];
      const normHeaderVal = (v: unknown) =>
        String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 }) as unknown[][];
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
        const rowVals = (rawRows[i] || []).map(normHeaderVal);
        if (rowVals.some(v => HEADER_HINTS_INSUMO.some(h => v === h || v.includes(h)))) {
          headerRowIndex = i;
          break;
        }
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: headerRowIndex });
      if (rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: 'Planilha vazia ou sem coluna "Nome" reconhecível.' });
      if (rows.length > 500) throw new TRPCError({ code: "BAD_REQUEST", message: "Limite de 500 linhas por importação." });

      const normalize = (v: unknown) => String(v ?? "").trim();
      const toNum = (v: unknown) => { const n = parseFloat(String(v ?? "0").replace(",", ".")); return isNaN(n) ? 0 : n; };
      // Normaliza chave de coluna: remove acentos (NFD) e caracteres não alfanuméricos
      const normKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      // Quebra o nome da coluna em palavras, pra correspondência por palavra
      // inteira (ex.: "Nome do Insumo" ~ "nome", sem "Sobrenome" casar errado)
      const colWordsInsumo = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
      const col = (row: Record<string, unknown>, ...keys: string[]) => {
        const cols = Object.keys(row);
        // 1ª passada: nome da coluna inteiro bate exatamente com o alias
        for (const k of keys) {
          const found = cols.find(rk => normKey(rk) === normKey(k));
          if (found && row[found] !== "") return row[found];
        }
        // 2ª passada: alguma palavra do nome da coluna bate com o alias
        // (cobre "Nome do Insumo", "Preço Unitário", "Estoque Atual (kg)" etc.)
        for (const k of keys) {
          const kn = normKey(k);
          const found = cols.find(rk => colWordsInsumo(rk).includes(kn));
          if (found && row[found] !== "") return row[found];
        }
        return "";
      };

      // Parsear as 10 colunas oficiais de cada linha
      const allParsedRows = rows.map((row, idx) => ({
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
        fornecedor_nome: normalize(col(row, "fornecedor", "fornecedornome", "supplier", "fabricante", "vendor")),
      }));

      // ── VALIDAÇÃO 1: Normalização de nomes para deduplicação ──────────────────
      const normalizeNome = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

      // ── VALIDAÇÃO 2: Remover linhas sem nome (cabeçalhos extras, totais, etc.) ─
      const rowsComNome = allParsedRows.filter(r => r.nome.length > 0);

      // ── VALIDAÇÃO 3: Deduplicar por nome normalizado (manter 1ª ocorrência) ───
      const seenNomesAnalise = new Set<string>();
      const parsedRows = rowsComNome.filter(r => {
        const key = normalizeNome(r.nome);
        if (seenNomesAnalise.has(key)) return false;
        seenNomesAnalise.add(key);
        return true;
      });

      // ── VALIDAÇÃO 4: Identificar linhas com valores zerados (aviso ao usuário) ─
      const linhasZeradas = parsedRows
        .filter(r => r.estoque_atual === 0 && r.preco_estimado === 0)
        .map(r => ({ nome: r.nome, linha: r._linha }));

      // Identificar nomes sem correspondente no catálogo
      const catalog = await listInsumosCatalogo(input.imovelId);
      const catalogNomes = new Set(catalog.map((c) => c.nomeNormalizado));

      // ── VALIDAÇÃO 5: Detectar conflitos com insumos já existentes no Railway ───
      // Busca insumos já cadastrados para identificar quais da planilha já existem
      let insumosExistentesAnalise: Insumo[] = [];
      try {
        const existResAnalise = await railwayFetch<{ data: Insumo[] }>("/insumos/", undefined, claims.produtorId);
        insumosExistentesAnalise = existResAnalise?.data ?? [];
      } catch {
        // Railway indisponível — continuar sem verificação de conflitos
      }

      // Mapa: nomeNormalizado → insumo existente (com estoque atual)
      const mapaExistentes = new Map<string, Insumo>();
      for (const ins of insumosExistentesAnalise) {
        mapaExistentes.set(normalizeNome(ins.nome), ins);
      }

      // Identificar nomes sem correspondente: verifica catálogo local E Railway
      // Se existe no Railway mas não no catálogo local, sincroniza automaticamente
      const unmapped: { nome: string; linha: number }[] = [];
      const seen = new Set<string>();
      for (const r of parsedRows) {
        if (!r.nome) continue;
        const key = normalizeNome(r.nome);
        // Reconhecido se está no catálogo local OU já existe no Railway
        const reconhecido = catalogNomes.has(key) || mapaExistentes.has(key);
        if (!reconhecido && !seen.has(key)) {
          unmapped.push({ nome: r.nome, linha: r._linha });
          seen.add(key);
        }
      }

      // Separar linhas em: novas (não existem) e conflitos (já existem)
      const rowsNovas: typeof parsedRows = [];
      const conflitos: {
        nome: string;
        linha: number;
        estoque_planilha: number;
        estoque_atual: number;
        insumo_id: number;
        unidade: string;
      }[] = [];

      for (const r of parsedRows) {
        const key = normalizeNome(r.nome);
        const existente = mapaExistentes.get(key);
        if (existente) {
          conflitos.push({
            nome: r.nome,
            linha: r._linha,
            estoque_planilha: r.estoque_atual,
            estoque_atual: existente.estoque_atual ?? 0,
            insumo_id: existente.id,
            unidade: existente.unidade ?? r.unidade,
          });
        } else {
          rowsNovas.push(r);
        }
      }

      return {
        rows: parsedRows,
        rows_novas: rowsNovas,
        conflitos,
        unmapped,
        catalog,
        total: parsedRows.length,
        total_original: allParsedRows.length,
        duplicatas_removidas: allParsedRows.length - parsedRows.length - (allParsedRows.length - rowsComNome.length),
        linhas_sem_nome: allParsedRows.length - rowsComNome.length,
        linhas_zeradas: linhasZeradas,
      };
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
        fornecedor_nome: z.string().optional(),
      })),
      mappings: z.record(z.string(), z.string()), // { nomePlanilha: nomeDestino }
      // Decisões do usuário para insumos já existentes: "adicionar" = soma estoque | "ignorar" = pula
      conflitos_decisoes: z.record(z.string(), z.enum(["adicionar", "ignorar"])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);

      const results: { nome: string; codigo?: string; ok: boolean; action?: "criado" | "atualizado" | "ignorado"; error?: string }[] = [];

      // ── VALIDAÇÃO 1: Deduplicar as rows recebidas por nome normalizado ───────────────
      const normalizeNomeConf = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const seenNomesConf = new Set<string>();
      const rowsUnicas = input.rows.filter(r => {
        if (!r.nome) return false;
        const key = normalizeNomeConf(r.nome);
        if (seenNomesConf.has(key)) return false;
        seenNomesConf.add(key);
        return true;
      });

      // ── VALIDAÇÃO 2: Buscar insumos já existentes no Railway ────────────────────────
      let insumosExistentes: Insumo[] = [];
      try {
        const existRes = await railwayFetch<{ data: Insumo[] }>("/insumos/", undefined, claims.produtorId);
        insumosExistentes = existRes?.data ?? [];
      } catch {
        // Railway indisponível — continuar sem verificação
      }
      // Mapa: nomeNormalizado → insumo existente completo (para obter o ID e estoque atual)
      const mapaExistentesConf = new Map<string, Insumo>();
      for (const ins of insumosExistentes) {
        mapaExistentesConf.set(normalizeNomeConf(ins.nome), ins);
      }

      // ── FORNECEDORES: buscar existentes e preparar resolução por nome ───────────────
      // A planilha pode trazer uma coluna "fornecedor" com o nome do fornecedor.
      // Resolvemos para o fornecedor_id existente (por nome normalizado) ou criamos
      // um novo fornecedor (apenas com o nome) na primeira ocorrência dentro do lote.
      let fornecedoresExistentes: Fornecedor[] = [];
      try {
        const fornRes = await railwayFetch<{ data: Fornecedor[] } | Fornecedor[]>(
          `/fornecedores/?fazenda_id=${input.imovelId}`, undefined, claims.produtorId
        );
        fornecedoresExistentes = Array.isArray(fornRes) ? fornRes : (fornRes as { data: Fornecedor[] }).data ?? [];
      } catch {
        // Railway indisponível — segue sem resolução de fornecedor
      }
      const mapaFornecedores = new Map<string, number>();
      for (const f of fornecedoresExistentes) {
        mapaFornecedores.set(normalizeNomeConf(f.nome), f.id);
      }
      async function resolverFornecedorId(nomeFornecedor?: string): Promise<number | undefined> {
        const nome = (nomeFornecedor ?? "").trim();
        if (!nome) return undefined;
        const key = normalizeNomeConf(nome);
        const existente = mapaFornecedores.get(key);
        if (existente) return existente;
        try {
          const novo = await railwayMutate<{ data: Fornecedor } | Fornecedor>(
            `/fornecedores/`, "POST", { fazenda_id: input.imovelId, nome }, claims.produtorId
          );
          const fornecedorCriado = (novo as { data: Fornecedor }).data ?? (novo as Fornecedor);
          mapaFornecedores.set(key, fornecedorCriado.id);
          return fornecedorCriado.id;
        } catch {
          // Não bloqueia a importação do insumo se a criação do fornecedor falhar
          return undefined;
        }
      }

      // Decisões do usuário: { nomePlanilha: "adicionar" | "ignorar" }
      const decisoes = input.conflitos_decisoes ?? {};
      // Mapa normalizado de decisões para busca robusta (ignora acentos e capitalização)
      const decisoesNorm = new Map<string, "adicionar" | "ignorar">();
      for (const [k, v] of Object.entries(decisoes)) {
        decisoesNorm.set(normalizeNomeConf(k), v);
      }

      for (const row of rowsUnicas) {
        if (!row.nome) { results.push({ nome: "(sem nome)", ok: false, error: "Nome obrigatório" }); continue; }

        // Aplicar de-para: se o nome da planilha foi mapeado para outro, usar o destino
        const nomeDestino = input.mappings[row.nome] ?? row.nome;
        const nomeNorm = normalizeNomeConf(nomeDestino);

        try {
          // Upsert no catálogo local
          const catalogItem = await upsertInsumosCatalogo({
            imovelId: input.imovelId,
            nome: nomeDestino,
            categoria: row.categoria,
            unidade: row.unidade,
          });

          // Verificar se já existe no Railway
          const insumoExistente = mapaExistentesConf.get(nomeNorm) ||
            (catalogItem.railwayId ? insumosExistentes.find(i => i.id === catalogItem.railwayId) : undefined);
          const jaExisteNoRailway = !!insumoExistente;

          if (jaExisteNoRailway && insumoExistente) {
            // ── DECISÃO DO USUÁRIO: adicionar ao estoque ou ignorar ──────────────────
            // Verificar a decisão usando o nome original da planilha (antes do de-para)
            // Usa busca normalizada para evitar falhas por acentuação ou capitalização
            const decisao = decisoes[row.nome]
              ?? decisoes[nomeDestino]
              ?? decisoesNorm.get(normalizeNomeConf(row.nome))
              ?? decisoesNorm.get(normalizeNomeConf(nomeDestino))
              // Se não há decisão explícita mas o insumo tem estoque > 0, aceitar automaticamente
              ?? (row.estoque_atual > 0 ? "adicionar" : "ignorar");

            if (decisao === "adicionar" && row.estoque_atual > 0) {
              // Somar o estoque da planilha ao estoque existente via movimentação
              try {
                // Usa ajuste_positivo para adicionar estoque via importação
                await railwayMutate(
                  `/insumos/${insumoExistente.id}/movimentar`,
                  "POST",
                  {
                    tipo: "ajuste_positivo",
                    quantidade: Math.abs(row.estoque_atual),
                    observacao: "Importação de planilha",
                    custo_unitario: row.preco_estimado || undefined,
                  },
                  claims.produtorId
                );
                results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: "atualizado" });
              } catch (movErr: unknown) {
                // Reportar erro real em vez de silenciosamente ignorar
                const errMsg = movErr instanceof Error ? movErr.message : String(movErr);
                results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: false, action: "ignorado", error: `Falha ao movimentar: ${errMsg}` });
              }
            } else {
              // Ignorar: não altera o estoque existente
              results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: "ignorado" });
            }
            // Se o insumo já existe mas ainda não tem fornecedor, e a planilha trouxe um,
            // vincula o fornecedor (resolvendo ou criando pelo nome) sem mexer em mais nada.
            if (!insumoExistente.fornecedor_id && row.fornecedor_nome) {
              const fornecedorId = await resolverFornecedorId(row.fornecedor_nome);
              if (fornecedorId) {
                try {
                  await railwayMutate(`/insumos/${insumoExistente.id}`, "PUT", {
                    nome: insumoExistente.nome,
                    categoria: insumoExistente.categoria,
                    unidade: insumoExistente.unidade,
                    origem: insumoExistente.origem,
                    estoque_minimo: insumoExistente.estoque_minimo,
                    estoque_ideal: insumoExistente.estoque_ideal,
                    preco_estimado: insumoExistente.preco_estimado,
                    fornecedor_id: fornecedorId,
                    reposicao_modo: insumoExistente.reposicao_modo,
                    lead_time_dias: insumoExistente.lead_time_dias,
                  }, claims.produtorId);
                } catch {
                  // Não bloqueia a importação se a vinculação do fornecedor falhar
                }
              }
            }
            continue;
          }

          // Insumo não existe: criar novo no Railway
          let actionFinal: "criado" | "atualizado" = "criado";
          try {
            const fornecedorId = await resolverFornecedorId(row.fornecedor_nome);
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
              fornecedor_id: fornecedorId,
              reposicao_modo: row.reposicao_modo,
              lead_time_dias: row.lead_time_dias,
            };
            const railwayResult = await railwayMutate<{ id: number } | unknown>("/insumos/", "POST", payload, claims.produtorId);
            if (railwayResult && typeof railwayResult === "object" && "id" in railwayResult) {
              await upsertInsumosCatalogo({ imovelId: input.imovelId, nome: nomeDestino, categoria: row.categoria, unidade: row.unidade, railwayId: (railwayResult as { id: number }).id });
            }
          } catch (railwayErr: unknown) {
            // Erro 409 = insumo já existe no Railway (race condition)
            const errMsg = railwayErr instanceof Error ? railwayErr.message : String(railwayErr);
            if (errMsg.includes("409") || errMsg.toLowerCase().includes("já existe") || errMsg.toLowerCase().includes("already exists")) {
              actionFinal = "atualizado";
            }
          }

          results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: actionFinal });
        } catch (e: unknown) {
          results.push({ nome: nomeDestino, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const success = results.filter(r => r.ok).length;
      const errors = results.filter(r => !r.ok).length;
      const criados = results.filter(r => r.action === "criado").length;
      const atualizados = results.filter(r => r.action === "atualizado").length;
      const ignorados = results.filter(r => r.action === "ignorado").length;
      return { total: rowsUnicas.length, success, errors, criados, atualizados, ignorados, results };
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
      // simulacaoAvulsa: endpoint público, sem produtorId necessário
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
      }, claims.produtorId);
      return res;
    }),

  listarCompetencias: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown[]>(`/simulador-regime/lancamentos/${input.imovelId}`, undefined, claims.produtorId);
      return Array.isArray(res) ? res : [];
    }),

  dashboardSimulador: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>(`/simulador-regime/dashboard/${input.imovelId}`, undefined, claims.produtorId);
      return res;
    }),

  deletarCompetencia: publicProcedure
    .input(z.object({ imovelId: z.number(), competencia: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>(`/simulador-regime/lancamento/${input.imovelId}/${input.competencia}`, {
        method: "DELETE",
      }, claims.produtorId);
      return res;
    }),

  perfilSimulador: publicProcedure
    .input(z.object({ imovelId: z.number() }))
    .query(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertImovel(claims, input.imovelId);
      const res = await railwayFetch<unknown>(`/simulador-regime/perfil/${input.imovelId}`, undefined, claims.produtorId);
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
      }, claims.produtorId);
      return res;
    }),

  // ── Fechar Competência ────────────────────────────────────────────────────
  fecharCompetencia: publicProcedure
    .input(z.object({ produtorId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const claims = await requireClaims(ctx.req);
      assertProdutor(claims, input.produtorId);
      const res = await railwayMutate<unknown>(`/produtores/${input.produtorId}/fechar-mes`, "POST", undefined, claims.produtorId);
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
