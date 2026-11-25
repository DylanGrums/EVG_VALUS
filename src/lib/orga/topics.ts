/** Sujets de décision, options et commentaires : lecture et écriture en base. */
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  decisionTopics,
  optionVotes,
  orgaComments,
  participants,
  topicOptions,
  type DecisionTopic,
  type TopicOption,
  type TopicStatus,
} from "@/db/schema";
import { OrgaError } from "./errors";
import { countActiveParticipants } from "./participants";
import { canPropose, canSetStatus, canVote, createsDependencyCycle, isLocked, isVisibleToMembers, memberPhase, priceInfo, type MemberPhase, type PriceInfo } from "./rules";
import type { OptionInput, TopicInput } from "./validation";

// --- Sujets ---

export async function listTopics(db: DB) {
  return db.select().from(decisionTopics).orderBy(asc(decisionTopics.position), asc(decisionTopics.createdAt));
}

export async function getTopic(db: DB, id: string) {
  const [row] = await db.select().from(decisionTopics).where(eq(decisionTopics.id, id));
  return row ?? null;
}

async function requireTopic(db: DB, id: string) {
  const topic = await getTopic(db, id);
  if (!topic) throw new OrgaError("Sujet introuvable.");
  return topic;
}

async function assertDependency(db: DB, topicId: string | null, dependsOnId: string | null) {
  if (!dependsOnId) return;
  const all = await listTopics(db);
  const byId = new Map(all.map((t) => [t.id, t]));
  if (!byId.has(dependsOnId)) throw new OrgaError("Le sujet dont il dépend n'existe pas.");
  if (topicId && createsDependencyCycle(topicId, dependsOnId, byId)) throw new OrgaError("Dépendance circulaire : choisis un autre sujet.");
}

export async function createTopic(db: DB, input: TopicInput) {
  await assertDependency(db, null, input.dependsOnId);
  const [last] = await db.select({ p: max(decisionTopics.position) }).from(decisionTopics);
  const [row] = await db
    .insert(decisionTopics)
    .values({ ...input, position: (last?.p ?? -1) + 1 })
    .returning();
  return row;
}

export async function updateTopic(db: DB, id: string, input: TopicInput) {
  await requireTopic(db, id);
  await assertDependency(db, id, input.dependsOnId);
  const [row] = await db.update(decisionTopics).set({ ...input, updatedAt: new Date() }).where(eq(decisionTopics.id, id)).returning();
  return row;
}

export async function setTopicStatus(db: DB, id: string, status: TopicStatus) {
  await requireTopic(db, id);
  const selected = await db.select({ id: topicOptions.id }).from(topicOptions).where(and(eq(topicOptions.topicId, id), eq(topicOptions.selected, true)));
  if (!canSetStatus(status, selected.length)) throw new OrgaError("Retiens au moins une option avant de marquer le sujet comme décidé.");
  await db.update(decisionTopics).set({ status, updatedAt: new Date() }).where(eq(decisionTopics.id, id));
}

/** Monte (-1) ou descend (+1) un sujet dans l'ordre d'affichage. */
export async function moveTopic(db: DB, id: string, direction: -1 | 1) {
  const all = await listTopics(db);
  const index = all.findIndex((t) => t.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= all.length) return;
  const reordered = [...all];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await db.transaction(async (tx) => {
    for (const [position, topic] of reordered.entries()) {
      if (topic.position !== position) await tx.update(decisionTopics).set({ position }).where(eq(decisionTopics.id, topic.id));
    }
  });
}

export async function deleteTopic(db: DB, id: string) {
  await db.delete(decisionTopics).where(eq(decisionTopics.id, id));
}

// --- Options ---

export async function getOption(db: DB, id: string) {
  const [row] = await db.select().from(topicOptions).where(eq(topicOptions.id, id));
  return row ?? null;
}

async function nextOptionPosition(db: DB, topicId: string) {
  const [last] = await db.select({ p: max(topicOptions.position) }).from(topicOptions).where(eq(topicOptions.topicId, topicId));
  return (last?.p ?? -1) + 1;
}

/** Option ajoutée par les organisateurs (toujours possible, quel que soit le statut). */
export async function createOrgaOption(db: DB, topicId: string, input: OptionInput) {
  await requireTopic(db, topicId);
  const [row] = await db
    .insert(topicOptions)
    .values({ ...input, topicId, proposedByOrga: true, position: await nextOptionPosition(db, topicId) })
    .returning();
  return row;
}

