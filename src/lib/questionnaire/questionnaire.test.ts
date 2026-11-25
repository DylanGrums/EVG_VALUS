import { beforeAll, describe, expect, test } from "vitest";
import { createTestDb, type DB } from "@/db";
import { analyze, exportCsv, exportJson } from "./analysis";
import { cleanDefinition, toEditorQuestions } from "./definition";
import { seedQuestions } from "./seed";
import {
  getOrganizer, getResponse, isDeleted, listVersions, loadAdminData, loadPublicState, publishVersion, removeParticipation,
  saveOrganizer, saveParticipation, setExcluded, setKnowledge,
} from "./store";
import { hashToken, newToken } from "./token";
import type { Draft, QuestionnaireVersion, ResponseEntry } from "./types";
import { cleanDraft } from "./validation";

const answerAll = (definition: QuestionnaireVersion, name: string, first = { choices: ["c1", "c2"], comment: "" }): Draft => ({
  version: definition.version,
  name,
  step: definition.questions.length + 1,
  answers: Object.fromEntries(
    definition.questions.filter((q) => !q.optional).map((q, i) => [String(q.id), i === 0 ? first : { choices: ["unknown"], comment: "" }]),
  ),
});

let db: DB;
let v1: QuestionnaireVersion;
beforeAll(async () => {
  db = await createTestDb();
  v1 = (await listVersions(db))[0];
});

const submit = async (draft: Draft) => {
  const id = hashToken(newToken());
  const result = await saveParticipation(db, id, { draft, revision: 0, submit: true });
  expect(result).toMatchObject({ ok: true, submitted: true });
  return id;
};

describe("version 1 (seed)", () => {
  test("est insérée une seule fois et reflète les modifications demandées", async () => {
    expect((await listVersions(db)).length).toBe(1);
    const q = (id: number) => v1.questions.find((x) => x.id === id)!;
    const labels = (id: number) => Object.values(q(id).options);
    expect(v1.questions).toHaveLength(21);
    expect(labels(2)).not.toContain("Un verre dans un bar où l’on peut discuter");
    expect(labels(2).some((l) => l.includes("Oktoberfest"))).toBe(true);
    expect(labels(3)).not.toContain("Un atelier participatif");
    expect(labels(3)).not.toContain("Un moment libre pour explorer ensemble");
    expect(labels(3)).toContain("Une activité humoristique ou insolite");
    expect(labels(6)).not.toContain("Jouer un rôle dans un jeu entre amis");
    expect(labels(7)).not.toContain("Humour ou spectacle");
    expect(q(13).extraSpecial).toEqual({ any: "Peu importe" });
    expect(q(5).kind).toBe("matrix");
    expect(Object.keys(q(5).options)).toHaveLength(25);
    expect(q(5).options["0-2"]).toBe("Les activités en hauteur · Je ne pense pas");
    expect(q(20).optional && q(21).optional).toBe(true);
  });
});

describe("validation des réponses", () => {
  test("accepte une réponse complète et nettoie", () => {
    expect(cleanDraft(answerAll(v1, " Élodie "), v1, true)?.name).toBe("Élodie");
  });
  test("refuse choix inconnu, exclusif mélangé, matrice à double choix, nom ou commentaire trop longs", () => {
    const base = answerAll(v1, "A");
    const bad = (key: string, answer: { choices: string[]; comment: string }) =>
      cleanDraft({ ...base, answers: { ...base.answers, [key]: answer } }, v1, true);
    expect(bad("2", { choices: ["zzz"], comment: "" })).toBeNull();
    expect(bad("2", { choices: ["c1", "none"], comment: "" })).toBeNull();
    expect(bad("13", { choices: ["c1", "any"], comment: "" })).toBeNull();
    expect(bad("13", { choices: ["any"], comment: "" })).not.toBeNull();
    expect(bad("5", { choices: ["0-0", "0-1"], comment: "" })).toBeNull();
    expect(bad("5", { choices: ["0-0", "1-1", "2-4"], comment: "" })).not.toBeNull();
    expect(bad("5", { choices: ["0-0", "none"], comment: "" })).toBeNull();
    expect(bad("2", { choices: ["c1"], comment: "x".repeat(2001) })).toBeNull();
    expect(cleanDraft({ ...base, name: "n".repeat(61) }, v1, true)).toBeNull();
    expect(cleanDraft({ ...base, name: "  " }, v1, true)).toBeNull();
    expect(cleanDraft({ ...base, answers: {} }, v1, true)).toBeNull();
    expect(cleanDraft({ ...base, answers: {} }, v1, false)).not.toBeNull();
    expect(cleanDraft({ ...base, step: 99 }, v1, false)).toBeNull();
    expect(bad("20", { choices: ["c1"], comment: "" })).toBeNull();
  });
  test("un commentaire seul suffit", () => {
    const base = answerAll(v1, "A");
    expect(cleanDraft({ ...base, answers: { ...base.answers, 2: { choices: [], comment: "Juste ça" } } }, v1, true)).not.toBeNull();
  });
});

