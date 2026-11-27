/** Accès base de données du questionnaire. Toutes les fonctions prennent `db` pour rester testables. */
import { and, asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { questionnaireOrganizer, questionnaireParticipations as parts, questionnaireVersions } from "@/db/schema/questionnaire";
import { participants } from "@/db/schema/orga";
import { normalize } from "./format";
import { activeDefinition, cleanDefinition, exclusiveKeys, matrixLabels, optionsFor } from "./definition";
import { seedQuestions } from "./seed";
import { cleanDraft } from "./validation";
import {
  isKnowledge,
  reactions,
  themes,
  type AdminData,
  type Draft,
  type KnowledgeLevel,
  type OrganizerEntry,
  type Question,
  type QuestionnaireVersion,
  type ResponseEntry,
  type SaveResult,
} from "./types";

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

// --- Versions ---

/** Liste des versions ; insère la version 1 (publiée) à la toute première utilisation. */
export async function listVersions(db: DB): Promise<QuestionnaireVersion[]> {
  let rows = await db.select().from(questionnaireVersions).orderBy(asc(questionnaireVersions.version));
  if (!rows.length) {
    await db.insert(questionnaireVersions).values({ version: 1, definition: seedQuestions }).onConflictDoNothing();
    rows = await db.select().from(questionnaireVersions).orderBy(asc(questionnaireVersions.version));
  }
  return rows.map((row) => ({ version: row.version, questions: row.definition as Question[], publishedAt: iso(row.publishedAt) }));
}

/** Publie une nouvelle version à partir de la saisie de l'éditeur (verrou optimiste sur le numéro de version). */
export async function publishVersion(
  db: DB,
  expectedVersion: number,
  input: unknown,
): Promise<{ ok: true; version: number } | { ok: false; code: "conflict" | "invalid"; message: string }> {
  const latest = (await listVersions(db)).at(-1)!;
  if (expectedVersion !== latest.version) {
    return { ok: false, code: "conflict", message: "Le questionnaire a évolué. Recharge la page avant de publier." };
  }
  const definition = cleanDefinition(input, latest.questions);
  if (!definition) {
    return { ok: false, code: "invalid", message: "Vérifie les questions, leurs choix et la visibilité d’au moins une question." };
  }
  const version = latest.version + 1;
  const inserted = await db.insert(questionnaireVersions).values({ version, definition }).onConflictDoNothing().returning({ version: questionnaireVersions.version });
  if (!inserted.length) return { ok: false, code: "conflict", message: "Une autre version vient d’être publiée. Recharge la page." };
  return { ok: true, version };
}

// --- Public : état et enregistrement d'une participation ---

/** Question prête pour l'affichage public (aucune donnée d'analyse). */
export type PublicQuestion = {
  id: string;
  themeLabel: string;
  title: string;
  prompt: string;
  hint: string;
  optional: boolean;
  matrix: boolean;
  /** Choix ordinaires (hors matrice). */
  choices: [string, string][];
  /** Options exclusives (Peu importe, Aucune, Je ne sais pas). */
  exclusive: [string, string][];
  /** Matrice : activités (une réponse par ligne) et réactions possibles. */
  rows: string[];
  reactions: string[];
};

export function toPublicQuestions(definition: QuestionnaireVersion): PublicQuestion[] {
  return definition.questions
    .filter((q) => !q.hidden)
    .map((q) => {
      const available = optionsFor(q);
      const exclusive = exclusiveKeys(q);
      const matrix = q.kind === "matrix";
      return {
        id: String(q.id),
        themeLabel: themes[q.theme],
        title: q.title,
        prompt: q.prompt,
        hint: q.hint,
        optional: Boolean(q.optional),
        matrix,
        choices: matrix ? [] : Object.entries(available).filter(([key]) => !exclusive.includes(key)),
        exclusive: Object.entries(available).filter(([key]) => exclusive.includes(key)),
        rows: matrix ? matrixLabels(q) : [],
        reactions: matrix ? [...reactions] : [],
      };
    });
}

export type PublicState = {
  version: number;
  questions: PublicQuestion[];
  draft: Draft | null;
  revision: number;
  submitted: boolean;
};

/** Ce que voit un répondant : jamais de niveau de connaissance, d'exclusion ni de donnée d'un autre. */
export async function loadPublicState(db: DB, id: string | null): Promise<PublicState> {
  const versions = await listVersions(db);
  const latest = versions.at(-1)!;
  const [row] = id
    ? await db
        .select({ version: parts.version, name: parts.name, step: parts.step, answers: parts.answers, revision: parts.revision, submittedAt: parts.submittedAt, deleted: parts.deleted })
        .from(parts)
        .where(eq(parts.id, id))
    : [];
  if (!row || row.deleted) {
    return { version: latest.version, questions: toPublicQuestions(latest), draft: null, revision: 0, submitted: false };
  }
  const definition = versions.find((v) => v.version === row.version) ?? latest;
  return {
    version: definition.version,
    questions: toPublicQuestions(definition),
    draft: row.submittedAt ? null : { version: row.version, name: row.name, step: row.step, answers: row.answers },
    revision: row.revision,
    submitted: Boolean(row.submittedAt),
  };
}

export async function isDeleted(db: DB, id: string): Promise<boolean> {
  const [row] = await db.select({ deleted: parts.deleted }).from(parts).where(eq(parts.id, id));
  return Boolean(row?.deleted);
}

const invalid = (message = "Vérifie les réponses et le prénom."): SaveResult => ({ ok: false, code: "invalid", message });
const conflict = (message: string): SaveResult => ({ ok: false, code: "conflict", message });

/**
 * Enregistre un brouillon (submit = false) ou l'envoi final (submit = true).
 * Verrou optimiste par `revision` ; l'envoi est idempotent (renvoi tardif = succès).
 */
export async function saveParticipation(
  db: DB,
  id: string,
  input: { draft: unknown; revision: number; submit: boolean; owner?: ParticipationOwner },
): Promise<SaveResult> {
  if (!Number.isInteger(input.revision) || input.revision < 0) return invalid();
  const [row] = await db.select().from(parts).where(eq(parts.id, id));
  const owner = input.owner;
  // Une participation rattachée à quelqu'un d'autre n'est jamais modifiable avec ce prénom.
  if (row && owner && row.participantId && row.participantId !== owner.participantId) {
    return { ok: false, code: "forbidden", message: "Cette participation appartient à quelqu’un d’autre. Recharge la page." };
  }
  if (row?.deleted) return { ok: false, code: "deleted", message: "Cette participation a été supprimée. Commence un nouveau questionnaire." };
  if (row?.submittedAt) {
    return input.submit ? { ok: true, revision: row.revision, submitted: true } : conflict("Cette réponse a déjà été envoyée.");
  }

  const versions = await listVersions(db);
  const latest = versions.at(-1)!;
  const draftVersion = (input.draft as { version?: unknown } | null)?.version;
  if (!row && draftVersion !== latest.version) {
    return { ok: false, code: "stale", message: "Le questionnaire vient de changer. Recharge la page pour ouvrir la nouvelle version." };
  }
  const definition = row ? versions.find((v) => v.version === row.version) : latest;
  if (!definition) return invalid();
  // Membre identifié : son prénom de la liste est utilisé, jamais celui saisi dans le formulaire.
  const draft = owner && input.draft && typeof input.draft === "object" ? { ...input.draft, name: owner.name } : input.draft;
  const data = cleanDraft(draft, definition, input.submit);
  if (!data) return invalid();
  const participantId = owner?.participantId ?? row?.participantId ?? null;

  const now = new Date();
  const submittedAt = input.submit ? now : null;
  if (!row) {
    if (input.revision !== 0) return conflict("Cette participation est introuvable. Recharge la page.");
    if (!data.name && !Object.values(data.answers).some((a) => a.choices.length || a.comment)) {
      return { ok: true, revision: 0, submitted: false }; // rien à garder
    }
    const created = await db
      .insert(parts)
      .values({ id, version: data.version, name: data.name, step: data.step, answers: data.answers, revision: 1, participantId, createdAt: now, updatedAt: now, submittedAt })
      .onConflictDoNothing()
      .returning({ revision: parts.revision });
    if (created.length) return { ok: true, revision: 1, submitted: input.submit };
  } else if (input.revision === row.revision) {
    const updated = await db
      .update(parts)
      .set({ name: data.name, step: data.step, answers: data.answers, revision: row.revision + 1, participantId, updatedAt: now, submittedAt })
      .where(and(eq(parts.id, id), eq(parts.revision, row.revision), isNull(parts.submittedAt), eq(parts.deleted, false)))
      .returning({ revision: parts.revision });
    if (updated.length) return { ok: true, revision: updated[0].revision, submitted: input.submit };
  }
  // Perdu une course : un envoi déjà passé est un succès, sinon conflit.
  const [after] = await db.select({ submittedAt: parts.submittedAt, revision: parts.revision }).from(parts).where(eq(parts.id, id));
  if (input.submit && after?.submittedAt) return { ok: true, revision: after.revision, submitted: true };
  return conflict("Cette participation a été modifiée dans un autre onglet. Recharge la page pour reprendre la dernière version.");
}

// --- Lien participation ↔ prénom du groupe ---

/** Membre identifié qui répond : son identifiant de participant et son prénom (venant du cookie signé). */
export type ParticipationOwner = { participantId: string; name: string };

/**
 * Même personne ? Prénoms égaux sans accents ni casse, ou prénom seul égal au premier mot de l'autre
 * (« Dylan » et « Dylan B. »). Sert de garde-fou avant de rattacher automatiquement une réponse déjà envoyée.
 */
export function sameName(a: string, b: string) {
  const [x, y] = [a, b].map((v) => normalize(v).replace(/\s+/g, " ").trim());
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return !short.includes(" ") && long.split(" ")[0] === short;
}

/** Rattache une participation non rattachée (et non supprimée) à un participant. */
export async function claimParticipation(db: DB, id: string, participantId: string): Promise<boolean> {
  const done = await db
    .update(parts)
    .set({ participantId })
    .where(and(eq(parts.id, id), isNull(parts.participantId), eq(parts.deleted, false)))
    .returning({ id: parts.id });
  return done.length === 1;
}

export type MemberQuestionnaire = {
  /** Participation du jeton de ce navigateur, rattachée au membre (null = aucune, ou celle de quelqu'un d'autre). */
  currentId: string | null;
  /** Le membre a déjà envoyé un questionnaire (sur ce navigateur ou un autre). */
  submitted: boolean;
  /** Brouillon en cours sur ce navigateur. */
  draft: { step: number; answered: number } | null;
};

/**
 * Où en est le membre avec le questionnaire. `tokenId` = empreinte du jeton du cookie de ce navigateur (déjà vérifié).
 * Rattachement automatique d'une participation non rattachée du jeton : un brouillon toujours ;
 * une réponse envoyée seulement si le prénom correspond (navigateur partagé). Une participation rattachée
 * à quelqu'un d'autre est ignorée : le membre repart d'un questionnaire vierge.
 */
export async function resolveMemberParticipation(db: DB, tokenId: string | null, member: { id: string; name: string }): Promise<MemberQuestionnaire> {
  let currentId: string | null = null;
  if (tokenId) {
    const [row] = await db
      .select({ id: parts.id, name: parts.name, participantId: parts.participantId, submittedAt: parts.submittedAt })
      .from(parts)
      .where(and(eq(parts.id, tokenId), eq(parts.deleted, false)));
    if (row?.participantId === member.id) currentId = row.id;
    else if (row && !row.participantId && (!row.submittedAt || sameName(row.name, member.name))) {
      if (await claimParticipation(db, row.id, member.id)) currentId = row.id;
    }
  }
  const linked = await db
    .select({ id: parts.id, step: parts.step, answers: parts.answers, submittedAt: parts.submittedAt })
    .from(parts)
    .where(and(eq(parts.participantId, member.id), eq(parts.deleted, false)));
  const current = linked.find((r) => r.id === currentId);
  return {
    currentId,
    submitted: linked.some((r) => r.submittedAt),
    draft:
      current && !current.submittedAt
        ? { step: current.step, answered: Object.values(current.answers).filter((a) => a.choices.length || a.comment).length }
        : null,
  };
}

/** Admin : rattache (participantId) ou détache (null) une participation. Le participant doit exister. */
export async function setParticipationOwner(db: DB, id: string, participantId: string | null): Promise<boolean> {
  if (participantId) {
    const [p] = await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId));
    if (!p) return false;
  }
  const done = await db.update(parts).set({ participantId }).where(and(eq(parts.id, id), eq(parts.deleted, false))).returning({ id: parts.id });
  return done.length === 1;
}