/** Proposition d'un membre : seulement si le sujet l'autorise et que le vote est ouvert. */
export async function proposeOption(db: DB, participantId: string, topicId: string, input: OptionInput, now = new Date()) {
  const topic = await requireTopic(db, topicId);
  const byId = new Map((await listTopics(db)).map((t) => [t.id, t]));
  if (!canPropose(topic, byId, now)) throw new OrgaError("Les propositions ne sont pas ouvertes sur ce sujet.");
  const [row] = await db
    .insert(topicOptions)
    .values({ ...input, topicId, proposedById: participantId, position: await nextOptionPosition(db, topicId) })
    .returning();
  return row;
}

export async function updateOption(db: DB, id: string, input: OptionInput) {
  const [row] = await db.update(topicOptions).set(input).where(eq(topicOptions.id, id)).returning();
  if (!row) throw new OrgaError("Option introuvable.");
  return row;
}

export async function deleteOption(db: DB, id: string) {
  await db.delete(topicOptions).where(eq(topicOptions.id, id));
}

/**
 * Retient (ou non) une option. Sur un sujet « un seul choix », retenir une option retire les autres.
 * Si plus aucune option n'est retenue, un sujet décidé repasse à « clos ».
 */
export async function setOptionSelected(db: DB, id: string, selected: boolean) {
  const option = await getOption(db, id);
  if (!option) throw new OrgaError("Option introuvable.");
  const topic = await requireTopic(db, option.topicId);
  await db.transaction(async (tx) => {
    if (selected && topic.voteMode === "unique") {
      await tx.update(topicOptions).set({ selected: false }).where(eq(topicOptions.topicId, topic.id));
    }
    await tx.update(topicOptions).set({ selected }).where(eq(topicOptions.id, id));
    if (!selected && topic.status === "decide") {
      const remaining = await tx.select({ id: topicOptions.id }).from(topicOptions).where(and(eq(topicOptions.topicId, topic.id), eq(topicOptions.selected, true)));
      if (!remaining.length) await tx.update(decisionTopics).set({ status: "clos", updatedAt: new Date() }).where(eq(decisionTopics.id, topic.id));
    }
  });
}

// --- Commentaires ---

/** Commentaire d'un membre sur un sujet visible et débloqué (ou sur une de ses options). */
export async function addComment(db: DB, authorId: string, topicId: string, optionId: string | null, body: string, now = new Date()) {
  const topic = await requireTopic(db, topicId);
  const byId = new Map((await listTopics(db)).map((t) => [t.id, t]));
  if (memberPhase(topic, byId, now) === "a_venir") throw new OrgaError("Ce sujet n'est pas encore ouvert.");
  if (optionId) {
    const option = await getOption(db, optionId);
    if (!option || option.topicId !== topicId) throw new OrgaError("Option introuvable.");
  }
  const [row] = await db.insert(orgaComments).values({ topicId, optionId, authorId, body }).returning();
  return row;
}

export async function deleteComment(db: DB, id: string) {
  await db.delete(orgaComments).where(eq(orgaComments.id, id));
}

// --- Vues ---

export type Voter = { id: string; name: string };
export type CommentView = { id: string; optionId: string | null; body: string; createdAt: Date; authorName: string | null; authorId: string | null };
export type OptionView = TopicOption & { price: PriceInfo; voters: Voter[]; proposedByName: string | null; comments: CommentView[] };
export type TopicView = {
  topic: DecisionTopic;
  phase: MemberPhase;
  locked: boolean;
  dependsOn: Pick<DecisionTopic, "id" | "title" | "status"> | null;
  options: OptionView[];
  comments: CommentView[];
  myVotes: string[];
  canVote: boolean;
  canPropose: boolean;
  activeCount: number;
  totalVoters: number;
};

/**
 * Tout ce qu'il faut pour afficher un sujet. `participantId` = membre courant (pour ses votes).
 * `forAdmin` autorise les brouillons ; sinon un brouillon renvoie null.
 */
