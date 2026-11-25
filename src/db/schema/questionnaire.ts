/**
 * Schéma du module « questionnaire — profil de Val ».
 *
 * - questionnaire_versions       : versions publiées du questionnaire (définition complète en JSON).
 * - questionnaire_participations : une ligne par participation (brouillon puis réponse envoyée).
 *     `id` = empreinte SHA-256 du jeton de reprise gardé dans un cookie httpOnly : le jeton lui-même n'est jamais stocké.
 *     `knowledge` = niveau de connaissance attribué par un organisateur (jamais exposé au public).
 *     La suppression est une « pierre tombale » (deleted) : elle empêche toute reprise avec l'ancien jeton.
 * - questionnaire_organizer      : avis privé (facultatif) de l'organisateur, une seule ligne.
 */
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type StoredAnswers = Record<string, { choices: string[]; comment: string }>;

export const questionnaireVersions = pgTable("questionnaire_versions", {
  version: integer("version").primaryKey(),
  definition: jsonb("definition").notNull().$type<unknown[]>(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionnaireParticipations = pgTable("questionnaire_participations", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  name: text("name").notNull().default(""),
  step: integer("step").notNull().default(0),
  answers: jsonb("answers").notNull().$type<StoredAnswers>().default({}),
  revision: integer("revision").notNull().default(1),
  knowledge: text("knowledge"), // 'barely' | 'well' | 'very' | null (non classé)
  excluded: boolean("excluded").notNull().default(false),
  deleted: boolean("deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const questionnaireOrganizer = pgTable("questionnaire_organizer", {
  id: integer("id").primaryKey().default(1),
  version: integer("version").notNull(),
  name: text("name").notNull().default("Organisateur"),
  step: integer("step").notNull().default(0),
  answers: jsonb("answers").notNull().$type<StoredAnswers>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
