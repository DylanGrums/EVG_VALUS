/** Infos pratiques libres du carnet sur place (gérées par les organisateurs). */
import { asc, eq, max } from "drizzle-orm";
import type { DB } from "@/db";
import { practicalInfos } from "@/db/schema";
import { OrgaError } from "./errors";
import type { InfoInput } from "./validation";

export async function listInfos(db: DB) {
  return db.select().from(practicalInfos).orderBy(asc(practicalInfos.position), asc(practicalInfos.createdAt));
}

export async function createInfo(db: DB, input: InfoInput) {
  const [last] = await db.select({ p: max(practicalInfos.position) }).from(practicalInfos);
  const [row] = await db.insert(practicalInfos).values({ ...input, position: (last?.p ?? -1) + 1 }).returning();
  return row;
}

export async function updateInfo(db: DB, id: string, input: InfoInput) {
  const [row] = await db.update(practicalInfos).set(input).where(eq(practicalInfos.id, id)).returning();
  if (!row) throw new OrgaError("Info introuvable.");
  return row;
}

export async function deleteInfo(db: DB, id: string) {
  await db.delete(practicalInfos).where(eq(practicalInfos.id, id));
}
