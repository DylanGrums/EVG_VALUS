/** Identité unique : liaison participation ↔ participant, statut « vient au week-end », vue publique anonyme. */
import { beforeEach, describe, expect, test } from "vitest";
import { createTestDb, type DB } from "@/db";
import { addParticipant, countActiveParticipants, registerSelf, removeParticipant, setParticipantAttending } from "@/lib/orga/participants";
import { createOrgaOption, createTopic, loadTopicView, setTopicStatus } from "@/lib/orga/topics";
import { toggleVote } from "@/lib/orga/votes";
import { optionSchema, topicSchema } from "@/lib/orga/validation";
import { publicTrends } from "./public-view";
import {
  claimParticipation,
  getResponse,
  listVersions,
  loadAdminData,
  removeParticipation,
  resolveMemberParticipation,
  sameName,
  saveParticipation,
  setExcluded,
  setKnowledge,
  setParticipationOwner,
} from "./store";
import { hashToken, newToken } from "./token";
import type { Draft, QuestionnaireVersion, ResponseEntry } from "./types";

let db: DB;
let v1: QuestionnaireVersion;
beforeEach(async () => {
  db = await createTestDb();
  v1 = (await listVersions(db))[0];
});

/** Réponse complète : la question 1 reçoit `first`, les autres « Je ne sais pas ». */
const complete = (name: string, first: string[] = ["c1"], comment = ""): Draft => ({
  version: v1.version,
  name,
  step: v1.questions.length + 1,
  answers: Object.fromEntries(
    v1.questions.filter((q) => !q.optional).map((q, i) => [String(q.id), i === 0 ? { choices: first, comment } : { choices: ["unknown"], comment: "" }]),
  ),
});
const partial = (name: string): Draft => ({ version: v1.version, name, step: 1, answers: { "1": { choices: ["c1"], comment: "" } } });
const id = () => hashToken(newToken());

