import { defineConfig } from "drizzle-kit";

// Avec DATABASE_URL (Neon) : Postgres distant. Sans : PGlite local dans .data/pglite.
const url = process.env.DATABASE_URL;

export default url
  ? defineConfig({ dialect: "postgresql", schema: "./src/db/schema/index.ts", out: "./drizzle", dbCredentials: { url } })
  : defineConfig({ dialect: "postgresql", driver: "pglite", schema: "./src/db/schema/index.ts", out: "./drizzle", dbCredentials: { url: "./.data/pglite" } });
