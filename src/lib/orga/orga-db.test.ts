import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type DB } from "@/db";
import { decisionTopics, optionVotes } from "@/db/schema";
import { OrgaError } from "./errors";
import { addParticipant, countActiveParticipants, listParticipants, NameTakenError, registerSelf, removeParticipant, renameParticipant } from "./participants";
import { addComment, createOrgaOption, createTopic, loadTopicView, listTopicSummaries, moveTopic, proposeOption, setOptionSelected, setTopicStatus, updateTopic } from "./topics";
import { toggleVote } from "./votes";
import { loadCarnet } from "./carnet";
import { optionSchema, topicSchema } from "./validation";

const topicInput = (o: Partial<Record<string, string>> = {}) =>
  topicSchema.parse({ type: "autre", title: "Sujet", description: "", voteMode: "unique", deadline: "", dependsOnId: "", allowProposals: "on", ...o });
const optionInput = (o: Partial<Record<string, string>> = {}) =>
  optionSchema.parse({ title: "Option", description: "", url: "", imageUrl: "", address: "", priceTotal: "", pricePerPerson: "", startsAt: "", endsAt: "", openingHours: "", practicalNotes: "", ...o });

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
});

describe("participants", () => {
  test("ajout, doublon refusé, renommage", async () => {
    const tom = await addParticipant(db, "  Tom ");
    expect(tom.name).toBe("Tom");
    await expect(addParticipant(db, "tom")).rejects.toBeInstanceOf(OrgaError);
    await renameParticipant(db, tom.id, "Thomas");
    expect((await listParticipants(db)).map((p) => p.name)).toEqual(["Thomas"]);
  });

  test("retrait doux si la personne a voté, suppression sinon", async () => {
    const a = await addParticipant(db, "Alex");
    const b = await addParticipant(db, "Bob");
    const t = await createTopic(db, topicInput());
    await setTopicStatus(db, t.id, "ouvert");
    const o = await createOrgaOption(db, t.id, optionInput());
    await toggleVote(db, a.id, o.id);

    expect(await removeParticipant(db, a.id)).toBe("desactive");
    expect(await removeParticipant(db, b.id)).toBe("supprime");
    expect(await countActiveParticipants(db)).toBe(0);
    expect((await listParticipants(db, { includeInactive: true })).map((p) => [p.name, p.active])).toEqual([["Alex", false]]);
    // Le vote est conservé et toujours affiché.
    expect((await loadTopicView(db, t.id, null))!.options[0].voters.map((v) => v.name)).toEqual(["Alex"]);
    // Un participant retiré ne peut plus voter ; le rajouter le réactive.
    await expect(toggleVote(db, a.id, o.id)).rejects.toBeInstanceOf(OrgaError);
    expect((await addParticipant(db, "alex")).id).toBe(a.id);
  });

  test("inscription libre : prénom pris refusé, personne retirée jamais réactivée", async () => {
    const sam = await registerSelf(db, " Sam ");
    expect(sam.name).toBe("Sam");
    await expect(registerSelf(db, "sam")).rejects.toBeInstanceOf(NameTakenError);
    await expect(registerSelf(db, "sam")).rejects.toMatchObject({ existing: { id: sam.id, name: "Sam" } });
    await expect(registerSelf(db, "   ")).rejects.toBeInstanceOf(OrgaError);
    // Un prénom ajouté par un orga est aussi « pris » : la personne doit le choisir dans la liste.
    await addParticipant(db, "Léo");
    await expect(registerSelf(db, "LÉO".toLowerCase())).rejects.toBeInstanceOf(NameTakenError);
    // Après retrait par un orga, une nouvelle inscription crée une nouvelle fiche.
    await removeParticipant(db, sam.id);
    const again = await registerSelf(db, "Sam");
    expect(again.id).not.toBe(sam.id);
  });
});