describe("liaison participation ↔ participant", () => {
  test("un membre qui répond : prénom imposé et participation rattachée", async () => {
    const tom = await registerSelf(db, "Thomas");
    const pid = id();
    const result = await saveParticipation(db, pid, { draft: complete("Pas moi"), revision: 0, submit: true, owner: { participantId: tom.id, name: tom.name } });
    expect(result).toMatchObject({ ok: true, submitted: true });
    const entry = await getResponse(db, pid);
    expect(entry?.name).toBe("Thomas");
    expect(entry?.participantId).toBe(tom.id);
    expect(await resolveMemberParticipation(db, null, tom)).toMatchObject({ currentId: null, submitted: true, draft: null });
  });

  test("une participation rattachée à quelqu'un d'autre n'est ni reprise ni modifiable", async () => {
    const a = await registerSelf(db, "Alex");
    const b = await registerSelf(db, "Bob");
    const pid = id();
    await saveParticipation(db, pid, { draft: partial("x"), revision: 0, submit: false, owner: { participantId: a.id, name: a.name } });
    expect(await resolveMemberParticipation(db, pid, b)).toMatchObject({ currentId: null, submitted: false });
    expect(await saveParticipation(db, pid, { draft: partial("x"), revision: 1, submit: false, owner: { participantId: b.id, name: b.name } })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect((await getResponse(db, pid))?.participantId).toBe(a.id);
  });

  test("jeton du navigateur non rattaché : brouillon toujours repris, réponse envoyée seulement si le prénom correspond", async () => {
    const dylan = await registerSelf(db, "Dylan B.");
    const draftId = id();
    await saveParticipation(db, draftId, { draft: partial("Dyl"), revision: 0, submit: false });
    expect(await resolveMemberParticipation(db, draftId, dylan)).toMatchObject({ currentId: draftId, submitted: false, draft: { step: 1, answered: 1 } });
    expect((await getResponse(db, draftId))?.participantId).toBe(dylan.id);

    const sent = id();
    await saveParticipation(db, sent, { draft: complete("dylan"), revision: 0, submit: true });
    const other = await registerSelf(db, "Thomas");
    expect(await resolveMemberParticipation(db, sent, other)).toMatchObject({ currentId: null, submitted: false });
    expect((await getResponse(db, sent))?.participantId).toBeNull();
    expect(await resolveMemberParticipation(db, sent, dylan)).toMatchObject({ currentId: sent, submitted: true });
    expect((await getResponse(db, sent))?.participantId).toBe(dylan.id);
  });

  test("pas de rattachement d'une participation déjà rattachée ou supprimée", async () => {
    const a = await registerSelf(db, "Alex");
    const b = await registerSelf(db, "Bob");
    const pid = id();
    await saveParticipation(db, pid, { draft: partial("Alex"), revision: 0, submit: false });
    expect(await claimParticipation(db, pid, a.id)).toBe(true);
    expect(await claimParticipation(db, pid, b.id)).toBe(false);
    await removeParticipation(db, pid);
    expect(await resolveMemberParticipation(db, pid, a)).toMatchObject({ currentId: null, submitted: false });
  });

  test("admin : lier et délier à la main, participant inexistant refusé", async () => {
    const a = await registerSelf(db, "Alex");
    const pid = id();
    await saveParticipation(db, pid, { draft: complete("Lex"), revision: 0, submit: true });
    expect(await setParticipationOwner(db, pid, "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(await setParticipationOwner(db, pid, a.id)).toBe(true);
    expect((await getResponse(db, pid))?.participantId).toBe(a.id);
    expect(await setParticipationOwner(db, pid, null)).toBe(true);
    expect((await getResponse(db, pid))?.participantId).toBeNull();
  });

  test("un participant ayant une réponse rattachée est retiré en douceur (réponse conservée)", async () => {
    const a = await registerSelf(db, "Alex");
    const pid = id();
    await saveParticipation(db, pid, { draft: complete("Alex"), revision: 0, submit: true, owner: { participantId: a.id, name: a.name } });
    expect(await removeParticipant(db, a.id)).toBe("desactive");
    expect((await getResponse(db, pid))?.participantId).toBe(a.id);
  });

  test("sameName", () => {
    expect(sameName("Élodie", "elodie ")).toBe(true);
    expect(sameName("Dylan", "Dylan B.")).toBe(true);
    expect(sameName("Dylan C.", "Dylan B.")).toBe(false);
    expect(sameName("Tom", "Thomas")).toBe(false);
    expect(sameName("", "Tom")).toBe(false);
  });
});

describe("participants qui viennent / proches", () => {
  test("seuls les participants qui viennent comptent (prix par personne, votants)", async () => {
    const a = await registerSelf(db, "Alex");
    const b = await registerSelf(db, "Bob");
    const copine = await registerSelf(db, "Léa", { attending: false });
    expect(copine.attending).toBe(false);
    expect(a.attending).toBe(true);
    expect(await countActiveParticipants(db)).toBe(2);

    await setParticipantAttending(db, b.id, false);
    expect(await countActiveParticipants(db)).toBe(1);
    await setParticipantAttending(db, b.id, true);
    expect((await addParticipant(db, "Chris")).attending).toBe(true);
    expect(await countActiveParticipants(db)).toBe(3);

    const topic = await createTopic(
      db,
      topicSchema.parse({ type: "logement", title: "Logement", description: "", voteMode: "unique", deadline: "", dependsOnId: "", allowProposals: "on" }),
    );
    await setTopicStatus(db, topic.id, "ouvert");
    const option = await createOrgaOption(
      db,
      topic.id,
      optionSchema.parse({ title: "Gîte", description: "", url: "", imageUrl: "", address: "", priceTotal: "300", pricePerPerson: "", startsAt: "", endsAt: "", openingHours: "", practicalNotes: "" }),
    );
    await toggleVote(db, a.id, option.id);
    await toggleVote(db, copine.id, option.id);
    const view = await loadTopicView(db, topic.id, a.id);
    expect(view?.activeCount).toBe(3);
    expect(view?.totalVoters).toBe(1);
    expect(view?.options[0].price.perPerson).toBe(10000);
  });
});

describe("vue publique anonyme", () => {
  const SECRET_NAME = "Zébulon-Secret";
  const SECRET_COMMENT = "commentaire-tres-prive";

  async function seed(n: number) {
    for (let i = 0; i < n; i++) {
      const pid = id();
      await saveParticipation(db, pid, { draft: complete(`${SECRET_NAME}${i}`, i === 0 ? ["c1"] : ["c1", "c2"], SECRET_COMMENT), revision: 0, submit: true });
      await setKnowledge(db, pid, i === 0 ? "very" : "barely");
    }
  }

  test("rien sous 3 réponses envoyées (brouillons, exclues et supprimées hors compte)", async () => {
    await seed(2);
    const draft = id();
    await saveParticipation(db, draft, { draft: partial("Brouillon"), revision: 0, submit: false });
    const excluded = id();
    await saveParticipation(db, excluded, { draft: complete("Exclu"), revision: 0, submit: true });
    await setExcluded(db, excluded, true);
    const removed = id();
    await saveParticipation(db, removed, { draft: complete("Supprimé"), revision: 0, submit: true });
    await removeParticipation(db, removed);

    const data = await loadAdminData(db);
    expect(publicTrends(data)).toEqual({ status: "waiting", count: 2, needed: 3 });
  });

  test("tendances non pondérées, sans prénom, commentaire, niveau ni identifiant", async () => {
    await seed(4);
    const data = await loadAdminData(db);
    const trends = publicTrends(data);
    expect(trends.status).toBe("ready");
    if (trends.status !== "ready") return;
    expect(trends.count).toBe(4);

    const first = trends.questions.find((q) => q.title === v1.questions[0].title)!;
    expect(first.answered).toBe(4);
    // c2 : 3 personnes sur 4, quel que soit leur niveau de connaissance (pondéré, ce serait 3/6).
    const c2 = first.top.find((c) => c.label === v1.questions[0].options.c2)!;
    expect(c2).toEqual({ label: v1.questions[0].options.c2, count: 3, share: 0.75 });
    expect(first.top[0]).toMatchObject({ label: v1.questions[0].options.c1, count: 4, share: 1 });
    expect(trends.consensus.some((h) => h.label === v1.questions[0].options.c1 && h.share === 1)).toBe(true);
    // Questions libres absentes (que des commentaires).
    expect(trends.questions.some((q) => q.title === v1.questions.find((x) => x.optional)!.title)).toBe(false);

    const json = JSON.stringify(trends);
    expect(json).not.toContain(SECRET_NAME);
    expect(json).not.toContain(SECRET_COMMENT);
    for (const forbidden of ["knowledge", "weight", "\"name\"", "comment", "individuals", "\"id\"", "barely", "very"]) {
      expect(json).not.toContain(forbidden);
    }
    for (const r of data.responses) expect(json).not.toContain(r.id);
  });

  test("question positive (Q6 « à l'aise ») jamais en vigilance ; doutes par question et par activité", async () => {
    for (let i = 0; i < 4; i++) {
      const draft = complete(`P${i}`);
      draft.answers["6"] = { choices: ["c1"], comment: "" };
      draft.answers["5"] = { choices: i < 2 ? ["0-4", "1-1"] : ["0-0", "1-0"], comment: "" };
      draft.answers["16"] = { choices: ["c1"], comment: "" };
      await saveParticipation(db, id(), { draft, revision: 0, submit: true });
    }
    const trends = publicTrends(await loadAdminData(db));
    if (trends.status !== "ready") throw new Error("attendu : ready");
    const q6 = v1.questions.find((q) => q.id === 6)!;
    const q16 = v1.questions.find((q) => q.id === 16)!;
    expect(trends.limits.some((h) => h.label === q6.options.c1)).toBe(false);
    // Q16 « risques » reste bien une vigilance.
    expect(trends.limits.some((h) => h.label === q16.options.c1)).toBe(true);
    // Matrice : 2/4 « je ne sais pas » sur la 1re activité, 2/4 « ça dépend » sur la 2e.
    const rows = trends.doubts.filter((d) => d.question === v1.questions.find((q) => q.id === 5)!.title);
    expect(rows).toHaveLength(2);
    expect(rows.every((d) => d.share === 0.5 && !d.label.includes("·"))).toBe(true);
    expect(new Set(rows.map((d) => d.detail))).toEqual(new Set(["2 « ça dépend »", "2 « je ne sais pas »"]));
    // Questions où tout le monde a dit « Je ne sais pas » : en tête, à 100 %.
    expect(trends.doubts[0]).toMatchObject({ share: 1, detail: "4 « je ne sais pas »" });
    expect(trends.doubts.some((d) => d.label === q6.title)).toBe(false);
  });

  test("la fonction ne modifie pas les données d'entrée", async () => {
    await seed(3);
    const data = await loadAdminData(db);
    const before = JSON.stringify(data);
    publicTrends(data);
    expect(JSON.stringify(data)).toBe(before);
    const responses: ResponseEntry[] = data.responses;
    expect(responses.every((r) => r.answers["1"].comment === SECRET_COMMENT)).toBe(true);
  });
});