describe("parcours public", () => {
  test("brouillon, reprise, envoi idempotent, conflits", async () => {
    const id = hashToken(newToken());
    expect((await loadPublicState(db, id)).draft).toBeNull();
    // Rien à garder : aucune ligne créée.
    expect(await saveParticipation(db, id, { draft: { version: 1, name: "", step: 0, answers: {} }, revision: 0, submit: false })).toEqual({ ok: true, revision: 0, submitted: false });

    const draft = { ...answerAll(v1, "Camille"), step: 2 };
    const saved = await saveParticipation(db, id, { draft, revision: 0, submit: false });
    expect(saved).toEqual({ ok: true, revision: 1, submitted: false });
    expect((await loadPublicState(db, id)).draft?.name).toBe("Camille");
    // Mauvaise révision = conflit
    expect(await saveParticipation(db, id, { draft, revision: 0, submit: false })).toMatchObject({ ok: false, code: "conflict" });
    // Envois concurrents : un seul gagne, l'autre est un succès idempotent
    const [a, b] = await Promise.all([
      saveParticipation(db, id, { draft, revision: 1, submit: true }),
      saveParticipation(db, id, { draft, revision: 1, submit: true }),
    ]);
    expect(a).toMatchObject({ ok: true, submitted: true });
    expect(b).toMatchObject({ ok: true, submitted: true });
    const state = await loadPublicState(db, id);
    expect(state.submitted).toBe(true);
    expect(state.draft).toBeNull();
    expect(await saveParticipation(db, id, { draft, revision: 2, submit: false })).toMatchObject({ ok: false, code: "conflict" });
  });

  test("l'état public ne contient ni niveau de connaissance ni donnée d'analyse", async () => {
    const id = await submit(answerAll(v1, "Secret"));
    await setKnowledge(db, id, "very");
    const state = await loadPublicState(db, id);
    const json = JSON.stringify(state);
    expect(Object.keys(state).sort()).toEqual(["draft", "questions", "revision", "submitted", "version"]);
    expect(json).not.toMatch(/knowledge|excluded|weight|poids|à peine|le connaît/i);
  });

  test("version périmée refusée pour une nouvelle participation", async () => {
    const result = await saveParticipation(db, hashToken(newToken()), { draft: answerAll(v1, "X"), revision: 0, submit: true, ...{} }).then(() => null);
    expect(result).toBeNull(); // v1 est encore la dernière ici
    const stale = await saveParticipation(db, hashToken(newToken()), { draft: { ...answerAll(v1, "X"), version: 99 }, revision: 0, submit: true });
    expect(stale).toMatchObject({ ok: false, code: "stale" });
  });
});

describe("administration", () => {
  test("exclusion, suppression avec blocage des renvois", async () => {
    const id = await submit(answerAll(v1, "À retirer"));
    expect(await setExcluded(db, id, true)).toBe(true);
    expect((await getResponse(db, id))?.excluded).toBe(true);
    expect(await removeParticipation(db, id)).toBe(true);
    expect(await getResponse(db, id)).toBeNull();
    expect(await isDeleted(db, id)).toBe(true);
    expect(await saveParticipation(db, id, { draft: answerAll(v1, "Retour"), revision: 1, submit: false })).toMatchObject({ ok: false, code: "deleted" });
    expect((await loadAdminData(db)).responses.some((r) => r.id === id)).toBe(false);
  });

  test("le niveau ne s'attribue qu'à une réponse terminée", async () => {
    const draftId = hashToken(newToken());
    await saveParticipation(db, draftId, { draft: { version: 1, name: "En cours", step: 1, answers: {} }, revision: 0, submit: false });
    expect(await setKnowledge(db, draftId, "well")).toBe(false);
    const done = await submit(answerAll(v1, "Terminée"));
    expect(await setKnowledge(db, done, "barely")).toBe(true);
    expect((await getResponse(db, done))?.knowledge).toBe("barely");
    expect(await setKnowledge(db, done, null)).toBe(true);
    expect(await setKnowledge(db, done, "nimporte" as never)).toBe(false);
  });

  test("avis privé de l'organisateur", async () => {
    expect(await getOrganizer(db)).toBeNull();
    const r = await saveOrganizer(db, { version: 1, name: "Orga", step: 0, answers: { 1: { choices: ["c1"], comment: "Privé" } } });
    expect(r.ok).toBe(true);
    expect((await getOrganizer(db))?.answers["1"].comment).toBe("Privé");
    expect((await saveOrganizer(db, { version: 42, name: "x", step: 0, answers: {} })).ok).toBe(false);
  });
});

