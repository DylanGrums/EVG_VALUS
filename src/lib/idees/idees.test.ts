import { beforeEach, describe, expect, test } from "vitest";
import { createTestDb, type DB } from "@/db";
import { ideaCities, ideaEvents } from "@/db/schema";
import { OrgaError } from "@/lib/orga/errors";
import { addParticipant, removeParticipant } from "@/lib/orga/participants";
import { seedQuestions } from "@/lib/questionnaire/seed";
import type { AdminData, ResponseEntry } from "@/lib/questionnaire/types";
import { normalize } from "@/lib/questionnaire/format";
import { cityKey } from "./common";
import { applyImport, IMPORT_EXAMPLE, locatePaths, parseImportText, previewImport, type ImportData } from "./import";
import {
  addIdeaComment,
  deleteCity,
  listCitySummaries,
  loadCityView,
  proposeCity,
  proposeEvent,
  setCityHidden,
  setCityRetained,
  setEventHidden,
  sortAndFilterCities,
  toggleCityVote,
  toggleEventVote,
} from "./ideas";
import { buildResearchMarkdown, buildResearchPrompt, makeRedactor } from "./research";
import { cityFormSchema, eventFormSchema } from "./validation";

let db: DB;
beforeEach(async () => {
  db = await createTestDb();
});

