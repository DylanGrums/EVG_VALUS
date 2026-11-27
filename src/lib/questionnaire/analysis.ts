/**
 * Analyses et exports (admin uniquement), pondérés par le niveau de connaissance des répondants.
 *
 * - Le pourcentage principal est pondéré : somme des poids des personnes ayant choisi / somme des poids
 *   des personnes ayant répondu à la question (commentaire seul inclus). Le nombre brut de personnes reste affiché.
 * - Poids : à peine = 1, bien = 2, très bien = 3, non classé = 2.
 * - Brouillons et réponses exclues sont hors analyses.
 * - Les questions identiques entre versions sont regroupées ; une question modifiée a ses propres résultats.
 * - Matrice : la part d'une cellule est calculée sur les répondants ayant réagi à CETTE activité
 *   (les « Je ne sais pas » globaux comptent comme « je ne sais pas » de chaque activité).
 * - Consensus : jamais sur une question de vigilance ni sur un refus / « ça dépend » de la matrice ;
 *   ces accords sur des refus sont des limites (voir `limits`).
 */
import { exclusiveKeys, optionsFor } from "./definition";
import { hasAnswer } from "./validation";
import {
  DEFAULT_WEIGHT,
  REACTION,
  isVigilanceQuestion,
  knowledgeLabels,
  reactions,
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

/**
 * `answered` : base du pourcentage (personnes). Pour une cellule de matrice, ce sont les répondants ayant réagi
 * à CETTE activité (plus les « Je ne sais pas » globaux), pas tous les répondants de la question.
 */
export type ChoiceResult = { key: string; label: string; special: boolean; count: number; weight: number; share: number; answered: number };

/** Feu tricolore d'une activité de la matrice. */
export type MatrixLevel = "rouge" | "vert" | "orange" | "gris";
export type MatrixCell = { reaction: number; label: string; count: number; weight: number; share: number };
export type MatrixRow = {
  index: number;
  /** Libellé complet (« Les activités en hauteur ») et nom court (« Activités en hauteur »). */
  label: string;
  name: string;
  /** Répondants ayant réagi à cette activité + « Je ne sais pas » globaux. */
  answered: number;
  weightedAnswered: number;
  /** Une cellule par réaction, dans l'ordre de `reactions` ; « Je ne sais pas » inclut les « Je ne sais pas » globaux. */
  cells: MatrixCell[];
  /** « Je ne pense pas » + « Il a déjà dit non ». */
  refusals: { count: number; share: number };
  level: MatrixLevel;
};
/**
 * Limite ou point de vigilance : une activité refusée (matrice, `row` = index de ligne) ou un risque cité
 * (question de vigilance, `row` = null). Toutes les candidates sont listées ; `isNotableLimit` filtre.
 */
export type LimitItem = {
  key: string;
  label: string;
  /** Matrice : « 1 a déjà dit non, 1 ne pense pas ». */
  detail: string;
  count: number;
  answered: number;
  share: number;
  row: number | null;
  /** Nombre de « Il a déjà dit non » (matrice). */
  alreadyNo: number;
  /** Refus connu : au moins un « déjà non », ou refus (déjà non + ne pense pas) ≥ 50 %. */
  strict: boolean;
  /** Au moins 2 personnes et 75 %. */
  unanimous: boolean;
};
export type Divergence = { text: string; row: number | null };
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
  /** Consensus POSITIFS (hors questions de vigilance ; matrice : « il serait partant » seulement, sans « déjà non »). */
  agreements: string[];
  /** Choix les plus cités (matrice : sans « ça dépend » ni « je ne sais pas »). */
  signals: string[];
  divergences: string[];
  divergenceItems: Divergence[];
  uncertain: number;
  /** Matrice uniquement : une ligne par activité. */
  rows: MatrixRow[];
  limits: LimitItem[];
};
export type SignalItem = { target: string; label: string; count: number; answered: number; share: number };
export type ThemeSummary = {
  id: ThemeId;
  name: string;
  agreements: SignalItem[];
  signals: SignalItem[];
  /** Limites notables (voir `isNotableLimit`). */
  limits: (LimitItem & { target: string })[];
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
  const matrix = question.kind === "matrix";
  const vigilance = isVigilanceQuestion(question);
  const shareIn = (list: Entry[], base: Entry[]) => {
    const total = sum(base);
    return total ? sum(list) / total : 0;
  };
  const uniq = (list: Entry[]) => [...new Map(list.map((e) => [e.id, e])).values()];

  // Matrice : base de chaque activité = répondants ayant réagi à cette activité + « Je ne sais pas » globaux.
  const globalUnknown = matrix ? (votes.unknown ?? []) : [];
  const rowIndices = matrix
    ? [...new Set(Object.keys(labels).flatMap((key) => (parseCell(key) ? [parseCell(key)!.row] : [])))].sort((a, b) => a - b)
    : [];
  const rowBase = new Map<number, Entry[]>(
    rowIndices.map((i) => [i, uniq([...reactions.flatMap((_, j) => votes[`${i}-${j}`] ?? []), ...globalUnknown])]),
  );
  const baseOf = (key: string) => {
    const cell = matrix ? parseCell(key) : null;
    return cell ? (rowBase.get(cell.row) ?? []) : respondents;
  };

  const choices: ChoiceResult[] = Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    special: exclusiveKeys(question).includes(key),
    count: votes[key].length,
    weight: sum(votes[key]),
    share: shareIn(votes[key], baseOf(key)),
    answered: baseOf(key).length,
  }));
  const shareOf = (key: string) => choices.find((c) => c.key === key)?.share ?? 0;

  const rows: MatrixRow[] = rowIndices.map((i) => {
    const base = rowBase.get(i)!;
    const cells: MatrixCell[] = reactions.map((label, j) => {
      const list = uniq([...(votes[`${i}-${j}`] ?? []), ...(j === REACTION.inconnu ? globalUnknown : [])]);
      return { reaction: j, label, count: list.length, weight: sum(list), share: shareIn(list, base) };
    });
    const refusalList = [...(votes[`${i}-${REACTION.nonPense}`] ?? []), ...(votes[`${i}-${REACTION.dejaNon}`] ?? [])];
    const refusals = { count: refusalList.length, share: shareIn(refusalList, base) };
    const label = rowLabel(labels, i);
    return { index: i, label, name: activityName(label), answered: base.length, weightedAnswered: sum(base), cells, refusals, level: levelOf(cells, refusals) };
  });
  const rowOf = (key: string) => rows.find((r) => r.index === parseCell(key)?.row);

  // Consensus positif : au moins deux personnes ET 75 % du poids des répondants (de l'activité, pour la matrice).
  // Jamais sur une question de vigilance (ce serait un risque partagé) ni sur un refus / « ça dépend » de la matrice.
  const agreements = vigilance
    ? []
    : decisive.filter((key) => {
        if (votes[key].length < 2 || shareOf(key) < 0.75) return false;
        if (!matrix) return true;
        return parseCell(key)?.reaction === REACTION.partant && rowOf(key)!.cells[REACTION.dejaNon].count === 0;
      });
  const signals = decisive
    .filter((key) => votes[key].length > 0 && !(matrix && parseCell(key)?.reaction === REACTION.depend))
    .sort((a, b) => shareOf(b) - shareOf(a) || votes[b].length - votes[a].length);

  const opposite: [string, string][] = [...question.opposite];
  for (const pair of complementaryOpposites(question)) {
    if (!opposite.some(([a, b]) => (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]))) opposite.push(pair);
  }
  if (matrix) {
    for (const key of decisive.filter((k) => parseCell(k)?.reaction === REACTION.partant)) {
      opposite.push([key, key.replace(/-\d+$/, "-" + REACTION.nonPense)]);
      opposite.push([key, key.replace(/-\d+$/, "-" + REACTION.dejaNon)]);
    }
  }
  const ids = (key: string) => new Set((votes[key] ?? []).map((e) => e.id));
  const divergenceItems: Divergence[] = opposite
    .filter(([a, b]) => {
      if (!votes[a] || !votes[b]) return false;
      const sa = ids(a);
      const sb = ids(b);
      return [...sa].some((id) => !sb.has(id)) && [...sb].some((id) => !sa.has(id));
    })
    .map(([a, b]): Divergence => {
      const ca = matrix ? parseCell(a) : null;
      const cb = matrix ? parseCell(b) : null;
      if (ca && cb) {
        const row = rowOf(a)!;
        return { text: `${row.name} : « ${REACTION_SHORT[ca.reaction]} » vs « ${REACTION_SHORT[cb.reaction]} »`, row: row.index };
      }
      return { text: `« ${labels[a]} » vs « ${labels[b]} »`, row: null };
    })
    // Matrice : une seule ligne par activité (« partant » vs « je ne pense pas / déjà non »).
    .reduce<Divergence[]>((acc, d) => {
      const same = d.row !== null ? acc.find((x) => x.row === d.row) : undefined;
      if (!same) return [...acc, d];
      const extra = /vs « (.+) »$/.exec(d.text)?.[1];
      if (extra) same.text = same.text.replace(/ »$/, ` » / « ${extra} »`);
      return acc;
    }, []);
  // « Aucune » face à des propositions retenues : seulement hors matrice/vigilance et si « Aucune » pèse au moins 25 %.
  const none = votes.none ?? [];
  if (!matrix && !vigilance && none.length && decisive.some((key) => votes[key].length) && shareIn(none, respondents) >= 0.25) {
    divergenceItems.push({ text: `Pour ${people(none.length)}, aucune proposition ne convient`, row: null });
  }

  const uncertain = new Set<string>((votes.unknown ?? []).map((e) => e.id));
  if (matrix) {
    for (const key of Object.keys(labels)) {
      const cell = parseCell(key);
      if (cell && (cell.reaction === REACTION.depend || cell.reaction === REACTION.inconnu)) for (const e of votes[key]) uncertain.add(e.id);
    }
  }

  const limits: LimitItem[] = [];
  if (matrix) {
    for (const row of rows) {
      if (!row.refusals.count) continue;
      const no = row.cells[REACTION.dejaNon].count;
      const doubt = row.cells[REACTION.nonPense].count;
      const detail = [no && (no === 1 ? "1 a déjà dit non" : `${no} ont déjà dit non`), doubt && (doubt === 1 ? "1 ne pense pas" : `${doubt} ne pensent pas`)]
        .filter(Boolean)
        .join(", ");
      limits.push({
        key: `${row.index}`,
        label: row.name,
        detail,
        count: row.refusals.count,
        answered: row.answered,
        share: row.refusals.share,
        row: row.index,
        alreadyNo: no,
        strict: no > 0 || row.refusals.share >= 0.5,
        unanimous: row.refusals.count >= 2 && row.refusals.share >= 0.75,
      });
    }
  } else if (vigilance) {
    for (const key of signals) {
      const c = choices.find((x) => x.key === key)!;
      limits.push({ key, label: c.label, detail: "", count: c.count, answered: c.answered, share: c.share, row: null, alreadyNo: 0, strict: false, unanimous: c.count >= 2 && c.share >= 0.75 });
    }
  }

  return {
    ...group,
    labels,
    answered,
    weightedAnswered,
    choices,
    comments,
    individuals,
    agreements,
    signals,
    divergences: divergenceItems.map((d) => d.text),
    divergenceItems,
    uncertain: uncertain.size,
    rows,
    limits,
  };
}

