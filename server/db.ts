import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Animal,
  FinancialRecord,
  HealthRecord,
  InsertAnimal,
  InsertFinancialRecord,
  InsertHealthRecord,
  InsertMovement,
  InsertReproductiveRecord,
  InsertUser,
  Movement,
  InsumosCatalogo,
  InsertInsumosCatalogo,
  Procuracao,
  ProdutorConfig,
  ReproductiveRecord,
  User,
  ContadorVinculo,
  InsertContadorVinculo,
  animals,
  contadorVinculo,
  financialRecords,
  healthRecords,
  insumosCatalogo,
  movements,
  procuracoes,
  produtorConfig,
  produtorImovel,
  reproductiveRecords,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import * as bcrypt from "bcryptjs";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByCpf(cpf: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = cpf.replace(/\D/g, "");
  const formatted = normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const result = await db
    .select()
    .from(users)
    .where(eq(users.cpf, formatted))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithCpf(data: {
  name: string;
  cpf: string;
  password: string;
  role?: "user" | "admin";
}): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalized = data.cpf.replace(/\D/g, "");
  const formatted = normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const passwordHash = await bcrypt.hash(data.password, 12);
  const openId = `cpf_${normalized}`;
  await db.insert(users).values({
    openId,
    name: data.name,
    cpf: formatted,
    passwordHash,
    loginMethod: "cpf",
    role: data.role ?? "user",
    lastSignedIn: new Date(),
  });
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function verifyUserPassword(cpf: string, password: string): Promise<User | null> {
  const user = await getUserByCpf(cpf);
  if (!user || !user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  const db = await getDb();
  if (db) await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
  return user;
}

// ─── Animals ──────────────────────────────────────────────────────────────────

export async function getAnimalsByUser(userId: number, species?: string): Promise<Animal[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(animals.userId, userId)];
  if (species) conditions.push(eq(animals.species, species as Animal["species"]));
  return db.select().from(animals).where(and(...conditions)).orderBy(desc(animals.createdAt));
}

export async function getAnimalById(id: number, userId: number): Promise<Animal | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(animals).where(and(eq(animals.id, id), eq(animals.userId, userId))).limit(1);
  return result[0];
}

export async function createAnimal(data: InsertAnimal): Promise<Animal> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(animals).values(data);
  const result = await db.select().from(animals).where(and(eq(animals.userId, data.userId), eq(animals.identifier, data.identifier))).orderBy(desc(animals.createdAt)).limit(1);
  return result[0];
}

export async function updateAnimal(id: number, userId: number, data: Partial<InsertAnimal>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(animals).set(data).where(and(eq(animals.id, id), eq(animals.userId, userId)));
}

export async function deleteAnimal(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(animals).where(and(eq(animals.id, id), eq(animals.userId, userId)));
}

export async function getHerdSummary(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ species: animals.species, count: sql<number>`count(*)`, status: animals.status })
    .from(animals)
    .where(eq(animals.userId, userId))
    .groupBy(animals.species, animals.status);
}

// ─── Health Records ───────────────────────────────────────────────────────────

export async function getHealthRecords(userId: number, animalId?: number): Promise<HealthRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(healthRecords.userId, userId)];
  if (animalId) conditions.push(eq(healthRecords.animalId, animalId));
  return db.select().from(healthRecords).where(and(...conditions)).orderBy(desc(healthRecords.date));
}

export async function createHealthRecord(data: InsertHealthRecord): Promise<HealthRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(healthRecords).values(data);
  const result = await db.select().from(healthRecords).where(eq(healthRecords.animalId, data.animalId)).orderBy(desc(healthRecords.createdAt)).limit(1);
  return result[0];
}

export async function updateHealthRecord(id: number, userId: number, data: Partial<InsertHealthRecord>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(healthRecords).set(data).where(and(eq(healthRecords.id, id), eq(healthRecords.userId, userId)));
}

export async function deleteHealthRecord(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(healthRecords).where(and(eq(healthRecords.id, id), eq(healthRecords.userId, userId)));
}

// ─── Reproductive Records ─────────────────────────────────────────────────────

export async function getReproductiveRecords(userId: number, animalId?: number): Promise<ReproductiveRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(reproductiveRecords.userId, userId)];
  if (animalId) conditions.push(eq(reproductiveRecords.femaleId, animalId));
  return db.select().from(reproductiveRecords).where(and(...conditions)).orderBy(desc(reproductiveRecords.date));
}