// --- Admin ---

function toResponse(row: typeof parts.$inferSelect): ResponseEntry {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    step: row.step,
    answers: row.answers,
    submittedAt: iso(row.submittedAt),
    updatedAt: iso(row.updatedAt),
    excluded: row.excluded,
    knowledge: isKnowledge(row.knowledge) ? row.knowledge : null,
    participantId: row.participantId,
  };
}

export async function getOrganizer(db: DB): Promise<OrganizerEntry | null> {
  const [row] = await db.select().from(questionnaireOrganizer).where(eq(questionnaireOrganizer.id, 1));
  return row ? { version: row.version, name: row.name, step: row.step, answers: row.answers, updatedAt: iso(row.updatedAt) } : null;
}

/** Tout ce qu'il faut au tableau de bord : versions, participations (hors supprimées), avis de l'organisateur. */
export async function loadAdminData(db: DB): Promise<AdminData> {
  const [versions, rows, organizer] = await Promise.all([
    listVersions(db),
    db.select().from(parts).where(eq(parts.deleted, false)).orderBy(desc(parts.updatedAt)),
    getOrganizer(db),
  ]);
  const responses = rows.map(toResponse).sort((a, b) => (b.submittedAt ?? b.updatedAt ?? "").localeCompare(a.submittedAt ?? a.updatedAt ?? ""));
  return { versions, responses, organizer };
}

