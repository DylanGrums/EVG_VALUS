import { describe, expect, test } from "vitest";
import { buildCarnet } from "./carnet";
import type { DecisionTopic, PracticalInfo, TopicOption } from "@/db/schema";

const topic = (id: string, type: DecisionTopic["type"], status: DecisionTopic["status"], position: number) =>
  ({ id, type, status, title: `Sujet ${id}`, position }) as DecisionTopic;

const option = (id: string, topicId: string, o: Partial<TopicOption> = {}) =>
  ({ id, topicId, title: `Option ${id}`, selected: true, position: 0, startsAt: null, endsAt: null, address: null, url: null, priceTotalCents: null, pricePerPersonCents: null, ...o }) as TopicOption;

const info = (id: string, o: Partial<PracticalInfo> = {}) => ({ id, title: `Info ${id}`, category: "autre", position: 0, at: null, address: null, url: null, ...o }) as PracticalInfo;

describe("carnet sur place", () => {
  const topics = [
    topic("dest", "destination", "decide", 0),
    topic("log", "logement", "decide", 1),
    topic("act", "activites", "decide", 2),
    topic("tr", "transport", "clos", 3),
    topic("autre", "autre", "ouvert", 4),
  ];
  const options = [
    option("lisbonne", "dest"),
    option("porto", "dest", { selected: false }),
    option("airbnb", "log", { startsAt: "2027-05-14 16:00:00", endsAt: "2027-05-16 11:00:00", priceTotalCents: 120000 }),
    option("hotel", "log", { selected: false }),
    option("karting", "act", { startsAt: "2027-05-15 14:00:00", endsAt: "2027-05-15 16:00:00" }),
    option("bateau", "act", { startsAt: "2027-05-15 10:00:00" }),
    option("train", "tr", { startsAt: "2027-05-14 08:00:00" }), // retenu mais sujet non décidé
    option("x", "autre"),
  ];
  const infos = [info("pharma", { category: "sante" }), info("resa", { category: "contact", at: "2027-05-15 20:00:00" })];
  const carnet = buildCarnet(topics, options, infos, 6);

  test("ne garde que les options retenues des sujets décidés", () => {
    expect(carnet.destinations.map((d) => d.id)).toEqual(["lisbonne"]);
    expect(carnet.logements.map((d) => d.id)).toEqual(["airbnb"]);
    expect(carnet.activites.map((d) => d.id)).toEqual(["bateau", "karting"]);
    expect(carnet.transports).toEqual([]);
  });

  test("calcule le prix par personne du logement", () => {
    expect(carnet.logements[0].price.perPerson).toBe(20000);
  });

  test("planning chronologique groupé par jour", () => {
    expect(carnet.planning.map((d) => d.day)).toEqual(["2027-05-14", "2027-05-15", "2027-05-16"]);
    expect(carnet.planning[1].events.map((e) => [e.title, e.label])).toEqual([
      ["Option bateau", "Activité"],
      ["Option karting", "Activité"],
      ["Info resa", "Info"],
    ]);
    expect(carnet.planning[1].events[1].until).toBe("2027-05-15 16:00:00");
    expect(carnet.planning[0].events[0].label).toBe("Check-in");
    expect(carnet.planning[2].events[0].label).toBe("Check-out");
  });

  test("infos pratiques groupées par catégorie", () => {
    expect(carnet.infos.map((g) => g.category)).toEqual(["contact", "sante"]);
    expect(carnet.isEmpty).toBe(false);
  });

  test("carnet vide quand rien n'est décidé", () => {
    expect(buildCarnet([topic("a", "logement", "ouvert", 0)], [option("o", "a")], [], 4).isEmpty).toBe(true);
  });
});
