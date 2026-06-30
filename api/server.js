var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/env.ts
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
      forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
    };
  }
});

// server/railwayProxy.ts
var railwayProxy_exports = {};
__export(railwayProxy_exports, {
  RAILWAY_API: () => RAILWAY_API2,
  assertImovel: () => assertImovel,
  assertProdutor: () => assertProdutor,
  getClaimsFromRequest: () => getClaimsFromRequest,
  railwayFetch: () => railwayFetch
});
import * as jose from "jose";
import { parse as parseCookieHeader2 } from "cookie";
import { TRPCError as TRPCError3 } from "@trpc/server";
async function getClaimsFromRequest(req) {
  try {
    let raw;
    const xRcClaims = req.headers["x-rc-claims"];
    if (xRcClaims) {
      raw = xRcClaims;
    } else {
      const cookies = parseCookieHeader2(req.headers.cookie ?? "");
      raw = cookies.rc_claims;
    }
    if (!raw) return null;
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jose.jwtVerify(raw, secret);
    if (typeof payload.produtorId !== "number" || typeof payload.cpf !== "string") return null;
    return {
      produtorId: payload.produtorId,
      cpf: payload.cpf,
      imovelId: payload.imovelId ?? null,
      role: payload.role ?? "user"
    };
  } catch {
    return null;
  }
}
function assertImovel(claims, requestedImovelId) {
  if (claims.imovelId !== null && claims.imovelId !== requestedImovelId) {
    throw new TRPCError3({
      code: "FORBIDDEN",
      message: "Acesso negado: im\xF3vel n\xE3o pertence \xE0 sess\xE3o ativa."
    });
  }
}
function assertProdutor(claims, requestedProdutorId) {
  if (claims.produtorId !== requestedProdutorId) {
    throw new TRPCError3({
      code: "FORBIDDEN",
      message: "Acesso negado: produtor n\xE3o corresponde \xE0 sess\xE3o ativa."
    });
  }
}
async function railwayFetch(path3, options) {
  const fetchOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers ?? {}
    }
  };
  const res = await fetch(`${RAILWAY_API2}${path3}`, fetchOptions);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new TRPCError3({
      code: res.status === 404 ? "NOT_FOUND" : "INTERNAL_SERVER_ERROR",
      message: err.detail ?? `Railway API error ${res.status}`
    });
  }
  if (res.status === 204) return {};
  return res.json();
}
var RAILWAY_API2;
var init_railwayProxy = __esm({
  "server/railwayProxy.ts"() {
    "use strict";
    init_env();
    RAILWAY_API2 = "https://ruralcaixa-mvp-production.up.railway.app";
  }
});

// server/storage.ts
var storage_exports = {};
__export(storage_exports, {
  storageGet: () => storageGet,
  storageGetSignedUrl: () => storageGetSignedUrl,
  storagePut: () => storagePut
});
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash2 = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash2}`;
  return `${relKey.slice(0, lastDot)}_${hash2}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
async function storageGet(relKey) {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}
async function storageGetSignedUrl(relKey) {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = await resp.json();
  return url;
}
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_env();
  }
});

