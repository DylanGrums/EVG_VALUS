/**
 * Enregistrement de la fréquentation (best effort, appelé par le route handler /api/ping).
 * Une visite (« connexion ») dure tant que l'activité continue ; plus de 30 min sans activité → nouvelle visite.
 */
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { pageViews, visits } from "@/db/schema";
import type { NormalizedPath } from "./paths";

/** Inactivité au-delà de laquelle une nouvelle connexion commence. */
export const VISIT_GAP_MS = 30 * 60 * 1000;
/** « En ligne » = activité dans les 5 dernières minutes. */
export const ONLINE_MS = 5 * 60 * 1000;
/** Même page renvoyée deux fois de suite dans ce délai (double effet, double clic) : comptée une fois. */
const DUPLICATE_MS = 3000;

export type ActivityKind = "view" | "ping";

export type ActivityInput = {
  kind: ActivityKind;
  page: NormalizedPath;
  /** Membre identifié (lu depuis le cookie signé). */
  participantId?: string | null;
  /** Visiteur anonyme : id de visite en cours (cookie httpOnly), s'il y en a un. */
  anonymousVisitId?: string | null;
  now?: Date;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function openVisit(db: DB, input: ActivityInput, since: Date) {
  if (input.participantId) {
    const [row] = await db
      .select()
      .from(visits)
      .where(and(eq(visits.participantId, input.participantId), gt(visits.lastSeenAt, since)))
      .orderBy(desc(visits.lastSeenAt))
      .limit(1);
    return row ?? null;
  }
  const id = input.anonymousVisitId;
  if (!id || !UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(visits)
    .where(and(eq(visits.id, id), isNull(visits.participantId), gt(visits.lastSeenAt, since)));
  return row ?? null;
}

/**
 * Enregistre une page vue (`view`) ou un signe de vie (`ping`, onglet visible).
 * Un ping sans visite en cours (retour sur un onglet après une longue pause) ouvre une nouvelle visite avec la page affichée.
 * Renvoie l'id de la visite (à mémoriser en cookie pour un anonyme).
 */
export async function recordActivity(db: DB, input: ActivityInput): Promise<{ visitId: string }> {
  const now = input.now ?? new Date();
  const participantId = input.participantId ?? null;
  let visit = await openVisit(db, input, new Date(now.getTime() - VISIT_GAP_MS));
  let countView = input.kind === "view";

  if (!visit) {
    [visit] = await db.insert(visits).values({ participantId, startedAt: now, lastSeenAt: now, pageCount: 0 }).returning();
    countView = true;
  } else if (countView) {
    const [last] = await db
      .select({ path: pageViews.path, createdAt: pageViews.createdAt })
      .from(pageViews)
      .where(eq(pageViews.visitId, visit.id))
      .orderBy(desc(pageViews.createdAt))
      .limit(1);
    if (last && last.path === input.page.path && now.getTime() - last.createdAt.getTime() < DUPLICATE_MS) countView = false;
  }

  if (countView) {
    await db.insert(pageViews).values({
      visitId: visit.id,
      participantId,
      path: input.page.path,
      section: input.page.section,
      refId: input.page.refId,
      createdAt: now,
    });
  }
  await db
    .update(visits)
    .set({ lastSeenAt: sql`greatest(${visits.lastSeenAt}, ${now.toISOString()}::timestamptz)`, pageCount: sql`${visits.pageCount} + ${countView ? 1 : 0}` })
    .where(eq(visits.id, visit.id));
  return { visitId: visit.id };
}

/** Requêtes évidentes de robots / préchargements, à ignorer. */
export function isIgnoredRequest(headers: Headers) {
  const ua = headers.get("user-agent") ?? "";
  if (!ua || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python|headlesschrome|lighthouse/i.test(ua)) return true;
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`;
  if (/prefetch|prerender/i.test(purpose) || headers.get("next-router-prefetch")) return true;
  // Uniquement depuis le site lui-même (pas de requête forgée par un autre site).
  const site = headers.get("sec-fetch-site");
  return !!site && site !== "same-origin";
}