export async function createReproductiveRecord(data: InsertReproductiveRecord): Promise<ReproductiveRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reproductiveRecords).values(data);
  const result = await db.select().from(reproductiveRecords).where(eq(reproductiveRecords.femaleId, data.femaleId)).orderBy(desc(reproductiveRecords.createdAt)).limit(1);
  return result[0];
}

export async function deleteReproductiveRecord(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reproductiveRecords).where(and(eq(reproductiveRecords.id, id), eq(reproductiveRecords.userId, userId)));
}

// ─── Financial Records ────────────────────────────────────────────────────────

export async function getFinancialRecords(userId: number, opts?: { from?: string; to?: string; type?: string }): Promise<FinancialRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(financialRecords.userId, userId)];
  if (opts?.type) conditions.push(eq(financialRecords.type, opts.type as FinancialRecord["type"]));
  if (opts?.from) conditions.push(gte(financialRecords.date, opts.from as unknown as Date));
  if (opts?.to) conditions.push(lte(financialRecords.date, opts.to as unknown as Date));
  return db.select().from(financialRecords).where(and(...conditions)).orderBy(desc(financialRecords.date));
}

export async function createFinancialRecord(data: InsertFinancialRecord): Promise<FinancialRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(financialRecords).values(data);
  const result = await db.select().from(financialRecords).where(eq(financialRecords.userId, data.userId)).orderBy(desc(financialRecords.createdAt)).limit(1);
  return result[0];
}

export async function deleteFinancialRecord(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(financialRecords).where(and(eq(financialRecords.id, id), eq(financialRecords.userId, userId)));
}

export async function getFinancialSummary(userId: number) {
  const db = await getDb();
  if (!db) return { receitas: 0, despesas: 0, lucro: 0 };
  const rows = await db
    .select({ type: financialRecords.type, total: sql<number>`sum(amount)` })
    .from(financialRecords)
    .where(eq(financialRecords.userId, userId))
    .groupBy(financialRecords.type);
  const receitas = Number(rows.find((r) => r.type === "receita")?.total ?? 0);
  const despesas = Number(rows.find((r) => r.type === "despesa")?.total ?? 0);
  return { receitas, despesas, lucro: receitas - despesas };
}

// ─── Movements ────────────────────────────────────────────────────────────────

export async function getMovements(userId: number, opts?: { from?: string; to?: string; species?: string }): Promise<(Movement & { animal: Animal | null })[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(movements.userId, userId)];
  if (opts?.from) conditions.push(gte(movements.date, opts.from as unknown as Date));
  if (opts?.to) conditions.push(lte(movements.date, opts.to as unknown as Date));
  const rows = await db.select().from(movements).where(and(...conditions)).orderBy(desc(movements.date));
  const result: (Movement & { animal: Animal | null })[] = [];
  for (const row of rows) {
    const animal = await getAnimalById(row.animalId, userId);
    if (opts?.species && animal?.species !== opts.species) continue;
    result.push({ ...row, animal: animal ?? null });
  }
  return result;
}

export async function createMovement(data: InsertMovement): Promise<Movement> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(movements).values(data);
  const result = await db.select().from(movements).where(eq(movements.animalId, data.animalId)).orderBy(desc(movements.createdAt)).limit(1);
  return result[0];
}

// ─── Produtor Config ──────────────────────────────────────────────────────────

/** Get per-produtor config (telegram_chat_id, whatsapp_priority). Returns null if not found. */
export async function getProdutorConfig(produtorId: number): Promise<ProdutorConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(produtorConfig).where(eq(produtorConfig.produtorId, produtorId)).limit(1);
  return result[0] ?? null;
}

/** Upsert per-produtor config. Creates a row if none exists, updates otherwise. */
export async function upsertProdutorConfig(
  produtorId: number,
  data: { telegramChatId?: string | null; whatsappPriority?: boolean }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(produtorConfig)
    .values({ produtorId, ...data })
    .onDuplicateKeyUpdate({ set: data });
}

// ─── Produtor Imovel (access control) ────────────────────────────────────────

/**
 * Returns the list of imovelIds that a given produtor is allowed to access.
 * If no rows exist (legacy / first login), returns null so the caller can
 * fall back to the Railway API list (all imóveis for that CPF).
 */
export async function getImoveisForProdutor(produtorId: number): Promise<number[] | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ imovelId: produtorImovel.imovelId })
    .from(produtorImovel)
    .where(eq(produtorImovel.produtorId, produtorId));
  if (rows.length === 0) return null; // no ACL rows → fall back to Railway
  return rows.map((r) => r.imovelId);
}

