/**
 * Agrégats de fréquentation pour l'admin (jamais exposés aux membres).
 * Volume visé : petit groupe, quelques milliers de lignes ; les regroupements par jour se font en JS (heure de Paris).
 */
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, max, min, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import { decisionTopics, ideaCities, pageViews, participants, visits } from "@/db/schema";
import { localIso } from "@/lib/orga/rules";
import { SECTION_LABELS, type Section } from "./paths";
import { ONLINE_MS } from "./track";

export const DAYS_SHOWN = 14;

export type PageStat = { section: Section; refId: string | null; label: string; views: number };

/** Libellé d'une page : « Sujet d’orga · Logement », « Ville · Lisbonne ». */
function pageLabel(section: Section, refId: string | null, titles: Map<string, string>) {
  const base = SECTION_LABELS[section] ?? section;
  if (!refId) return base;
  const title = titles.get(refId);
  return title ? `${base} · ${title}` : `${base} (supprimé)`;
}

async function refTitles(db: DB, refIds: (string | null)[]) {
  const ids = [...new Set(refIds.filter((x): x is string => !!x))];
  const titles = new Map<string, string>();
  if (!ids.length) return titles;
  const [topics, cities] = await Promise.all([
    db.select({ id: decisionTopics.id, title: decisionTopics.title }).from(decisionTopics).where(inArray(decisionTopics.id, ids)),
    db.select({ id: ideaCities.id, title: ideaCities.name }).from(ideaCities).where(inArray(ideaCities.id, ids)),
  ]);
  for (const r of [...topics, ...cities]) titles.set(r.id, r.title);
  return titles;
}

async function topPages(db: DB, where: SQL | undefined, limit: number): Promise<PageStat[]> {
  const rows = await db
    .select({ section: pageViews.section, refId: pageViews.refId, views: count() })
    .from(pageViews)
    .where(where)
    .groupBy(pageViews.section, pageViews.refId)
    .orderBy(desc(count()), pageViews.section)
    .limit(limit);
  const titles = await refTitles(db, rows.map((r) => r.refId));
  return rows.map((r) => ({ section: r.section as Section, refId: r.refId, views: r.views, label: pageLabel(r.section as Section, r.refId, titles) }));
}

/** Clé de jour « YYYY-MM-DD » à Paris. */
export function parisDay(date: Date) {
  return localIso(date).slice(0, 10);
}

/** Les `n` derniers jours (heure de Paris), du plus ancien à aujourd'hui. */
export function lastDays(now: Date, n = DAYS_SHOWN) {
  const [y, m, d] = parisDay(now).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - (n - 1 - i))).toISOString().slice(0, 10));
}

export type MemberStat = {
  participantId: string;
  name: string;
  active: boolean;
  visits: number;
  pageViews: number;
  firstVisitAt: Date | null;
  lastSeenAt: Date | null;
  online: boolean;
  topSections: { section: Section; label: string; views: number }[];
};

/** Statistiques par prénom (tous les participants, retirés compris, marqués `active: false`). */
export async function listMemberStats(db: DB, now = new Date()): Promise<MemberStat[]> {
  const [people, visitRows, viewRows, sectionRows] = await Promise.all([
    db.select({ id: participants.id, name: participants.name, active: participants.active }).from(participants),
    db
      .select({ id: visits.participantId, n: count(), first: min(visits.startedAt), last: max(visits.lastSeenAt) })
      .from(visits)
      .where(isNotNull(visits.participantId))
      .groupBy(visits.participantId),
    db.select({ id: pageViews.participantId, n: count() }).from(pageViews).where(isNotNull(pageViews.participantId)).groupBy(pageViews.participantId),
    db
      .select({ id: pageViews.participantId, section: pageViews.section, n: count() })
      .from(pageViews)
      .where(isNotNull(pageViews.participantId))
      .groupBy(pageViews.participantId, pageViews.section),
  ]);
  const byVisit = new Map(visitRows.map((r) => [r.id, r]));
  const byView = new Map(viewRows.map((r) => [r.id, r.n]));
  const sections = new Map<string, MemberStat["topSections"]>();
  for (const r of sectionRows) {
    if (!r.id) continue;
    const list = sections.get(r.id) ?? [];
    list.push({ section: r.section as Section, label: SECTION_LABELS[r.section as Section] ?? r.section, views: r.n });
    sections.set(r.id, list);
  }
  const onlineSince = now.getTime() - ONLINE_MS;
  return people.map((p) => {
    const v = byVisit.get(p.id);
    const last = v?.last ? new Date(v.last) : null;
    return {
      participantId: p.id,
      name: p.name,
      active: p.active,
      visits: v?.n ?? 0,
      pageViews: byView.get(p.id) ?? 0,
      firstVisitAt: v?.first ? new Date(v.first) : null,
      lastSeenAt: last,
      online: !!last && last.getTime() > onlineSince,
      topSections: (sections.get(p.id) ?? []).sort((a, b) => b.views - a.views || a.label.localeCompare(b.label)).slice(0, 3),
    };
  });
}

