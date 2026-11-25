import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

/**
 * Base de données :
 * - DATABASE_URL défini → Postgres Neon (driver WebSocket, transactions supportées).
 *   Le schéma y est appliqué par les migrations versionnées (drizzle/), lancées par `vercel-build`.
 * - sinon → PGlite (Postgres embarqué) persisté dans .data/pglite, migrations de drizzle/ appliquées au démarrage.
 * Les tests utilisent createTestDb() : PGlite en mémoire, mêmes migrations.
 * Après une modification de src/db/schema : `npm run db:generate` (sinon le dev et les tests ne voient pas le changement).
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __evgDb?: Promise<DB> };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function applyMigrations(db: DB) {
  await migrate(db as never, { migrationsFolder: MIGRATIONS });
}

async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    neonConfig.webSocketConstructor = WebSocket;
    return drizzleNeon({ client: new Pool({ connectionString: url }), schema }) as unknown as DB;
  }
  const dir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const db = drizzlePglite({ client: new PGlite(dir), schema }) as unknown as DB;
  await applyMigrations(db);
  return db;
}

/** Instance partagée (survit au hot reload en dev). */
export function getDb(): Promise<DB> {
  globalForDb.__evgDb ??= createDb().catch((error) => {
    globalForDb.__evgDb = undefined;
    throw error;
  });
  return globalForDb.__evgDb;
}

/** Base PGlite en mémoire, migrée, pour les tests. */
export async function createTestDb(): Promise<DB> {
  const db = drizzlePglite({ client: new PGlite(), schema }) as unknown as DB;
  await applyMigrations(db);
  return db;
}

export { schema };
