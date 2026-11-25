import { describe, expect, test } from "vitest";
import { canPropose, canVote, createsDependencyCycle, isLocked, isPastDeadline, localIso, memberPhase, nextVotes, priceInfo } from "./rules";
import { formatDay, formatEuros, parseEuros, formatTime } from "./format";
import type { DecisionTopic } from "@/db/schema";

const now = new Date("2027-05-01T10:00:00Z"); // 12h00 à Paris

function topic(overrides: Partial<DecisionTopic> = {}) {
  return { id: "t", status: "ouvert", deadline: null, dependsOnId: null, allowProposals: true, ...overrides } as DecisionTopic;
}

describe("verrouillage par dépendance", () => {
  const destination = topic({ id: "dest", status: "ouvert" });
  const logement = topic({ id: "log", dependsOnId: "dest" });

  test("verrouillé tant que la dépendance n'est pas décidée", () => {
    const byId = new Map([["dest", destination]]);
    expect(isLocked(logement, byId)).toBe(true);
    expect(memberPhase(logement, byId, now)).toBe("a_venir");
    expect(canVote(logement, byId, now)).toBe(false);
    expect(canPropose(logement, byId, now)).toBe(false);
  });

  test("débloqué une fois la dépendance décidée", () => {
    const byId = new Map([["dest", { ...destination, status: "decide" as const }]]);
    expect(isLocked(logement, byId)).toBe(false);
    expect(canVote(logement, byId, now)).toBe(true);
  });

  test("une dépendance supprimée ne verrouille pas", () => {
    expect(isLocked(logement, new Map())).toBe(false);
  });

  test("détecte les cycles", () => {
    const byId = new Map([
      ["a", { dependsOnId: null }],
      ["b", { dependsOnId: "a" }],
      ["c", { dependsOnId: "b" }],
    ]);
    expect(createsDependencyCycle("a", "c", byId)).toBe(true);
    expect(createsDependencyCycle("a", "a", byId)).toBe(true);
    expect(createsDependencyCycle("c", "a", byId)).toBe(false);
  });
});

describe("phases et droit de vote", () => {
  const byId = new Map();
  test.each([
    ["brouillon", "a_venir", false],
    ["ouvert", "ouvert", true],
    ["clos", "clos", false],
    ["decide", "decide", false],
  ] as const)("statut %s → %s", (status, phase, vote) => {
    const t = topic({ status });
    expect(memberPhase(t, byId, now)).toBe(phase);
    expect(canVote(t, byId, now)).toBe(vote);
  });

  test("date limite dépassée (heure de Paris) : votes figés", () => {
    expect(localIso(now)).toBe("2027-05-01T12:00");
    expect(isPastDeadline("2027-05-01 11:59:00", now)).toBe(true);
    expect(isPastDeadline("2027-05-01 12:30:00", now)).toBe(false);
    const t = topic({ deadline: "2027-04-30 20:00:00" });
    expect(memberPhase(t, byId, now)).toBe("vote_termine");
    expect(canVote(t, byId, now)).toBe(false);
  });

  test("propositions désactivées par l'orga", () => {
    expect(canPropose(topic({ allowProposals: false }), byId, now)).toBe(false);
    expect(canPropose(topic(), byId, now)).toBe(true);
  });
});

describe("bascule des votes", () => {
  test("un seul choix : remplace le vote précédent", () => {
    expect(nextVotes([], "a", "unique")).toEqual(["a"]);
    expect(nextVotes(["a"], "b", "unique")).toEqual(["b"]);
    expect(nextVotes(["a"], "a", "unique")).toEqual([]);
  });
  test("plusieurs choix : cumule et retire", () => {
    expect(nextVotes(["a"], "b", "multiple")).toEqual(["a", "b"]);
    expect(nextVotes(["a", "b"], "a", "multiple")).toEqual(["b"]);
  });
});

describe("prix par personne", () => {
  test("calculé depuis le total, arrondi au centime supérieur", () => {
    expect(priceInfo({ priceTotalCents: 100000, pricePerPersonCents: null }, 3)).toEqual({ perPerson: 33334, total: 100000, source: "calcule", totalEstimated: false });
  });
  test("saisi directement : prioritaire, total estimé", () => {
    expect(priceInfo({ priceTotalCents: null, pricePerPersonCents: 8000 }, 10)).toEqual({ perPerson: 8000, total: 80000, source: "saisi", totalEstimated: true });
    expect(priceInfo({ priceTotalCents: 50000, pricePerPersonCents: 6000 }, 10).perPerson).toBe(6000);
  });
  test("sans participant ni prix", () => {
    expect(priceInfo({ priceTotalCents: 100000, pricePerPersonCents: null }, 0).perPerson).toBeNull();
    expect(priceInfo({ priceTotalCents: null, pricePerPersonCents: null }, 8)).toEqual({ perPerson: null, total: null, source: null, totalEstimated: false });
  });
});

describe("formats", () => {
  test("euros", () => {
    expect(parseEuros("1 250,50 €")).toBe(125050);
    expect(parseEuros("89.9")).toBe(8990);
    expect(parseEuros("")).toBeNull();
    expect(parseEuros("abc")).toBeNaN();
    expect(formatEuros(125050).replace(/\s/g, " ")).toBe("1 250,50 €");
    expect(formatEuros(8000).replace(/\s/g, " ")).toBe("80 €");
  });
  test("dates locales", () => {
    expect(formatDay("2027-05-15 14:30:00")).toBe("samedi 15 mai");
    expect(formatTime("2027-05-15 14:30:00")).toBe("14h30");
    expect(formatTime("2027-05-15 09:00:00")).toBe("9h");
  });
});
