import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
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
  ReproductiveRecord,
  User,
  animals,
  financialRecords,
  healthRecords,
  movements,
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