// server/vercelHandler.ts
import "dotenv/config";
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  date,
  boolean
} from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  cpf: varchar("cpf", { length: 14 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var animals = mysqlTable("animals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  identifier: varchar("identifier", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }),
  species: mysqlEnum("species", ["ovinos", "caprinos", "suinos", "bovinos"]).notNull(),
  breed: varchar("breed", { length: 128 }),
  sex: mysqlEnum("sex", ["macho", "femea"]).notNull(),
  birthDate: date("birthDate"),
  weight: decimal("weight", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["ativo", "vendido", "morto", "transferido"]).default("ativo").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var healthRecords = mysqlTable("health_records", {
  id: int("id").autoincrement().primaryKey(),
  animalId: int("animalId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["vacina", "medicamento", "ocorrencia"]).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  date: date("date").notNull(),
  nextDueDate: date("nextDueDate"),
  dosage: varchar("dosage", { length: 128 }),
  veterinarian: varchar("veterinarian", { length: 128 }),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var reproductiveRecords = mysqlTable("reproductive_records", {
  id: int("id").autoincrement().primaryKey(),
  femaleId: int("femaleId").notNull(),
  maleId: int("maleId"),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["cobertura", "gestacao", "parto", "aborto"]).notNull(),
  date: date("date").notNull(),
  expectedBirthDate: date("expectedBirthDate"),
  actualBirthDate: date("actualBirthDate"),
  offspringCount: int("offspringCount"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var financialRecords = mysqlTable("financial_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["receita", "despesa"]).notNull(),
  category: varchar("category", { length: 128 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: date("date").notNull(),
  animalId: int("animalId"),
  species: mysqlEnum("species", ["ovinos", "caprinos", "suinos", "bovinos"]),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var movements = mysqlTable("movements", {
  id: int("id").autoincrement().primaryKey(),
  animalId: int("animalId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["entrada", "saida", "transferencia", "nascimento", "morte", "venda"]).notNull(),
  date: date("date").notNull(),
  fromLocation: varchar("fromLocation", { length: 255 }),
  toLocation: varchar("toLocation", { length: 255 }),
  weight: decimal("weight", { precision: 8, scale: 2 }),
  value: decimal("value", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var produtorConfig = mysqlTable("produtor_config", {
  id: int("id").autoincrement().primaryKey(),
  /** Railway produtor.id — used as the foreign key to the Railway dataset */
  produtorId: int("produtorId").notNull().unique(),
  /** Telegram personal chat_id for direct OTP messages (optional) */
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  /**
   * When true, WhatsApp is the primary OTP channel and Telegram is the fallback.
   * Set to true once Meta approves the WhatsApp Business integration.
   * Default false = Telegram first.
   */
  whatsappPriority: boolean("whatsappPriority").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var produtorImovel = mysqlTable("produtor_imovel", {
  id: int("id").autoincrement().primaryKey(),
  /** Railway produtor.id */
  produtorId: int("produtorId").notNull(),
  /** Railway imovel.id */
  imovelId: int("imovelId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var procuracoes = mysqlTable("procuracoes", {
  id: int("id").autoincrement().primaryKey(),
  /** CPF do procurador (quem está solicitando acesso) */
  procuradorCpf: varchar("procuradorCpf", { length: 14 }).notNull(),
  /** Nome do procurador */
  procuradorNome: varchar("procuradorNome", { length: 255 }),
  /** CPF do produtor representado */
  produtorCpf: varchar("produtorCpf", { length: 14 }).notNull(),
  /** URL pública do arquivo no S3 */
  arquivoUrl: text("arquivoUrl").notNull(),
  /** Chave S3 para gestão do arquivo */
  arquivoKey: varchar("arquivoKey", { length: 512 }).notNull(),
  /** Status da procuração */
  status: mysqlEnum("status", ["pendente", "aprovado", "rejeitado"]).default("pendente").notNull(),
  /** Observação do admin ao aprovar/rejeitar */
  adminNota: text("adminNota"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var insumosCatalogo = mysqlTable("insumos_catalogo", {
  id: int("id").autoincrement().primaryKey(),
  /** Railway imovel.id (fazenda) */
  imovelId: int("imovelId").notNull(),
  /**
   * Código único por fazenda: prefixo por categoria + sequencial
   * Ex: FAR-001 (farmácia), RAC-002 (ração), COM-003 (combustível)
   */
  codigo: varchar("codigo", { length: 32 }).notNull(),
  /** Nome canônico do insumo (normalizado para busca) */
  nome: varchar("nome", { length: 255 }).notNull(),
  /** Nome normalizado para busca fuzzy (lowercase, sem acentos) */
  nomeNormalizado: varchar("nomeNormalizado", { length: 255 }).notNull(),
  categoria: varchar("categoria", { length: 64 }).notNull().default("outros"),
  unidade: varchar("unidade", { length: 32 }).notNull().default("unidade"),
  /** ID do insumo no Railway (null até o backend de insumos ser deployado) */
  railwayId: int("railwayId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/db.ts
init_env();
import * as bcrypt from "bcryptjs";
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = { openId: user.openId };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByCpf(cpf) {
  const db = await getDb();
  if (!db) return void 0;
  const normalized = cpf.replace(/\D/g, "");
  const formatted = normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const result = await db.select().from(users).where(eq(users.cpf, formatted)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createUserWithCpf(data) {
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
    lastSignedIn: /* @__PURE__ */ new Date()
  });
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
async function verifyUserPassword(cpf, password) {
  const user = await getUserByCpf(cpf);
  if (!user || !user.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  const db = await getDb();
  if (db) await db.update(users).set({ lastSignedIn: /* @__PURE__ */ new Date() }).where(eq(users.id, user.id));
  return user;
}
async function getAnimalsByUser(userId, species) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(animals.userId, userId)];
  if (species) conditions.push(eq(animals.species, species));
  return db.select().from(animals).where(and(...conditions)).orderBy(desc(animals.createdAt));
}
async function getAnimalById(id, userId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(animals).where(and(eq(animals.id, id), eq(animals.userId, userId))).limit(1);
  return result[0];
}
async function createAnimal(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(animals).values(data);
  const result = await db.select().from(animals).where(and(eq(animals.userId, data.userId), eq(animals.identifier, data.identifier))).orderBy(desc(animals.createdAt)).limit(1);
  return result[0];
}
async function updateAnimal(id, userId, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(animals).set(data).where(and(eq(animals.id, id), eq(animals.userId, userId)));
}
async function deleteAnimal(id, userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(animals).where(and(eq(animals.id, id), eq(animals.userId, userId)));
}
async function getHerdSummary(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ species: animals.species, count: sql`count(*)`, status: animals.status }).from(animals).where(eq(animals.userId, userId)).groupBy(animals.species, animals.status);
}
async function getHealthRecords(userId, animalId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(healthRecords.userId, userId)];
  if (animalId) conditions.push(eq(healthRecords.animalId, animalId));
  return db.select().from(healthRecords).where(and(...conditions)).orderBy(desc(healthRecords.date));
}
async function createHealthRecord(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(healthRecords).values(data);
  const result = await db.select().from(healthRecords).where(eq(healthRecords.animalId, data.animalId)).orderBy(desc(healthRecords.createdAt)).limit(1);
  return result[0];
}
async function updateHealthRecord(id, userId, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(healthRecords).set(data).where(and(eq(healthRecords.id, id), eq(healthRecords.userId, userId)));
}
async function deleteHealthRecord(id, userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(healthRecords).where(and(eq(healthRecords.id, id), eq(healthRecords.userId, userId)));
}
async function getReproductiveRecords(userId, animalId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(reproductiveRecords.userId, userId)];
  if (animalId) conditions.push(eq(reproductiveRecords.femaleId, animalId));
  return db.select().from(reproductiveRecords).where(and(...conditions)).orderBy(desc(reproductiveRecords.date));
}
async function createReproductiveRecord(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reproductiveRecords).values(data);
  const result = await db.select().from(reproductiveRecords).where(eq(reproductiveRecords.femaleId, data.femaleId)).orderBy(desc(reproductiveRecords.createdAt)).limit(1);
  return result[0];
}
async function deleteReproductiveRecord(id, userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reproductiveRecords).where(and(eq(reproductiveRecords.id, id), eq(reproductiveRecords.userId, userId)));
}
async function getFinancialRecords(userId, opts) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(financialRecords.userId, userId)];
  if (opts?.type) conditions.push(eq(financialRecords.type, opts.type));
  if (opts?.from) conditions.push(gte(financialRecords.date, opts.from));
  if (opts?.to) conditions.push(lte(financialRecords.date, opts.to));
  return db.select().from(financialRecords).where(and(...conditions)).orderBy(desc(financialRecords.date));
}
async function createFinancialRecord(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(financialRecords).values(data);
  const result = await db.select().from(financialRecords).where(eq(financialRecords.userId, data.userId)).orderBy(desc(financialRecords.createdAt)).limit(1);
  return result[0];
}
async function deleteFinancialRecord(id, userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(financialRecords).where(and(eq(financialRecords.id, id), eq(financialRecords.userId, userId)));
}
async function getFinancialSummary(userId) {
  const db = await getDb();
  if (!db) return { receitas: 0, despesas: 0, lucro: 0 };
  const rows = await db.select({ type: financialRecords.type, total: sql`sum(amount)` }).from(financialRecords).where(eq(financialRecords.userId, userId)).groupBy(financialRecords.type);
  const receitas = Number(rows.find((r) => r.type === "receita")?.total ?? 0);
  const despesas = Number(rows.find((r) => r.type === "despesa")?.total ?? 0);
  return { receitas, despesas, lucro: receitas - despesas };
}
async function getMovements(userId, opts) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(movements.userId, userId)];
  if (opts?.from) conditions.push(gte(movements.date, opts.from));
  if (opts?.to) conditions.push(lte(movements.date, opts.to));
  const rows = await db.select().from(movements).where(and(...conditions)).orderBy(desc(movements.date));
  const result = [];
  for (const row of rows) {
    const animal = await getAnimalById(row.animalId, userId);
    if (opts?.species && animal?.species !== opts.species) continue;
    result.push({ ...row, animal: animal ?? null });
  }
  return result;
}
async function createMovement(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(movements).values(data);
  const result = await db.select().from(movements).where(eq(movements.animalId, data.animalId)).orderBy(desc(movements.createdAt)).limit(1);
  return result[0];
}
async function getProdutorConfig(produtorId) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(produtorConfig).where(eq(produtorConfig.produtorId, produtorId)).limit(1);
  return result[0] ?? null;
}
async function upsertProdutorConfig(produtorId, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(produtorConfig).values({ produtorId, ...data }).onDuplicateKeyUpdate({ set: data });
}
async function getImoveisForProdutor(produtorId) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ imovelId: produtorImovel.imovelId }).from(produtorImovel).where(eq(produtorImovel.produtorId, produtorId));
  if (rows.length === 0) return null;
  return rows.map((r) => r.imovelId);
}
async function createProcuracao(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(procuracoes).values({
    procuradorCpf: data.procuradorCpf,
    procuradorNome: data.procuradorNome ?? null,
    produtorCpf: data.produtorCpf,
    arquivoUrl: data.arquivoUrl,
    arquivoKey: data.arquivoKey,
    status: "pendente"
  });
  const id = result.insertId;
  const rows = await db.select().from(procuracoes).where(eq(procuracoes.id, id)).limit(1);
  return rows[0];
}
async function getProcuracaoByProcurador(cpf) {
  const db = await getDb();
  if (!db) return null;
  const normalized = cpf.replace(/\D/g, "");
  const formatted = normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const rows = await db.select().from(procuracoes).where(eq(procuracoes.procuradorCpf, formatted)).orderBy(desc(procuracoes.createdAt)).limit(1);
  return rows[0] ?? null;
}
async function listProcuracoes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(procuracoes).orderBy(desc(procuracoes.createdAt));
}
async function updateProcuracaoStatus(id, status, adminNota) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(procuracoes).set({ status, adminNota: adminNota ?? null }).where(eq(procuracoes.id, id));
}
function normalizeInsumoNome(nome) {
  return nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
var CATEGORIA_PREFIX = {
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
  "outros": "OUT"
};
function getCategoriaPrefix(categoria) {
  const norm = normalizeInsumoNome(categoria);
  for (const [key, prefix] of Object.entries(CATEGORIA_PREFIX)) {
    if (norm.includes(key)) return prefix;
  }
  return "INS";
}
async function gerarCodigoInsumo(imovelId, categoria) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const prefix = getCategoriaPrefix(categoria);
  const rows = await db.select({ codigo: insumosCatalogo.codigo }).from(insumosCatalogo).where(and(eq(insumosCatalogo.imovelId, imovelId), like(insumosCatalogo.codigo, `${prefix}-%`)));
  const seq = rows.length + 1;
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
async function listInsumosCatalogo(imovelId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(insumosCatalogo).where(eq(insumosCatalogo.imovelId, imovelId)).orderBy(insumosCatalogo.codigo);
}
async function findInsumoByNome(imovelId, nome) {
  const db = await getDb();
  if (!db) return null;
  const nomeNorm = normalizeInsumoNome(nome);
  const rows = await db.select().from(insumosCatalogo).where(and(eq(insumosCatalogo.imovelId, imovelId), eq(insumosCatalogo.nomeNormalizado, nomeNorm))).limit(1);
  return rows[0] ?? null;
}
async function searchInsumosCatalogo(imovelId, query) {
  const db = await getDb();
  if (!db) return [];
  const nomeNorm = normalizeInsumoNome(query);
  return db.select().from(insumosCatalogo).where(and(eq(insumosCatalogo.imovelId, imovelId), like(insumosCatalogo.nomeNormalizado, `%${nomeNorm}%`))).orderBy(insumosCatalogo.codigo).limit(20);
}
async function upsertInsumosCatalogo(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const nomeNorm = normalizeInsumoNome(data.nome);
  const categoria = data.categoria ?? "outros";
  const unidade = data.unidade ?? "unidade";
  const existing = await findInsumoByNome(data.imovelId, data.nome);
  if (existing) {
    await db.update(insumosCatalogo).set({ categoria, unidade, ...data.railwayId ? { railwayId: data.railwayId } : {} }).where(eq(insumosCatalogo.id, existing.id));
    return { ...existing, categoria, unidade };
  }
  const codigo = await gerarCodigoInsumo(data.imovelId, categoria);
  const insert = {
    imovelId: data.imovelId,
    codigo,
    nome: data.nome.trim(),
    nomeNormalizado: nomeNorm,
    categoria,
    unidade,
    railwayId: data.railwayId ?? null
  };
  const [result] = await db.insert(insumosCatalogo).values(insert);
  const id = result.insertId;
  const rows = await db.select().from(insumosCatalogo).where(eq(insumosCatalogo.id, id)).limit(1);
  return rows[0];
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    // sameSite:'none' requires secure:true; fall back to 'lax' for plain HTTP
    // (dev sandbox, localhost) so the cookie is actually sent by the browser.
    sameSite: secure ? "none" : "lax",
    secure
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
init_env();
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
init_env();
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { TRPCError as TRPCError5 } from "@trpc/server";
import { z as z3 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_env();
import * as jose2 from "jose";

// server/otp.ts
var RAILWAY_API = "https://ruralcaixa-mvp-production.up.railway.app";
var OTP_TTL_MS = 5 * 60 * 1e3;
var MAX_ATTEMPTS = 5;
var otpStore = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  Array.from(otpStore.entries()).forEach(([key, entry]) => {
    if (entry.expiresAt < now) otpStore.delete(key);
  });
}, 6e4);
function generateCode() {
  return String(Math.floor(1e5 + Math.random() * 9e5));
}
function cleanCpf(cpf) {
  return cpf.replace(/\D/g, "");
}
function maskPhone(phone) {
  const digits = phone.replace(/\D/g, "").slice(-11);
  if (digits.length < 4) return "****";
  return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
}
async function fetchProdutor(cpf) {
  const res = await fetch(`${RAILWAY_API}/produtores`, {
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error("Falha ao consultar produtores");
  const list = await res.json();
  return list.find((p) => cleanCpf(p.cpf) === cleanCpf(cpf)) ?? null;
}
async function fetchImoveis(cpf) {
  try {
    const res = await fetch(`${RAILWAY_API}/imoveis/buscar?cpf=${cleanCpf(cpf)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
async function sendWhatsApp(telefone, code) {
  try {
    const body = {
      telefone,
      tipo_midia: "texto",
      conteudo: `\u{1F510} *RuralCaixa* \u2014 Seu c\xF3digo de acesso \xE9:

*${code}*

V\xE1lido por 5 minutos. N\xE3o compartilhe com ningu\xE9m.`,
      imovel_id: null
    };
    const res = await fetch(`${RAILWAY_API}/ovino/webhook/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch {
    return false;
  }
}
async function sendTelegramDirect(telegramChatId, code, nome) {
  try {
    const body = {
      telegram_chat_id: telegramChatId,
      mensagem: `\u{1F510} Ol\xE1, ${nome}!

Seu c\xF3digo de acesso ao *RuralCaixa* \xE9:

*${code}*

V\xE1lido por 5 minutos. N\xE3o compartilhe com ningu\xE9m.`
    };
    const res = await fetch(`${RAILWAY_API}/telegram/mensagem-direta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch {
    return false;
  }
}
async function sendTelegramGroup(code, nome) {
  try {
    const body = {
      titulo: "C\xF3digo de Acesso RuralCaixa",
      mensagem: `\u{1F510} Ol\xE1, ${nome}!

Seu c\xF3digo de acesso \xE9: *${code}*

V\xE1lido por 5 minutos. N\xE3o compartilhe com ningu\xE9m.`,
      nivel: "info"
    };
    const res = await fetch(`${RAILWAY_API}/telegram/alerta/generico`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch {
    return false;
  }
}
async function smartSend(produtorId, telefone, code, nome) {
  const config = await getProdutorConfig(produtorId).catch(() => null);
  const whatsappPriority = config?.whatsappPriority ?? false;
  const telegramChatId = config?.telegramChatId ?? null;
  if (whatsappPriority) {
    const wappOk = await sendWhatsApp(telefone, code);
    if (wappOk) return "whatsapp";
    if (telegramChatId) {
      const tgOk = await sendTelegramDirect(telegramChatId, code, nome);
      if (tgOk) return "telegram_direct";
    }
    const tgGroupOk = await sendTelegramGroup(code, nome);
    if (tgGroupOk) return "telegram_group";
    throw new Error("N\xE3o foi poss\xEDvel enviar o c\xF3digo. Tente novamente em instantes.");
  } else {
    if (telegramChatId) {
      const tgOk = await sendTelegramDirect(telegramChatId, code, nome);
      if (tgOk) return "telegram_direct";
    }
    const tgGroupOk = await sendTelegramGroup(code, nome);
    if (tgGroupOk) return "telegram_group";
    const wappOk = await sendWhatsApp(telefone, code);
    if (wappOk) return "whatsapp";
    throw new Error("N\xE3o foi poss\xEDvel enviar o c\xF3digo. Tente novamente em instantes.");
  }
}
async function sendOtp(cpf) {
  const cpfClean = cleanCpf(cpf);
  const produtor = await fetchProdutor(cpfClean);
  if (!produtor) {
    throw new Error("CPF n\xE3o encontrado. Verifique ou entre em contato.");
  }
  const imovelList = await fetchImoveis(cpfClean);
  const localUser = await getUserByCpf(cpfClean).catch(() => null);
  const role = localUser?.role ?? "user";
  let allowedImoveis = imovelList;
  if (role === "user") {
    const allowedIds = await getImoveisForProdutor(produtor.id).catch(() => null);
    if (allowedIds) {
      allowedImoveis = imovelList.filter((im) => allowedIds.includes(im.id));
    }
  }
  const imovelId = allowedImoveis?.[0]?.id;
  const imovelCount = allowedImoveis.length;
  const code = generateCode();
  const entry = {
    code,
    cpf: cpfClean,
    produtorId: produtor.id,
    produtorNome: produtor.nome,
    telefone: produtor.telefone,
    imovelId,
    imovelCount,
    role,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0
  };
  const channel = await smartSend(produtor.id, produtor.telefone, code, produtor.nome);
  otpStore.set(cpfClean, entry);
  console.log(`[OTP] Code sent to ${produtor.nome} via ${channel} (${maskPhone(produtor.telefone)})`);
  return {
    success: true,
    channel,
    maskedPhone: maskPhone(produtor.telefone),
    produtorNome: produtor.nome
  };
}
async function verifyOtp(cpf, code) {
  const cpfClean = cleanCpf(cpf);
  const entry = otpStore.get(cpfClean);
  if (!entry) {
    throw new Error("C\xF3digo expirado ou n\xE3o solicitado. Solicite um novo c\xF3digo.");
  }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cpfClean);
    throw new Error("C\xF3digo expirado. Solicite um novo c\xF3digo.");
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(cpfClean);
    throw new Error("Muitas tentativas incorretas. Solicite um novo c\xF3digo.");
  }
  if (entry.code !== code.trim()) {
    const remaining = MAX_ATTEMPTS - entry.attempts;
    throw new Error(
      `C\xF3digo incorreto. ${remaining} tentativa${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`
    );
  }
  otpStore.delete(cpfClean);
  const openId = `rc_${entry.produtorId}`;
  return {
    success: true,
    produtorId: entry.produtorId,
    produtorNome: entry.produtorNome,
    imovelId: entry.imovelId,
    imovelCount: entry.imovelCount ?? 1,
    role: entry.role ?? "user",
    openId
  };
}

// server/routers/railway.ts
import { z as z2 } from "zod";
init_railwayProxy();
import * as XLSX from "xlsx";
import { TRPCError as TRPCError4 } from "@trpc/server";
async function requireClaims(req) {
  const claims = await getClaimsFromRequest(req);
  if (!claims) {
    throw new TRPCError4({
      code: "UNAUTHORIZED",
      message: "Sess\xE3o inv\xE1lida ou expirada. Fa\xE7a login novamente."
    });
  }
  return claims;
}
async function railwayMutate(path3, method, body) {
  const res = await fetch(`${RAILWAY_API2}${path3}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== void 0 ? JSON.stringify(body) : void 0
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new TRPCError4({
      code: "INTERNAL_SERVER_ERROR",
      message: err.detail ?? `Railway API error ${res.status}`
    });
  }
  if (res.status === 204) return {};
  return res.json();
}
var especiePrefix = {
  ovinos: "ovino",
  caprinos: "caprino",
  suinos: "suino",
  bovinos: "bovino"
};
var railwayRouter = router({
  // ── Imóveis ────────────────────────────────────────────────────────────────
  imoveis: publicProcedure.query(async ({ ctx }) => {
    const claims = await requireClaims(ctx.req);
    const allImoveis = await railwayFetch(`/imoveis/buscar?cpf=${claims.cpf}`);
    if (claims.role === "admin") {
      return allImoveis;
    }
    const allowedIds = await getImoveisForProdutor(claims.produtorId);
    if (!allowedIds) {
      return allImoveis;
    }
    return allImoveis.filter((im) => allowedIds.includes(im.id));
  }),
  // ── Raças por espécie ──────────────────────────────────────────────────────
  racas: publicProcedure.input(z2.object({ especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    await requireClaims(ctx.req);
    const prefix = especiePrefix[input.especie];
    return railwayFetch(`/${prefix}/racas`).catch(() => []);
  }),
  // ── Animals ────────────────────────────────────────────────────────────────
  animais: publicProcedure.input(z2.object({ imovelId: z2.number(), especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    if (input.especie === "bovinos") {
      return railwayFetch(`/${prefix}/animais/${input.imovelId}`);
    }
    return railwayFetch(`/${prefix}/animais?imovel_id=${input.imovelId}`);
  }),
  createAnimal: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    brinco: z2.string().min(1),
    nome: z2.string().optional(),
    raca: z2.string().optional(),
    sexo: z2.enum(["M", "F"]),
    data_nascimento: z2.string().optional(),
    peso_nascimento: z2.number().optional(),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { imovelId, especie, ...fields } = input;
    return railwayMutate(`/${prefix}/animais`, "POST", {
      imovel_id: imovelId,
      ...fields
    });
  }),
  updateAnimal: publicProcedure.input(z2.object({
    animalId: z2.number(),
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    brinco: z2.string().optional(),
    nome: z2.string().optional(),
    raca: z2.string().optional(),
    sexo: z2.enum(["M", "F"]).optional(),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { animalId, imovelId, especie, ...fields } = input;
    return railwayMutate(`/${prefix}/animais/${animalId}`, "PATCH", fields);
  }),
  updateAnimalStatus: publicProcedure.input(z2.object({
    animalId: z2.number(),
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    status: z2.string(),
    motivo: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { animalId, imovelId, especie, ...fields } = input;
    return railwayMutate(`/${prefix}/animais/${animalId}/status`, "PATCH", fields);
  }),
  // ── Dashboard ──────────────────────────────────────────────────────────────
  ovinoDashboard: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return railwayFetch(`/ovino/dashboard/${input.imovelId}`);
  }),
  // ── Financial ──────────────────────────────────────────────────────────────
  produtorResumo: publicProcedure.input(z2.object({ produtorId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    return railwayFetch(`/produtores/${input.produtorId}/resumo`);
  }),
  lancamentos: publicProcedure.input(z2.object({ produtorId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    return railwayFetch(`/produtores/${input.produtorId}/lancamentos`);
  }),
  createLancamento: publicProcedure.input(z2.object({
    produtorId: z2.number(),
    tipo: z2.enum(["receita", "despesa"]),
    descricao: z2.string().min(1),
    valor: z2.number().positive(),
    data_lancamento: z2.string(),
    confirmado: z2.boolean().optional(),
    atividade: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    const { produtorId, ...fields } = input;
    return railwayMutate(`/lancamentos`, "POST", {
      produtor_id: produtorId,
      ...fields
    });
  }),
  updateLancamento: publicProcedure.input(z2.object({
    lancamentoId: z2.string(),
    produtorId: z2.number(),
    tipo: z2.enum(["receita", "despesa"]).optional(),
    descricao: z2.string().optional(),
    valor: z2.number().positive().optional(),
    data_lancamento: z2.string().optional(),
    confirmado: z2.boolean().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    const { lancamentoId, produtorId, ...fields } = input;
    return railwayMutate(`/lancamentos/${lancamentoId}`, "PUT", {
      produtor_id: produtorId,
      ...fields
    });
  }),
  deleteLancamento: publicProcedure.input(z2.object({ produtorId: z2.number(), lancamentoId: z2.string() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    await railwayMutate(`/lancamentos/${input.lancamentoId}`, "DELETE");
    return { success: true };
  }),
  // ── Sanitary ───────────────────────────────────────────────────────────────
  sanitario: publicProcedure.input(z2.object({ imovelId: z2.number(), especie: z2.enum(["ovinos", "caprinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    if (input.especie === "bovinos") {
      return railwayFetch(`/${prefix}/sanitario/${input.imovelId}/proximos`);
    }
    return railwayFetch(`/${prefix}/sanitario/calendario?imovel_id=${input.imovelId}&dias=30`);
  }),
  createSanitario: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    insumo_id: z2.number().optional(),
    descricao: z2.string().min(1),
    tipo: z2.string(),
    data_aplicacao: z2.string(),
    animal_id: z2.number().optional(),
    dose_ml: z2.number().optional(),
    responsavel_nome: z2.string().optional(),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { imovelId, especie, ...fields } = input;
    return railwayMutate(`/${prefix}/saude`, "POST", {
      imovel_id: imovelId,
      ...fields
    });
  }),
  // ── Reproduction ───────────────────────────────────────────────────────────
  reproducao: publicProcedure.input(z2.object({ imovelId: z2.number(), especie: z2.enum(["ovinos", "caprinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    if (input.especie === "bovinos") {
      return railwayFetch(`/${prefix}/reproducao/${input.imovelId}/prenhas`);
    }
    return railwayFetch(`/${prefix}/alertas?imovel_id=${input.imovelId}&tipo=reproducao`).catch(() => []);
  }),
  createReproducao: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "bovinos"]),
    tipo: z2.string(),
    data_evento: z2.string(),
    matriz_id: z2.number().optional(),
    reprodutor_id: z2.number().optional(),
    cordeiros_vivos: z2.number().optional(),
    cordeiros_mortos: z2.number().optional(),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { imovelId, especie, ...fields } = input;
    return railwayMutate(`/${prefix}/reproducao`, "POST", {
      imovel_id: imovelId,
      ...fields
    });
  }),
  // ── Insumos ────────────────────────────────────────────────────────────────
  insumos: publicProcedure.input(z2.object({ imovelId: z2.number(), categoria: z2.string().optional(), origem: z2.string().optional() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const params = new URLSearchParams({ fazenda_id: String(input.imovelId) });
    if (input.categoria) params.set("categoria", input.categoria);
    if (input.origem) params.set("origem", input.origem);
    const data = await railwayFetch(`/insumos/?${params}`);
    return Array.isArray(data) ? data : data.data ?? [];
  }),
  insumosAlertas: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayFetch(`/insumos/alertas?fazenda_id=${input.imovelId}`);
    return Array.isArray(data) ? data : data.data ?? [];
  }),
  createInsumo: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    nome: z2.string().min(1),
    descricao: z2.string().optional(),
    categoria: z2.string().default("outros"),
    unidade: z2.string().default("unidade"),
    origem: z2.enum(["comprado", "proprio", "doacao"]).default("comprado"),
    estoque_atual: z2.number().default(0),
    estoque_minimo: z2.number().default(0),
    estoque_ideal: z2.number().default(0),
    preco_estimado: z2.number().optional(),
    fornecedor_id: z2.number().optional(),
    reposicao_modo: z2.enum(["automatico", "manual"]).default("manual"),
    lead_time_dias: z2.number().default(7)
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const { imovelId, ...fields } = input;
    const data = await railwayMutate(`/insumos/`, "POST", { fazenda_id: imovelId, ...fields });
    return data.data ?? data;
  }),
  insumoDetalhe: publicProcedure.input(z2.object({ imovelId: z2.number(), insumoId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayFetch(`/insumos/${input.insumoId}?fazenda_id=${input.imovelId}`);
    return data.data ?? data;
  }),
  movimentarInsumo: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    insumoId: z2.number(),
    tipo: z2.enum(["compra", "producao_propria", "doacao", "ajuste_positivo", "uso", "venda", "perda", "ajuste_negativo"]),
    quantidade: z2.number().positive(),
    custo_unitario: z2.number().optional(),
    observacao: z2.string().optional(),
    data_movim: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const { imovelId, insumoId, ...fields } = input;
    const data = await railwayMutate(`/insumos/${insumoId}/movimentar`, "POST", fields);
    return data.data ?? data;
  }),
  // ── Fornecedores ───────────────────────────────────────────────────────────
  fornecedores: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayFetch(`/fornecedores/?fazenda_id=${input.imovelId}`);
    return Array.isArray(data) ? data : data.data ?? [];
  }),
  createFornecedor: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    nome: z2.string().min(1),
    cnpj_cpf: z2.string().optional(),
    whatsapp: z2.string().optional(),
    telegram: z2.string().optional(),
    email: z2.string().optional(),
    endereco: z2.string().optional(),
    prazo_entrega_dias: z2.number().default(7),
    forma_pagamento: z2.string().default("a_vista"),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const { imovelId, ...fields } = input;
    const data = await railwayMutate(`/fornecedores/`, "POST", { fazenda_id: imovelId, ...fields });
    return data.data ?? data;
  }),
  // ── Pedidos de Compra ────────────────────────────────────────────────────────
  pedidosCompra: publicProcedure.input(z2.object({ imovelId: z2.number(), status: z2.string().optional() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const params = new URLSearchParams({ fazenda_id: String(input.imovelId) });
    if (input.status) params.set("status", input.status);
    const data = await railwayFetch(`/pedidos-compra/?${params}`);
    return Array.isArray(data) ? data : data.data ?? [];
  }),
  createPedidoCompra: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    insumo_id: z2.number(),
    fornecedor_id: z2.number().optional(),
    quantidade: z2.number().positive(),
    preco_estimado: z2.number().optional(),
    data_entrega_desejada: z2.string().optional(),
    observacao: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const { imovelId, ...fields } = input;
    const data = await railwayMutate(`/pedidos-compra/`, "POST", { fazenda_id: imovelId, ...fields });
    return data.data ?? data;
  }),
  aprovarPedidoCompra: publicProcedure.input(z2.object({ imovelId: z2.number(), pedidoId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayMutate(`/pedidos-compra/${input.pedidoId}/aprovar`, "PUT");
    return data.data ?? data;
  }),
  enviarPedidoCompra: publicProcedure.input(z2.object({ imovelId: z2.number(), pedidoId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return railwayMutate(`/pedidos-compra/${input.pedidoId}/enviar`, "POST");
  }),
  /**
   * Importar insumos de planilha Excel ou CSV.
   * O cliente envia o arquivo como base64 + mimeType.
   * O servidor parseia, valida e cria cada insumo via API Railway.
   */
  importarInsumos: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    fileBase64: z2.string(),
    fileName: z2.string()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const buffer = Buffer.from(input.fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
      const rowVals = rawRows[i].map((v) => String(v ?? "").toLowerCase().trim());
      if (rowVals.some((v) => v === "nome" || v === "name" || v === "insumo" || v === "produto")) {
        headerRowIndex = i;
        break;
      }
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: headerRowIndex });
    if (rows.length === 0) throw new Error('Planilha vazia ou sem dados reconhec\xEDveis. Verifique se h\xE1 uma coluna chamada "Nome".');
    if (rows.length > 500) throw new Error("Limite de 500 linhas por importa\xE7\xE3o.");
    const normalize = (v) => String(v ?? "").trim();
    const toNum = (v) => {
      const n = parseFloat(String(v ?? "0").replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const col = (row, ...keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find((rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, ""));
        if (found && row[found] !== "") return row[found];
      }
      return "";
    };
    const results = [];
    for (const row of rows) {
      const nome = normalize(col(row, "nome", "name", "insumo", "produto"));
      if (!nome) {
        results.push({ nome: "(sem nome)", ok: false, error: "Nome obrigat\xF3rio" });
        continue;
      }
      const categoria = normalize(col(row, "categoria", "category", "tipo", "type")) || "outros";
      const unidade = normalize(col(row, "unidade", "unit", "un")) || "unidade";
      try {
        const catalogItem = await upsertInsumosCatalogo({
          imovelId: input.imovelId,
          nome,
          categoria,
          unidade
        });
        const payload = {
          fazenda_id: input.imovelId,
          nome,
          categoria,
          unidade,
          origem: normalize(col(row, "origem", "origin")) || "comprado",
          estoque_atual: toNum(col(row, "estoqueatual", "estoque", "posicaofisicaatual", "posicao", "quantidade", "qty", "stock")),
          estoque_minimo: toNum(col(row, "estoqueminimo", "minimo", "min", "stockmin")),
          estoque_ideal: toNum(col(row, "estoqueideal", "ideal", "stockideal")),
          preco_estimado: toNum(col(row, "precoestimado", "preco", "price", "valor", "valorunitariodaultimacompra", "valorunitario")) || void 0,
          reposicao_modo: normalize(col(row, "reposicaomodo", "reposicao", "repositionmode")) === "automatico" ? "automatico" : "manual",
          lead_time_dias: toNum(col(row, "leadtime", "leadtimediatias", "prazoentrega")) || 7
        };
        try {
          const railwayResult = await railwayMutate("/insumos/", "POST", payload);
          if (railwayResult && typeof railwayResult === "object" && "id" in railwayResult) {
            await upsertInsumosCatalogo({ imovelId: input.imovelId, nome, categoria, unidade, railwayId: railwayResult.id });
          }
        } catch {
        }
        const isNew = !catalogItem.railwayId;
        results.push({ nome, codigo: catalogItem.codigo, ok: true, action: isNew ? "criado" : "atualizado" });
      } catch (e) {
        results.push({ nome, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const success = results.filter((r) => r.ok).length;
    const errors = results.filter((r) => !r.ok).length;
    return { total: rows.length, success, errors, results };
  }),
  /** Lista o catálogo local de insumos de uma fazenda */
  listarCatalogInsumos: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return listInsumosCatalogo(input.imovelId);
  }),
  /** Busca insumos no catálogo por nome (autocomplete) */
  buscarCatalogInsumos: publicProcedure.input(z2.object({ imovelId: z2.number(), query: z2.string().min(1) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return searchInsumosCatalogo(input.imovelId, input.query);
  }),
  /** Upsert manual de um insumo no catálogo (cadastro pelo formulário) */
  upsertCatalogInsumo: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    nome: z2.string().min(1),
    categoria: z2.string().optional(),
    unidade: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return upsertInsumosCatalogo({
      imovelId: input.imovelId,
      nome: input.nome,
      categoria: input.categoria,
      unidade: input.unidade
    });
  }),
  /**
   * Pré-analisa a planilha e retorna:
   * - rows: todas as linhas parseadas com as 10 colunas oficiais
   * - unmapped: nomes que não existem no catálogo (precisam de de-para)
   * - catalog: catálogo atual da fazenda (para popular os selects de de-para)
   */
  analisarPlanilhaInsumos: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    fileBase64: z2.string(),
    fileName: z2.string()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const buffer = Buffer.from(input.fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
      const rowVals = rawRows[i].map((v) => String(v ?? "").toLowerCase().trim());
      if (rowVals.some((v) => v === "nome" || v === "name" || v === "insumo" || v === "produto")) {
        headerRowIndex = i;
        break;
      }
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: headerRowIndex });
    if (rows.length === 0) throw new TRPCError4({ code: "BAD_REQUEST", message: 'Planilha vazia ou sem coluna "Nome" reconhec\xEDvel.' });
    if (rows.length > 500) throw new TRPCError4({ code: "BAD_REQUEST", message: "Limite de 500 linhas por importa\xE7\xE3o." });
    const normalize = (v) => String(v ?? "").trim();
    const toNum = (v) => {
      const n = parseFloat(String(v ?? "0").replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const col = (row, ...keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find((rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, ""));
        if (found && row[found] !== "") return row[found];
      }
      return "";
    };
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
      lead_time_dias: toNum(col(row, "leadtime", "leadtimediatias", "prazoentrega")) || 7
    }));
    const catalog = await listInsumosCatalogo(input.imovelId);
    const catalogNomes = new Set(catalog.map((c) => c.nomeNormalizado));
    const normalizeNome = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const unmapped = [];
    const seen = /* @__PURE__ */ new Set();
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
  confirmarImportacaoInsumos: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    rows: z2.array(z2.object({
      _linha: z2.number(),
      nome: z2.string(),
      categoria: z2.string(),
      unidade: z2.string(),
      origem: z2.string(),
      estoque_atual: z2.number(),
      estoque_minimo: z2.number(),
      estoque_ideal: z2.number(),
      preco_estimado: z2.number(),
      reposicao_modo: z2.string(),
      lead_time_dias: z2.number()
    })),
    mappings: z2.record(z2.string(), z2.string())
    // { nomePlanilha: nomeDestino }
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const results = [];
    for (const row of input.rows) {
      if (!row.nome) {
        results.push({ nome: "(sem nome)", ok: false, error: "Nome obrigat\xF3rio" });
        continue;
      }
      const nomeDestino = input.mappings[row.nome] ?? row.nome;
      try {
        const catalogItem = await upsertInsumosCatalogo({
          imovelId: input.imovelId,
          nome: nomeDestino,
          categoria: row.categoria,
          unidade: row.unidade
        });
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
            preco_estimado: row.preco_estimado || void 0,
            reposicao_modo: row.reposicao_modo,
            lead_time_dias: row.lead_time_dias
          };
          const railwayResult = await railwayMutate("/insumos/", "POST", payload);
          if (railwayResult && typeof railwayResult === "object" && "id" in railwayResult) {
            await upsertInsumosCatalogo({ imovelId: input.imovelId, nome: nomeDestino, categoria: row.categoria, unidade: row.unidade, railwayId: railwayResult.id });
          }
        } catch {
        }
        const isNew = !catalogItem.railwayId;
        results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: isNew ? "criado" : "atualizado" });
      } catch (e) {
        results.push({ nome: nomeDestino, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const success = results.filter((r) => r.ok).length;
    const errors = results.filter((r) => !r.ok).length;
    return { total: input.rows.length, success, errors, results };
  }),
  // ─── Simulador de Regime Tributário ───────────────────────────────────────
  simulacaoAvulsa: publicProcedure.input(z2.object({
    faturamento_12m: z2.number(),
    folha_12m: z2.number().default(0),
    despesas_12m: z2.number().default(0),
    tipo_producao: z2.enum(["in_natura", "industrializado", "servico", "misto", "comercio", "industria"]).default("in_natura"),
    creditos_pis_cofins: z2.number().default(0),
    jcp: z2.number().default(0)
  })).mutation(async ({ input }) => {
    const res = await railwayFetch("/simulador-regime/simulacao", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return res;
  }),
  registrarCompetencia: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    competencia: z2.string(),
    // "YYYY-MM"
    faturamento: z2.number(),
    folha_pagamento: z2.number().default(0),
    despesas_dedutiveis: z2.number().default(0),
    tipo_producao: z2.enum(["in_natura", "industrializado", "servico", "misto", "comercio", "industria"]).default("in_natura"),
    creditos_pis_cofins: z2.number().default(0),
    jcp: z2.number().default(0),
    observacao: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch("/simulador-regime/lancamento", {
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
        observacao: input.observacao
      })
    });
    return res;
  }),
  listarCompetencias: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/lancamentos/${input.imovelId}`);
    return Array.isArray(res) ? res : [];
  }),
  dashboardSimulador: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/dashboard/${input.imovelId}`);
    return res;
  }),
  deletarCompetencia: publicProcedure.input(z2.object({ imovelId: z2.number(), competencia: z2.string() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/lancamento/${input.imovelId}/${input.competencia}`, {
      method: "DELETE"
    });
    return res;
  }),
  perfilSimulador: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/perfil/${input.imovelId}`);
    return res;
  }),
  salvarPerfilSimulador: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    tipo_producao: z2.string(),
    regime_atual: z2.string().optional(),
    faturamento_estimado_anual: z2.number().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch("/simulador-regime/perfil", {
      method: "POST",
      body: JSON.stringify({
        imovel_id: input.imovelId,
        tipo_producao: input.tipo_producao,
        regime_atual: input.regime_atual,
        faturamento_estimado_anual: input.faturamento_estimado_anual
      })
    });
    return res;
  }),
  // ── Fechar Competência ────────────────────────────────────────────────────
  fecharCompetencia: publicProcedure.input(z2.object({ produtorId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    const res = await railwayMutate(`/produtores/${input.produtorId}/fechar-mes`, "POST");
    return res;
  })
});

