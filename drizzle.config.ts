import { defineConfig } from "drizzle-kit";

// Avec DATABASE_URL (Neon) : Postgres distant. Sans : PGlite local dans .data/pglite.
const url = process.env.DATABASE_URL;

// Sur Vercel, sans base Neon connectée, on échoue tout de suite avec un message clair
// (sinon le build passerait et le site planterait en ligne).
if (process.env.VERCEL) {
  const missing = ["DATABASE_URL", "SESSION_SECRET", "ADMIN_PASSWORD"].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Variables manquantes sur Vercel : ${missing.join(", ")}. ` +
        "DATABASE_URL vient de Storage → Neon ; les autres se créent dans Settings → Environment Variables. Puis redéploie.",
    );
  }
}

export default url
  ? defineConfig({ dialect: "postgresql", schema: "./src/db/schema/index.ts", out: "./drizzle", dbCredentials: { url } })
  : defineConfig({ dialect: "postgresql", driver: "pglite", schema: "./src/db/schema/index.ts", out: "./drizzle", dbCredentials: { url: "./.data/pglite" } });
