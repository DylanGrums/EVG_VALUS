/**
 * Schéma du module « Idées » : villes et événements à explorer en amont de l'orga.
 *
 * - idea_cities       : villes candidates (importées par l'admin ou proposées par un membre).
 *     `key` = nom + pays normalisés : sert à reconnaître une ville lors d'un réimport (idempotence).
 *     `retained` = retenue par les orgas (affichée en tête côté membres).
 * - idea_events       : événements/activités d'une ville. `key` = nom normalisé, unique par ville.
 * - idea_city_votes   : un 👍 par participant et par ville (on peut soutenir plusieurs villes).
 * - idea_event_votes  : un 👍 par participant et par événement.
 * - idea_comments     : commentaires sur une ville (event_id nul) ou sur un de ses événements.
 *
 * Les valeurs énumérées sont stockées en texte (typées côté TS) pour évoluer sans migration d'enum.
 */
import { boolean, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { participants } from "./orga";

export const IDEA_SOURCES = ["import", "membre"] as const;
export type IdeaSource = (typeof IDEA_SOURCES)[number];

export const IDEA_CATEGORIES = ["fete", "culture", "sport", "gastronomie", "nature", "soiree", "autre"] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const ideaCities = pgTable(
  "idea_cities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    country: text("country").notNull(),
    summary: text("summary").notNull().default(""),
    why: text("why").notNull().default(""),
    access: text("access"),
    budget: text("budget"),
    url: text("url"),
    source: text("source").$type<IdeaSource>().notNull().default("import"),
    createdById: uuid("created_by").references(() => participants.id, { onDelete: "set null" }),
    hidden: boolean("hidden").notNull().default(false),
    retained: boolean("retained").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("idea_cities_key_idx").on(t.key)],
);

export const ideaEvents = pgTable(
  "idea_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cityId: uuid("city_id").notNull().references(() => ideaCities.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<IdeaCategory>().notNull().default("autre"),
    description: text("description").notNull().default(""),
    why: text("why").notNull().default(""),
    startsOn: date("starts_on", { mode: "string" }),
    endsOn: date("ends_on", { mode: "string" }),
    datesText: text("dates_text"),
    priceText: text("price_text"),
    /** Prix minimum indicatif en centimes d'euro. */
    priceMinCents: integer("price_min_cents"),
    url: text("url"),
    address: text("address"),
    source: text("source").$type<IdeaSource>().notNull().default("import"),
    createdById: uuid("created_by").references(() => participants.id, { onDelete: "set null" }),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("idea_events_city_key_idx").on(t.cityId, t.key)],
);

export const ideaCityVotes = pgTable(
  "idea_city_votes",
  {
    cityId: uuid("city_id").notNull().references(() => ideaCities.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.cityId, t.participantId] }), index("idea_city_votes_participant_idx").on(t.participantId)],
);

export const ideaEventVotes = pgTable(
  "idea_event_votes",
  {
    eventId: uuid("event_id").notNull().references(() => ideaEvents.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.participantId] }), index("idea_event_votes_participant_idx").on(t.participantId)],
);

export const ideaComments = pgTable(
  "idea_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cityId: uuid("city_id").notNull().references(() => ideaCities.id, { onDelete: "cascade" }),
    /** Nul = commentaire sur la ville elle-même. */
    eventId: uuid("event_id").references(() => ideaEvents.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => participants.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("idea_comments_city_idx").on(t.cityId)],
);

export type IdeaCity = typeof ideaCities.$inferSelect;
export type IdeaEvent = typeof ideaEvents.$inferSelect;
export type IdeaComment = typeof ideaComments.$inferSelect;
