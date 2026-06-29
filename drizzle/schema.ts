import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  date,
  boolean,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Animals ─────────────────────────────────────────────────────────────────

export const animals = mysqlTable("animals", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Animal = typeof animals.$inferSelect;
export type InsertAnimal = typeof animals.$inferInsert;

// ─── Health Records ───────────────────────────────────────────────────────────

export const healthRecords = mysqlTable("health_records", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HealthRecord = typeof healthRecords.$inferSelect;
export type InsertHealthRecord = typeof healthRecords.$inferInsert;

// ─── Reproductive Records ─────────────────────────────────────────────────────

export const reproductiveRecords = mysqlTable("reproductive_records", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReproductiveRecord = typeof reproductiveRecords.$inferSelect;
export type InsertReproductiveRecord = typeof reproductiveRecords.$inferInsert;

// ─── Financial Records ────────────────────────────────────────────────────────

export const financialRecords = mysqlTable("financial_records", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FinancialRecord = typeof financialRecords.$inferSelect;
export type InsertFinancialRecord = typeof financialRecords.$inferInsert;

// ─── Movements ────────────────────────────────────────────────────────────────

export const movements = mysqlTable("movements", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Movement = typeof movements.$inferSelect;
export type InsertMovement = typeof movements.$inferInsert;

// ─── Produtor Config ────────────────────────────────────────────────────────────────────────────────────

/**
 * Per-produtor configuration stored locally (Railway API has no telegram_chat_id field).
 * produtorId matches the Railway produtor.id.
 */
export const produtorConfig = mysqlTable("produtor_config", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProdutorConfig = typeof produtorConfig.$inferSelect;
export type InsertProdutorConfig = typeof produtorConfig.$inferInsert;