describe("analyses pondérées", () => {
  const entry = (id: string, knowledge: "barely" | "well" | "very" | null, answers: Record<string, { choices: string[]; comment: string }>): ResponseEntry => ({
    id, version: 1, name: id, step: 22, answers, submittedAt: "2027-01-01T10:00:00.000Z", updatedAt: "2027-01-01T10:00:00.000Z", excluded: false, knowledge,
  });
  const data = (responses: ResponseEntry[]) => ({ versions: [v1], responses, organizer: null });
  const q1 = (a: ReturnType<typeof analyze>) => a.results.find((r) => r.question.id === 1)!;

  test("pourcentage pondéré, nombre brut, non classé = poids 2", () => {
    const a = analyze(data([
      entry("a", "barely", { 1: { choices: ["c1"], comment: "" } }), // poids 1
      entry("b", "very", { 1: { choices: ["c2"], comment: "" } }), // poids 3
      entry("c", null, { 1: { choices: ["c1"], comment: "" } }), // poids 2
      entry("d", "well", {}), // n'a pas répondu à Q1
    ]));
    const r = q1(a);
    expect(r.answered).toBe(3);
    expect(r.weightedAnswered).toBe(6);
    const c1 = r.choices.find((c) => c.key === "c1")!;
    expect(c1.count).toBe(2);
    expect(c1.weight).toBe(3);
    expect(c1.share).toBeCloseTo(0.5);
    expect(r.choices.find((c) => c.key === "c2")!.share).toBeCloseTo(0.5);
    expect(a.weightedCount).toBe(1 + 3 + 2 + 2);
  });

  test("commentaire seul compté, brouillons et exclus hors analyses", () => {
    const draft = { ...entry("d", "very", { 1: { choices: ["c1"], comment: "" } }), submittedAt: null };
    const out = { ...entry("e", "very", { 1: { choices: ["c1"], comment: "" } }), excluded: true };
    const a = analyze(data([entry("a", null, { 1: { choices: [], comment: "Seulement un mot" } }), draft, out]));
    expect(q1(a).answered).toBe(1);
    expect(q1(a).comments).toHaveLength(1);
    expect(a.respondentCount).toBe(1);
  });

  test("convergence : deux personnes et 75 % du poids", () => {
    const strong = analyze(data([
      entry("a", "barely", { 1: { choices: ["c1"], comment: "" } }),
      entry("b", "very", { 1: { choices: ["c1"], comment: "" } }),
      entry("c", "barely", { 1: { choices: ["c1"], comment: "" } }),
    ]));
    expect(q1(strong).agreements).toContain("c1");
    // Le poids du dissident fait passer sous 75 % : 2 pour / 3 contre en poids.
    const weak = analyze(data([
      entry("a", "barely", { 1: { choices: ["c1"], comment: "" } }),
      entry("b", "barely", { 1: { choices: ["c1"], comment: "" } }),
      entry("c", "very", { 1: { choices: ["c2"], comment: "" } }),
    ]));
    expect(q1(weak).agreements).not.toContain("c1");
  });

  test("filtre par niveau (dont non classé) ; l'avis de l'organisateur est écarté", () => {
    const d = { ...data([
      entry("a", "barely", { 1: { choices: ["c1"], comment: "" } }),
      entry("b", "very", { 1: { choices: ["c2"], comment: "" } }),
      entry("c", null, { 1: { choices: ["c3"], comment: "" } }),
    ]), organizer: { version: 1, name: "Orga", step: 0, answers: { 1: { choices: ["c4"], comment: "" } }, updatedAt: null } };
    expect(analyze(d, { levels: ["very"] }).respondentCount).toBe(1);
    expect(q1(analyze(d, { levels: ["unranked"] })).choices.find((c) => c.key === "c3")!.count).toBe(1);
    expect(analyze(d, { levels: ["barely", "very"] }).respondentCount).toBe(2);
    expect(analyze(d, { includeOrganizer: true }).analyzedCount).toBe(4);
    expect(analyze(d, { includeOrganizer: true, levels: ["very"] }).organizerIncluded).toBe(false);
  });

  test("matrice : divergence partant / déjà dit non et incertitude", () => {
    const a = analyze(data([
      entry("a", null, { 5: { choices: ["0-0"], comment: "" } }),
      entry("b", null, { 5: { choices: ["0-3", "1-1"], comment: "" } }),
    ]));
    const r = a.results.find((x) => x.question.id === 5)!;
    expect(r.divergences.some((t) => t.includes("Il serait partant") && t.includes("Il a déjà dit non"))).toBe(true);
    expect(r.uncertain).toBe(1);
  });

  test("exports : CSV (niveau, poids, exclus, anti-formule) et JSON", () => {
    const rows = [
      entry("a", "very", { 1: { choices: ["c1"], comment: "=HYPERLINK(\"x\")" } }),
      { ...entry("b", null, { 1: { choices: ["c2"], comment: "ok" } }), excluded: true },
      { ...entry("c", null, {}), submittedAt: null },
    ];
    const csv = exportCsv(data(rows));
    expect(csv).toContain("niveau de connaissance");
    expect(csv).toContain("Le connaît très bien");
    expect(csv).toContain("À classer");
    expect(csv).toContain('"\'=HYPERLINK');
    expect(csv).toContain('"oui"');
    expect(csv).not.toContain('"c";'); // brouillon absent
    const json = exportJson(data(rows));
    expect(json.responses).toHaveLength(2);
    expect(json.responses[0]).toMatchObject({ weight: 3 });
  });
});

