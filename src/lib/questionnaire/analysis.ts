/**
 * Analyses et exports (admin uniquement), pondérés par le niveau de connaissance des répondants.
 *
 * - Le pourcentage principal est pondéré : somme des poids des personnes ayant choisi / somme des poids
 *   des personnes ayant répondu à la question (commentaire seul inclus). Le nombre brut de personnes reste affiché.
 * - Poids : à peine = 1, bien = 2, très bien = 3, non classé = 2.
 * - Brouillons et réponses exclues sont hors analyses.
 * - Les questions identiques entre versions sont regroupées ; une question modifiée a ses propres résultats.
 */
import { exclusiveKeys, optionsFor } from "./definition";
import { hasAnswer } from "./validation";
import {
  DEFAULT_WEIGHT,
  REACTION,
  knowledgeLabels,
  themes,
  weightOf,
  type AdminData,
  type KnowledgeLevel,
  type LevelFilter,
  type Question,
  type ThemeId,
} from "./types";

export type AnalyzeOptions = {
  includeOrganizer?: boolean;
  /** Si défini et non vide : seuls les répondants de ces niveaux comptent (l'avis de l'organisateur est alors écarté). */
  levels?: LevelFilter[] | null;
};

type Entry = {
  id: string;
  name: string;
  version: number;
  answers: AdminData["responses"][number]["answers"];
  weight: number;
  knowledge: KnowledgeLevel | null;
};

export type ChoiceResult = { key: string; label: string; special: boolean; count: number; weight: number; share: number };
export type QuestionResult = {
  key: string;
  question: Question;
  versions: number[];
  labels: Record<string, string>;
  /** Personnes ayant répondu (brut) et somme de leurs poids. */
  answered: number;
  weightedAnswered: number;
  choices: ChoiceResult[];
  comments: { id: string; name: string; text: string }[];
  individuals: { id: string; name: string; knowledge: KnowledgeLevel | null; choices: string[]; comment: string }[];
  agreements: string[];
  signals: string[];
  divergences: string[];
  uncertain: number;
};
export type SignalItem = { target: string; label: string; count: number; answered: number; share: number };
export type ThemeSummary = {
  id: ThemeId;
  name: string;
  agreements: SignalItem[];
  signals: SignalItem[];
  divergences: { target: string; text: string }[];
  uncertain: { target: string; title: string; count: number; answered: number }[];
};
export type Analysis = {
  organizerIncluded: boolean;
  respondentCount: number;
  analyzedCount: number;
  weightedCount: number;
  results: QuestionResult[];
  byTheme: ThemeSummary[];
};

const questionSignature = (q: Question) =>
  JSON.stringify([q.id, q.theme, q.title, q.prompt, q.hint, q.kind, q.optional || false, optionsFor(q), q.opposite]);

/** Clés « décisives » (hors options exclusives et, en matrice, hors « Je ne sais pas »). */
const decisiveKeys = (q: Question) =>
  Object.keys(optionsFor(q)).filter((key) => !exclusiveKeys(q).includes(key) && !(q.kind === "matrix" && key.endsWith("-" + REACTION.inconnu)));

