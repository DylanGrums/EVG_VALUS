import { beforeEach, describe, expect, test } from "vitest";
import { createTestDb, type DB } from "@/db";
import { pageViews, visits } from "@/db/schema";
import { addParticipant } from "@/lib/orga/participants";
import { createTopic } from "@/lib/orga/topics";
import { topicSchema } from "@/lib/orga/validation";
import { normalizePath, type NormalizedPath } from "./paths";
import { getMemberDetail, getOverview, lastDays, listMemberStats, parisDay, sortMemberStats } from "./stats";
import { isIgnoredRequest, recordActivity } from "./track";
import { formatAgo, formatDuration } from "./format";

const T0 = new Date("2026-11-27T10:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60000);
const page = (p: string) => normalizePath(p) as NormalizedPath;

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
});

describe("normalizePath", () => {
  test("sections connues, query et slash final retirés", () => {
    expect(normalizePath("/")).toEqual({ path: "/", section: "accueil", refId: null });
    expect(normalizePath("/orga/?x=1")).toEqual({ path: "/orga", section: "orga", refId: null });
    expect(normalizePath("/qui-es-tu?suite=%2Forga")).toMatchObject({ section: "identification" });
    expect(normalizePath("/orga/sur-place")).toMatchObject({ section: "sur-place" });
    const id = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
    expect(normalizePath(`/orga/sujets/${id.toUpperCase()}`)).toEqual({ path: `/orga/sujets/${id}`, section: "sujet", refId: id });
    expect(normalizePath(`/idees/${id}#c`)).toEqual({ path: `/idees/${id}`, section: "ville", refId: id });
  });

  test("admin, API, chemins inconnus et invalides ignorés", () => {
    for (const p of ["/admin", "/admin/stats", "/api/ping", "/orga/sujets/pas-un-id", "/inconnu", "//evil.com", "orga", "", null, 42, "/" + "a".repeat(400)]) {
      expect(normalizePath(p)).toBeNull();
    }
  });
});

describe("recordActivity", () => {
  test("une connexion = une visite, nouvelle après 30 min d'inactivité", async () => {
    const tom = await addParticipant(db, "Tom");
    const a = await recordActivity(db, { kind: "view", page: page("/"), participantId: tom.id, now: at(0) });
    const b = await recordActivity(db, { kind: "view", page: page("/orga"), participantId: tom.id, now: at(10) });
    await recordActivity(db, { kind: "ping", page: page("/orga"), participantId: tom.id, now: at(35) });
    const c = await recordActivity(db, { kind: "view", page: page("/idees"), participantId: tom.id, now: at(64) });
    expect(b.visitId).toBe(a.visitId);
    expect(c.visitId).toBe(a.visitId); // le ping à +35 a prolongé la visite
    const d = await recordActivity(db, { kind: "view", page: page("/"), participantId: tom.id, now: at(100) });
    expect(d.visitId).not.toBe(a.visitId);

    const rows = await db.select().from(visits);
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.id === a.visitId)!;
    expect(first.pageCount).toBe(3);
    expect(first.lastSeenAt.getTime()).toBe(at(64).getTime());
  });

  test("ping sans visite en cours : ouvre une visite avec la page ; doublon immédiat ignoré", async () => {
    const tom = await addParticipant(db, "Tom");
    await recordActivity(db, { kind: "ping", page: page("/orga"), participantId: tom.id, now: at(0) });
    await recordActivity(db, { kind: "view", page: page("/orga"), participantId: tom.id, now: new Date(at(0).getTime() + 1000) });
    expect(await db.select().from(pageViews)).toHaveLength(1);
    await recordActivity(db, { kind: "view", page: page("/orga"), participantId: tom.id, now: at(1) });
    expect(await db.select().from(pageViews)).toHaveLength(2);
  });

  test("anonymes : suivis par l'id de visite du cookie, jamais rattachés à un membre", async () => {
    const tom = await addParticipant(db, "Tom");
    const a = await recordActivity(db, { kind: "view", page: page("/qui-es-tu"), now: at(0) });
    const b = await recordActivity(db, { kind: "view", page: page("/"), anonymousVisitId: a.visitId, now: at(2) });
    expect(b.visitId).toBe(a.visitId);
    // Un id inconnu, invalide ou expiré ouvre une nouvelle visite.
    expect((await recordActivity(db, { kind: "view", page: page("/"), anonymousVisitId: "nimporte", now: at(3) })).visitId).not.toBe(a.visitId);
    expect((await recordActivity(db, { kind: "view", page: page("/"), anonymousVisitId: a.visitId, now: at(40) })).visitId).not.toBe(a.visitId);
    // L'id de visite d'un membre ne peut pas être repris par un anonyme.
    const m = await recordActivity(db, { kind: "view", page: page("/"), participantId: tom.id, now: at(41) });
    expect((await recordActivity(db, { kind: "view", page: page("/"), anonymousVisitId: m.visitId, now: at(42) })).visitId).not.toBe(m.visitId);
  });
});