describe("votes", () => {
  test("un seul choix, bascule, votes figés hors statut ouvert", async () => {
    const p = await addParticipant(db, "Paul");
    const t = await createTopic(db, topicInput());
    const o1 = await createOrgaOption(db, t.id, optionInput({ title: "A" }));
    const o2 = await createOrgaOption(db, t.id, optionInput({ title: "B" }));

    await expect(toggleVote(db, p.id, o1.id)).rejects.toThrow("fermés"); // brouillon
    await setTopicStatus(db, t.id, "ouvert");
    expect(await toggleVote(db, p.id, o1.id)).toEqual([o1.id]);
    expect(await toggleVote(db, p.id, o2.id)).toEqual([o2.id]);
    expect(await db.select().from(optionVotes)).toHaveLength(1);
    expect(await toggleVote(db, p.id, o2.id)).toEqual([]);

    await toggleVote(db, p.id, o1.id);
    await setTopicStatus(db, t.id, "clos");
    await expect(toggleVote(db, p.id, o1.id)).rejects.toBeInstanceOf(OrgaError);
    const view = (await loadTopicView(db, t.id, p.id))!;
    expect(view.myVotes).toEqual([o1.id]);
    expect(view.canVote).toBe(false);
  });

  test("plusieurs choix", async () => {
    const p = await addParticipant(db, "Paul");
    const t = await createTopic(db, topicInput({ voteMode: "multiple" }));
    await setTopicStatus(db, t.id, "ouvert");
    const o1 = await createOrgaOption(db, t.id, optionInput());
    const o2 = await createOrgaOption(db, t.id, optionInput());
    await toggleVote(db, p.id, o1.id);
    expect(await toggleVote(db, p.id, o2.id)).toEqual([o1.id, o2.id]);
  });

  test("le logement est verrouillé tant que la destination n'est pas décidée", async () => {
    const p = await addParticipant(db, "Paul");
    const dest = await createTopic(db, topicInput({ type: "destination", title: "Destination" }));
    const log = await createTopic(db, topicInput({ type: "logement", title: "Logement", dependsOnId: dest.id }));
    await setTopicStatus(db, dest.id, "ouvert");
    await setTopicStatus(db, log.id, "ouvert");
    const lisbonne = await createOrgaOption(db, dest.id, optionInput({ title: "Lisbonne" }));
    const airbnb = await createOrgaOption(db, log.id, optionInput({ title: "Airbnb", priceTotal: "1200" }));

    await expect(toggleVote(db, p.id, airbnb.id)).rejects.toBeInstanceOf(OrgaError);
    await expect(proposeOption(db, p.id, log.id, optionInput())).rejects.toBeInstanceOf(OrgaError);
    await expect(addComment(db, p.id, log.id, null, "Hâte !")).rejects.toBeInstanceOf(OrgaError);
    expect((await listTopicSummaries(db)).map((s) => s.phase)).toEqual(["ouvert", "a_venir"]);

    await expect(setTopicStatus(db, dest.id, "decide")).rejects.toThrow("Retiens");
    await setOptionSelected(db, lisbonne.id, true);
    await setTopicStatus(db, dest.id, "decide");
    expect(await toggleVote(db, p.id, airbnb.id)).toEqual([airbnb.id]);
    await proposeOption(db, p.id, log.id, optionInput({ title: "Hôtel" }));
    await addComment(db, p.id, log.id, airbnb.id, "Top la terrasse");

    const view = (await loadTopicView(db, log.id, p.id))!;
    expect(view.options.map((o) => o.title)).toEqual(["Airbnb", "Hôtel"]);
    expect(view.options[0].price.perPerson).toBe(120000);
    expect(view.options[0].comments[0].authorName).toBe("Paul");
    expect(view.options[1].proposedByName).toBe("Paul");
  });

  test("refuse une dépendance circulaire", async () => {
    const a = await createTopic(db, topicInput({ title: "A" }));
    const b = await createTopic(db, topicInput({ title: "B", dependsOnId: a.id }));
    await expect(updateTopic(db, a.id, topicInput({ title: "A", dependsOnId: b.id }))).rejects.toThrow("circulaire");
  });
});

describe("sujets et carnet", () => {
  test("ordre des sujets", async () => {
    const a = await createTopic(db, topicInput({ title: "A" }));
    await createTopic(db, topicInput({ title: "B" }));
    await moveTopic(db, a.id, 1);
    const rows = await db.select().from(decisionTopics).orderBy(decisionTopics.position);
    expect(rows.map((r) => r.title)).toEqual(["B", "A"]);
  });

  test("retenir en mode unique remplace, retirer la dernière option rouvre le sujet", async () => {
    const t = await createTopic(db, topicInput({ type: "logement" }));
    const o1 = await createOrgaOption(db, t.id, optionInput({ startsAt: "2027-05-14T16:00" }));
    const o2 = await createOrgaOption(db, t.id, optionInput());
    await setOptionSelected(db, o1.id, true);
    await setOptionSelected(db, o2.id, true);
    await setTopicStatus(db, t.id, "decide");
    expect((await loadCarnet(db)).logements.map((l) => l.id)).toEqual([o2.id]);

    await setOptionSelected(db, o2.id, false);
    const [row] = await db.select().from(decisionTopics).where(eq(decisionTopics.id, t.id));
    expect(row.status).toBe("clos");
    expect((await loadCarnet(db)).isEmpty).toBe(true);
  });

  test("les brouillons sont invisibles pour les membres", async () => {
    const t = await createTopic(db, topicInput());
    expect(await loadTopicView(db, t.id, null)).toBeNull();
    expect(await loadTopicView(db, t.id, null, { forAdmin: true })).not.toBeNull();
    expect(await listTopicSummaries(db)).toEqual([]);
  });
});
