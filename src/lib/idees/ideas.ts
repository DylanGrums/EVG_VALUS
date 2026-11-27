/**
 * Villes et événements du module Idées : lecture, votes (👍 multiples), propositions des membres,
 * commentaires et gestion admin. Toutes les fonctions prennent `db` pour rester testables.
 * L'identité (participantId) est fournie par l'appelant depuis la session signée, jamais depuis un formulaire.
 */
import { and, asc, count, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { DB } from "@/db";
import { ideaCities, ideaCityVotes, ideaComments, ideaEventVotes, ideaEvents, participants, type IdeaCity, type IdeaEvent } from "@/db/schema";
import { OrgaError } from "@/lib/orga/errors";
import { getActiveParticipant } from "@/lib/orga/participants";
import { cityKey, eventKey } from "./common";
import type { CityInput, EventInput } from "./validation";

export type Voter = { id: string; name: string };
export type IdeaCommentView = { id: string; eventId: string | null; body: string; createdAt: Date; authorName: string | null };

async function requireActive(db: DB, participantId: string) {
  const participant = await getActiveParticipant(db, participantId);
  if (!participant) throw new OrgaError("Choisis d'abord ton prénom.");
  return participant;
}

export async function getCity(db: DB, id: string) {
  const [row] = await db.select().from(ideaCities).where(eq(ideaCities.id, id));
  return row ?? null;
}

export async function getEvent(db: DB, id: string) {
  const [row] = await db.select().from(ideaEvents).where(eq(ideaEvents.id, id));
  return row ?? null;
}

/** Ville visible des membres (existe et non masquée), sinon erreur. */
async function visibleCity(db: DB, id: string) {
  const city = await getCity(db, id);
  if (!city || city.hidden) throw new OrgaError("Ville introuvable.");
  return city;
}

async function visibleEvent(db: DB, id: string) {
  const event = await getEvent(db, id);
  if (!event || event.hidden) throw new OrgaError("Événement introuvable.");
  await visibleCity(db, event.cityId);
  return event;
}

// --- Liste ---

export type CitySummary = IdeaCity & {
  eventCount: number;
  voteCount: number;
  commentCount: number;
  voted: boolean;
  proposedByName: string | null;
};

/** Villes avec compteurs. Membres : villes et événements masqués exclus. */
export async function listCitySummaries(db: DB, { participantId = null as string | null, forAdmin = false } = {}): Promise<CitySummary[]> {
  const [cities, events, votes, comments, people] = await Promise.all([
    db.select().from(ideaCities).where(forAdmin ? undefined : eq(ideaCities.hidden, false)).orderBy(asc(ideaCities.name)),
    db
      .select({ cityId: ideaEvents.cityId, n: count() })
      .from(ideaEvents)
      .where(forAdmin ? undefined : eq(ideaEvents.hidden, false))
      .groupBy(ideaEvents.cityId),
    db.select({ cityId: ideaCityVotes.cityId, participantId: ideaCityVotes.participantId }).from(ideaCityVotes),
    db
      .select({ cityId: ideaComments.cityId, n: count() })
      .from(ideaComments)
      .leftJoin(ideaEvents, eq(ideaComments.eventId, ideaEvents.id))
      .where(forAdmin ? undefined : orNullEventVisible())
      .groupBy(ideaComments.cityId),
    db.select({ id: participants.id, name: participants.name }).from(participants),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const eventCounts = new Map(events.map((e) => [e.cityId, e.n]));
  const commentCounts = new Map(comments.map((c) => [c.cityId, c.n]));
  return cities.map((city) => {
    const cityVotes = votes.filter((v) => v.cityId === city.id);
    return {
      ...city,
      eventCount: eventCounts.get(city.id) ?? 0,
      voteCount: cityVotes.length,
      commentCount: commentCounts.get(city.id) ?? 0,
      voted: participantId !== null && cityVotes.some((v) => v.participantId === participantId),
      proposedByName: city.createdById ? (names.get(city.createdById) ?? null) : null,
    };
  });
}

/** Commentaire de ville, ou commentaire d'un événement non masqué. */
function orNullEventVisible() {
  return or(isNull(ideaComments.eventId), eq(ideaEvents.hidden, false));
}

export type CitySort = "votes" | "evenements" | "nom";
export const CITY_SORTS: Record<CitySort, string> = { votes: "Plus de 👍", evenements: "Plus d’événements", nom: "Nom" };

/** Tri des cartes : villes retenues d'abord, puis le critère choisi. Filtre texte sur nom, pays, résumé. */
export function sortAndFilterCities(cities: CitySummary[], sort: CitySort, query: string, normalize: (v: string) => string) {
  const q = normalize(query.trim());
  const filtered = q ? cities.filter((c) => normalize([c.name, c.country, c.summary, c.why].join(" ")).includes(q)) : cities;
  const byName = (a: CitySummary, b: CitySummary) => a.name.localeCompare(b.name, "fr");
  const compare: Record<CitySort, (a: CitySummary, b: CitySummary) => number> = {
    votes: (a, b) => b.voteCount - a.voteCount || b.eventCount - a.eventCount || byName(a, b),
    evenements: (a, b) => b.eventCount - a.eventCount || b.voteCount - a.voteCount || byName(a, b),
    nom: byName,
  };
  return [...filtered].sort((a, b) => Number(b.retained) - Number(a.retained) || compare[sort](a, b));
}

// --- Détail d'une ville ---

export type EventView = IdeaEvent & { voters: Voter[]; voted: boolean; comments: IdeaCommentView[]; proposedByName: string | null };
export type CityView = {
  city: IdeaCity;
  proposedByName: string | null;
  voters: Voter[];
  voted: boolean;
  events: EventView[];
  comments: IdeaCommentView[];
};

export async function loadCityView(db: DB, cityId: string, participantId: string | null, { forAdmin = false } = {}): Promise<CityView | null> {
  const city = await getCity(db, cityId);
  if (!city || (city.hidden && !forAdmin)) return null;
  const [events, people] = await Promise.all([
    db
      .select()
      .from(ideaEvents)
      .where(forAdmin ? eq(ideaEvents.cityId, cityId) : and(eq(ideaEvents.cityId, cityId), eq(ideaEvents.hidden, false)))
      .orderBy(asc(ideaEvents.name)),
    db.select({ id: participants.id, name: participants.name }).from(participants),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const eventIds = events.map((e) => e.id);
  const [cityVotes, eventVotes, comments] = await Promise.all([
    db.select().from(ideaCityVotes).where(eq(ideaCityVotes.cityId, cityId)).orderBy(asc(ideaCityVotes.createdAt)),
    eventIds.length ? db.select().from(ideaEventVotes).where(inArray(ideaEventVotes.eventId, eventIds)).orderBy(asc(ideaEventVotes.createdAt)) : Promise.resolve([]),
    db.select().from(ideaComments).where(eq(ideaComments.cityId, cityId)).orderBy(asc(ideaComments.createdAt)),
  ]);
  const voter = (id: string): Voter => ({ id, name: names.get(id) ?? "?" });
  const commentView = (c: (typeof comments)[number]): IdeaCommentView => ({
    id: c.id,
    eventId: c.eventId,
    body: c.body,
    createdAt: c.createdAt,
    authorName: c.authorId ? (names.get(c.authorId) ?? null) : null,
  });
  const visibleIds = new Set(eventIds);
  return {
    city,
    proposedByName: city.createdById ? (names.get(city.createdById) ?? null) : null,
    voters: cityVotes.map((v) => voter(v.participantId)),
    voted: participantId !== null && cityVotes.some((v) => v.participantId === participantId),
    comments: comments.filter((c) => c.eventId === null).map(commentView),
    events: events.map((event) => {
      const votes = eventVotes.filter((v) => v.eventId === event.id);
      return {
        ...event,
        voters: votes.map((v) => voter(v.participantId)),
        voted: participantId !== null && votes.some((v) => v.participantId === participantId),
        comments: comments.filter((c) => c.eventId === event.id && visibleIds.has(event.id)).map(commentView),
        proposedByName: event.createdById ? (names.get(event.createdById) ?? null) : null,
      };
    }),
  };
}

export type EventSort = "votes" | "date";
/** Événements triés par 👍 (puis date) ou par date (sans date en dernier), filtrés par catégorie. */
export function sortEvents(events: EventView[], sort: EventSort, category: string | null) {
  const list = category ? events.filter((e) => e.category === category) : events;
  const date = (e: EventView) => e.startsOn ?? "9999-12-31";
  return [...list].sort((a, b) =>
    sort === "date"
      ? date(a).localeCompare(date(b)) || b.voters.length - a.voters.length
      : b.voters.length - a.voters.length || date(a).localeCompare(date(b)) || a.name.localeCompare(b.name, "fr"),
  );
}

// --- Votes (👍 multiples : chaque ville / événement indépendamment) ---

/** Ajoute ou retire le 👍 du participant sur une ville. Renvoie true si le participant soutient désormais la ville. */
export async function toggleCityVote(db: DB, participantId: string, cityId: string) {
  await requireActive(db, participantId);
  await visibleCity(db, cityId);
  const where = and(eq(ideaCityVotes.cityId, cityId), eq(ideaCityVotes.participantId, participantId));
  const removed = await db.delete(ideaCityVotes).where(where).returning({ cityId: ideaCityVotes.cityId });
  if (removed.length) return false;
  await db.insert(ideaCityVotes).values({ cityId, participantId }).onConflictDoNothing();
  return true;
}

export async function toggleEventVote(db: DB, participantId: string, eventId: string) {
  await requireActive(db, participantId);
  await visibleEvent(db, eventId);
  const where = and(eq(ideaEventVotes.eventId, eventId), eq(ideaEventVotes.participantId, participantId));
  const removed = await db.delete(ideaEventVotes).where(where).returning({ eventId: ideaEventVotes.eventId });
  if (removed.length) return false;
  await db.insert(ideaEventVotes).values({ eventId, participantId }).onConflictDoNothing();
  return true;
}

// --- Propositions des membres ---

async function assertCityKeyFree(db: DB, key: string, exceptId?: string) {
  const [row] = await db
    .select({ id: ideaCities.id, name: ideaCities.name })
    .from(ideaCities)
    .where(exceptId ? and(eq(ideaCities.key, key), ne(ideaCities.id, exceptId)) : eq(ideaCities.key, key));
  if (row) throw new OrgaError(`« ${row.name} » est déjà dans la liste des idées.`);
}

async function assertEventKeyFree(db: DB, cityId: string, key: string, exceptId?: string) {
  const conditions = [eq(ideaEvents.cityId, cityId), eq(ideaEvents.key, key)];
  if (exceptId) conditions.push(ne(ideaEvents.id, exceptId));
  const [row] = await db.select({ name: ideaEvents.name }).from(ideaEvents).where(and(...conditions));
  if (row) throw new OrgaError(`« ${row.name} » est déjà proposé pour cette ville.`);
}

/** Un membre propose une ville : marquée « proposée par » lui. */
export async function proposeCity(db: DB, participantId: string, input: CityInput, now = new Date()) {
  await requireActive(db, participantId);
  const key = cityKey(input.name, input.country);
  await assertCityKeyFree(db, key);
  const [row] = await db
    .insert(ideaCities)
    .values({ ...input, key, source: "membre", createdById: participantId, createdAt: now, updatedAt: now })
    .returning();
  return row;
}

export async function proposeEvent(db: DB, participantId: string, cityId: string, input: EventInput, now = new Date()) {
  await requireActive(db, participantId);
  await visibleCity(db, cityId);
  const key = eventKey(input.name);
  await assertEventKeyFree(db, cityId, key);
  const [row] = await db
    .insert(ideaEvents)
    .values({ ...input, cityId, key, source: "membre", createdById: participantId, createdAt: now, updatedAt: now })
    .returning();
  return row;
}

// --- Commentaires ---

export async function addIdeaComment(db: DB, participantId: string, cityId: string, eventId: string | null, body: string, now = new Date()) {
  await requireActive(db, participantId);
  await visibleCity(db, cityId);
  if (eventId) {
    const event = await visibleEvent(db, eventId);
    if (event.cityId !== cityId) throw new OrgaError("Événement introuvable.");
  }
  const [row] = await db.insert(ideaComments).values({ cityId, eventId, authorId: participantId, body, createdAt: now }).returning();
  return row;
}

export async function deleteIdeaComment(db: DB, id: string) {
  await db.delete(ideaComments).where(eq(ideaComments.id, id));
}

// --- Admin ---

export async function updateCity(db: DB, id: string, input: CityInput, now = new Date()) {
  const key = cityKey(input.name, input.country);
  await assertCityKeyFree(db, key, id);
  await db.update(ideaCities).set({ ...input, key, updatedAt: now }).where(eq(ideaCities.id, id));
}

export async function setCityHidden(db: DB, id: string, hidden: boolean) {
  await db.update(ideaCities).set({ hidden }).where(eq(ideaCities.id, id));
}

/** « Retenir cette ville » : affichée en tête côté membres avec un badge. */
export async function setCityRetained(db: DB, id: string, retained: boolean) {
  await db.update(ideaCities).set({ retained }).where(eq(ideaCities.id, id));
}

export async function deleteCity(db: DB, id: string) {
  await db.delete(ideaCities).where(eq(ideaCities.id, id));
}

export async function updateEvent(db: DB, id: string, input: EventInput, now = new Date()) {
  const event = await getEvent(db, id);
  if (!event) throw new OrgaError("Événement introuvable.");
  const key = eventKey(input.name);
  await assertEventKeyFree(db, event.cityId, key, id);
  await db.update(ideaEvents).set({ ...input, key, updatedAt: now }).where(eq(ideaEvents.id, id));
}

export async function setEventHidden(db: DB, id: string, hidden: boolean) {
  await db.update(ideaEvents).set({ hidden }).where(eq(ideaEvents.id, id));
}

export async function deleteEvent(db: DB, id: string) {
  await db.delete(ideaEvents).where(eq(ideaEvents.id, id));
}