// server/routers.ts
async function signJwt(payload) {
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  return new jose2.SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret);
}
var speciesEnum = z3.enum(["ovinos", "caprinos", "suinos", "bovinos"]);
var sexEnum = z3.enum(["macho", "femea"]);
var statusEnum = z3.enum(["ativo", "vendido", "morto", "transferido"]);
var healthTypeEnum = z3.enum(["vacina", "medicamento", "ocorrencia"]);
var reproTypeEnum = z3.enum(["cobertura", "gestacao", "parto", "aborto"]);
var financialTypeEnum = z3.enum(["receita", "despesa"]);
var movementTypeEnum = z3.enum(["entrada", "saida", "transferencia", "nascimento", "morte", "venda"]);
var appRouter = router({
  system: systemRouter,
  railway: railwayRouter,
  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    loginWithCpf: publicProcedure.input(z3.object({ cpf: z3.string().min(11), password: z3.string().min(1) })).mutation(async ({ input, ctx }) => {
      const user = await verifyUserPassword(input.cpf, input.password);
      if (!user) {
        throw new TRPCError5({ code: "UNAUTHORIZED", message: "CPF ou senha inv\xE1lidos." });
      }
      const token = await signJwt({ sub: user.openId, userId: user.id, role: user.role });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1e3 });
      return { success: true, user: { id: user.id, name: user.name, cpf: user.cpf, role: user.role } };
    }),
    registerWithCpf: publicProcedure.input(z3.object({
      name: z3.string().min(2),
      cpf: z3.string().min(11),
      password: z3.string().min(6),
      role: z3.enum(["user", "admin"]).optional()
    })).mutation(async ({ input }) => {
      const existing = await getUserByCpf(input.cpf);
      if (existing) throw new TRPCError5({ code: "CONFLICT", message: "CPF j\xE1 cadastrado." });
      const user = await createUserWithCpf({ name: input.name, cpf: input.cpf, password: input.password, role: input.role });
      return { success: true, user: { id: user.id, name: user.name, cpf: user.cpf } };
    }),
    // Step 1: Send OTP via WhatsApp/Telegram
    sendOtp: publicProcedure.input(z3.object({ cpf: z3.string().min(11) })).mutation(async ({ input }) => {
      return sendOtp(input.cpf);
    }),
    // Step 2: Verify OTP and create session
    verifyOtp: publicProcedure.input(z3.object({ cpf: z3.string().min(11), code: z3.string().length(6) })).mutation(async ({ input, ctx }) => {
      const result = await verifyOtp(input.cpf, input.code);
      const token = await sdk.createSessionToken(result.openId, {
        name: result.produtorNome,
        expiresInMs: 30 * 24 * 60 * 60 * 1e3
        // 30 days
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1e3 });
      const claimsToken = await signJwt({
        produtorId: result.produtorId,
        cpf: input.cpf.replace(/\D/g, ""),
        imovelId: result.imovelId ?? null,
        role: result.role ?? "user"
      });
      ctx.res.cookie("rc_claims", claimsToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1e3 });
      return {
        success: true,
        produtorId: result.produtorId,
        produtorNome: result.produtorNome,
        imovelId: result.imovelId,
        imovelCount: result.imovelCount,
        cpf: input.cpf,
        role: result.role ?? "user",
        // Return token so client can store it in localStorage as fallback
        // when cookies are blocked (cross-site preview environments)
        rcClaimsToken: claimsToken
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie("rc_claims", { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    // Re-emit rc_claims when producer switches property
    switchImovel: publicProcedure.input(z3.object({ imovelId: z3.number() })).mutation(async ({ input, ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) throw new TRPCError5({ code: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida." });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      const claimsToken = await signJwt({
        produtorId: claims.produtorId,
        cpf: claims.cpf,
        imovelId: input.imovelId,
        role: claims.role ?? "user"
      });
      ctx.res.cookie("rc_claims", claimsToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1e3 });
      return { success: true, imovelId: input.imovelId, rcClaimsToken: claimsToken };
    })
  }),
  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const [herd, financial] = await Promise.all([
        getHerdSummary(ctx.user.id),
        getFinancialSummary(ctx.user.id)
      ]);
      return { herd, financial };
    })
  }),
  // ── Animals ───────────────────────────────────────────────────────────────
  animals: router({
    list: protectedProcedure.input(z3.object({ species: speciesEnum.optional() }).optional()).query(({ ctx, input }) => getAnimalsByUser(ctx.user.id, input?.species)),
    get: protectedProcedure.input(z3.object({ id: z3.number() })).query(async ({ ctx, input }) => {
      const animal = await getAnimalById(input.id, ctx.user.id);
      if (!animal) throw new TRPCError5({ code: "NOT_FOUND" });
      return animal;
    }),
    create: protectedProcedure.input(z3.object({
      identifier: z3.string().min(1),
      name: z3.string().optional(),
      species: speciesEnum,
      breed: z3.string().optional(),
      sex: sexEnum,
      birthDate: z3.string().optional(),
      weight: z3.string().optional(),
      notes: z3.string().optional()
    })).mutation(
      ({ ctx, input }) => createAnimal({ ...input, userId: ctx.user.id, birthDate: input.birthDate, weight: input.weight })
    ),
    update: protectedProcedure.input(z3.object({
      id: z3.number(),
      identifier: z3.string().min(1).optional(),
      name: z3.string().optional(),
      species: speciesEnum.optional(),
      breed: z3.string().optional(),
      sex: sexEnum.optional(),
      birthDate: z3.string().optional(),
      weight: z3.string().optional(),
      status: statusEnum.optional(),
      notes: z3.string().optional()
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateAnimal(id, ctx.user.id, data);
    }),
    delete: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(({ ctx, input }) => deleteAnimal(input.id, ctx.user.id))
  }),
  // ── Health ────────────────────────────────────────────────────────────────
  health: router({
    list: protectedProcedure.input(z3.object({ animalId: z3.number().optional() }).optional()).query(({ ctx, input }) => getHealthRecords(ctx.user.id, input?.animalId)),
    create: protectedProcedure.input(z3.object({
      animalId: z3.number(),
      type: healthTypeEnum,
      description: z3.string().min(1),
      date: z3.string(),
      nextDueDate: z3.string().optional(),
      dosage: z3.string().optional(),
      veterinarian: z3.string().optional(),
      cost: z3.string().optional(),
      notes: z3.string().optional()
    })).mutation(
      ({ ctx, input }) => createHealthRecord({ ...input, userId: ctx.user.id, date: input.date, nextDueDate: input.nextDueDate, cost: input.cost })
    ),
    update: protectedProcedure.input(z3.object({
      id: z3.number(),
      description: z3.string().optional(),
      date: z3.string().optional(),
      nextDueDate: z3.string().optional(),
      dosage: z3.string().optional(),
      veterinarian: z3.string().optional(),
      cost: z3.string().optional(),
      notes: z3.string().optional()
    })).mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateHealthRecord(id, ctx.user.id, data);
    }),
    delete: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(({ ctx, input }) => deleteHealthRecord(input.id, ctx.user.id))
  }),
  // ── Reproduction ──────────────────────────────────────────────────────────
  reproduction: router({
    list: protectedProcedure.input(z3.object({ animalId: z3.number().optional() }).optional()).query(({ ctx, input }) => getReproductiveRecords(ctx.user.id, input?.animalId)),
    create: protectedProcedure.input(z3.object({
      femaleId: z3.number(),
      maleId: z3.number().optional(),
      type: reproTypeEnum,
      date: z3.string(),
      expectedBirthDate: z3.string().optional(),
      actualBirthDate: z3.string().optional(),
      offspringCount: z3.number().optional(),
      notes: z3.string().optional()
    })).mutation(
      ({ ctx, input }) => createReproductiveRecord({ ...input, userId: ctx.user.id, date: input.date, expectedBirthDate: input.expectedBirthDate, actualBirthDate: input.actualBirthDate })
    ),
    delete: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(({ ctx, input }) => deleteReproductiveRecord(input.id, ctx.user.id))
  }),
  // ── Financial ─────────────────────────────────────────────────────────────
  financial: router({
    list: protectedProcedure.input(z3.object({ from: z3.string().optional(), to: z3.string().optional(), type: financialTypeEnum.optional() }).optional()).query(({ ctx, input }) => getFinancialRecords(ctx.user.id, input)),
    summary: protectedProcedure.query(({ ctx }) => getFinancialSummary(ctx.user.id)),
    create: protectedProcedure.input(z3.object({
      type: financialTypeEnum,
      category: z3.string().min(1),
      description: z3.string().min(1),
      amount: z3.string(),
      date: z3.string(),
      animalId: z3.number().optional(),
      species: speciesEnum.optional(),
      notes: z3.string().optional()
    })).mutation(
      ({ ctx, input }) => createFinancialRecord({ ...input, userId: ctx.user.id, date: input.date, amount: input.amount })
    ),
    delete: protectedProcedure.input(z3.object({ id: z3.number() })).mutation(({ ctx, input }) => deleteFinancialRecord(input.id, ctx.user.id))
  }),
  // ── Produtor Config (Telegram / WhatsApp settings)
  produtorConfig: router({
    get: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) return null;
      return getProdutorConfig(claims.produtorId);
    }),
    save: publicProcedure.input(z3.object({
      telegramChatId: z3.string().nullable().optional(),
      whatsappPriority: z3.boolean().optional()
    })).mutation(async ({ input, ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) throw new TRPCError5({ code: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida." });
      await upsertProdutorConfig(claims.produtorId, {
        telegramChatId: input.telegramChatId ?? void 0,
        whatsappPriority: input.whatsappPriority
      });
      return { success: true };
    })
  }),
  // ── Procurações ────────────────────────────────────────────────────────────────────────────────────
  procuracao: router({
    /** Verifica o status da procuração do procurador logado */
    status: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) return null;
      const cpf = claims.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      return getProcuracaoByProcurador(cpf);
    }),
    /** Upload de procuração: recebe base64 do arquivo e salva no S3 */
    upload: publicProcedure.input(z3.object({
      procuradorCpf: z3.string().min(11),
      procuradorNome: z3.string().optional(),
      produtorCpf: z3.string().min(11),
      fileBase64: z3.string().min(1),
      fileName: z3.string().min(1),
      mimeType: z3.string().min(1)
    })).mutation(async ({ input }) => {
      const { storagePut: storagePut2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      const cpfClean = input.procuradorCpf.replace(/\D/g, "");
      const ext = input.fileName.split(".").pop() ?? "pdf";
      const key = `procuracoes/${cpfClean}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const { url } = await storagePut2(key, buffer, input.mimeType);
      const proc = await createProcuracao({
        procuradorCpf: input.procuradorCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"),
        procuradorNome: input.procuradorNome,
        produtorCpf: input.produtorCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"),
        arquivoUrl: url,
        arquivoKey: key
      });
      return { success: true, id: proc.id, status: proc.status };
    }),
    /** Lista todas as procurações (admin only) */
    list: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims || claims.role !== "admin") {
        throw new TRPCError5({ code: "FORBIDDEN", message: "Acesso restrito ao administrador." });
      }
      return listProcuracoes();
    }),
    /** Aprova ou rejeita uma procuração (admin only) */
    updateStatus: publicProcedure.input(z3.object({
      id: z3.number(),
      status: z3.enum(["aprovado", "rejeitado"]),
      adminNota: z3.string().optional()
    })).mutation(async ({ input, ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims || claims.role !== "admin") {
        throw new TRPCError5({ code: "FORBIDDEN", message: "Acesso restrito ao administrador." });
      }
      await updateProcuracaoStatus(input.id, input.status, input.adminNota);
      return { success: true };
    })
  }),
  // ── Movements ─────────────────────────────────────────────────────────────
  movements: router({
    list: protectedProcedure.input(z3.object({ from: z3.string().optional(), to: z3.string().optional(), species: speciesEnum.optional() }).optional()).query(({ ctx, input }) => getMovements(ctx.user.id, input)),
    create: protectedProcedure.input(z3.object({
      animalId: z3.number(),
      type: movementTypeEnum,
      date: z3.string(),
      fromLocation: z3.string().optional(),
      toLocation: z3.string().optional(),
      weight: z3.string().optional(),
      value: z3.string().optional(),
      notes: z3.string().optional()
    })).mutation(
      ({ ctx, input }) => createMovement({ ...input, userId: ctx.user.id, date: input.date, weight: input.weight, value: input.value })
    )
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
function serveStatic(app2) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/vercelHandler.ts
var app = express2();
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
serveStatic(app);
var vercelHandler_default = app;
export {
  vercelHandler_default as default
};