describe("statistiques", () => {
  test("par prénom, en ligne, jamais venus / jamais revenus, global", async () => {
    const tom = await addParticipant(db, "Tom");
    const lea = await addParticipant(db, "Léa");
    const max = await addParticipant(db, "Max");
    const topic = await createTopic(
      db,
      topicSchema.parse({ type: "logement", title: "Le logement", description: "", voteMode: "unique", deadline: "", dependsOnId: "", allowProposals: "on" }),
    );

    // Tom : deux connexions (hier et maintenant), Léa : une connexion il y a 2 h, Max : jamais.
    await recordActivity(db, { kind: "view", page: page("/"), participantId: tom.id, now: at(-24 * 60) });
    await recordActivity(db, { kind: "view", page: page(`/orga/sujets/${topic.id}`), participantId: tom.id, now: at(-24 * 60 + 2) });
    await recordActivity(db, { kind: "view", page: page("/orga"), participantId: tom.id, now: at(-2) });
    await recordActivity(db, { kind: "view", page: page(`/orga/sujets/${topic.id}`), participantId: tom.id, now: at(-1) });
    await recordActivity(db, { kind: "view", page: page("/idees"), participantId: lea.id, now: at(-120) });
    const anon = await recordActivity(db, { kind: "view", page: page("/qui-es-tu"), now: at(-3) });
    await recordActivity(db, { kind: "ping", page: page("/qui-es-tu"), anonymousVisitId: anon.visitId, now: at(-1) });

    const stats = await listMemberStats(db, T0);
    const t = stats.find((s) => s.participantId === tom.id)!;
    expect(t).toMatchObject({ visits: 2, pageViews: 4, online: true });
    expect(t.firstVisitAt?.getTime()).toBe(at(-24 * 60).getTime());
    expect(t.topSections[0]).toMatchObject({ section: "sujet", views: 2 });
    expect(stats.find((s) => s.participantId === lea.id)).toMatchObject({ visits: 1, online: false });
    expect(stats.find((s) => s.participantId === max.id)).toMatchObject({ visits: 0, lastSeenAt: null });
    expect(sortMemberStats(stats, "derniere").map((s) => s.name)).toEqual(["Tom", "Léa", "Max"]);
    expect(sortMemberStats(stats, "prenom").map((s) => s.name)).toEqual(["Léa", "Max", "Tom"]);

    const o = await getOverview(db, T0);
    expect(o.onlineMembers.map((m) => m.name)).toEqual(["Tom"]);
    expect(o.onlineAnonymous).toBe(1);
    expect(o.totals).toEqual({ visits: 4, pageViews: 6, anonymousVisits: 1, anonymousPageViews: 1 });
    expect(o.topPages[0]).toMatchObject({ section: "sujet", views: 2, label: "Sujet d’orga · Le logement" });
    expect(o.neverCame.map((m) => m.name)).toEqual(["Max"]);
    expect(o.neverReturned.map((m) => m.name)).toEqual(["Léa"]);
    expect(o.days).toHaveLength(14);
    expect(o.days.at(-1)).toEqual({ day: "2026-11-27", visits: 3, pageViews: 4 });
    expect(o.days.at(-2)).toEqual({ day: "2026-11-26", visits: 1, pageViews: 2 });

    const detail = await getMemberDetail(db, tom.id, T0);
    expect(detail?.visits).toHaveLength(2);
    expect(detail?.visits[0].pages.map((p) => p.label)).toEqual(["Orga", "Sujet d’orga · Le logement"]);
    expect(await getMemberDetail(db, "1b4e28ba-2fa1-11d2-883f-0016d3cca427", T0)).toBeNull();
  });

  test("jours à l'heure de Paris", () => {
    expect(parisDay(new Date("2026-11-27T23:30:00Z"))).toBe("2026-11-28");
    expect(lastDays(new Date("2026-03-30T00:30:00+02:00"), 3)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
  });
});

describe("divers", () => {
  test("robots, préchargements et autres sites ignorés", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    expect(isIgnoredRequest(new Headers({ "user-agent": ua, "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isIgnoredRequest(new Headers({ "user-agent": "Googlebot/2.1" }))).toBe(true);
    expect(isIgnoredRequest(new Headers({ "user-agent": ua, "next-router-prefetch": "1" }))).toBe(true);
    expect(isIgnoredRequest(new Headers({ "user-agent": ua, "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isIgnoredRequest(new Headers({}))).toBe(true);
  });

  test("formats", () => {
    expect(formatAgo(null)).toBe("jamais");
    expect(formatAgo(at(-3 * 60 - 5), T0)).toBe("il y a 3 h");
    expect(formatAgo(at(-12), T0)).toBe("il y a 12 min");
    expect(formatDuration(65 * 60000)).toBe("1 h 05");
  });
});
