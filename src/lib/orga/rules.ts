/**
 * Règles métier pures (sans BDD) : visibilité et verrouillage des sujets, droit de vote/proposition,
 * prix par personne. Testées dans rules.test.ts.
 */
import type { DecisionTopic, TopicOption, TopicStatus, VoteMode } from "@/db/schema";

type TopicLike = Pick<DecisionTopic, "id" | "status" | "deadline" | "dependsOnId" | "allowProposals">;

/** Un sujet en brouillon n'existe pas pour les membres. */
export function isVisibleToMembers(topic: Pick<DecisionTopic, "status">) {
  return topic.status !== "brouillon";
}

/**
 * Verrouillé tant que le sujet dont il dépend n'est pas décidé.
 * Une dépendance introuvable (supprimée) ne verrouille pas.
 */
export function isLocked(topic: Pick<DecisionTopic, "dependsOnId">, byId: Map<string, Pick<DecisionTopic, "status">>) {
  if (!topic.dependsOnId) return false;
  const parent = byId.get(topic.dependsOnId);
  return !!parent && parent.status !== "decide";
}

/** Date limite dépassée ? (`deadline` est une heure locale sans fuseau, comparée à `now` local). */
export function isPastDeadline(deadline: string | null, now: Date) {
  if (!deadline) return false;
  return deadline.replace(" ", "T").slice(0, 16) <= localIso(now);
}

/** Fuseau de référence des heures saisies (le serveur Vercel tourne en UTC). */
export const ORGA_TIMEZONE = "Europe/Paris";

/** « YYYY-MM-DDTHH:mm » dans le fuseau de l'orga. */
export function localIso(date: Date, timeZone = ORGA_TIMEZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** État vu par les membres. */
export type MemberPhase = "a_venir" | "ouvert" | "vote_termine" | "clos" | "decide";

export function memberPhase(topic: TopicLike, byId: Map<string, Pick<DecisionTopic, "status">>, now: Date): MemberPhase {
  if (topic.status === "decide") return "decide";
  if (topic.status === "brouillon" || isLocked(topic, byId)) return "a_venir";
  if (topic.status === "clos") return "clos";
  return isPastDeadline(topic.deadline, now) ? "vote_termine" : "ouvert";
}

export const PHASE_LABELS: Record<MemberPhase, string> = {
  a_venir: "À venir",
  ouvert: "Vote ouvert",
  vote_termine: "Vote terminé",
  clos: "Vote clos",
  decide: "Décidé",
};

/** Les votes ne sont modifiables que sur un sujet ouvert, non verrouillé, avant la date limite. */
export function canVote(topic: TopicLike, byId: Map<string, Pick<DecisionTopic, "status">>, now: Date) {
  return memberPhase(topic, byId, now) === "ouvert";
}

/** Un membre peut proposer une option si le sujet l'autorise et que le vote est ouvert. */
export function canPropose(topic: TopicLike, byId: Map<string, Pick<DecisionTopic, "status">>, now: Date) {
  return topic.allowProposals && canVote(topic, byId, now);
}

/**
 * Nouvel ensemble de votes d'un participant sur un sujet après un clic sur `optionId` (bascule).
 * En mode « unique », voter pour une option retire le vote précédent.
 */
export function nextVotes(current: string[], optionId: string, mode: VoteMode): string[] {
  if (current.includes(optionId)) return current.filter((id) => id !== optionId);
  return mode === "unique" ? [optionId] : [...current, optionId];
}

export type PriceInfo = {
  /** Prix par personne en centimes, ou null si inconnu. */
  perPerson: number | null;
  /** Prix total en centimes (saisi, ou estimé depuis le prix par personne). */
  total: number | null;
  /** D'où vient le prix par personne. */
  source: "saisi" | "calcule" | null;
  /** Le total est-il une estimation (prix/pers × participants) ? */
  totalEstimated: boolean;
};

/**
 * Prix par personne : celui saisi s'il existe, sinon total ÷ participants actifs (arrondi au centime supérieur).
 */
export function priceInfo(option: Pick<TopicOption, "priceTotalCents" | "pricePerPersonCents">, activeCount: number): PriceInfo {
  const { priceTotalCents: total, pricePerPersonCents: perPerson } = option;
  if (perPerson != null) {
    if (total != null) return { perPerson, total, source: "saisi", totalEstimated: false };
    return { perPerson, total: activeCount > 0 ? perPerson * activeCount : null, source: "saisi", totalEstimated: activeCount > 0 };
  }
  if (total != null) {
    return { perPerson: activeCount > 0 ? Math.ceil(total / activeCount) : null, total, source: activeCount > 0 ? "calcule" : null, totalEstimated: false };
  }
  return { perPerson: null, total: null, source: null, totalEstimated: false };
}

/** Empêche les cycles de dépendance (A dépend de B qui dépend de A). */
export function createsDependencyCycle(topicId: string, dependsOnId: string | null, byId: Map<string, Pick<DecisionTopic, "dependsOnId">>) {
  let current = dependsOnId;
  const seen = new Set<string>();
  while (current) {
    if (current === topicId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = byId.get(current)?.dependsOnId ?? null;
  }
  return false;
}

/** Transitions de statut autorisées depuis l'admin. */
export function canSetStatus(status: TopicStatus, selectedCount: number) {
  return status !== "decide" || selectedCount > 0;
}
