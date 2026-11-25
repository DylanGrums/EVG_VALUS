/**
 * Schéma du module « organisation de l'EVG ».
 *
 * - participants        : prénoms du groupe (retrait doux via `active`).
 * - decision_topics     : sujets de décision (destination, logement, activités, transport, autre).
 * - topic_options       : propositions d'un sujet (lien, prix, adresse, horaires…), `selected` = retenue.
 * - option_votes        : un vote par participant et par option.
 * - orga_comments       : commentaires sur un sujet (option_id nul) ou sur une option.
 * - practical_infos     : infos pratiques libres du carnet sur place.
 *
 * Les valeurs énumérées sont stockées en texte (typées côté TS) pour pouvoir évoluer sans migration d'enum.
 * Les dates/heures sont des `timestamp` sans fuseau : heure locale du lieu de l'EVG, telle que saisie.
 */
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

export const TOPIC_TYPES = ["destination", "logement", "activites", "transport", "autre"] as const;
export type TopicType = (typeof TOPIC_TYPES)[number];

export const TOPIC_STATUSES = ["brouillon", "ouvert", "clos", "decide"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const VOTE_MODES = ["unique", "multiple"] as const;
export type VoteMode = (typeof VOTE_MODES)[number];

export const INFO_CATEGORIES = ["contact", "logement", "transport", "resto", "sante", "argent", "autre"] as const;
export type InfoCategory = (typeof INFO_CATEGORIES)[number];

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
/** Date/heure locale (sans fuseau), renvoyée en chaîne « YYYY-MM-DD HH:mm:ss ». */
const localDateTime = (name: string) => timestamp(name, { mode: "string" });

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const decisionTopics = pgTable(
  "decision_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<TopicType>().notNull().default("autre"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<TopicStatus>().notNull().default("brouillon"),
    voteMode: text("vote_mode").$type<VoteMode>().notNull().default("unique"),
    deadline: localDateTime("deadline"),
    dependsOnId: uuid("depends_on_id").references((): AnyPgColumn => decisionTopics.id, { onDelete: "set null" }),
    allowProposals: boolean("allow_proposals").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decision_topics_position_idx").on(t.position)],
);

export const topicOptions = pgTable(
  "topic_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id").notNull().references(() => decisionTopics.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    url: text("url"),
    imageUrl: text("image_url"),
    address: text("address"),
    /** Prix total en centimes (ex. location complète). */
    priceTotalCents: integer("price_total_cents"),
    /** Prix par personne saisi directement, prioritaire sur le calcul depuis le total. */
    pricePerPersonCents: integer("price_per_person_cents"),
    /** Début (check-in, départ, début d'activité…) et fin (check-out, arrivée…). */
    startsAt: localDateTime("starts_at"),
    endsAt: localDateTime("ends_at"),
    /** Horaires d'ouverture/fermeture en texte libre (« 10h-19h, fermé le lundi »). */
    openingHours: text("opening_hours"),
    /** Infos pratiques libres (code d'accès, consignes, qui a réservé…). */
    practicalNotes: text("practical_notes"),
    proposedById: uuid("proposed_by_id").references(() => participants.id, { onDelete: "set null" }),
    proposedByOrga: boolean("proposed_by_orga").notNull().default(false),
    selected: boolean("selected").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("topic_options_topic_idx").on(t.topicId)],
);

export const optionVotes = pgTable(
  "option_votes",
  {
    optionId: uuid("option_id").notNull().references(() => topicOptions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.optionId, t.participantId] }), index("option_votes_participant_idx").on(t.participantId)],
);

export const orgaComments = pgTable(
  "orga_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id").notNull().references(() => decisionTopics.id, { onDelete: "cascade" }),
    /** Nul = commentaire sur le sujet lui-même. */
    optionId: uuid("option_id").references(() => topicOptions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => participants.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("orga_comments_topic_idx").on(t.topicId)],
);

export const practicalInfos = pgTable("practical_infos", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: text("category").$type<InfoCategory>().notNull().default("autre"),
  body: text("body").notNull().default(""),
  address: text("address"),
  url: text("url"),
  phone: text("phone"),
  at: localDateTime("at"),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

export type Participant = typeof participants.$inferSelect;
export type DecisionTopic = typeof decisionTopics.$inferSelect;
export type TopicOption = typeof topicOptions.$inferSelect;
export type OptionVote = typeof optionVotes.$inferSelect;
export type OrgaComment = typeof orgaComments.$inferSelect;
export type PracticalInfo = typeof practicalInfos.$inferSelect;