describe("éditeur versionné", () => {
  test("publication, conflit, masquage, ajout, réordonnancement ; brouillons et réponses gardent leur version", async () => {
    const ongoing = hashToken(newToken());
    await saveParticipation(db, ongoing, { draft: { ...answerAll(v1, "Avant publication"), step: 3 }, revision: 0, submit: false });

    const edit = toEditorQuestions(v1);
    edit[0].labels[0] = "Première option modifiée";
    edit[1].hidden = true;
    [edit[2], edit[3]] = [edit[3], edit[2]];
    edit.push({ id: "q-979736ba-86c4-401d-9d90-5bd645c0608d", theme: "experiences", title: "Question ajoutée", prompt: "Autre suggestion ?", hint: "", labels: [] });

    expect(await publishVersion(db, 1, edit)).toEqual({ ok: true, version: 2 });
    expect(await publishVersion(db, 1, edit)).toMatchObject({ ok: false, code: "conflict" });
    expect(await publishVersion(db, 2, [])).toMatchObject({ ok: false, code: "invalid" });

    const versions = await listVersions(db);
    const v2 = versions[1];
    expect(v2.questions.find((q) => q.id === 2)?.hidden).toBe(true);
    expect(v2.questions.at(-1)?.optional).toBe(true);
    // Les paires opposées (Q12) survivent à une modification d'une autre question mais pas à celle de leurs libellés.
    expect(v2.questions.find((q) => q.id === 12)?.opposite).toEqual([["c1", "c4"]]);

    // Le brouillon en cours reste sur v1 ; un nouveau répondant a v2 (sans Q2 masquée).
    const state = await loadPublicState(db, ongoing);
    expect(state.version).toBe(1);
    expect(state.questions.some((q) => q.id === "2")).toBe(true);
    const fresh = await loadPublicState(db, null);
    expect(fresh.version).toBe(2);
    expect(fresh.questions.some((q) => q.id === "2")).toBe(false);
    expect(await saveParticipation(db, ongoing, { draft: answerAll(v1, "Avant publication"), revision: 1, submit: true })).toMatchObject({ ok: true });

    // Analyses : la question 1 modifiée est séparée de l'ancienne.
    const admin = await loadAdminData(db);
    const result = analyze(admin);
    const q1s = result.results.filter((r) => r.question.id === 1);
    expect(q1s).toHaveLength(2);
    expect(q1s.find((r) => r.versions.includes(1))!.labels.c1).toBe(v1.questions[0].options.c1);
    // Une question inchangée est regroupée sur les deux versions.
    expect(result.results.find((r) => r.question.id === 6)!.versions.sort()).toEqual([1, 2]);
  });

  test("refuse la disparition d'une question, un doublon de libellé, un id inventé", () => {
    const edit = toEditorQuestions({ version: 1, questions: seedQuestions });
    expect(cleanDefinition(edit.slice(1), seedQuestions)).toBeNull();
    const dup = structuredClone(edit);
    dup[0].labels[1] = dup[0].labels[0];
    expect(cleanDefinition(dup, seedQuestions)).toBeNull();
    expect(cleanDefinition([...edit, { id: "nimporte", theme: "ambiance", title: "t", prompt: "p", hint: "", labels: [] }], seedQuestions)).toBeNull();
    expect(cleanDefinition(edit, seedQuestions)).not.toBeNull();
  });
});
