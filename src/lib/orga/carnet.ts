/**
 * Carnet de voyage (phase B, sur place) : ne contient QUE ce qui a été retenu,
 * c'est-à-dire les options `selected` des sujets au statut « décidé », plus les infos pratiques.
 */
import { asc } from "drizzle-orm";
import type { DB } from "@/db";
import { decisionTopics, practicalInfos, topicOptions, type DecisionTopic, type InfoCategory, type PracticalInfo, type TopicOption, type TopicType } from "@/db/schema";
import { dayKey } from "./format";
import { countActiveParticipants } from "./participants";
import { priceInfo, type PriceInfo } from "./rules";

export type CarnetItem = TopicOption & { topicType: TopicType; topicTitle: string; price: PriceInfo };

export type CarnetEvent = {
  at: string;
  /** Fin éventuelle (même événement, ex. activité 14h-16h). */
  until: string | null;
  label: string;
  title: string;
  kind: TopicType | "info";
  address: string | null;
  url: string | null;
  refId: string;
};

export type Carnet = {
  destinations: CarnetItem[];
  logements: CarnetItem[];
  activites: CarnetItem[];
  transports: CarnetItem[];
  planning: { day: string; events: CarnetEvent[] }[];
  infos: { category: InfoCategory; items: PracticalInfo[] }[];
  isEmpty: boolean;
};

const INFO_ORDER: InfoCategory[] = ["contact", "logement", "transport", "resto", "sante", "argent", "autre"];

export function buildCarnet(topics: DecisionTopic[], options: TopicOption[], infos: PracticalInfo[], activeCount: number): Carnet {
  const decided = new Map(topics.filter((t) => t.status === "decide").map((t) => [t.id, t]));
  const topicOrder = new Map(topics.map((t) => [t.id, t.position]));

  const items: CarnetItem[] = options
    .filter((o) => o.selected && decided.has(o.topicId))
    .sort((a, b) => (topicOrder.get(a.topicId)! - topicOrder.get(b.topicId)!) || a.position - b.position)
    .map((o) => {
      const topic = decided.get(o.topicId)!;
      return { ...o, topicType: topic.type, topicTitle: topic.title, price: priceInfo(o, activeCount) };
    });

  const byStart = (a: CarnetItem, b: CarnetItem) => (a.startsAt ?? "9999").localeCompare(b.startsAt ?? "9999");
  const destinations = items.filter((i) => i.topicType === "destination");
  const logements = items.filter((i) => i.topicType === "logement").sort(byStart);
  const transports = items.filter((i) => i.topicType === "transport").sort(byStart);
  const activites = items.filter((i) => i.topicType === "activites" || i.topicType === "autre").sort(byStart);

  const events: CarnetEvent[] = [];
  const push = (item: CarnetItem, at: string | null, label: string, until: string | null = null) => {
    if (at) events.push({ at, until, label, title: item.title, kind: item.topicType, address: item.address, url: item.url, refId: item.id });
  };
  for (const l of logements) {
    push(l, l.startsAt, "Check-in");
    push(l, l.endsAt, "Check-out");
  }
  for (const t of transports) {
    push(t, t.startsAt, "Départ");
    push(t, t.endsAt, "Arrivée");
  }
  for (const a of activites) {
    // Une fin le même jour s'affiche comme plage horaire ; sinon comme événement séparé.
    const sameDay = a.endsAt && a.startsAt && dayKey(a.endsAt) === dayKey(a.startsAt);
    push(a, a.startsAt, a.topicType === "activites" ? "Activité" : "Au programme", sameDay ? a.endsAt : null);
    if (a.endsAt && !sameDay) push(a, a.endsAt, "Fin");
  }
  for (const info of infos) {
    if (info.at) events.push({ at: info.at, until: null, label: "Info", title: info.title, kind: "info", address: info.address, url: info.url, refId: info.id });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const planning: Carnet["planning"] = [];
  for (const event of events) {
    const day = dayKey(event.at);
    const last = planning.at(-1);
    if (last?.day === day) last.events.push(event);
    else planning.push({ day, events: [event] });
  }

  const sortedInfos = [...infos].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  const groupedInfos = INFO_ORDER.map((category) => ({ category, items: sortedInfos.filter((i) => i.category === category) })).filter((g) => g.items.length);

  return {
    destinations,
    logements,
    activites,
    transports,
    planning,
    infos: groupedInfos,
    isEmpty: items.length === 0 && infos.length === 0,
  };
}

export async function loadCarnet(db: DB) {
  const [topics, options, infos, activeCount] = await Promise.all([
    db.select().from(decisionTopics),
    db.select().from(topicOptions),
    db.select().from(practicalInfos).orderBy(asc(practicalInfos.position)),
    countActiveParticipants(db),
  ]);
  return buildCarnet(topics, options, infos, activeCount);
}
