/** Votes : bascule d'un vote d'un participant sur une option, selon les règles du sujet. */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { optionVotes, topicOptions } from "@/db/schema";
import { OrgaError } from "./errors";
import { getActiveParticipant } from "./participants";
import { canVote, nextVotes } from "./rules";
import { getOption, getTopic, listTopics } from "./topics";

/**
 * Clic sur « je vote » : ajoute ou retire le vote. En mode « un seul choix », remplace le vote précédent.
 * Refusé si le sujet n'est pas ouvert (brouillon, clos, décidé, verrouillé par sa dépendance, date limite passée).
 * Renvoie les options désormais votées par ce participant sur ce sujet.
 */
export async function toggleVote(db: DB, participantId: string, optionId: string, now = new Date()) {
  const participant = await getActiveParticipant(db, participantId);
  if (!participant) throw new OrgaError("Choisis d'abord ton prénom.");
  const option = await getOption(db, optionId);
  if (!option) throw new OrgaError("Option introuvable.");
  const topic = await getTopic(db, option.topicId);
  if (!topic) throw new OrgaError("Sujet introuvable.");
  const byId = new Map((await listTopics(db)).map((t) => [t.id, t]));
  if (!canVote(topic, byId, now)) throw new OrgaError("Les votes sont fermés sur ce sujet.");

  return db.transaction(async (tx) => {
    const siblings = await tx.select({ id: topicOptions.id }).from(topicOptions).where(eq(topicOptions.topicId, topic.id));
    const siblingIds = siblings.map((s) => s.id);
    const current = (
      await tx
        .select({ optionId: optionVotes.optionId })
        .from(optionVotes)
        .where(and(eq(optionVotes.participantId, participantId), inArray(optionVotes.optionId, siblingIds)))
    ).map((v) => v.optionId);

    const next = nextVotes(current, optionId, topic.voteMode);
    const toRemove = current.filter((id) => !next.includes(id));
    const toAdd = next.filter((id) => !current.includes(id));
    if (toRemove.length) {
      await tx.delete(optionVotes).where(and(eq(optionVotes.participantId, participantId), inArray(optionVotes.optionId, toRemove)));
    }
    if (toAdd.length) {
      await tx
        .insert(optionVotes)
        .values(toAdd.map((id) => ({ optionId: id, participantId })))
        .onConflictDoNothing();
    }
    return next;
  });
}
