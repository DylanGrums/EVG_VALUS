/** Logique pure sur les définitions de questionnaire : options, masquage, validation de l'éditeur. */
import { isTheme, reactions, special, type Question, type QuestionnaireVersion } from "./types";

/** Options proposées pour une question (choix + options exclusives). */
export function optionsFor(question: Question): Record<string, string> {
  if (question.optional) return question.options;
  if (question.kind === "matrix") return question.globalSpecial ? { ...question.options, ...special } : question.options;
  return { ...question.options, ...(question.extraSpecial ?? {}), ...special };
}

/** Clés exclusives : cochées, elles remplacent tous les autres choix. */
export function exclusiveKeys(question: Question): string[] {
  if (question.optional) return [];
  if (question.kind === "matrix") return question.globalSpecial ? Object.keys(special) : [];
  return [...Object.keys(question.extraSpecial ?? {}), ...Object.keys(special)];
}

/** Options d'une matrice : une entrée « ligne-réaction » par combinaison. */
export const matrixOptions = (rows: string[]) =>
  Object.fromEntries(rows.flatMap((label, i) => reactions.map((reaction, j) => [`${i}-${j}`, `${label} · ${reaction}`])));

/** Lignes (activités) d'une matrice. */
export const matrixLabels = (question: Question) =>
  Object.entries(question.options)
    .filter(([key]) => key.endsWith("-0"))
    .map(([, label]) => label.slice(0, -(" · " + reactions[0]).length));

export const activeDefinition = (definition: QuestionnaireVersion): QuestionnaireVersion => ({
  ...definition,
  questions: definition.questions.filter((question) => !question.hidden),
});

/** Question telle que l'éditeur la manipule : les choix sont une simple liste de libellés. */
export type EditorQuestion = {
  id: number | string;
  theme: string;
  title: string;
  prompt: string;
  hint: string;
  labels: string[];
  hidden?: boolean;
  kind?: "matrix";
};

export const toEditorQuestions = (version: QuestionnaireVersion): EditorQuestion[] =>
  version.questions.map((question) => ({
    id: question.id,
    theme: question.theme,
    title: question.title,
    prompt: question.prompt,
    hint: question.hint,
    hidden: question.hidden,
    kind: question.kind,
    labels: question.kind === "matrix" ? matrixLabels(question) : Object.values(question.options),
  }));

/**
 * Valide la liste saisie dans l'éditeur et produit la définition de la nouvelle version.
 * Règles : aucune question existante ne disparaît (on la masque), au moins une question visible,
 * libellés uniques, tailles limitées, identifiants des nouvelles questions de la forme « q-<uuid> ».
 */
export function cleanDefinition(input: unknown, previous: Question[]): Question[] | null {
  if (!Array.isArray(input) || !input.length || input.length > 100) return null;
  if (!input.some((q) => q && typeof q === "object" && !q.hidden)) return null;
  const text = (value: unknown, length: number, required = true): value is string =>
    typeof value === "string" && value.length <= length && (!required || value.trim().length > 0);

  const ids = new Set<string>();
  const result: Question[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id);
    if (!/^[a-z\d-]{1,60}$/.test(id) || ids.has(id)) return null;
    if (!text(raw.title, 160) || !text(raw.prompt, 600) || !text(raw.hint ?? "", 600, false) || !isTheme(raw.theme)) return null;
    const old = previous.find((q) => String(q.id) === id);
    if (!old && !/^q-[a-f0-9-]{36}$/.test(id)) return null;
    ids.add(id);
    const matrix = old?.kind === "matrix";
    if (matrix && raw.kind !== "matrix") return null;
    const labelsInput = raw.labels;
    if (!Array.isArray(labelsInput) || labelsInput.length > (matrix ? 15 : 40)) return null;
    if (matrix && !labelsInput.length) return null;
    if (!labelsInput.every((label) => text(label, 300))) return null;
    const labels = (labelsInput as string[]).map((label) => label.trim());
    if (new Set(labels).size !== labels.length) return null;

    const options = matrix ? matrixOptions(labels) : Object.fromEntries(labels.map((label, i) => [`c${i + 1}`, label]));
    // Une paire opposée n'est conservée que si ses deux libellés n'ont pas changé.
    const opposite = (old?.opposite ?? []).filter(([a, b]) => old!.options[a] === options[a] && old!.options[b] === options[b]);
    const question: Question = {
      id: old?.id ?? id,
      theme: raw.theme,
      title: (raw.title as string).trim(),
      prompt: (raw.prompt as string).trim(),
      hint: ((raw.hint as string | undefined) ?? "").trim(),
      options,
      opposite,
    };
    if (raw.hidden) question.hidden = true;
    if (matrix) {
      question.kind = "matrix";
      question.globalSpecial = true;
    }
    if (!labels.length) question.optional = true;
    if (old?.extraSpecial && !matrix && labels.length) question.extraSpecial = old.extraSpecial;
    result.push(question);
  }
  return previous.every((q) => ids.has(String(q.id))) ? result : null;
}