export async function getResponse(db: DB, id: string): Promise<ResponseEntry | null> {
  const [row] = await db.select().from(parts).where(and(eq(parts.id, id), eq(parts.deleted, false)));
  return row ? toResponse(row) : null;
}

export async function setExcluded(db: DB, id: string, excluded: boolean): Promise<boolean> {
  const done = await db.update(parts).set({ excluded }).where(and(eq(parts.id, id), eq(parts.deleted, false))).returning({ id: parts.id });
  return done.length === 1;
}

/** Niveau de connaissance : réservé aux réponses terminées ; null = non classé. */
export async function setKnowledge(db: DB, id: string, level: KnowledgeLevel | null): Promise<boolean> {
  if (level !== null && !isKnowledge(level)) return false;
  const done = await db
    .update(parts)
    .set({ knowledge: level })
    .where(and(eq(parts.id, id), eq(parts.deleted, false), isNotNull(parts.submittedAt)))
    .returning({ id: parts.id });
  return done.length === 1;
}

/** Suppression : on garde une pierre tombale vide pour bloquer toute reprise avec l'ancien jeton. */
export async function removeParticipation(db: DB, id: string): Promise<boolean> {
  const done = await db
    .update(parts)
    .set({ deleted: true, name: "", answers: {}, step: 0, submittedAt: null, excluded: false, knowledge: null, participantId: null, revision: 0, updatedAt: new Date() })
    .where(and(eq(parts.id, id), eq(parts.deleted, false)))
    .returning({ id: parts.id });
  return done.length === 1;
}

export async function countParticipations(db: DB): Promise<number> {
  const [row] = await db.select({ n: count() }).from(parts).where(eq(parts.deleted, false));
  return row?.n ?? 0;
}

/** Avis privé de l'organisateur (brouillon permissif : aucune réponse obligatoire). */
export async function saveOrganizer(db: DB, input: unknown): Promise<SaveResult> {
  const versions = await listVersions(db);
  const version = (input as { version?: unknown } | null)?.version;
  const definition = versions.find((v) => v.version === version);
  const data = definition && cleanDraft(input, activeDefinition(definition));
  if (!data) return invalid("Les réponses de l’organisateur sont invalides.");
  const values = { version: data.version, name: data.name || "Organisateur", step: data.step, answers: data.answers, updatedAt: new Date() };
  await db.insert(questionnaireOrganizer).values({ id: 1, ...values }).onConflictDoUpdate({ target: questionnaireOrganizer.id, set: values });
  return { ok: true, revision: 0, submitted: false };
}