export const MEMBER_SORTS = ["derniere", "premiere", "connexions", "pages", "prenom"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

/** Tri du tableau par prénom ; les « jamais venus » toujours en fin pour les tris par date/nombre. */
export function sortMemberStats(rows: MemberStat[], sort: MemberSort) {
  const time = (d: Date | null) => d?.getTime() ?? -Infinity;
  const byName = (a: MemberStat, b: MemberStat) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  const cmp: Record<MemberSort, (a: MemberStat, b: MemberStat) => number> = {
    derniere: (a, b) => time(b.lastSeenAt) - time(a.lastSeenAt) || byName(a, b),
    premiere: (a, b) => (a.firstVisitAt ? 0 : 1) - (b.firstVisitAt ? 0 : 1) || time(a.firstVisitAt) - time(b.firstVisitAt) || byName(a, b),
    connexions: (a, b) => b.visits - a.visits || byName(a, b),
    pages: (a, b) => b.pageViews - a.pageViews || byName(a, b),
    prenom: byName,
  };
  return [...rows].sort(cmp[sort]);
}

export type Overview = {
  onlineMembers: { participantId: string; name: string }[];
  onlineAnonymous: number;
  totals: { visits: number; pageViews: number; anonymousVisits: number; anonymousPageViews: number };
  days: { day: string; visits: number; pageViews: number }[];
  topPages: PageStat[];
  neverCame: { participantId: string; name: string }[];
  neverReturned: { participantId: string; name: string }[];
};

/** Tableau de bord global. */
export async function getOverview(db: DB, now = new Date()): Promise<Overview> {
  const onlineSince = new Date(now.getTime() - ONLINE_MS);
  const days = lastDays(now);
  // Marge d'un jour : le découpage exact se fait sur la clé de jour de Paris.
  const since = new Date(`${days[0]}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 1);

  const [online, totals, anon, recentVisits, recentViews, pages, members] = await Promise.all([
    db
      .select({ participantId: visits.participantId, name: participants.name })
      .from(visits)
      .leftJoin(participants, eq(participants.id, visits.participantId))
      .where(gt(visits.lastSeenAt, onlineSince)),
    db.select({ visits: count(), pageViews: sql<number>`coalesce(sum(${visits.pageCount}), 0)::int` }).from(visits),
    db
      .select({ visits: count(), pageViews: sql<number>`coalesce(sum(${visits.pageCount}), 0)::int` })
      .from(visits)
      .where(isNull(visits.participantId)),
    db.select({ at: visits.startedAt }).from(visits).where(gte(visits.startedAt, since)),
    db.select({ at: pageViews.createdAt }).from(pageViews).where(gte(pageViews.createdAt, since)),
    topPages(db, undefined, 15),
    listMemberStats(db, now),
  ]);

  const perDay = new Map(days.map((d) => [d, { day: d, visits: 0, pageViews: 0 }]));
  for (const r of recentVisits) {
    const e = perDay.get(parisDay(r.at));
    if (e) e.visits++;
  }
  for (const r of recentViews) {
    const e = perDay.get(parisDay(r.at));
    if (e) e.pageViews++;
  }

  const seen = new Set<string>();
  const onlineMembers: Overview["onlineMembers"] = [];
  let onlineAnonymous = 0;
  for (const r of online) {
    if (!r.participantId) onlineAnonymous++;
    else if (!seen.has(r.participantId)) {
      seen.add(r.participantId);
      onlineMembers.push({ participantId: r.participantId, name: r.name ?? "?" });
    }
  }
  onlineMembers.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const activeMembers = members.filter((m) => m.active);
  const pick = (m: MemberStat) => ({ participantId: m.participantId, name: m.name });
  return {
    onlineMembers,
    onlineAnonymous,
    totals: { visits: totals[0]?.visits ?? 0, pageViews: totals[0]?.pageViews ?? 0, anonymousVisits: anon[0]?.visits ?? 0, anonymousPageViews: anon[0]?.pageViews ?? 0 },
    days: [...perDay.values()],
    topPages: pages,
    neverCame: sortMemberStats(activeMembers.filter((m) => m.visits === 0), "prenom").map(pick),
    neverReturned: sortMemberStats(activeMembers.filter((m) => m.visits === 1), "prenom").map(pick),
  };
}

export type VisitDetail = {
  id: string;
  startedAt: Date;
  lastSeenAt: Date;
  pageCount: number;
  pages: { label: string; at: Date }[];
};

/** Détail d'un prénom : statistiques, pages les plus consultées, historique des visites (les plus récentes d'abord). */
export async function getMemberDetail(db: DB, participantId: string, now = new Date(), { visitLimit = 50 } = {}) {
  const stats = (await listMemberStats(db, now)).find((m) => m.participantId === participantId);
  if (!stats) return null;
  const [pages, visitRows] = await Promise.all([
    topPages(db, eq(pageViews.participantId, participantId), 10),
    db.select().from(visits).where(eq(visits.participantId, participantId)).orderBy(desc(visits.startedAt)).limit(visitLimit),
  ]);
  const viewRows = visitRows.length
    ? await db
        .select({ visitId: pageViews.visitId, section: pageViews.section, refId: pageViews.refId, at: pageViews.createdAt })
        .from(pageViews)
        .where(and(eq(pageViews.participantId, participantId), inArray(pageViews.visitId, visitRows.map((v) => v.id))))
        .orderBy(pageViews.createdAt)
    : [];
  const titles = await refTitles(db, viewRows.map((r) => r.refId));
  const byVisit = new Map<string, VisitDetail["pages"]>();
  for (const r of viewRows) {
    const list = byVisit.get(r.visitId) ?? [];
    list.push({ label: pageLabel(r.section as Section, r.refId, titles), at: r.at });
    byVisit.set(r.visitId, list);
  }
  const history: VisitDetail[] = visitRows.map((v) => ({
    id: v.id,
    startedAt: v.startedAt,
    lastSeenAt: v.lastSeenAt,
    pageCount: v.pageCount,
    pages: byVisit.get(v.id) ?? [],
  }));
  return { stats, topPages: pages, visits: history };
}