function score(group: { question: Question; versions: number[]; key: string }, entries: Entry[]): QuestionResult {
  const { question, versions } = group;
  const labels = optionsFor(question);
  const votes: Record<string, Entry[]> = Object.fromEntries(Object.keys(labels).map((key) => [key, []]));
  const comments: QuestionResult["comments"] = [];
  const individuals: QuestionResult["individuals"] = [];
  const decisive = decisiveKeys(question);
  const sum = (list: Entry[]) => list.reduce((total, e) => total + e.weight, 0);
  const who = (e: Entry) => ({ id: e.id, name: e.name || "Sans prénom" });

  const respondents: Entry[] = [];
  for (const entry of entries) {
    if (!versions.includes(entry.version)) continue;
    const answer = entry.answers[String(question.id)];
    if (!answer || !hasAnswer(answer)) continue;
    respondents.push(entry);
    individuals.push({ ...who(entry), knowledge: entry.knowledge, choices: answer.choices, comment: answer.comment });
    for (const choice of new Set(answer.choices)) votes[choice]?.push(entry);
    if (answer.comment) comments.push({ ...who(entry), text: answer.comment });
  }
  const answered = respondents.length;
  const weightedAnswered = sum(respondents);
  const share = (list: Entry[]) => (weightedAnswered ? sum(list) / weightedAnswered : 0);

  const choices: ChoiceResult[] = Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    special: exclusiveKeys(question).includes(key),
    count: votes[key].length,
    weight: sum(votes[key]),
    share: share(votes[key]),
  }));

  // Convergence : au moins deux personnes ET 75 % du poids des répondants.
  const agreements = decisive.filter((key) => votes[key].length >= 2 && share(votes[key]) >= 0.75);
  const signals = decisive
    .filter((key) => votes[key].length > 0)
    .sort((a, b) => sum(votes[b]) - sum(votes[a]) || votes[b].length - votes[a].length);

  const opposite: [string, string][] = [...question.opposite];
  if (question.kind === "matrix") {
    for (const key of decisive.filter((k) => k.endsWith("-" + REACTION.partant))) {
      opposite.push([key, key.replace(/-\d+$/, "-" + REACTION.dejaNon)]);
      opposite.push([key, key.replace(/-\d+$/, "-" + REACTION.nonPense)]);
    }
  }
  const ids = (key: string) => new Set((votes[key] ?? []).map((e) => e.id));
  const divergences = opposite
    .filter(([a, b]) => {
      if (!votes[a] || !votes[b]) return false;
      const sa = ids(a);
      const sb = ids(b);
      return [...sa].some((id) => !sb.has(id)) && [...sb].some((id) => !sa.has(id));
    })
    .map(([a, b]) => `${labels[a]} / ${labels[b]}`);
  if (votes.none?.length && decisive.some((key) => votes[key].length)) {
    divergences.push("« Aucune de ces propositions » et des propositions retenues");
  }

  const uncertain = new Set<string>((votes.unknown ?? []).map((e) => e.id));
  if (question.kind === "matrix") {
    for (const key of Object.keys(labels)) {
      if (key.endsWith("-" + REACTION.depend) || key.endsWith("-" + REACTION.inconnu)) for (const e of votes[key]) uncertain.add(e.id);
    }
  }

  return { ...group, labels, answered, weightedAnswered, choices, comments, individuals, agreements, signals, divergences, uncertain: uncertain.size };
}

export function analyze(data: AdminData, options: AnalyzeOptions = {}): Analysis {
  const levels = options.levels?.length ? options.levels : null;
  const responses = data.responses.filter((r) => {
    if (!r.submittedAt || r.excluded) return false;
    return !levels || levels.includes(r.knowledge ?? "unranked");
  });
  const entries: Entry[] = responses.map((r) => ({
    id: r.id,
    name: r.name,
    version: r.version,
    answers: r.answers,
    weight: weightOf(r.knowledge),
    knowledge: r.knowledge,
  }));
  const organizerIncluded = Boolean(options.includeOrganizer && data.organizer && !levels);
  if (organizerIncluded && data.organizer) {
    entries.push({
      id: "organisateur",
      name: (data.organizer.name || "Organisateur") + " (organisation)",
      version: data.organizer.version,
      answers: data.organizer.answers,
      weight: DEFAULT_WEIGHT,
      knowledge: null,
    });
  }

  const last = data.versions.at(-1);
  const occurring = new Set(entries.map((e) => e.version));
  const groups = new Map<string, { question: Question; versions: number[]; key: string }>();
  for (const version of [...data.versions].reverse()) {
    if (version !== last && !occurring.has(version.version)) continue;
    for (const question of version.questions.filter((q) => !q.hidden)) {
      const signature = questionSignature(question);
      const group = groups.get(signature);
      if (group) group.versions.push(version.version);
      else groups.set(signature, { question, versions: [version.version], key: `question-${version.version}-${question.id}` });
    }
  }
  // Ordre d'affichage : celui de la dernière version, puis les questions retirées/modifiées.
  const results = [...groups.values()].map((group) => score(group, entries));

  const byTheme: ThemeSummary[] = (Object.entries(themes) as [ThemeId, string][]).map(([id, name]) => {
    const matching = results.filter((r) => r.question.theme === id);
    const signal = (r: QuestionResult, key: string): SignalItem => {
      const choice = r.choices.find((c) => c.key === key)!;
      return { target: r.key, label: r.labels[key], count: choice.count, answered: r.answered, share: choice.share };
    };
    return {
      id,
      name,
      agreements: matching.flatMap((r) => r.agreements.map((key) => signal(r, key))),
      signals: matching.flatMap((r) => r.signals.slice(0, 3).map((key) => signal(r, key))),
      divergences: matching.flatMap((r) => r.divergences.map((text) => ({ target: r.key, text }))),
      uncertain: matching
        .filter((r) => r.uncertain || !r.answered)
        .map((r) => ({ target: r.key, title: r.question.title, count: r.uncertain, answered: r.answered })),
    };
  });

  return {
    organizerIncluded,
    respondentCount: responses.length,
    analyzedCount: entries.length,
    weightedCount: entries.reduce((total, e) => total + e.weight, 0),
    results,
    byTheme,
  };
}

