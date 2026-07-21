var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// drizzle/schema.ts
var schema_exports = {};
__export(schema_exports, {
  alertasEstoqueConfig: () => alertasEstoqueConfig,
  alertasEstoqueLog: () => alertasEstoqueLog,
  animals: () => animals,
  contadorVinculo: () => contadorVinculo,
  financialRecords: () => financialRecords,
  healthRecords: () => healthRecords,
  insumosCatalogo: () => insumosCatalogo,
  movements: () => movements,
  procuracoes: () => procuracoes,
  produtorConfig: () => produtorConfig,
  produtorImovel: () => produtorImovel,
  reproductiveRecords: () => reproductiveRecords,
  users: () => users
});
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
var users, animals, healthRecords, reproductiveRecords, financialRecords, movements, produtorConfig, produtorImovel, procuracoes, insumosCatalogo, contadorVinculo, alertasEstoqueLog, alertasEstoqueConfig;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
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
    animals = mysqlTable("animals", {
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
    healthRecords = mysqlTable("health_records", {
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
    reproductiveRecords = mysqlTable("reproductive_records", {
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
    financialRecords = mysqlTable("financial_records", {
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
    movements = mysqlTable("movements", {
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
    produtorConfig = mysqlTable("produtor_config", {
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
    produtorImovel = mysqlTable("produtor_imovel", {
      id: int("id").autoincrement().primaryKey(),
      /** Railway produtor.id */
      produtorId: int("produtorId").notNull(),
      /** Railway imovel.id */
      imovelId: int("imovelId").notNull(),
      /** Railway api_token for this produtor (used in Authorization header) */
      railwayToken: varchar("railwayToken", { length: 128 }),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    procuracoes = mysqlTable("procuracoes", {
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
    insumosCatalogo = mysqlTable("insumos_catalogo", {
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
    contadorVinculo = mysqlTable("contador_vinculo", {
      id: int("id").autoincrement().primaryKey(),
      /** CPF do contador (11 dígitos, sem formatação) */
      contadorCpf: varchar("contadorCpf", { length: 14 }).notNull(),
      /** Nome completo do contador */
      contadorNome: varchar("contadorNome", { length: 255 }).notNull(),
      /** Telefone do contador para receber OTP (formato: 5511999999999) */
      contadorTelefone: varchar("contadorTelefone", { length: 20 }).notNull(),
      /** CPF do produtor que autorizou o acesso (11 dígitos, sem formatação) */
      produtorCpf: varchar("produtorCpf", { length: 14 }).notNull(),
      /** Railway produtor.id do produtor que autorizou */
      produtorId: int("produtorId").notNull(),
      /** Status do vínculo */
      status: mysqlEnum("status_cv", ["ativo", "revogado"]).default("ativo").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    alertasEstoqueLog = mysqlTable("alertas_estoque_log", {
      id: int("id").autoincrement().primaryKey(),
      /** Railway imovel.id ao qual o alerta pertence */
      imovelId: int("imovelId").notNull(),
      /** Railway produtor.id que recebeu o alerta */
      produtorId: int("produtorId").notNull(),
      /** Número de insumos urgentes no momento do envio */
      totalCriticos: int("totalCriticos").default(0).notNull(),
      /** Número de insumos com atenção no momento do envio */
      totalAtencao: int("totalAtencao").default(0).notNull(),
      /** Canal usado: telegram_direct | telegram_group */
      canal: varchar("canal", { length: 32 }).notNull().default("telegram_group"),
      /** Status do envio */
      status: mysqlEnum("status_ael", ["enviado", "falhou", "ignorado"]).default("enviado").notNull(),
      /** Mensagem de erro se status = falhou */
      erro: text("erro"),
      criadoEm: timestamp("criadoEm").defaultNow().notNull()
    });
    alertasEstoqueConfig = mysqlTable("alertas_estoque_config", {
      id: int("id").autoincrement().primaryKey(),
      produtorId: int("produtorId").notNull().unique(),
      /** Alertas ativados */
      ativo: boolean("ativo").default(true).notNull(),
      /** Nível mínimo para disparar: critico | atencao | ambos */
      nivelMinimo: mysqlEnum("nivel_minimo_aec", ["critico", "atencao", "ambos"]).default("ambos").notNull(),
      /** Hora de envio do alerta diário (0-23) */
      horaEnvio: int("horaEnvio").default(7).notNull(),
      /** Cooldown em horas entre alertas do mesmo produtor */
      cooldownHoras: int("cooldownHoras").default(24).notNull(),
      /** taskUid do heartbeat job criado para este produtor */
      heartbeatTaskUid: varchar("heartbeatTaskUid", { length: 128 }),
      criadoEm: timestamp("criadoEm").defaultNow().notNull(),
      atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull()
    });
  }
});

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

// server/db.ts
var db_exports = {};
__export(db_exports, {
  cadastrarContador: () => cadastrarContador,
  createAnimal: () => createAnimal,
  createFinancialRecord: () => createFinancialRecord,
  createHealthRecord: () => createHealthRecord,
  createMovement: () => createMovement,
  createProcuracao: () => createProcuracao,
  createReproductiveRecord: () => createReproductiveRecord,
  createUserWithCpf: () => createUserWithCpf,
  deleteAnimal: () => deleteAnimal,
  deleteFinancialRecord: () => deleteFinancialRecord,
  deleteHealthRecord: () => deleteHealthRecord,
  deleteReproductiveRecord: () => deleteReproductiveRecord,
  findInsumoByNome: () => findInsumoByNome,
  gerarCodigoInsumo: () => gerarCodigoInsumo,
  getAnimalById: () => getAnimalById,
  getAnimalsByUser: () => getAnimalsByUser,
  getDb: () => getDb,
  getFinancialRecords: () => getFinancialRecords,
  getFinancialSummary: () => getFinancialSummary,
  getHealthRecords: () => getHealthRecords,
  getHerdSummary: () => getHerdSummary,
  getImoveisForProdutor: () => getImoveisForProdutor,
  getMovements: () => getMovements,
  getProcuracaoByProcurador: () => getProcuracaoByProcurador,
  getProdutorConfig: () => getProdutorConfig,
  getRailwayToken: () => getRailwayToken,
  getReproductiveRecords: () => getReproductiveRecords,
  getUserByCpf: () => getUserByCpf,
  getUserByOpenId: () => getUserByOpenId,
  getVinculosPorContador: () => getVinculosPorContador,
  listInsumosCatalogo: () => listInsumosCatalogo,
  listProcuracoes: () => listProcuracoes,
  listarContadoresPorProdutor: () => listarContadoresPorProdutor,
  normalizeInsumoNome: () => normalizeInsumoNome,
  revogarContador: () => revogarContador,
  searchInsumosCatalogo: () => searchInsumosCatalogo,
  seedImoveisAcl: () => seedImoveisAcl,
  updateAnimal: () => updateAnimal,
  updateHealthRecord: () => updateHealthRecord,
  updateProcuracaoStatus: () => updateProcuracaoStatus,
  upsertInsumosCatalogo: () => upsertInsumosCatalogo,
  upsertProdutorConfig: () => upsertProdutorConfig,
  upsertUser: () => upsertUser,
  verifyUserPassword: () => verifyUserPassword
});
import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as bcrypt from "bcryptjs";
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
async function getRailwayToken(produtorId) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ railwayToken: produtorImovel.railwayToken }).from(produtorImovel).where(and(eq(produtorImovel.produtorId, produtorId), sql`railwayToken IS NOT NULL`)).limit(1);
  return rows[0]?.railwayToken ?? null;
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
async function cadastrarContador(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cpfClean = data.contadorCpf.replace(/\D/g, "");
  const existing = await db.select().from(contadorVinculo).where(
    and(
      eq(contadorVinculo.contadorCpf, cpfClean),
      eq(contadorVinculo.produtorCpf, data.produtorCpf),
      eq(contadorVinculo.status, "ativo")
    )
  ).limit(1);
  if (existing.length > 0) throw new Error("Este contador j\xE1 est\xE1 vinculado a este produtor.");
  const [result] = await db.insert(contadorVinculo).values({
    contadorCpf: cpfClean,
    contadorNome: data.contadorNome.trim(),
    contadorTelefone: data.contadorTelefone.replace(/\D/g, ""),
    produtorCpf: data.produtorCpf,
    produtorId: data.produtorId,
    status: "ativo"
  });
  const id = result.insertId;
  const rows = await db.select().from(contadorVinculo).where(eq(contadorVinculo.id, id)).limit(1);
  return rows[0];
}
async function listarContadoresPorProdutor(produtorCpf) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contadorVinculo).where(
    and(
      eq(contadorVinculo.produtorCpf, produtorCpf),
      eq(contadorVinculo.status, "ativo")
    )
  ).orderBy(contadorVinculo.createdAt);
}
async function revogarContador(id, produtorCpf) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contadorVinculo).set({ status: "revogado" }).where(
    and(
      eq(contadorVinculo.id, id),
      eq(contadorVinculo.produtorCpf, produtorCpf)
    )
  );
}
async function getVinculosPorContador(contadorCpf) {
  const db = await getDb();
  if (!db) return [];
  const cpfClean = contadorCpf.replace(/\D/g, "");
  return db.select().from(contadorVinculo).where(
    and(
      eq(contadorVinculo.contadorCpf, cpfClean),
      eq(contadorVinculo.status, "ativo")
    )
  );
}
async function seedImoveisAcl(produtorId, imovelIds) {
  const db = await getDb();
  if (!db || imovelIds.length === 0) return;
  const existing = await db.select({ imovelId: produtorImovel.imovelId }).from(produtorImovel).where(eq(produtorImovel.produtorId, produtorId));
  if (existing.length > 0) return;
  await db.insert(produtorImovel).values(
    imovelIds.map((imovelId) => ({ produtorId, imovelId }))
  );
}
var _db, CATEGORIA_PREFIX;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    init_env();
    _db = null;
    CATEGORIA_PREFIX = {
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
async function railwayFetch(path3, options, produtorId) {
  let authHeader = {};
  if (produtorId) {
    const token = await getRailwayToken(produtorId).catch(() => null);
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  }
  const fetchOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
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
    init_db();
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

// server/alertasEstoque.ts
var alertasEstoque_exports = {};
__export(alertasEstoque_exports, {
  processarAlertasProdutor: () => processarAlertasProdutor,
  processarTodosAlertas: () => processarTodosAlertas
});
import { eq as eq2, and as and2, gte as gte2, desc as desc2 } from "drizzle-orm";
async function sendTelegramDirect(telegramChatId, mensagem) {
  try {
    const res = await fetch(`${RAILWAY_API2}/telegram/mensagem-direta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram_chat_id: telegramChatId,
        mensagem,
        parse_mode: "Markdown"
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}
async function sendTelegramGroup2(mensagem) {
  try {
    const res = await fetch(`${RAILWAY_API2}/telegram/alerta/generico`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem, parse_mode: "Markdown" })
    });
    return res.ok;
  } catch {
    return false;
  }
}
function formatarMensagem(imovelNome, criticos, atencao) {
  const dataHora = (/* @__PURE__ */ new Date()).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const linhas = [];
  if (criticos.length > 0) {
    linhas.push("\u{1F7E5} *URGENTE \u2014 Reposi\xE7\xE3o imediata:*");
    for (const ins of criticos.slice(0, 8)) {
      const fornecedor = ins.fornecedor_nome ? ` \xB7 ${ins.fornecedor_nome}` : " \xB7 \u26A0\uFE0F Sem fornecedor";
      linhas.push(
        `  \u2022 *${ins.nome}* \u2014 ${ins.estoque_atual} ${ins.unidade} (m\xEDn: ${ins.estoque_minimo})${fornecedor}`
      );
    }
    if (criticos.length > 8) {
      linhas.push(`  _...e mais ${criticos.length - 8} item(ns)_`);
    }
  }
  if (atencao.length > 0) {
    if (linhas.length > 0) linhas.push("");
    linhas.push("\u{1F7E7} *ATEN\xC7\xC3O \u2014 Estoque baixo:*");
    for (const ins of atencao.slice(0, 5)) {
      linhas.push(
        `  \u2022 *${ins.nome}* \u2014 ${ins.estoque_atual} ${ins.unidade} (m\xEDn: ${ins.estoque_minimo})`
      );
    }
    if (atencao.length > 5) {
      linhas.push(`  _...e mais ${atencao.length - 5} item(ns)_`);
    }
  }
  return [
    `\u26A0\uFE0F *Alerta de Estoque \u2014 ${imovelNome}*`,
    "",
    ...linhas,
    "",
    `\u{1F449} [Abrir RuralCaixa](https://ruralcaixa.vercel.app/insumos)`,
    "",
    `_${dataHora}_`
  ].join("\n");
}
async function verificarCooldown(produtorId, imovelId, cooldownHoras) {
  const db = await getDb();
  if (!db) return false;
  const limite = new Date(Date.now() - cooldownHoras * 60 * 60 * 1e3);
  const ultimoLog = await db.select().from(alertasEstoqueLog).where(
    and2(
      eq2(alertasEstoqueLog.produtorId, produtorId),
      eq2(alertasEstoqueLog.imovelId, imovelId),
      eq2(alertasEstoqueLog.status, "enviado"),
      gte2(alertasEstoqueLog.criadoEm, limite)
    )
  ).orderBy(desc2(alertasEstoqueLog.criadoEm)).limit(1);
  return ultimoLog.length > 0;
}
async function registrarLog(params) {
  const db = await getDb();
  if (!db) return;
  await db.insert(alertasEstoqueLog).values(params);
}
async function buscarInsumosAlerta(imovelId, railwayToken) {
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (railwayToken) {
      headers["Authorization"] = `Bearer ${railwayToken}`;
    }
    const res = await fetch(
      `${RAILWAY_API2}/insumos/alertas?imovel_id=${imovelId}`,
      { headers }
    );
    if (!res.ok) return { criticos: [], atencao: [] };
    const alertas = await res.json();
    const criticos = alertas.filter((a) => a.status_estoque === "critico");
    const atencao = alertas.filter(
      (a) => a.status_estoque === "baixo" || a.status_estoque === "atencao"
    );
    return { criticos, atencao };
  } catch {
    return { criticos: [], atencao: [] };
  }
}
async function buscarNomeImovel(imovelId, railwayToken) {
  try {
    const headers = {};
    if (railwayToken) headers["Authorization"] = `Bearer ${railwayToken}`;
    const res = await fetch(`${RAILWAY_API2}/imoveis/${imovelId}`, { headers });
    if (!res.ok) return `Im\xF3vel #${imovelId}`;
    const data = await res.json();
    return data.nome ?? data.name ?? `Im\xF3vel #${imovelId}`;
  } catch {
    return `Im\xF3vel #${imovelId}`;
  }
}
async function processarAlertasProdutor(produtorId) {
  const db = await getDb();
  if (!db) return [];
  const configRows = await db.select().from(alertasEstoqueConfig).where(eq2(alertasEstoqueConfig.produtorId, produtorId)).limit(1);
  const config = configRows[0];
  if (!config || !config.ativo) return [];
  const prodConfigRows = await db.select().from(produtorConfig).where(eq2(produtorConfig.produtorId, produtorId)).limit(1);
  const telegramChatId = prodConfigRows[0]?.telegramChatId ?? null;
  const imovelRows = await db.select().from(produtorImovel).where(eq2(produtorImovel.produtorId, produtorId));
  if (imovelRows.length === 0) return [];
  const resultados = [];
  for (const { imovelId, railwayToken } of imovelRows) {
    const emCooldown = await verificarCooldown(
      produtorId,
      imovelId,
      config.cooldownHoras
    );
    if (emCooldown) {
      resultados.push({
        produtorId,
        imovelId,
        enviado: false,
        motivo: "cooldown"
      });
      continue;
    }
    const { criticos, atencao } = await buscarInsumosAlerta(
      imovelId,
      railwayToken
    );
    const deveMostrarCriticos = config.nivelMinimo === "critico" || config.nivelMinimo === "ambos";
    const deveMostrarAtencao = config.nivelMinimo === "atencao" || config.nivelMinimo === "ambos";
    const criticosFiltrados = deveMostrarCriticos ? criticos : [];
    const atencaoFiltrados = deveMostrarAtencao ? atencao : [];
    if (criticosFiltrados.length === 0 && atencaoFiltrados.length === 0) {
      await registrarLog({
        imovelId,
        produtorId,
        totalCriticos: 0,
        totalAtencao: 0,
        canal: "nenhum",
        status: "ignorado"
      });
      resultados.push({
        produtorId,
        imovelId,
        enviado: false,
        motivo: "sem_alertas"
      });
      continue;
    }
    const nomeImovel = await buscarNomeImovel(imovelId, railwayToken);
    const mensagem = formatarMensagem(
      nomeImovel,
      criticosFiltrados,
      atencaoFiltrados
    );
    let enviado = false;
    let canal = "telegram_group";
    if (telegramChatId) {
      enviado = await sendTelegramDirect(telegramChatId, mensagem);
      canal = "telegram_direct";
    }
    if (!enviado) {
      enviado = await sendTelegramGroup2(mensagem);
      canal = "telegram_group";
    }
    await registrarLog({
      imovelId,
      produtorId,
      totalCriticos: criticosFiltrados.length,
      totalAtencao: atencaoFiltrados.length,
      canal,
      status: enviado ? "enviado" : "falhou",
      erro: enviado ? void 0 : "Falha ao enviar via Telegram"
    });
    resultados.push({
      produtorId,
      imovelId,
      enviado,
      canal
    });
  }
  return resultados;
}
async function processarTodosAlertas() {
  const db = await getDb();
  if (!db) return { processados: 0, enviados: 0, falhas: 0 };
  const configs = await db.select().from(alertasEstoqueConfig).where(eq2(alertasEstoqueConfig.ativo, true));
  let processados = 0;
  let enviados = 0;
  let falhas = 0;
  for (const config of configs) {
    const resultados = await processarAlertasProdutor(config.produtorId);
    processados += resultados.length;
    enviados += resultados.filter((r) => r.enviado).length;
    falhas += resultados.filter((r) => !r.enviado && r.motivo !== "cooldown" && r.motivo !== "sem_alertas").length;
  }
  return { processados, enviados, falhas };
}
var init_alertasEstoque = __esm({
  "server/alertasEstoque.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_railwayProxy();
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/oauth.ts
init_db();

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
init_db();
init_env();
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
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
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
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
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
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
init_db();
init_env();
import * as jose2 from "jose";

// server/otp.ts
init_db();
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
async function sendOtp(cpf) {
  const cpfClean = cleanCpf(cpf);
  const vinculos = await getVinculosPorContador(cpfClean).catch(() => []);
  if (vinculos.length > 0) {
    const vinculo = vinculos[0];
    const allImovelIds = [];
    for (const v of vinculos) {
      const imovelList = await fetchImoveis(v.produtorCpf).catch(() => []);
      for (const im of imovelList) {
        if (!allImovelIds.includes(im.id)) allImovelIds.push(im.id);
      }
    }
    const code = generateCode();
    const entry = {
      code,
      cpf: cpfClean,
      produtorId: 0,
      produtorNome: vinculo.contadorNome,
      telefone: vinculo.contadorTelefone,
      imovelId: void 0,
      imovelCount: allImovelIds.length,
      role: "admin",
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0
    };
    let channel2 = "telegram_group";
    const wappOk = await sendWhatsApp(vinculo.contadorTelefone, code).catch(() => false);
    if (wappOk) {
      channel2 = "whatsapp";
    } else {
      await sendTelegramGroup(code, vinculo.contadorNome);
    }
    otpStore.set(cpfClean, entry);
    console.log(`[OTP] Contador ${vinculo.contadorNome} via ${channel2} (${maskPhone(vinculo.contadorTelefone)})`);
    return {
      success: true,
      channel: channel2,
      maskedPhone: maskPhone(vinculo.contadorTelefone),
      produtorNome: vinculo.contadorNome
    };
  }
  const produtor = await fetchProdutor(cpfClean);
  if (!produtor) {
    throw new Error("CPF n\xE3o encontrado. Verifique ou entre em contato.");
  }
  const res = await fetch(`${RAILWAY_API}/auth/solicitar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf: cpfClean })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || "N\xE3o foi poss\xEDvel enviar o c\xF3digo. Tente novamente em instantes.");
  }
  const data = await res.json();
  const channel = data.canal === "whatsapp" ? "whatsapp" : data.canal === "telegram_grupo" ? "telegram_group" : "telegram_direct";
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
  if (entry) {
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
    const openId2 = `rc_contador_${cpfClean}`;
    return {
      success: true,
      produtorId: entry.produtorId,
      produtorNome: entry.produtorNome,
      imovelId: entry.imovelId,
      imovelCount: entry.imovelCount ?? 1,
      role: entry.role ?? "admin",
      openId: openId2
    };
  }
  const res = await fetch(`${RAILWAY_API}/auth/verificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf: cpfClean, codigo: code.trim() })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || "C\xF3digo expirado ou n\xE3o solicitado. Solicite um novo c\xF3digo.");
  }
  const data = await res.json();
  const imovelList = await fetchImoveis(cpfClean);
  const localUser = await getUserByCpf(cpfClean).catch(() => null);
  const role = localUser?.role ?? "user";
  let allowedImoveis = imovelList;
  if (role === "user") {
    const allowedIds = await getImoveisForProdutor(data.produtor_id).catch(() => null);
    if (allowedIds) {
      allowedImoveis = imovelList.filter((im) => allowedIds.includes(im.id));
    }
  }
  const imovelId = allowedImoveis?.[0]?.id;
  const imovelCount = allowedImoveis.length;
  const openId = `rc_${data.produtor_id}`;
  return {
    success: true,
    produtorId: data.produtor_id,
    produtorNome: data.nome,
    rcClaimsToken: data.token,
    imovelId,
    imovelCount,
    role,
    openId
  };
}

// server/routers/railway.ts
import { z as z2 } from "zod";
init_railwayProxy();
init_db();
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
  if (claims.role !== "admin" && claims.imovelId !== null) {
    const { getImoveisForProdutor: getImoveisForProdutor2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const allowedIds = await getImoveisForProdutor2(claims.produtorId);
    if (allowedIds !== null && !allowedIds.includes(claims.imovelId)) {
      throw new TRPCError4({
        code: "UNAUTHORIZED",
        message: "Im\xF3vel da sess\xE3o n\xE3o autorizado. Selecione um im\xF3vel v\xE1lido."
      });
    }
  }
  return claims;
}
function msgDeErro(e) {
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const obj = e;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.detail === "string") return obj.detail;
    if (obj.cause) return msgDeErro(obj.cause);
    try {
      return JSON.stringify(obj);
    } catch {
      return "erro desconhecido";
    }
  }
  return String(e);
}
async function railwayMutate(path3, method, body, produtorId) {
  let authHeader = {};
  if (produtorId) {
    const { getRailwayToken: getRailwayToken2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const token = await getRailwayToken2(produtorId).catch(() => null);
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  }
  const res = await fetch(`${RAILWAY_API2}${path3}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeader },
    body: body !== void 0 ? JSON.stringify(body) : void 0
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const detailStr = typeof detail === "string" ? detail : detail != null ? (() => {
      try {
        return JSON.stringify(detail);
      } catch {
        return String(detail);
      }
    })() : `Railway API error ${res.status}`;
    throw new TRPCError4({
      code: "INTERNAL_SERVER_ERROR",
      message: detailStr
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
    let allowedIds = await getImoveisForProdutor(claims.produtorId);
    if (!allowedIds) {
      const railwayIds = allImoveis.map((im) => im.id);
      await seedImoveisAcl(claims.produtorId, railwayIds);
      allowedIds = railwayIds;
    }
    return allImoveis.filter((im) => allowedIds.includes(im.id));
  }),
  // ── Raças por espécie ──────────────────────────────────────────────────────
  // ── Criar Imóvel ──────────────────────────────────────────────────────────
  criarImovel: publicProcedure.input(z2.object({
    nome: z2.string().min(1),
    nirf: z2.string().optional(),
    car: z2.string().optional(),
    caepf: z2.string().optional(),
    cnpj: z2.string().optional(),
    municipio: z2.string().optional(),
    uf: z2.string().optional(),
    area_ha: z2.number().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    const body = { nome: input.nome };
    if (input.nirf) body.nirf = input.nirf;
    if (input.car) body.car = input.car;
    if (input.caepf) body.caepf = input.caepf;
    if (input.cnpj) body.cnpj = input.cnpj;
    if (input.municipio) body.municipio = input.municipio;
    if (input.uf) body.uf = input.uf;
    if (input.area_ha) body.area_total = input.area_ha;
    const novo = await railwayMutate(
      `/propriedades-rural/`,
      "POST",
      body,
      claims.produtorId
    );
    await seedImoveisAcl(claims.produtorId, [novo.id]);
    return novo;
  }),
  // ── Editar Imóvel ──────────────────────────────────────────────────────────
  editarImovel: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    nome: z2.string().optional(),
    nirf: z2.string().optional(),
    car: z2.string().optional(),
    municipio: z2.string().optional(),
    uf: z2.string().optional(),
    area_ha: z2.number().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const body = {};
    if (input.nome) body.nome = input.nome;
    if (input.nirf) body.nirf = input.nirf;
    if (input.car) body.car = input.car;
    if (input.municipio) body.municipio = input.municipio;
    if (input.uf) body.uf = input.uf;
    if (input.area_ha) body.area_total = input.area_ha;
    return railwayMutate(
      `/imoveis-rurais/${input.imovelId}`,
      "PUT",
      body,
      claims.produtorId
    );
  }),
  // ── Excluir Imóvel ───────────────────────────────────────────────────────────
  excluirImovel: publicProcedure.input(z2.object({ imovelId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return railwayMutate(
      `/imoveis-rurais/${input.imovelId}`,
      "DELETE",
      void 0,
      claims.produtorId
    );
  }),
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
      return railwayFetch(`/${prefix}/animais/${input.imovelId}`, void 0, claims.produtorId);
    }
    return railwayFetch(`/${prefix}/animais?imovel_id=${input.imovelId}`, void 0, claims.produtorId);
  }),
  // ── Dar baixa no rebanho (venda / morte / abate / doacao / permuta) ──────
  registrarBaixaAnimal: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    animalId: z2.number(),
    tipo: z2.enum(["abate_proprio", "abate_frigorif", "venda", "morte", "doacao", "permuta"]),
    data: z2.string(),
    pesoVivoKg: z2.number().optional(),
    pesoCarcacaKg: z2.number().optional(),
    valorTotal: z2.number().optional(),
    comprador: z2.string().optional(),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const body = input.especie === "bovinos" ? {
      animal_id: input.animalId,
      data: input.data,
      tipo: input.tipo,
      peso_vivo_kg: input.pesoVivoKg,
      peso_carcaca_kg: input.pesoCarcacaKg,
      valor_total: input.valorTotal,
      comprador: input.comprador,
      observacoes: input.observacoes
    } : {
      animal_id: input.animalId,
      data_abate: input.data,
      peso_vivo_kg: input.pesoVivoKg,
      peso_carcaca_kg: input.pesoCarcacaKg,
      destino: input.tipo,
      valor_total_rs: input.valorTotal,
      comprador: input.comprador
    };
    return railwayMutate(`/${prefix}/abates`, "POST", body, claims.produtorId);
  }),
  // ── Registrar pesagem (kg canonico; conversao de arroba feita no cliente) ─
  registrarPesagemAnimal: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    animalId: z2.number(),
    data: z2.string(),
    pesoKg: z2.number(),
    motivo: z2.string().default("rotina"),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const body = input.especie === "bovinos" ? {
      animal_id: input.animalId,
      data: input.data,
      peso_kg: input.pesoKg,
      motivo: input.motivo,
      observacoes: input.observacoes
    } : {
      animal_id: input.animalId,
      data_pesagem: input.data,
      peso_kg: input.pesoKg,
      motivo: input.motivo
    };
    return railwayMutate(`/${prefix}/pesagens`, "POST", body, claims.produtorId);
  }),
  // ── Desempenho do rebanho (score por percentil de GMD/litros-dia) ────────
  desempenhoRebanho: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    dias: z2.number().min(7).max(180).default(30)
  })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    return railwayFetch(
      `/${prefix}/desempenho?imovel_id=${input.imovelId}&dias=${input.dias}`,
      void 0,
      claims.produtorId
    );
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
    observacoes: z2.string().optional(),
    // Campos específicos de bovinos (obrigatórios na API, opcionais aqui para outras espécies)
    categoria: z2.string().optional(),
    aptidao_manejo: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { imovelId, especie, ...fields } = input;
    return railwayMutate(`/${prefix}/animais`, "POST", {
      imovel_id: imovelId,
      ...fields
    }, claims.produtorId);
  }),
  updateAnimal: publicProcedure.input(z2.object({
    animalId: z2.number(),
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    brinco: z2.string().optional(),
    nome: z2.string().optional(),
    raca: z2.string().optional(),
    sexo: z2.enum(["M", "F"]).optional(),
    observacoes: z2.string().optional(),
    data_nascimento: z2.string().optional(),
    peso_nascimento: z2.number().optional(),
    categoria: z2.string().optional(),
    aptidao_manejo: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { animalId, imovelId, especie, ...fields } = input;
    return railwayMutate(`/${prefix}/animais/${animalId}`, "PATCH", fields, claims.produtorId);
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
    return railwayMutate(`/${prefix}/animais/${animalId}/status`, "PATCH", fields, claims.produtorId);
  }),
  deleteAnimal: publicProcedure.input(z2.object({
    animalId: z2.number(),
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"])
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    await railwayMutate(`/${prefix}/animais/${input.animalId}`, "DELETE", void 0, claims.produtorId);
    return { success: true };
  }),
  analisarPlanilhaAnimais: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    rows: z2.array(z2.record(z2.string(), z2.any()))
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    let existentes = [];
    try {
      if (input.especie === "bovinos") {
        existentes = await railwayFetch(`/${prefix}/animais/${input.imovelId}`, void 0, claims.produtorId);
      } else {
        existentes = await railwayFetch(`/${prefix}/animais?imovel_id=${input.imovelId}`, void 0, claims.produtorId);
      }
    } catch (_) {
      existentes = [];
    }
    const brincoExistente = new Set(existentes.map((a) => String(a.brinco ?? "").toLowerCase().trim()));
    const COL_BRINCO = ["brinco", "id", "identificacao", "identificador", "numero", "tag", "brinco/id"];
    const COL_NOME = ["nome", "name"];
    const COL_RACA = ["raca", "ra\xE7a", "breed", "raca_nome"];
    const COL_SEXO = ["sexo", "sex", "genero", "g\xEAnero"];
    const COL_NASC = ["data_nascimento", "nascimento", "data nasc", "dt_nasc", "birth_date"];
    const COL_PESO = ["peso", "peso_nascimento", "peso nasc", "peso_kg"];
    const COL_CAT = ["categoria", "category"];
    const COL_APT = ["aptidao_manejo", "aptidao", "aptid\xE3o", "manejo"];
    const normColKey = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const colWords = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    const findCol = (row, keys) => {
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
      return void 0;
    };
    const rows_novas = [];
    const conflitos = [];
    let ignoradas_count = 0;
    const COL_NASC_DIA = ["datanascimentodia", "dianascimento"];
    const COL_NASC_MES = ["datanascimentomes", "mesnascimento"];
    const COL_NASC_ANO = ["datanascimentoano", "anonascimento"];
    const dataCompletaOuNada = (v) => {
      if (!v) return void 0;
      const s = v.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
      return void 0;
    };
    const montarData = (row) => {
      const dia = findCol(row, COL_NASC_DIA);
      const mes = findCol(row, COL_NASC_MES);
      const ano = findCol(row, COL_NASC_ANO);
      if (dia && mes && ano) {
        const d = parseInt(dia, 10), m = parseInt(mes, 10), a = parseInt(ano, 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(a) && a > 1900)
          return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
      return dataCompletaOuNada(findCol(row, COL_NASC));
    };
    for (const row of input.rows) {
      const brinco = findCol(row, COL_BRINCO);
      if (!brinco) {
        ignoradas_count++;
        continue;
      }
      const parsed = {
        brinco,
        nome: findCol(row, COL_NOME),
        raca: findCol(row, COL_RACA),
        sexo: (findCol(row, COL_SEXO) ?? "M").toUpperCase().startsWith("F") ? "F" : "M",
        data_nascimento: montarData(row),
        peso_nascimento: findCol(row, COL_PESO) ? Number(findCol(row, COL_PESO)) : void 0,
        categoria: findCol(row, COL_CAT),
        aptidao_manejo: findCol(row, COL_APT) ?? "corte"
      };
      if (brincoExistente.has(brinco.toLowerCase())) {
        const existente = existentes.find((a) => String(a.brinco ?? "").toLowerCase().trim() === brinco.toLowerCase());
        conflitos.push({ brinco, parsed, existente_id: existente?.id, existente });
      } else {
        rows_novas.push(parsed);
      }
    }
    if (rows_novas.length === 0 && conflitos.length === 0 && input.rows.length > 0) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: `Nenhuma linha com brinco reconhecido. Verifique se a planilha tem uma coluna "Brinco" (ou ID/Identifica\xE7\xE3o/N\xFAmero/Tag) e se o cabe\xE7alho est\xE1 na primeira linha de dados.`
      });
    }
    return { rows_novas, conflitos, ignoradas_count, total_planilha: input.rows.length };
  }),
  confirmarImportacaoAnimais: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    rows_novas: z2.array(z2.record(z2.string(), z2.any())),
    conflitos_decisoes: z2.array(z2.object({
      brinco: z2.string(),
      existente_id: z2.number().optional(),
      acao: z2.enum(["atualizar", "ignorar"]),
      dados: z2.record(z2.string(), z2.any()).optional()
    })).optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    let criados = 0, atualizados = 0, ignorados = 0, erros = 0;
    const erros_detalhe = [];
    for (const row of input.rows_novas) {
      try {
        await railwayMutate(`/${prefix}/animais`, "POST", { imovel_id: input.imovelId, ...row }, claims.produtorId);
        criados++;
      } catch (e) {
        erros++;
        const msg = msgDeErro(e);
        if (erros_detalhe.length < 10) erros_detalhe.push(`${row.brinco ?? "?"}: ${msg}`);
      }
    }
    for (const dec of input.conflitos_decisoes ?? []) {
      if (dec.acao === "atualizar" && dec.existente_id) {
        try {
          await railwayMutate(`/${prefix}/animais/${dec.existente_id}`, "PATCH", dec.dados ?? {}, claims.produtorId);
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
      criados,
      atualizados,
      ignorados,
      erros,
      total: criados + atualizados + ignorados + erros,
      erros_detalhe: erros_detalhe.length > 0 ? erros_detalhe : void 0
    };
  }),
  // ── Genealogia (Bovino) ──────────────────────────────────────────────────
  // Importa exportações de sistemas de genealogia (ex.: GISleite), que
  // frequentemente vêm como tabela HTML salva com extensão .xls e com nomes
  // de coluna diferentes do template padrão (ex.: "Identificador Animal" em
  // vez de "Brinco", data de nascimento partida em Dia/Mês/Ano, pai/mãe por
  // número de registro em vez de estarem no próprio rebanho).
  analisarPlanilhaGenealogiaBovino: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    rows: z2.array(z2.record(z2.string(), z2.any()))
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    let existentes = [];
    try {
      existentes = await railwayFetch(`/bovino/animais/${input.imovelId}`, void 0, claims.produtorId);
    } catch (_) {
      existentes = [];
    }
    const brincoExistente = new Set(existentes.map((a) => String(a.brinco ?? "").toLowerCase().trim()));
    const normColKey = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const colWords = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    const findCol = (row, keys) => {
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
      return void 0;
    };
    const COL_BRINCO = ["brinco", "id", "identificacao", "identificador", "numero", "tag"];
    const COL_NOME = ["nome", "name"];
    const COL_REG_PAI = ["registropai", "registro_pai", "regpai", "numero_pai"];
    const COL_NOME_PAI = ["nomepai", "nome_pai", "pai"];
    const COL_REG_MAE = ["registromae", "registro_mae", "regmae", "numero_mae"];
    const COL_NOME_MAE = ["nomemae", "nome_mae", "mae", "m\xE3e"];
    const COL_SEXO = ["sexo", "sex", "genero", "g\xEAnero"];
    const COL_RACA = ["raca", "ra\xE7a", "breed"];
    const COL_COMPOSICAO = ["composicaoracial", "composicao_racial", "composicao"];
    const COL_NASC_DIA = ["datanascimentodia", "diananscimento", "dia"];
    const COL_NASC_MES = ["datanascimentomes", "mesnascimento", "mes"];
    const COL_NASC_ANO = ["datanascimentoano", "anonascimento", "ano"];
    const rows_novas = [];
    const conflitos = [];
    let ignoradas_count = 0;
    for (const row of input.rows) {
      const brinco = findCol(row, COL_BRINCO);
      if (!brinco) {
        ignoradas_count++;
        continue;
      }
      let data_nascimento;
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
      const parsed = {
        brinco,
        nome: findCol(row, COL_NOME),
        sexo: sexoRaw.startsWith("F") ? "F" : "M",
        raca_nome: findCol(row, COL_RACA),
        // resolvido pro raca_id no backend, se houver match
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
        origem: "compra"
      };
      if (brincoExistente.has(brinco.toLowerCase())) {
        const existente = existentes.find((a) => String(a.brinco ?? "").toLowerCase().trim() === brinco.toLowerCase());
        conflitos.push({ brinco, parsed, existente_id: existente?.id, existente });
      } else {
        rows_novas.push(parsed);
      }
    }
    if (rows_novas.length === 0 && conflitos.length === 0 && input.rows.length > 0) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: `Nenhuma linha com identifica\xE7\xE3o de animal reconhecida. Colunas aceitas: Brinco, Identificador (Animal), ID, N\xFAmero, Tag.`
      });
    }
    return { rows_novas, conflitos, ignoradas_count, total_planilha: input.rows.length };
  }),
  // Segunda passada: depois que confirmarImportacaoAnimais criar os animais
  // (via /bovino/animais, que já aceita nome_pai/nome_mae/registro_*_externo/
  // composicao_racial desde a migração 017), chama isso pra tentar linkar
  // pai_id/mae_id de verdade sempre que o pai/mãe também estiver no rebanho.
  relinkGenealogiaBovino: publicProcedure.input(z2.object({ imovelId: z2.number() })).mutation(async ({ ctx, input }) => {
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
  analisarPlanilhaLactacoesBovino: publicProcedure.input(z2.object({ imovelId: z2.number(), rows: z2.array(z2.record(z2.string(), z2.any())) })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    let existentes = [];
    try {
      existentes = await railwayFetch(`/bovino/animais/${input.imovelId}`, void 0, claims.produtorId);
    } catch {
      existentes = [];
    }
    const brincoParaId = /* @__PURE__ */ new Map();
    for (const a of existentes) {
      if (a.brinco) brincoParaId.set(String(a.brinco).toLowerCase().trim(), a.id);
    }
    const normColKey = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const colWords = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    const findCol = (row, keys) => {
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
      return void 0;
    };
    const dataBr = (v) => {
      if (!v) return void 0;
      const s = v.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
      return void 0;
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
    const itens = [];
    const nao_encontrados = [];
    let ignoradas_count = 0;
    for (const row of input.rows) {
      const brinco = findCol(row, COL_BRINCO);
      const dataParto = dataBr(findCol(row, COL_DATA_PARTO));
      if (!brinco || !dataParto) {
        ignoradas_count++;
        continue;
      }
      const animalId = brincoParaId.get(brinco.toLowerCase());
      if (!animalId) {
        nao_encontrados.push({ brinco });
        continue;
      }
      const n = (v) => v !== void 0 ? Number(v.replace(",", ".")) : void 0;
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
        causa_encerramento: findCol(row, COL_CAUSA_ENC)
      });
    }
    if (itens.length === 0 && input.rows.length > 0) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: "Nenhuma linha reconhecida. Verifique se a planilha tem 'Identificador Animal' e 'Data Parto', e se os animais j\xE1 est\xE3o cadastrados no rebanho."
      });
    }
    return { itens, nao_encontrados, ignoradas_count, total_planilha: input.rows.length };
  }),
  confirmarImportacaoLactacoesBovino: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    itens: z2.array(z2.record(z2.string(), z2.any()))
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const itens = input.itens.map(({ brinco, ...rest }) => rest);
    return railwayMutate(`/bovino/leiteiro/lactacoes/importar`, "POST", {
      imovel_id: input.imovelId,
      itens
    }, claims.produtorId);
  }),
  analisarPlanilhaControleLeiteiroBovino: publicProcedure.input(z2.object({ imovelId: z2.number(), rows: z2.array(z2.record(z2.string(), z2.any())) })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    let existentes = [];
    try {
      existentes = await railwayFetch(`/bovino/animais/${input.imovelId}`, void 0, claims.produtorId);
    } catch {
      existentes = [];
    }
    const brincoParaId = /* @__PURE__ */ new Map();
    for (const a of existentes) {
      if (a.brinco) brincoParaId.set(String(a.brinco).toLowerCase().trim(), a.id);
    }
    const normColKey = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const colWords = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    const findCol = (row, keys) => {
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
      return void 0;
    };
    const dataBr = (v) => {
      if (!v) return void 0;
      const s = v.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
      return void 0;
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
    const itens = [];
    const nao_encontrados = [];
    let ignoradas_count = 0;
    for (const row of input.rows) {
      const brinco = findCol(row, COL_BRINCO);
      const dataControle = dataBr(findCol(row, COL_DATA_CONTROLE));
      const producaoControle = findCol(row, COL_PROD_CONTROLE);
      if (!brinco || !dataControle || !producaoControle) {
        ignoradas_count++;
        continue;
      }
      const animalId = brincoParaId.get(brinco.toLowerCase());
      if (!animalId) {
        nao_encontrados.push({ brinco });
        continue;
      }
      const n = (v) => v !== void 0 ? Number(v.replace(",", ".")) : void 0;
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
        numero_controle_externo: n(findCol(row, COL_NUM_CONTROLE))
      });
    }
    if (itens.length === 0 && input.rows.length > 0) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: "Nenhuma linha reconhecida. Verifique se a planilha tem 'Identificador Animal', 'Data Controle' e 'Producao Leite Controle', e se os animais j\xE1 est\xE3o cadastrados no rebanho."
      });
    }
    return { itens, nao_encontrados, ignoradas_count, total_planilha: input.rows.length };
  }),
  confirmarImportacaoControleLeiteiroBovino: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    itens: z2.array(z2.record(z2.string(), z2.any()))
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const itens = input.itens.map(({ brinco, ...rest }) => rest);
    return railwayMutate(`/bovino/leiteiro/ordenha/importar`, "POST", {
      imovel_id: input.imovelId,
      itens
    }, claims.produtorId);
  }),
  lactacoesBovino: publicProcedure.input(z2.object({ imovelId: z2.number(), animalId: z2.number().optional() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const qs = input.animalId ? `?animal_id=${input.animalId}` : "";
    return railwayFetch(`/bovino/leiteiro/lactacoes/${input.imovelId}${qs}`, void 0, claims.produtorId);
  }),
  controleLeiteiroBovino: publicProcedure.input(z2.object({ imovelId: z2.number(), animalId: z2.number().optional(), dias: z2.number().optional() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const params = new URLSearchParams();
    params.set("dias", String(input.dias ?? 3650));
    params.set("fonte", "gisleite");
    if (input.animalId) params.set("animal_id", String(input.animalId));
    return railwayFetch(`/bovino/leiteiro/ordenha/${input.imovelId}?${params.toString()}`, void 0, claims.produtorId);
  }),
  // ── Dashboard ──────────────────────────────────────────────────────────────
  ovinoDashboard: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return railwayFetch(`/ovino/dashboard/${input.imovelId}`, void 0, claims.produtorId);
  }),
  // ── Financial ──────────────────────────────────────────────────────────────
  produtorResumo: publicProcedure.input(z2.object({ produtorId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    return railwayFetch(`/produtores/${input.produtorId}/resumo`, void 0, claims.produtorId);
  }),
  lancamentos: publicProcedure.input(z2.object({ produtorId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    return railwayFetch(`/produtores/${input.produtorId}/lancamentos`, void 0, claims.produtorId);
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
    }, claims.produtorId);
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
    }, claims.produtorId);
  }),
  deleteLancamento: publicProcedure.input(z2.object({ produtorId: z2.number(), lancamentoId: z2.string() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    await railwayMutate(`/lancamentos/${input.lancamentoId}`, "DELETE", void 0, claims.produtorId);
    return { success: true };
  }),
  importarLancamentos: publicProcedure.input(z2.object({
    produtorId: z2.number(),
    imovelId: z2.number(),
    arquivo: z2.string(),
    // base64
    nomeArquivo: z2.string(),
    mapaData: z2.string().optional(),
    mapaValor: z2.string().optional(),
    mapaDescricao: z2.string().optional(),
    mapaTipo: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    const { getRailwayToken: getRailwayToken2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const token = await getRailwayToken2(input.produtorId).catch(() => null);
    const buffer = Buffer.from(input.arquivo, "base64");
    const formData = new FormData();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    formData.append("arquivo", blob, input.nomeArquivo);
    formData.append("produtor_id", String(input.produtorId));
    formData.append("imovel_id", String(input.imovelId));
    if (input.mapaData) formData.append("mapa_data", input.mapaData);
    if (input.mapaValor) formData.append("mapa_valor", input.mapaValor);
    if (input.mapaDescricao) formData.append("mapa_descricao", input.mapaDescricao);
    if (input.mapaTipo) formData.append("mapa_tipo", input.mapaTipo);
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${RAILWAY_API2}/importacao/lancamentos`, {
      method: "POST",
      headers,
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: err.detail ?? `Erro na importa\xE7\xE3o: HTTP ${res.status}`
      });
    }
    return res.json();
  }),
  // ── Sanitary ───────────────────────────────────────────────────────────────
  // Histórico sanitário (ovinos/caprinos/suinos: /historico; bovinos: /proximos)
  sanitario: publicProcedure.input(z2.object({ imovelId: z2.number(), especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    if (input.especie === "bovinos") {
      return railwayFetch(`/${prefix}/sanitario/${input.imovelId}/proximos`, void 0, claims.produtorId).catch(() => []);
    }
    return railwayFetch(`/${prefix}/sanitario/historico?imovel_id=${input.imovelId}`, void 0, claims.produtorId).catch(() => []);
  }),
  // Calendário sanitário (próximos eventos)
  sanitarioCalendario: publicProcedure.input(z2.object({ imovelId: z2.number(), especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    if (input.especie === "bovinos") {
      return railwayFetch(`/${prefix}/sanitario/${input.imovelId}/proximos`, void 0, claims.produtorId).catch(() => ({ reforcos_pendentes: [], tarefas_sanitarias: [], total: 0 }));
    }
    return railwayFetch(`/${prefix}/sanitario/calendario?imovel_id=${input.imovelId}&dias=30`, void 0, claims.produtorId).catch(() => ({ reforcos_pendentes: [], tarefas_sanitarias: [], total: 0 }));
  }),
  // Insumos sanitários disponíveis por espécie
  sanitarioInsumos: publicProcedure.input(z2.object({ imovelId: z2.number(), especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    return railwayFetch(`/${prefix}/sanitario/insumos?imovel_id=${input.imovelId}`, void 0, claims.produtorId).catch(() => []);
  }),
  // Criar aplicação sanitária
  createSanitario: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    insumo_id: z2.number(),
    animal_id: z2.number().optional(),
    lote_id: z2.number().optional(),
    data_aplicacao: z2.string(),
    dose_ml: z2.number().optional(),
    via: z2.string().optional(),
    responsavel_nome: z2.string().optional(),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { imovelId, especie, ...fields } = input;
    const endpoint = input.especie === "bovinos" ? `/${prefix}/sanitario` : `/${prefix}/sanitario/aplicar`;
    return railwayMutate(endpoint, "POST", {
      imovel_id: imovelId,
      ...fields
    }, claims.produtorId);
  }),
  // Excluir registro sanitário
  deleteSanitario: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    sanitarioId: z2.number()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    return railwayMutate(`/${prefix}/sanitario/${input.sanitarioId}`, "DELETE", void 0, claims.produtorId).catch(() => ({ ok: true }));
  }),
  updateSanitario: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    sanitarioId: z2.number(),
    data_aplicacao: z2.string().optional(),
    dose_ml: z2.number().optional(),
    via: z2.string().optional(),
    responsavel_nome: z2.string().optional(),
    observacoes: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    const { imovelId, especie, sanitarioId, ...fields } = input;
    return railwayMutate(
      `/${prefix}/sanitario/${sanitarioId}`,
      "PATCH",
      fields,
      claims.produtorId
    ).catch(() => ({ ok: true }));
  }),
  // ── Reproduction ───────────────────────────────────────────────────────────
  reproducao: publicProcedure.input(z2.object({ imovelId: z2.number(), especie: z2.enum(["ovinos", "caprinos", "bovinos"]) })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    if (input.especie === "bovinos") {
      return railwayFetch(`/${prefix}/reproducao/${input.imovelId}/prenhas`, void 0, claims.produtorId);
    }
    return railwayFetch(`/${prefix}/alertas?imovel_id=${input.imovelId}&tipo=reproducao`, void 0, claims.produtorId).catch(() => []);
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
    }, claims.produtorId);
  }),
  // ── Insumos ────────────────────────────────────────────────────────────────
  insumos: publicProcedure.input(z2.object({ imovelId: z2.number(), categoria: z2.string().optional(), origem: z2.string().optional() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const params = new URLSearchParams({ fazenda_id: String(input.imovelId) });
    if (input.categoria) params.set("categoria", input.categoria);
    if (input.origem) params.set("origem", input.origem);
    const data = await railwayFetch(`/insumos/?${params}`, void 0, claims.produtorId);
    return Array.isArray(data) ? data : data.data ?? [];
  }),
  insumosAlertas: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayFetch(`/insumos/alertas?fazenda_id=${input.imovelId}`, void 0, claims.produtorId);
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
    estoque_reservado: z2.number().default(0),
    estoque_maximo: z2.number().optional(),
    lote: z2.string().optional(),
    validade: z2.string().optional(),
    local_armazenamento: z2.string().optional(),
    preco_estimado: z2.number().optional(),
    fornecedor_id: z2.number().optional(),
    reposicao_modo: z2.enum(["automatico", "manual"]).default("manual"),
    lead_time_dias: z2.number().default(7)
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const { imovelId, ...fields } = input;
    const data = await railwayMutate(`/insumos/`, "POST", { fazenda_id: imovelId, ...fields }, claims.produtorId);
    return data.data ?? data;
  }),
  // ── Editar Insumo (inclui vincular/trocar fornecedor) ────────────────────────
  atualizarInsumo: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    insumoId: z2.number(),
    nome: z2.string().min(1),
    descricao: z2.string().optional(),
    categoria: z2.string(),
    unidade: z2.string(),
    origem: z2.enum(["comprado", "proprio", "doacao"]),
    estoque_minimo: z2.number(),
    estoque_ideal: z2.number(),
    preco_estimado: z2.number().optional(),
    fornecedor_id: z2.number().optional(),
    reposicao_modo: z2.enum(["automatico", "manual"]),
    lead_time_dias: z2.number()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const { imovelId, insumoId, ...fields } = input;
    const data = await railwayMutate(`/insumos/${insumoId}`, "PUT", fields, claims.produtorId);
    return data.data ?? data;
  }),
  resumoMovimentacoesInsumos: publicProcedure.input(z2.object({ imovelId: z2.number(), mes: z2.string().optional() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const qs = input.mes ? `&mes=${input.mes}` : "";
    return railwayFetch(`/insumos/resumo-movimentacoes?fazenda_id=${input.imovelId}${qs}`, void 0, claims.produtorId);
  }),
  insumoDetalhe: publicProcedure.input(z2.object({ imovelId: z2.number(), insumoId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayFetch(`/insumos/${input.insumoId}?fazenda_id=${input.imovelId}`, void 0, claims.produtorId);
    return data.data ?? data;
  }),
  movimentarInsumo: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    insumoId: z2.number(),
    tipo: z2.enum(["compra", "producao_propria", "doacao", "ajuste_positivo", "uso", "venda", "perda", "ajuste_negativo"]),
    quantidade: z2.number().positive(),
    custo_unitario: z2.number().optional(),
    observacao: z2.string().optional(),
    data_movim: z2.string().optional(),
    // Rastreabilidade de saída
    motivo_saida: z2.enum(["consumo_rebanho", "perda", "vencimento", "transferencia", "venda", "ajuste", "outro"]).optional(),
    lote_destino: z2.string().optional(),
    atividade: z2.enum(["pecuaria_corte", "pecuaria_leite", "suinocultura", "avicultura", "agricultura", "geral"]).optional(),
    // Vínculo real com o Rebanho (para GMD/custo por kg e litros/dia por animal)
    animal_id: z2.number().optional(),
    lote_id: z2.number().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const { imovelId, insumoId, ...fields } = input;
    const observacaoEnriquecida = [
      fields.observacao,
      fields.motivo_saida ? `motivo:${fields.motivo_saida}` : void 0,
      fields.atividade ? `atividade:${fields.atividade}` : void 0,
      fields.lote_destino ? `lote:${fields.lote_destino}` : void 0
    ].filter(Boolean).join(" | ") || void 0;
    const payload = {
      tipo: fields.tipo,
      quantidade: fields.quantidade,
      custo_unitario: fields.custo_unitario,
      data_movim: fields.data_movim,
      observacao: observacaoEnriquecida,
      animal_id: fields.animal_id,
      lote_id: fields.lote_id,
      atividade: fields.atividade
    };
    const data = await railwayMutate(`/insumos/${insumoId}/movimentar`, "POST", payload, claims.produtorId);
    return data.data ?? data;
  }),
  // ── Produção integrada com Insumos (GMD/custo por kg, ou litros/dia e custo/litro) ──
  // Bovino tem endpoint dedicado (corte + leite); Ovino/Caprino reaproveitam o
  // endpoint de indicadores já existente; Suíno tem endpoint espelhado do de Bovino.
  producaoInsumosAnimal: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    animalId: z2.number(),
    especie: z2.enum(["ovinos", "caprinos", "suinos", "bovinos"]),
    dias: z2.number().min(1).max(365).default(30)
  })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const prefix = especiePrefix[input.especie];
    if (input.especie === "bovinos") {
      return railwayFetch(`/${prefix}/animais/${input.animalId}/producao-insumos?dias=${input.dias}`, void 0, claims.produtorId);
    }
    if (input.especie === "suinos") {
      const r2 = await railwayFetch(`/${prefix}/animais/${input.animalId}/producao-insumos?dias=${input.dias}`, void 0, claims.produtorId);
      return { ...r2, tipo: "corte" };
    }
    const r = await railwayFetch(`/${prefix}/indicadores/animal/${input.animalId}`, void 0, claims.produtorId);
    return {
      animal_id: input.animalId,
      tipo: "corte",
      periodo_dias: input.dias,
      gmd_kg_dia: r.gmd_geral ?? null,
      ganho_total_kg: r.ganho_total_kg ?? null,
      custo_insumos_periodo: r.custo_insumos_periodo ?? 0,
      custo_por_kg_ganho: r.custo_por_kg_ganho ?? null,
      aviso: null
    };
  }),
  deleteInsumo: publicProcedure.input(z2.object({ imovelId: z2.number(), insumoId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayMutate(`/insumos/${input.insumoId}`, "DELETE", void 0, claims.produtorId);
    return data;
  }),
  duplicadosInsumos: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayFetch(`/insumos/duplicados?fazenda_id=${input.imovelId}`, void 0, claims.produtorId);
    return data;
  }),
  limparDuplicadosInsumos: publicProcedure.input(z2.object({ imovelId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayMutate(`/insumos/limpar-duplicados?fazenda_id=${input.imovelId}`, "POST", void 0, claims.produtorId);
    return data;
  }),
  // ── Fornecedores ───────────────────────────────────────────────────────────
  fornecedores: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayFetch(`/fornecedores/?fazenda_id=${input.imovelId}`, void 0, claims.produtorId);
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
    const data = await railwayMutate(`/fornecedores/`, "POST", { fazenda_id: imovelId, ...fields }, claims.produtorId);
    return data.data ?? data;
  }),
  updateFornecedor: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    fornecedorId: z2.number(),
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
    const { imovelId, fornecedorId, ...fields } = input;
    const data = await railwayMutate(`/fornecedores/${fornecedorId}`, "PUT", { fazenda_id: imovelId, ...fields }, claims.produtorId);
    return data.data ?? data;
  }),
  deleteFornecedor: publicProcedure.input(z2.object({ imovelId: z2.number(), fornecedorId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayMutate(`/fornecedores/${input.fornecedorId}`, "DELETE", void 0, claims.produtorId);
    return data;
  }),
  // ── Pedidos de Compra ────────────────────────────────────────────────────────
  pedidosCompra: publicProcedure.input(z2.object({ imovelId: z2.number(), status: z2.string().optional() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const params = new URLSearchParams({ fazenda_id: String(input.imovelId) });
    if (input.status) params.set("status", input.status);
    const data = await railwayFetch(`/pedidos-compra/?${params}`, void 0, claims.produtorId);
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
    const data = await railwayMutate(`/pedidos-compra/`, "POST", { fazenda_id: imovelId, ...fields }, claims.produtorId);
    return data.data ?? data;
  }),
  aprovarPedidoCompra: publicProcedure.input(z2.object({ imovelId: z2.number(), pedidoId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const data = await railwayMutate(`/pedidos-compra/${input.pedidoId}/aprovar`, "PUT", void 0, claims.produtorId);
    return data.data ?? data;
  }),
  enviarPedidoCompra: publicProcedure.input(z2.object({ imovelId: z2.number(), pedidoId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return railwayMutate(`/pedidos-compra/${input.pedidoId}/enviar`, "POST", void 0, claims.produtorId);
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
    const normKey = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const col = (row, ...keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find((rk) => normKey(rk) === normKey(k));
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
          const railwayResult = await railwayMutate("/insumos/", "POST", payload, claims.produtorId);
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
    const HEADER_HINTS_INSUMO = ["nome", "name", "insumo", "produto", "descricao"];
    const normHeaderVal = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
      const rowVals = (rawRows[i] || []).map(normHeaderVal);
      if (rowVals.some((v) => HEADER_HINTS_INSUMO.some((h) => v === h || v.includes(h)))) {
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
    const normKey = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const colWordsInsumo = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    const col = (row, ...keys) => {
      const cols = Object.keys(row);
      for (const k of keys) {
        const found = cols.find((rk) => normKey(rk) === normKey(k));
        if (found && row[found] !== "") return row[found];
      }
      for (const k of keys) {
        const kn = normKey(k);
        const found = cols.find((rk) => colWordsInsumo(rk).includes(kn));
        if (found && row[found] !== "") return row[found];
      }
      return "";
    };
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
      fornecedor_nome: normalize(col(row, "fornecedor", "fornecedornome", "supplier", "fabricante", "vendor"))
    }));
    const normalizeNome = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const rowsComNome = allParsedRows.filter((r) => r.nome.length > 0);
    const seenNomesAnalise = /* @__PURE__ */ new Set();
    const parsedRows = rowsComNome.filter((r) => {
      const key = normalizeNome(r.nome);
      if (seenNomesAnalise.has(key)) return false;
      seenNomesAnalise.add(key);
      return true;
    });
    const linhasZeradas = parsedRows.filter((r) => r.estoque_atual === 0 && r.preco_estimado === 0).map((r) => ({ nome: r.nome, linha: r._linha }));
    const catalog = await listInsumosCatalogo(input.imovelId);
    const catalogNomes = new Set(catalog.map((c) => c.nomeNormalizado));
    let insumosExistentesAnalise = [];
    try {
      const existResAnalise = await railwayFetch("/insumos/", void 0, claims.produtorId);
      insumosExistentesAnalise = existResAnalise?.data ?? [];
    } catch {
    }
    const mapaExistentes = /* @__PURE__ */ new Map();
    for (const ins of insumosExistentesAnalise) {
      mapaExistentes.set(normalizeNome(ins.nome), ins);
    }
    const unmapped = [];
    const seen = /* @__PURE__ */ new Set();
    for (const r of parsedRows) {
      if (!r.nome) continue;
      const key = normalizeNome(r.nome);
      const reconhecido = catalogNomes.has(key) || mapaExistentes.has(key);
      if (!reconhecido && !seen.has(key)) {
        unmapped.push({ nome: r.nome, linha: r._linha });
        seen.add(key);
      }
    }
    const rowsNovas = [];
    const conflitos = [];
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
          unidade: existente.unidade ?? r.unidade
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
      linhas_zeradas: linhasZeradas
    };
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
      lead_time_dias: z2.number(),
      fornecedor_nome: z2.string().optional()
    })),
    mappings: z2.record(z2.string(), z2.string()),
    // { nomePlanilha: nomeDestino }
    // Decisões do usuário para insumos já existentes: "adicionar" = soma estoque | "ignorar" = pula
    conflitos_decisoes: z2.record(z2.string(), z2.enum(["adicionar", "ignorar"])).optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const results = [];
    const normalizeNomeConf = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const seenNomesConf = /* @__PURE__ */ new Set();
    const rowsUnicas = input.rows.filter((r) => {
      if (!r.nome) return false;
      const key = normalizeNomeConf(r.nome);
      if (seenNomesConf.has(key)) return false;
      seenNomesConf.add(key);
      return true;
    });
    let insumosExistentes = [];
    try {
      const existRes = await railwayFetch("/insumos/", void 0, claims.produtorId);
      insumosExistentes = existRes?.data ?? [];
    } catch {
    }
    const mapaExistentesConf = /* @__PURE__ */ new Map();
    for (const ins of insumosExistentes) {
      mapaExistentesConf.set(normalizeNomeConf(ins.nome), ins);
    }
    let fornecedoresExistentes = [];
    try {
      const fornRes = await railwayFetch(
        `/fornecedores/?fazenda_id=${input.imovelId}`,
        void 0,
        claims.produtorId
      );
      fornecedoresExistentes = Array.isArray(fornRes) ? fornRes : fornRes.data ?? [];
    } catch {
    }
    const mapaFornecedores = /* @__PURE__ */ new Map();
    for (const f of fornecedoresExistentes) {
      mapaFornecedores.set(normalizeNomeConf(f.nome), f.id);
    }
    async function resolverFornecedorId(nomeFornecedor) {
      const nome = (nomeFornecedor ?? "").trim();
      if (!nome) return void 0;
      const key = normalizeNomeConf(nome);
      const existente = mapaFornecedores.get(key);
      if (existente) return existente;
      try {
        const novo = await railwayMutate(
          `/fornecedores/`,
          "POST",
          { fazenda_id: input.imovelId, nome },
          claims.produtorId
        );
        const fornecedorCriado = novo.data ?? novo;
        mapaFornecedores.set(key, fornecedorCriado.id);
        return fornecedorCriado.id;
      } catch {
        return void 0;
      }
    }
    const decisoes = input.conflitos_decisoes ?? {};
    const decisoesNorm = /* @__PURE__ */ new Map();
    for (const [k, v] of Object.entries(decisoes)) {
      decisoesNorm.set(normalizeNomeConf(k), v);
    }
    for (const row of rowsUnicas) {
      if (!row.nome) {
        results.push({ nome: "(sem nome)", ok: false, error: "Nome obrigat\xF3rio" });
        continue;
      }
      const nomeDestino = input.mappings[row.nome] ?? row.nome;
      const nomeNorm = normalizeNomeConf(nomeDestino);
      try {
        const catalogItem = await upsertInsumosCatalogo({
          imovelId: input.imovelId,
          nome: nomeDestino,
          categoria: row.categoria,
          unidade: row.unidade
        });
        const insumoExistente = mapaExistentesConf.get(nomeNorm) || (catalogItem.railwayId ? insumosExistentes.find((i) => i.id === catalogItem.railwayId) : void 0);
        const jaExisteNoRailway = !!insumoExistente;
        if (jaExisteNoRailway && insumoExistente) {
          const decisao = decisoes[row.nome] ?? decisoes[nomeDestino] ?? decisoesNorm.get(normalizeNomeConf(row.nome)) ?? decisoesNorm.get(normalizeNomeConf(nomeDestino)) ?? (row.estoque_atual > 0 ? "adicionar" : "ignorar");
          if (decisao === "adicionar" && row.estoque_atual > 0) {
            try {
              await railwayMutate(
                `/insumos/${insumoExistente.id}/movimentar`,
                "POST",
                {
                  tipo: "ajuste_positivo",
                  quantidade: Math.abs(row.estoque_atual),
                  observacao: "Importa\xE7\xE3o de planilha",
                  custo_unitario: row.preco_estimado || void 0
                },
                claims.produtorId
              );
              results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: "atualizado" });
            } catch (movErr) {
              const errMsg = movErr instanceof Error ? movErr.message : String(movErr);
              results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: false, action: "ignorado", error: `Falha ao movimentar: ${errMsg}` });
            }
          } else {
            results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: "ignorado" });
          }
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
                  lead_time_dias: insumoExistente.lead_time_dias
                }, claims.produtorId);
              } catch {
              }
            }
          }
          continue;
        }
        let actionFinal = "criado";
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
            preco_estimado: row.preco_estimado || void 0,
            fornecedor_id: fornecedorId,
            reposicao_modo: row.reposicao_modo,
            lead_time_dias: row.lead_time_dias
          };
          const railwayResult = await railwayMutate("/insumos/", "POST", payload, claims.produtorId);
          if (railwayResult && typeof railwayResult === "object" && "id" in railwayResult) {
            await upsertInsumosCatalogo({ imovelId: input.imovelId, nome: nomeDestino, categoria: row.categoria, unidade: row.unidade, railwayId: railwayResult.id });
          }
        } catch (railwayErr) {
          const errMsg = railwayErr instanceof Error ? railwayErr.message : String(railwayErr);
          if (errMsg.includes("409") || errMsg.toLowerCase().includes("j\xE1 existe") || errMsg.toLowerCase().includes("already exists")) {
            actionFinal = "atualizado";
          }
        }
        results.push({ nome: nomeDestino, codigo: catalogItem.codigo, ok: true, action: actionFinal });
      } catch (e) {
        results.push({ nome: nomeDestino, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const success = results.filter((r) => r.ok).length;
    const errors = results.filter((r) => !r.ok).length;
    const criados = results.filter((r) => r.action === "criado").length;
    const atualizados = results.filter((r) => r.action === "atualizado").length;
    const ignorados = results.filter((r) => r.action === "ignorado").length;
    return { total: rowsUnicas.length, success, errors, criados, atualizados, ignorados, results };
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
    }, claims.produtorId);
    return res;
  }),
  listarCompetencias: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/lancamentos/${input.imovelId}`, void 0, claims.produtorId);
    return Array.isArray(res) ? res : [];
  }),
  dashboardSimulador: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/dashboard/${input.imovelId}`, void 0, claims.produtorId);
    return res;
  }),
  deletarCompetencia: publicProcedure.input(z2.object({ imovelId: z2.number(), competencia: z2.string() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/lancamento/${input.imovelId}/${input.competencia}`, {
      method: "DELETE"
    }, claims.produtorId);
    return res;
  }),
  perfilSimulador: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const res = await railwayFetch(`/simulador-regime/perfil/${input.imovelId}`, void 0, claims.produtorId);
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
    }, claims.produtorId);
    return res;
  }),
  // ── Fechar Competência ────────────────────────────────────────────────────
  fecharCompetencia: publicProcedure.input(z2.object({ produtorId: z2.number() })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertProdutor(claims, input.produtorId);
    const res = await railwayMutate(`/produtores/${input.produtorId}/fechar-mes`, "POST", void 0, claims.produtorId);
    return res;
  }),
  // ── Agricultura ────────────────────────────────────────────────
  culturas: publicProcedure.query(async ({ ctx }) => {
    const claims = await requireClaims(ctx.req);
    const res = await railwayFetch("/agricultura/culturas", void 0, claims.produtorId);
    return Array.isArray(res) ? res : [];
  }),
  safras: publicProcedure.input(z2.object({ imovelId: z2.number() })).query(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    const raw = await railwayFetch(
      `/agricultura/imoveis/${input.imovelId}/safras`,
      void 0,
      claims.produtorId
    );
    const data = raw;
    return Array.isArray(data) ? data : data.safras ?? data.items ?? [];
  }),
  criarSafra: publicProcedure.input(z2.object({
    imovelId: z2.number(),
    cultura: z2.string(),
    area_ha: z2.number().optional(),
    data_plantio: z2.string().optional(),
    data_colheita_prevista: z2.string().optional()
  })).mutation(async ({ ctx, input }) => {
    const claims = await requireClaims(ctx.req);
    assertImovel(claims, input.imovelId);
    return railwayFetch(
      `/agricultura/imoveis/${input.imovelId}/safras`,
      {
        method: "POST",
        body: JSON.stringify({
          cultura: input.cultura,
          area_ha: input.area_ha,
          data_plantio: input.data_plantio,
          data_colheita_prevista: input.data_colheita_prevista,
          imovel_id: input.imovelId
        })
      },
      claims.produtorId
    );
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
      if (claims.role !== "admin") {
        const allowedIds = await getImoveisForProdutor(claims.produtorId);
        if (allowedIds && !allowedIds.includes(input.imovelId)) {
          throw new TRPCError5({
            code: "FORBIDDEN",
            message: "Acesso negado: im\xF3vel n\xE3o pertence ao seu cadastro."
          });
        }
      }
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
  // ── Contadores ────────────────────────────────────────────────────────────
  contadores: router({
    /** Lista os contadores ativos vinculados ao produtor logado */
    listar: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) throw new TRPCError5({ code: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida." });
      if (claims.role !== "user") throw new TRPCError5({ code: "FORBIDDEN", message: "Apenas produtores podem gerenciar contadores." });
      return listarContadoresPorProdutor(claims.cpf);
    }),
    /** Cadastra um novo contador autorizado pelo produtor logado */
    cadastrar: publicProcedure.input(z3.object({
      contadorCpf: z3.string().min(11, "CPF inv\xE1lido"),
      contadorNome: z3.string().min(2, "Nome obrigat\xF3rio"),
      contadorTelefone: z3.string().min(10, "Telefone inv\xE1lido")
    })).mutation(async ({ input, ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) throw new TRPCError5({ code: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida." });
      if (claims.role !== "user") throw new TRPCError5({ code: "FORBIDDEN", message: "Apenas produtores podem cadastrar contadores." });
      const vinculo = await cadastrarContador({
        contadorCpf: input.contadorCpf,
        contadorNome: input.contadorNome,
        contadorTelefone: input.contadorTelefone,
        produtorCpf: claims.cpf,
        produtorId: claims.produtorId
      });
      return { success: true, id: vinculo.id };
    }),
    /** Revoga o acesso de um contador */
    revogar: publicProcedure.input(z3.object({ id: z3.number() })).mutation(async ({ input, ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) throw new TRPCError5({ code: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida." });
      if (claims.role !== "user") throw new TRPCError5({ code: "FORBIDDEN", message: "Apenas produtores podem revogar contadores." });
      await revogarContador(input.id, claims.cpf);
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
  }),
  // ── Alertas de Estoque ──────────────────────────────────────────────────────────────────
  alertasEstoque: router({
    /** Busca a configuração de alertas do produtor logado */
    getConfig: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) return null;
      const dbConn = await (await Promise.resolve().then(() => (init_db(), db_exports))).getDb();
      if (!dbConn) return null;
      const { alertasEstoqueConfig: alertasEstoqueConfig2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq3 } = await import("drizzle-orm");
      const rows = await dbConn.select().from(alertasEstoqueConfig2).where(eq3(alertasEstoqueConfig2.produtorId, claims.produtorId)).limit(1);
      return rows[0] ?? null;
    }),
    /** Salva (upsert) a configuração de alertas */
    saveConfig: publicProcedure.input(z3.object({
      ativo: z3.boolean(),
      nivelMinimo: z3.enum(["critico", "atencao", "ambos"]),
      horaEnvio: z3.number().min(0).max(23),
      cooldownHoras: z3.number().min(1).max(168)
    })).mutation(async ({ input, ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) throw new TRPCError5({ code: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida." });
      const dbConn = await (await Promise.resolve().then(() => (init_db(), db_exports))).getDb();
      if (!dbConn) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR", message: "Banco indispon\xEDvel." });
      const { alertasEstoqueConfig: alertasEstoqueConfig2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq3 } = await import("drizzle-orm");
      const existing = await dbConn.select().from(alertasEstoqueConfig2).where(eq3(alertasEstoqueConfig2.produtorId, claims.produtorId)).limit(1);
      if (existing.length > 0) {
        await dbConn.update(alertasEstoqueConfig2).set(input).where(eq3(alertasEstoqueConfig2.produtorId, claims.produtorId));
      } else {
        await dbConn.insert(alertasEstoqueConfig2).values({ produtorId: claims.produtorId, ...input });
      }
      return { success: true };
    }),
    /** Dispara um alerta de teste imediato para o produtor logado */
    testar: publicProcedure.mutation(async ({ ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) throw new TRPCError5({ code: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida." });
      const { processarAlertasProdutor: processarAlertasProdutor2 } = await Promise.resolve().then(() => (init_alertasEstoque(), alertasEstoque_exports));
      const resultados = await processarAlertasProdutor2(claims.produtorId);
      const enviados = resultados.filter((r) => r.enviado).length;
      return { success: true, enviados, total: resultados.length };
    }),
    /** Retorna os últimos 10 logs de alertas do produtor */
    getLogs: publicProcedure.query(async ({ ctx }) => {
      const { getClaimsFromRequest: getClaimsFromRequest2 } = await Promise.resolve().then(() => (init_railwayProxy(), railwayProxy_exports));
      const claims = await getClaimsFromRequest2(ctx.req);
      if (!claims) return [];
      const dbConn = await (await Promise.resolve().then(() => (init_db(), db_exports))).getDb();
      if (!dbConn) return [];
      const { alertasEstoqueLog: alertasEstoqueLog2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq3, desc: desc3 } = await import("drizzle-orm");
      return dbConn.select().from(alertasEstoqueLog2).where(eq3(alertasEstoqueLog2.produtorId, claims.produtorId)).orderBy(desc3(alertasEstoqueLog2.criadoEm)).limit(10);
    })
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
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
init_alertasEstoque();
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/alertas-estoque", async (req, res) => {
    const token = req.headers["x-scheduled-token"] ?? req.body?.token;
    const expectedToken = process.env.SCHEDULED_SECRET ?? "ruralcaixa-scheduled";
    if (token !== expectedToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const resultado = await processarTodosAlertas();
      return res.json({ ok: true, ...resultado });
    } catch (err) {
      console.error("[alertas-estoque] Erro:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