const people = (n: number) => `${n} personne${n > 1 ? "s" : ""}`;

/** Cellule de matrice « ligne-réaction ». */
export function parseCell(key: string): { row: number; reaction: number } | null {
  const m = /^(\d+)-(\d+)$/.exec(key);
  return m ? { row: Number(m[1]), reaction: Number(m[2]) } : null;
}

const rowLabel = (labels: Record<string, string>, i: number) => {
  const label = labels[`${i}-${REACTION.partant}`] ?? "";
  const suffix = " · " + reactions[REACTION.partant];
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
};

/** « Les activités en hauteur » → « Activités en hauteur ». */
export function activityName(label: string) {
  const short = label.replace(/^(les|des)\s+/i, "");
  return short.charAt(0).toLocaleUpperCase("fr") + short.slice(1);
}

/** Réactions de la matrice, formulées pour les libellés de désaccord. */
const REACTION_SHORT: Record<number, string> = {
  [REACTION.partant]: "il serait partant",
  [REACTION.depend]: "ça dépend",
  [REACTION.nonPense]: "je ne pense pas",
  [REACTION.dejaNon]: "il a déjà dit non",
  [REACTION.inconnu]: "je ne sais pas",
};

/**
 * Feu tricolore : rouge si au moins un « déjà non » ou une majorité de refus ; vert si majorité « partant » ;
 * orange si « ça dépend » domine ; gris sinon.
 */