/** Cellule CSV : neutralise les débuts de formule pour les tableurs. */
const csvCell = (value: unknown) => {
  const str = String(value ?? "");
  const safe = /^[\s﻿]*[=+\-@]|^[\t\r\n]/.test(str) ? "'" + str : str;
  return '"' + safe.replaceAll('"', '""') + '"';
};

/** Export CSV : questionnaires terminés (exclus signalés), niveau et poids inclus. */
export function exportCsv(data: AdminData, includeOrganizer = false): string {
  const rows: unknown[][] = [
    ["source", "identifiant", "prénom ou pseudonyme", "date", "exclue des statistiques", "niveau de connaissance", "poids", "version", "question", "thème", "intitulé", "choix", "commentaire"],
  ];
  const entries = data.responses
    .filter((r) => r.submittedAt)
    .map((r) => ({
      source: "participant",
      id: r.id,
      name: r.name,
      date: r.submittedAt,
      excluded: r.excluded,
      level: r.knowledge ? knowledgeLabels[r.knowledge] : "À classer",
      weight: weightOf(r.knowledge),
      version: r.version,
      answers: r.answers,
    }));
  if (includeOrganizer && data.organizer) {
    const o = data.organizer;
    entries.push({ source: "organisateur", id: "organisateur", name: o.name, date: o.updatedAt, excluded: false, level: "", weight: DEFAULT_WEIGHT, version: o.version, answers: o.answers });
  }
  const definitions = new Map(data.versions.map((v) => [v.version, v.questions]));
  for (const entry of entries) {
    for (const question of (definitions.get(entry.version) ?? []).filter((q) => !q.hidden)) {
      const answer = entry.answers[String(question.id)];
      const labels = optionsFor(question);
      rows.push([
        entry.source, entry.id, entry.name, entry.date, entry.excluded ? "oui" : "non", entry.level, entry.weight, entry.version,
        question.id, themes[question.theme], question.prompt,
        answer?.choices.map((key) => labels[key] ?? key).join(" | "), answer?.comment,
      ]);
    }
  }
  return "﻿" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

/** Export JSON : versions, réponses terminées (niveau et poids inclus), avis de l'organisateur facultatif, analyses pondérées. */
export function exportJson(data: AdminData, includeOrganizer = false) {
  return {
    versions: data.versions,
    responses: data.responses
      .filter((r) => r.submittedAt)
      .map((r) => ({ ...r, knowledgeLabel: r.knowledge ? knowledgeLabels[r.knowledge] : "À classer", weight: weightOf(r.knowledge) })),
    organizer: includeOrganizer ? data.organizer : undefined,
    analyses: analyze(data, { includeOrganizer }),
  };
}
