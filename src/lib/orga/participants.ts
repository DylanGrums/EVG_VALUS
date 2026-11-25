/** Participants du groupe : liste des prénoms gérée par les organisateurs. */
import { and, asc, count, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { optionVotes, orgaComments, participants, topicOptions } from "@/db/schema";
import { OrgaError } from "./errors";
import { participantNameSchema } from "./validation";

function parseName(name: string) {
  const parsed = participantNameSchema.safeParse(name);
  if (!parsed.success) throw new OrgaError(parsed.error.issues[0]?.message ?? "Prénom invalide");
  return parsed.data;
}

async function assertNameFree(db: DB, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.active, true), sql`lower(${participants.name}) = lower(${name})`));
  if (rows.some((r) => r.id !== exceptId)) throw new OrgaError(`« ${name} » est déjà dans la liste.`);
}

/** Participants triés par prénom (actifs seulement par défaut). */
export async function listParticipants(db: DB, { includeInactive = false } = {}) {
  const rows = await db
    .select()
    .from(participants)
    .where(includeInactive ? undefined : eq(participants.active, true))
    .orderBy(asc(sql`lower(${participants.name})`));
  return rows;
}

export async function countActiveParticipants(db: DB) {
  const [row] = await db.select({ n: count() }).from(participants).where(eq(participants.active, true));
  return row?.n ?? 0;
}

/** Participant actif ou null (sert à valider la session membre). */
export async function getActiveParticipant(db: DB, id: string | undefined | null) {
  if (!id) return null;
  const [row] = await db.select().from(participants).where(and(eq(participants.id, id), eq(participants.active, true)));
  return row ?? null;
}

export async function addParticipant(db: DB, name: string) {
  const clean = parseName(name);
  await assertNameFree(db, clean);
  // Si la personne avait été retirée, on la réactive plutôt que de créer un doublon.
  const [former] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.active, false), sql`lower(${participants.name}) = lower(${clean})`));
  if (former) {
    const [row] = await db.update(participants).set({ active: true, name: clean }).where(eq(participants.id, former.id)).returning();
    return row;
  }
  const [row] = await db.insert(participants).values({ name: clean }).returning();
  return row;
}

/** Le prénom est déjà pris par un participant actif (inscription par la personne elle-même). */
export class NameTakenError extends OrgaError {
  constructor(name: string) {
    super(`« ${name} » est déjà inscrit. Si c’est toi, choisis « J’ai déjà renseigné mon prénom ». Sinon, ajoute l’initiale de ton nom (ex. « ${name} B. »).`);
    this.name = "NameTakenError";
  }
}

/**
 * Inscription d'un membre par lui-même au premier passage sur le lien secret.
 * Contrairement à addParticipant (admin), on ne réactive jamais une personne retirée par les orgas :
 * on crée une nouvelle fiche. Un prénom déjà actif est refusé (NameTakenError).
 */
export async function registerSelf(db: DB, name: string) {
  const clean = parseName(name);
  const [taken] = await db
    .select({ name: participants.name })
    .from(participants)
    .where(and(eq(participants.active, true), sql`lower(${participants.name}) = lower(${clean})`));
  if (taken) throw new NameTakenError(taken.name);
  const [row] = await db.insert(participants).values({ name: clean }).returning();
  return row;
}

export async function renameParticipant(db: DB, id: string, name: string) {
  const clean = parseName(name);
  await assertNameFree(db, clean, id);
  const [row] = await db.update(participants).set({ name: clean }).where(eq(participants.id, id)).returning();
  if (!row) throw new OrgaError("Participant introuvable.");
  return row;
}

/** A-t-il déjà laissé une trace (vote, commentaire, proposition) ? */
async function hasActivity(db: DB, id: string) {
  const [votes] = await db.select({ n: count() }).from(optionVotes).where(eq(optionVotes.participantId, id));
  const [comments] = await db.select({ n: count() }).from(orgaComments).where(eq(orgaComments.authorId, id));
  const [options] = await db.select({ n: count() }).from(topicOptions).where(eq(topicOptions.proposedById, id));
  return (votes?.n ?? 0) + (comments?.n ?? 0) + (options?.n ?? 0) > 0;
}

/**
 * Retire un participant. Retrait doux (désactivation, votes et commentaires conservés) s'il a déjà participé,
 * suppression définitive sinon. Renvoie le mode appliqué.
 */
export async function removeParticipant(db: DB, id: string): Promise<"desactive" | "supprime"> {
  if (await hasActivity(db, id)) {
    const rows = await db.update(participants).set({ active: false }).where(eq(participants.id, id)).returning({ id: participants.id });
    if (!rows.length) throw new OrgaError("Participant introuvable.");
    return "desactive";
  }
  const rows = await db.delete(participants).where(eq(participants.id, id)).returning({ id: participants.id });
  if (!rows.length) throw new OrgaError("Participant introuvable.");
  return "supprime";
}

export async function restoreParticipant(db: DB, id: string) {
  const [p] = await db.select().from(participants).where(eq(participants.id, id));
  if (!p) throw new OrgaError("Participant introuvable.");
  await assertNameFree(db, p.name, id);
  await db.update(participants).set({ active: true }).where(eq(participants.id, id));
}
