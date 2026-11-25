/** Validation stricte côté serveur des réponses (brouillon ou envoi final). */
import { z } from "zod";
import { exclusiveKeys, optionsFor } from "./definition";
import type { AnswerSet, Draft, QuestionnaireVersion } from "./types";

export const NAME_MAX = 60;
export const COMMENT_MAX = 2000;

const draftSchema = z.object({
  version: z.number().int(),
  name: z.string().max(500),
  step: z.number().int().min(0),
  answers: z.record(z.string(), z.object({ choices: z.array(z.string().max(40)).max(200), comment: z.string().max(COMMENT_MAX + 500) })),
});

/**
 * Nettoie et valide un brouillon face à la définition (questions visibles uniquement).
 * Retourne null si invalide. `complete` = envoi final : prénom et une réponse par question obligatoire.
 * Règles : choix existants, options exclusives seules, matrice = un seul choix par ligne,
 * commentaire ≤ 2000 caractères, prénom ≤ 60.
 */
export function cleanDraft(payload: unknown, definition: QuestionnaireVersion, complete = false): Draft | null {
  const parsed = draftSchema.safeParse(payload);
  if (!parsed.success) return null;
  const input = parsed.data;
  const questions = definition.questions.filter((q) => !q.hidden);
  if (input.version !== definition.version || input.step > questions.length + 1) return null;

  const name = input.name.trim();
  if (name.length > NAME_MAX || (complete && !name)) return null;

  const answers: AnswerSet = {};
  for (const question of questions) {
    const key = String(question.id);
    const answer = Object.hasOwn(input.answers, key) ? input.answers[key] : undefined;
    if (!answer) {
      if (complete && !question.optional) return null;
      continue;
    }
    const comment = answer.comment.trim();
    if (comment.length > COMMENT_MAX) return null;
    const choices = [...new Set(answer.choices)];
    const available = optionsFor(question);
    if (choices.some((choice) => !Object.hasOwn(available, choice))) return null;
    if (question.optional && choices.length) return null;
    const exclusive = exclusiveKeys(question);
    if (choices.length > 1 && choices.some((choice) => exclusive.includes(choice))) return null;
    if (question.kind === "matrix") {
      const rows = choices.filter((choice) => !exclusive.includes(choice)).map((choice) => choice.split("-")[0]);
      if (new Set(rows).size !== rows.length) return null;
    }
    if (complete && !question.optional && !choices.length && !comment) return null;
    answers[key] = { choices, comment };
  }
  return { version: definition.version, name, step: input.step, answers };
}

/** Une réponse compte dès qu'elle a un choix ou un commentaire (commentaire seul inclus). */
export const hasAnswer = (answer: { choices: string[]; comment: string } | undefined): boolean =>
  Boolean(answer && (answer.choices.length || answer.comment.trim()));