export async function loadTopicView(db: DB, topicId: string, participantId: string | null, { forAdmin = false, now = new Date() } = {}): Promise<TopicView | null> {
  const all = await listTopics(db);
  const byId = new Map(all.map((t) => [t.id, t]));
  const topic = byId.get(topicId);
  if (!topic || (!forAdmin && !isVisibleToMembers(topic))) return null;

  const [options, activeCount] = await Promise.all([
    db
      .select({ option: topicOptions, proposedByName: participants.name })
      .from(topicOptions)
      .leftJoin(participants, eq(participants.id, topicOptions.proposedById))
      .where(eq(topicOptions.topicId, topicId))
      .orderBy(asc(topicOptions.position), asc(topicOptions.createdAt)),
    countActiveParticipants(db),
  ]);
  const optionIds = options.map((o) => o.option.id);
  const [votes, comments] = await Promise.all([
    optionIds.length
      ? db
          .select({ optionId: optionVotes.optionId, id: participants.id, name: participants.name })
          .from(optionVotes)
          .innerJoin(participants, eq(participants.id, optionVotes.participantId))
          .where(inArray(optionVotes.optionId, optionIds))
          .orderBy(asc(optionVotes.createdAt))
      : Promise.resolve([]),
    db
      .select({ id: orgaComments.id, optionId: orgaComments.optionId, body: orgaComments.body, createdAt: orgaComments.createdAt, authorId: orgaComments.authorId, authorName: participants.name })
      .from(orgaComments)
      .leftJoin(participants, eq(participants.id, orgaComments.authorId))
      .where(eq(orgaComments.topicId, topicId))
      .orderBy(asc(orgaComments.createdAt)),
  ]);

  const locked = isLocked(topic, byId);
  const parent = topic.dependsOnId ? byId.get(topic.dependsOnId) : undefined;
  const optionViews: OptionView[] = options.map(({ option, proposedByName }) => ({
    ...option,
    proposedByName,
    price: priceInfo(option, activeCount),
    voters: votes.filter((v) => v.optionId === option.id).map(({ id, name }) => ({ id, name })),
    comments: comments.filter((c) => c.optionId === option.id),
  }));

  return {
    topic,
    phase: memberPhase(topic, byId, now),
    locked,
    dependsOn: parent ? { id: parent.id, title: parent.title, status: parent.status } : null,
    options: optionViews,
    comments: comments.filter((c) => c.optionId === null),
    myVotes: participantId ? votes.filter((v) => v.id === participantId).map((v) => v.optionId) : [],
    canVote: !!participantId && canVote(topic, byId, now),
    canPropose: !!participantId && canPropose(topic, byId, now),
    activeCount,
    totalVoters: new Set(votes.map((v) => v.id)).size,
  };
}

export type TopicSummary = DecisionTopic & {
  phase: MemberPhase;
  dependsOnTitle: string | null;
  optionCount: number;
  voterCount: number;
  commentCount: number;
  selectedTitles: string[];
  iVoted: boolean;
};

/** Résumé de tous les sujets (pour l'accueil membre ou l'admin). */
export async function listTopicSummaries(db: DB, { participantId = null as string | null, forAdmin = false, now = new Date() } = {}): Promise<TopicSummary[]> {
  const all = await listTopics(db);
  const byId = new Map(all.map((t) => [t.id, t]));
  const visible = forAdmin ? all : all.filter(isVisibleToMembers);
  if (!visible.length) return [];
  const ids = visible.map((t) => t.id);

  const [options, votes, comments] = await Promise.all([
    db.select({ id: topicOptions.id, topicId: topicOptions.topicId, title: topicOptions.title, selected: topicOptions.selected }).from(topicOptions).where(inArray(topicOptions.topicId, ids)).orderBy(asc(topicOptions.position)),
    db
      .select({ topicId: topicOptions.topicId, participantId: optionVotes.participantId })
      .from(optionVotes)
      .innerJoin(topicOptions, eq(topicOptions.id, optionVotes.optionId))
      .where(inArray(topicOptions.topicId, ids)),
    db.select({ topicId: orgaComments.topicId, n: sql<number>`count(*)::int` }).from(orgaComments).where(inArray(orgaComments.topicId, ids)).groupBy(orgaComments.topicId),
  ]);

  return visible.map((topic) => {
    const own = options.filter((o) => o.topicId === topic.id);
    const topicVotes = votes.filter((v) => v.topicId === topic.id);
    return {
      ...topic,
      phase: memberPhase(topic, byId, now),
      dependsOnTitle: topic.dependsOnId ? (byId.get(topic.dependsOnId)?.title ?? null) : null,
      optionCount: own.length,
      voterCount: new Set(topicVotes.map((v) => v.participantId)).size,
      commentCount: comments.find((c) => c.topicId === topic.id)?.n ?? 0,
      selectedTitles: own.filter((o) => o.selected).map((o) => o.title),
      iVoted: !!participantId && topicVotes.some((v) => v.participantId === participantId),
    };
  });
}

/** Derniers commentaires (admin, modération). */
export async function listRecentComments(db: DB, limit = 30) {
  return db
    .select({ id: orgaComments.id, body: orgaComments.body, createdAt: orgaComments.createdAt, topicId: orgaComments.topicId, topicTitle: decisionTopics.title, authorName: participants.name })
    .from(orgaComments)
    .innerJoin(decisionTopics, eq(decisionTopics.id, orgaComments.topicId))
    .leftJoin(participants, eq(participants.id, orgaComments.authorId))
    .orderBy(desc(orgaComments.createdAt))
    .limit(limit);
}