const parse = (value: unknown): ImportData => {
  const result = parseImportText(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.data;
};

const cityInput = (o: Partial<Record<string, string>> = {}) => cityFormSchema.parse({ name: "Gand", country: "Belgique", summary: "", why: "", access: "", budget: "", url: "", ...o });
const eventInput = (o: Partial<Record<string, string>> = {}) =>
  eventFormSchema.parse({ name: "Balade", category: "nature", description: "", why: "", startsOn: "", endsOn: "", datesText: "", priceText: "", priceMin: "", url: "", address: "", ...o });

describe("validation de l'import", () => {
  test("l'exemple documenté est valide, catégories avec ou sans accent", () => {
    const data = parse(IMPORT_EXAMPLE);
    expect(data.villes[0].evenements.map((e) => e.categorie)).toEqual(["gastronomie", "fete"]);
    expect(data.villes[0].evenements[0].prix_min_eur).toBe(2000);
    expect(parse({ villes: [{ nom: "A", pays: "B", evenements: [{ nom: "x", categorie: "Soirée" }] }] }).villes[0].evenements[0].categorie).toBe("soiree");
  });

  test("tolère le texte autour du JSON (bloc ```json de l'IA)", () => {
    const text = "Voici le résultat :\n```json\n" + JSON.stringify({ villes: [{ nom: "Porto", pays: "Portugal" }] }) + "\n```\nBon voyage !";
    expect(parse(text).villes[0].nom).toBe("Porto");
  });

  test("erreurs avec numéro de ligne et chemin lisible", () => {
    const text = JSON.stringify(
      { villes: [{ nom: "Porto", pays: "Portugal", evenements: [{ nom: "Fête", categorie: "rave", date_debut: "2027-02-31", lien: "javascript:alert(1)" }] }, { nom: "Sans pays" }] },
      null,
      2,
    );
    const result = parseImportText(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const lines = text.split("\n");
    const byField = (field: string) => result.errors.find((e) => e.where.endsWith(field));
    expect(byField("categorie")?.where).toBe("Ville 1 « Porto » › événement 1 « Fête » › categorie");
    expect(lines[byField("categorie")!.line! - 1]).toContain('"categorie"');
    expect(lines[byField("date_debut")!.line! - 1]).toContain('"date_debut"');
    expect(lines[byField("lien")!.line! - 1]).toContain('"lien"');
    // Champ manquant : ligne de l'objet parent.
    expect(byField("pays")?.where).toBe("Ville 2 « Sans pays » › pays");
    expect(byField("pays")?.line).not.toBeNull();
  });

  test("JSON mal formé : message et ligne", () => {
    const result = parseImportText('{\n  "villes": [\n    { "nom": "A", }\n  ]\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toMatch(/JSON invalide/);
    expect(parseImportText("").ok).toBe(false);
    expect(parseImportText('{"villes": []}').ok).toBe(false);
  });

  test("locatePaths", () => {
    const lines = locatePaths('{\n "villes": [\n  {\n   "nom": "a\\"b",\n   "evenements": [ { "nom": "x" } ]\n  }\n ]\n}');
    expect(lines.get("villes.0.nom")).toBe(4);
    expect(lines.get("villes.0.evenements.0.nom")).toBe(5);
  });

  test("doublons internes fusionnés avec avertissement", () => {
    const result = parseImportText(JSON.stringify({ villes: [{ nom: "Porto", pays: "Portugal", evenements: [{ nom: "A" }] }, { nom: "porto", pays: "PORTUGAL", evenements: [{ nom: "B" }, { nom: "a" }] }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.villes).toHaveLength(1);
    expect(result.data.villes[0].evenements.map((e) => e.nom)).toEqual(["a", "B"]);
    expect(result.warnings).toHaveLength(2);
  });
});

describe("import idempotent", () => {
  test("réimport : mise à jour sans doublon, votes, commentaires, masquage et retenue conservés", async () => {
    const tom = await addParticipant(db, "Tom");
    const first = parse(IMPORT_EXAMPLE);
    expect((await previewImport(db, first)).counts).toEqual({ newCities: 1, existingCities: 0, newEvents: 2, existingEvents: 0 });
    await applyImport(db, first);

    const [city] = await db.select().from(ideaCities);
    const events = await db.select().from(ideaEvents);
    await toggleCityVote(db, tom.id, city.id);
    await toggleEventVote(db, tom.id, events[0].id);
    await addIdeaComment(db, tom.id, city.id, events[0].id, "Trop bien");
    await setCityRetained(db, city.id, true);
    await setEventHidden(db, events[1].id, true);

    const second = parse({
      villes: [
        {
          nom: "PORTO ",
          pays: "portugal",
          resume: "Nouveau résumé",
          evenements: [{ nom: "dégustation dans une cave de vila nova de gaia", prix_min_eur: 25 }, { nom: "Nouveau truc", categorie: "sport" }],
        },
        { nom: "Séville", pays: "Espagne" },
      ],
    });
    expect((await previewImport(db, second)).counts).toEqual({ newCities: 1, existingCities: 1, newEvents: 1, existingEvents: 1 });
    await applyImport(db, second);
    await applyImport(db, second); // deux fois : aucun effet de plus

    const cities = await db.select().from(ideaCities);
    expect(cities).toHaveLength(2);
    const porto = cities.find((c) => c.id === city.id)!;
    expect(porto.summary).toBe("Nouveau résumé");
    expect(porto.access).toBe(city.access); // absent du fichier → inchangé
    expect(porto.retained).toBe(true);
    const view = (await loadCityView(db, city.id, tom.id, { forAdmin: true }))!;
    expect(view.events).toHaveLength(3);
    const tasting = view.events.find((e) => e.id === events[0].id)!;
    expect(tasting.priceMinCents).toBe(2500);
    expect(tasting.description).toBe(events[0].description);
    expect(tasting.voters.map((v) => v.name)).toEqual(["Tom"]);
    expect(tasting.comments.map((c) => c.body)).toEqual(["Trop bien"]);
    expect(view.voted).toBe(true);
    expect(view.events.find((e) => e.id === events[1].id)!.hidden).toBe(true);
  });
});

describe("votes, propositions, masquage", () => {
  test("👍 multiples et bascule", async () => {
    const tom = await addParticipant(db, "Tom");
    const lea = await addParticipant(db, "Léa");
    await applyImport(db, parse({ villes: [{ nom: "A", pays: "X", evenements: [{ nom: "e1" }, { nom: "e2" }] }, { nom: "B", pays: "X" }] }));
    const [a, b] = (await listCitySummaries(db)).sort((x, y) => x.name.localeCompare(y.name));
    expect(await toggleCityVote(db, tom.id, a.id)).toBe(true);
    expect(await toggleCityVote(db, tom.id, b.id)).toBe(true); // plusieurs villes soutenues
    expect(await toggleCityVote(db, lea.id, a.id)).toBe(true);
    expect(await toggleCityVote(db, tom.id, a.id)).toBe(false); // retrait
    const summaries = await listCitySummaries(db, { participantId: tom.id });
    expect(summaries.map((c) => [c.name, c.voteCount, c.voted])).toEqual([
      ["A", 1, false],
      ["B", 1, true],
    ]);

    const view = (await loadCityView(db, a.id, tom.id))!;
    for (const e of view.events) await toggleEventVote(db, tom.id, e.id);
    const after = (await loadCityView(db, a.id, tom.id))!;
    expect(after.events.every((e) => e.voted && e.voters.length === 1)).toBe(true);

    await removeParticipant(db, lea.id);
    await expect(toggleCityVote(db, lea.id, a.id)).rejects.toBeInstanceOf(OrgaError);
  });

  test("proposition d'un membre : marquée, doublon refusé", async () => {
    const tom = await addParticipant(db, "Tom");
    const city = await proposeCity(db, tom.id, cityInput({ url: "gand.be" }));
    expect(city).toMatchObject({ source: "membre", createdById: tom.id, url: "https://gand.be", key: cityKey("Gand", "Belgique") });
    await expect(proposeCity(db, tom.id, cityInput({ name: "GAND" }))).rejects.toBeInstanceOf(OrgaError);
    const event = await proposeEvent(db, tom.id, city.id, eventInput({ startsOn: "2027-05-15", priceMin: "12,50" }));
    expect(event).toMatchObject({ source: "membre", createdById: tom.id, startsOn: "2027-05-15", priceMinCents: 1250 });
    await expect(proposeEvent(db, tom.id, city.id, eventInput({ name: "balade" }))).rejects.toBeInstanceOf(OrgaError);
    const view = (await loadCityView(db, city.id, tom.id))!;
    expect(view.proposedByName).toBe("Tom");
    expect(view.events[0].proposedByName).toBe("Tom");
    expect(() => eventFormSchema.parse({ ...eventInput(), category: "rave" })).toThrow();
  });

  test("masquage : invisible des membres, plus de vote ni de commentaire ; retenue en tête ; suppression en cascade", async () => {
    const tom = await addParticipant(db, "Tom");
    await applyImport(db, parse({ villes: [{ nom: "A", pays: "X", evenements: [{ nom: "e1" }] }, { nom: "B", pays: "X" }, { nom: "C", pays: "X" }] }));
    const all = await listCitySummaries(db, { forAdmin: true });
    const [a, b, c] = all.sort((x, y) => x.name.localeCompare(y.name));
    await setCityHidden(db, a.id, true);
    expect((await listCitySummaries(db)).map((x) => x.name)).toEqual(["B", "C"]);
    expect(await loadCityView(db, a.id, tom.id)).toBeNull();
    expect(await loadCityView(db, a.id, null, { forAdmin: true })).not.toBeNull();
    await expect(toggleCityVote(db, tom.id, a.id)).rejects.toBeInstanceOf(OrgaError);
    await expect(addIdeaComment(db, tom.id, a.id, null, "x")).rejects.toBeInstanceOf(OrgaError);

    await toggleCityVote(db, tom.id, b.id);
    await setCityRetained(db, c.id, true);
    const sorted = sortAndFilterCities(await listCitySummaries(db), "votes", "", normalize);
    expect(sorted.map((x) => x.name)).toEqual(["C", "B"]);
    expect(sortAndFilterCities(await listCitySummaries(db), "nom", "b", normalize).map((x) => x.name)).toEqual(["B"]);

    await setCityHidden(db, a.id, false);
    const ev = (await loadCityView(db, a.id, tom.id))!.events[0];
    await setEventHidden(db, ev.id, true);
    expect((await loadCityView(db, a.id, tom.id))!.events).toHaveLength(0);
    await expect(toggleEventVote(db, tom.id, ev.id)).rejects.toBeInstanceOf(OrgaError);

    await deleteCity(db, a.id);
    expect(await db.select().from(ideaEvents)).toHaveLength(0);
  });
});

describe("synthèse Markdown", () => {
  const response = (id: string, name: string, knowledge: ResponseEntry["knowledge"], answers: ResponseEntry["answers"]): ResponseEntry => ({
    id,
    version: 1,
    name,
    step: 0,
    answers,
    submittedAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:00.000Z",
    excluded: false,
    knowledge,
  });
  const data: AdminData = {
    versions: [{ version: 1, questions: seedQuestions }],
    responses: [
      response("a", "Bernadette", "very", {
        1: { choices: ["c3"], comment: "Il adore quand Gérard organise des soirées" },
        5: { choices: ["0-3", "1-0"], comment: "Jamais de saut à l'élastique, Valentin a le vertige" },
        16: { choices: ["c4"], comment: "" },
      }),
      response("b", "Gérard Dupont", "barely", { 1: { choices: ["c3", "c4"], comment: "" }, 5: { choices: ["0-2"], comment: "" } }),
    ],
    organizer: null,
  };

  test("pondéré et brut, critères, limites, sans prénom de répondant", () => {
    const md = buildResearchMarkdown(data, { now: new Date("2026-11-27T12:00:00Z"), participantCount: 8 });
    expect(md).toContain("## Critères pour la recherche");
    expect(md).toContain("mai 2027");
    expect(md).toContain("environ 8 participants");
    // c3 choisi par les deux : 100 % pondéré, 2 / 2 brut ; c4 : 1/(3+1) = 25 % pondéré, 1 / 2 brut.
    expect(md).toMatch(/\| Une ambiance animée avec du monde \| 100 % \| 2 \/ 2 \(100 %\) \|/);
    expect(md).toMatch(/\| Une ambiance de grande fête \| 25 % \| 1 \/ 2 \(50 %\) \|/);
    expect(md).toContain("## Limites et « non » forts");
    expect(md).toMatch(/\*\*Les activités en hauteur\*\* : « a déjà dit non » 75 % \(1 pers\.\)/);
    expect(md).toContain("Des dépenses élevées sur place");
    expect(md).toContain("« Il adore quand [prénom] organise des soirées »");
    expect(md).toContain("Valentin a le vertige");
    for (const name of ["Bernadette", "Gérard", "Dupont"]) expect(md).not.toContain(name);
  });

  test("redaction et prompt", () => {
    expect(makeRedactor(["Jean-Mi", "Val"])("Jean-Mi et Val, jean-mi")).toBe("[prénom] et Val, [prénom]");
    const prompt = buildResearchPrompt({ participantCount: 6 });
    expect(prompt).toContain('"villes"');
    expect(prompt).toContain("mai 2027");
    expect(prompt).toContain("environ 6 personnes");
  });
});