function levelOf(cells: MatrixCell[], refusals: { count: number; share: number }): MatrixLevel {
  if (cells[REACTION.dejaNon].count > 0 || refusals.share > 0.5) return "rouge";
  if (cells[REACTION.partant].share > 0.5) return "vert";
  const depend = cells[REACTION.depend].share;
  if (depend > 0 && depend > cells[REACTION.partant].share && depend > refusals.share && depend > cells[REACTION.inconnu].share) return "orange";
  return "gris";
}

/**
 * Paires opposées complémentaires, ajoutées côté analyse sans modifier les versions stockées.
 * Indexées par id de question ET vérifiées par libellés : ignorées si la question a été modifiée dans l'éditeur.
 * Écartées après relecture (non opposées) : Q14 c1/c3 (un trajet direct peut être long), Q16 c2/c6 (risques indépendants).
 */
const COMPLEMENTARY_OPPOSITES: Record<string, [[string, string], [string, string]][]> = {
  "1": [[["c1", "Une ambiance calme et détendue"], ["c4", "Une ambiance de grande fête"]]],
  "4": [[["c1", "Une activité familière qu’il apprécie déjà"], ["c4", "Une expérience rare ou inattendue"]]],
  "11": [[["c1", "Des moments réservés au groupe"], ["c3", "Des échanges spontanés avec d’autres personnes"]]],
  "13": [[["c2", "Un logement partagé avec espace commun"], ["c3", "Des chambres séparées et du calme"]]],
  "14": [[["c4", "Peu de déplacements sur place"], ["c5", "Plusieurs déplacements sur place si les activités le justifient"]]],
  "15": [[["c2", "Deux soirées animées"], ["c5", "Un programme axé sur la journée"]]],
  "16": [[["c1", "Un lieu peu animé"], ["c7", "Des lieux très fréquentés ou bruyants"]]],
};

export function complementaryOpposites(question: Question): [string, string][] {
  if (question.kind === "matrix") return [];
  return (COMPLEMENTARY_OPPOSITES[String(question.id)] ?? [])
    .filter(([[a, la], [b, lb]]) => question.options[a] === la && question.options[b] === lb)
    .map(([[a], [b]]) => [a, b]);
}

/**
 * Limite à mettre en avant : activité avec au moins un « déjà non » ou au moins 2 refus ;
 * risque cité par au moins 2 personnes et un tiers des répondants.
 */
export const isNotableLimit = (l: LimitItem) => (l.row !== null ? l.alreadyNo > 0 || l.count >= 2 : l.count >= 2 && l.share >= 1 / 3);

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
      return { target: r.key, label: r.labels[key], count: choice.count, answered: choice.answered, share: choice.share };
    };
    return {
      id,
      name,
      agreements: matching.flatMap((r) => r.agreements.map((key) => signal(r, key))),
      signals: matching.flatMap((r) => r.signals.slice(0, 3).map((key) => signal(r, key))),
      limits: matching.flatMap((r) => r.limits.filter(isNotableLimit).map((l) => ({ ...l, target: r.key }))),
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
