/**
 * Schéma des statistiques de fréquentation (réservées aux admins, jamais mentionnées aux membres).
 *
 * - visits      : une « connexion » = une visite ; une nouvelle visite commence après 30 min sans activité.
 *                 `participant_id` = membre identifié (cookie signé), nul pour un visiteur anonyme (sans prénom).
 *                 Les anonymes ne sont reconnus que le temps d'une visite (cookie httpOnly aléatoire = id de la visite).
 *                 Aucune IP ni user-agent stocké.
 * - page_views  : pages vues d'une visite (chemin normalisé, section, `ref_id` = sujet d'orga ou ville).
 *
 * La navigation dans /admin n'est jamais enregistrée.
 */
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { participants } from "./orga";

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantId: uuid("participant_id").references(() => participants.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    pageCount: integer("page_count").notNull().default(0),
  },
  (t) => [index("visits_participant_idx").on(t.participantId, t.lastSeenAt), index("visits_last_seen_idx").on(t.lastSeenAt)],
);

export const pageViews = pgTable(
  "page_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id").notNull().references(() => visits.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => participants.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    section: text("section").notNull(),
    /** Sujet d'orga (`sujet`) ou ville (`ville`) consulté ; pas de clé étrangère : la cible peut être supprimée. */
    refId: uuid("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("page_views_created_idx").on(t.createdAt),
    index("page_views_participant_idx").on(t.participantId),
    index("page_views_visit_idx").on(t.visitId),
  ],
);

export type Visit = typeof visits.$inferSelect;
export type PageView = typeof pageViews.$inferSelect;