// ─── Procurações ──────────────────────────────────────────────────────────────

/** Cria uma nova procuração com status pendente */
export async function createProcuracao(data: {
  procuradorCpf: string;
  procuradorNome?: string;
  produtorCpf: string;
  arquivoUrl: string;
  arquivoKey: string;
}): Promise<Procuracao> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(procuracoes).values({
    procuradorCpf: data.procuradorCpf,
    procuradorNome: data.procuradorNome ?? null,
    produtorCpf: data.produtorCpf,
    arquivoUrl: data.arquivoUrl,
    arquivoKey: data.arquivoKey,
    status: "pendente",
  });
  const id = (result as { insertId: number }).insertId;
  const rows = await db.select().from(procuracoes).where(eq(procuracoes.id, id)).limit(1);
  return rows[0];
}

/** Retorna a procuração mais recente de um procurador (por CPF) */
export async function getProcuracaoByProcurador(cpf: string): Promise<Procuracao | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = cpf.replace(/\D/g, "");
  const formatted = normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const rows = await db
    .select()
    .from(procuracoes)
    .where(eq(procuracoes.procuradorCpf, formatted))
    .orderBy(desc(procuracoes.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Lista todas as procurações (para o painel admin) */
export async function listProcuracoes(): Promise<Procuracao[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(procuracoes).orderBy(desc(procuracoes.createdAt));
}

/** Aprova ou rejeita uma procuração */
export async function updateProcuracaoStatus(
  id: number,
  status: "aprovado" | "rejeitado",
  adminNota?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(procuracoes)
    .set({ status, adminNota: adminNota ?? null })
    .where(eq(procuracoes.id, id));
}

// ─── Catálogo de Insumos ────────────────────────────────────────────────────────────────────────────────────

/** Normaliza um nome de insumo para busca: lowercase, sem acentos, sem espaços extras */
export function normalizeInsumoNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefixos de código por categoria */
const CATEGORIA_PREFIX: Record<string, string> = {
  "farmacia": "FAR",
  "racao": "RAC",
  "combustivel": "COM",
  "fertilizante": "FER",
  "defensivo": "DEF",
  "vacina": "VAC",
  "medicamento": "MED",
  "lubrificante": "LUB",
  "semente": "SEM",
  "embalagem": "EMB",
  "outros": "OUT",
};

function getCategoriaPrefix(categoria: string): string {
  const norm = normalizeInsumoNome(categoria);
  for (const [key, prefix] of Object.entries(CATEGORIA_PREFIX)) {
    if (norm.includes(key)) return prefix;
  }
  return "INS";
}

/** Gera um código único para um novo insumo: PREFIX-NNN */
export async function gerarCodigoInsumo(imovelId: number, categoria: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const prefix = getCategoriaPrefix(categoria);
  // Contar quantos insumos com esse prefixo já existem nessa fazenda
  const rows = await db
    .select({ codigo: insumosCatalogo.codigo })
    .from(insumosCatalogo)
    .where(and(eq(insumosCatalogo.imovelId, imovelId), like(insumosCatalogo.codigo, `${prefix}-%`)));
  const seq = rows.length + 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

/** Lista todos os insumos do catálogo de uma fazenda */
export async function listInsumosCatalogo(imovelId: number): Promise<InsumosCatalogo[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(insumosCatalogo)
    .where(eq(insumosCatalogo.imovelId, imovelId))
    .orderBy(insumosCatalogo.codigo);
}

/** Busca um insumo pelo nome normalizado (exact match) */
export async function findInsumoByNome(imovelId: number, nome: string): Promise<InsumosCatalogo | null> {
  const db = await getDb();
  if (!db) return null;
  const nomeNorm = normalizeInsumoNome(nome);
  const rows = await db
    .select()
    .from(insumosCatalogo)
    .where(and(eq(insumosCatalogo.imovelId, imovelId), eq(insumosCatalogo.nomeNormalizado, nomeNorm)))
    .limit(1);
  return rows[0] ?? null;
}

/** Busca insumos pelo nome (busca parcial para autocomplete) */
export async function searchInsumosCatalogo(imovelId: number, query: string): Promise<InsumosCatalogo[]> {
  const db = await getDb();
  if (!db) return [];
  const nomeNorm = normalizeInsumoNome(query);
  return db
    .select()
    .from(insumosCatalogo)
    .where(and(eq(insumosCatalogo.imovelId, imovelId), like(insumosCatalogo.nomeNormalizado, `%${nomeNorm}%`)))
    .orderBy(insumosCatalogo.codigo)
    .limit(20);
}

/**
 * Upsert de insumo no catálogo:
 * - Se já existe pelo nome normalizado, atualiza categoria/unidade/railwayId
 * - Se não existe, cria com código gerado automaticamente
 * Retorna o insumo (novo ou atualizado) com o código.
 */
export async function upsertInsumosCatalogo(data: {
  imovelId: number;
  nome: string;
  categoria?: string;
  unidade?: string;
  railwayId?: number;
}): Promise<InsumosCatalogo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const nomeNorm = normalizeInsumoNome(data.nome);
  const categoria = data.categoria ?? "outros";
  const unidade = data.unidade ?? "unidade";

  // Verificar se já existe
  const existing = await findInsumoByNome(data.imovelId, data.nome);
  if (existing) {
    // Atualizar categoria/unidade/railwayId se fornecidos
    await db
      .update(insumosCatalogo)
      .set({ categoria, unidade, ...(data.railwayId ? { railwayId: data.railwayId } : {}) })
      .where(eq(insumosCatalogo.id, existing.id));
    return { ...existing, categoria, unidade };
  }

  // Criar novo com código gerado
  const codigo = await gerarCodigoInsumo(data.imovelId, categoria);
  const insert: InsertInsumosCatalogo = {
    imovelId: data.imovelId,
    codigo,
    nome: data.nome.trim(),
    nomeNormalizado: nomeNorm,
    categoria,
    unidade,
    railwayId: data.railwayId ?? null,
  };
  const [result] = await db.insert(insumosCatalogo).values(insert);
  const id = (result as { insertId: number }).insertId;
  const rows = await db.select().from(insumosCatalogo).where(eq(insumosCatalogo.id, id)).limit(1);
  return rows[0];
}

// ─── Vínculo Contador ↔ Produtor ─────────────────────────────────────────────

/** Cadastra um contador autorizado pelo produtor */
export async function cadastrarContador(data: {
  contadorCpf: string;
  contadorNome: string;
  contadorTelefone: string;
  produtorCpf: string;
  produtorId: number;
}): Promise<ContadorVinculo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cpfClean = data.contadorCpf.replace(/\D/g, "");
  // Verifica se já existe vínculo ativo para este contador+produtor
  const existing = await db
    .select()
    .from(contadorVinculo)
    .where(
      and(
        eq(contadorVinculo.contadorCpf, cpfClean),
        eq(contadorVinculo.produtorCpf, data.produtorCpf),
        eq(contadorVinculo.status, "ativo")
      )
    )
    .limit(1);
  if (existing.length > 0) throw new Error("Este contador já está vinculado a este produtor.");
  const [result] = await db.insert(contadorVinculo).values({
    contadorCpf: cpfClean,
    contadorNome: data.contadorNome.trim(),
    contadorTelefone: data.contadorTelefone.replace(/\D/g, ""),
    produtorCpf: data.produtorCpf,
    produtorId: data.produtorId,
    status: "ativo",
  });
  const id = (result as { insertId: number }).insertId;
  const rows = await db.select().from(contadorVinculo).where(eq(contadorVinculo.id, id)).limit(1);
  return rows[0];
}

/** Lista os contadores ativos vinculados a um produtor */
export async function listarContadoresPorProdutor(produtorCpf: string): Promise<ContadorVinculo[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contadorVinculo)
    .where(
      and(
        eq(contadorVinculo.produtorCpf, produtorCpf),
        eq(contadorVinculo.status, "ativo")
      )
    )
    .orderBy(contadorVinculo.createdAt);
}

/** Revoga o acesso de um contador (soft delete) */
export async function revogarContador(id: number, produtorCpf: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(contadorVinculo)
    .set({ status: "revogado" })
    .where(
      and(
        eq(contadorVinculo.id, id),
        eq(contadorVinculo.produtorCpf, produtorCpf)
      )
    );
}

/**
 * Busca todos os vínculos ativos para um CPF de contador.
 * Usado no login OTP para determinar quais produtores o contador pode acessar.
 */
export async function getVinculosPorContador(contadorCpf: string): Promise<ContadorVinculo[]> {
  const db = await getDb();
  if (!db) return [];
  const cpfClean = contadorCpf.replace(/\D/g, "");
  return db
    .select()
    .from(contadorVinculo)
    .where(
      and(
        eq(contadorVinculo.contadorCpf, cpfClean),
        eq(contadorVinculo.status, "ativo")
      )
    );
}
