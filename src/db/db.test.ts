import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/db";

test("la base de test PGlite démarre", async () => {
  const db = await createTestDb();
  const result = (await db.execute(sql`select 1 as ok`)) as unknown as { rows: unknown[] };
  expect(result.rows[0]).toEqual({ ok: 1 });
});
