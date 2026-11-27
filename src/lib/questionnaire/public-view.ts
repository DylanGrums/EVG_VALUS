/**
 * Vue publique des réponses au questionnaire : tendances agrégées et ANONYMES, partagées au groupe sur l'accueil.
 *
 * Règles (décidées le 2026-11-27) :
 * - jamais de prénom, de commentaire libre, de vue par répondant ni d'identifiant de participation ;
 * - jamais de pondération : tous les répondants pèsent pareil ici (le niveau de connaissance reste réservé aux admins) ;
 * - seules les réponses envoyées, non exclues et non supprimées comptent (brouillons et avis de l'organisateur exclus) ;
 * - rien n'est montré sous PUBLIC_MIN_RESPONSES réponses, pour éviter de deviner qui a répondu quoi.
 *
 * Fonction pure : elle ne renvoie que des libellés de questions/choix, des nombres et des pourcentages.
 */
import { analyze, type QuestionResult } from "./analysis";
import { isVigilanceQuestion, REACTION, themes, type QuestionnaireVersion, type ResponseEntry, type ThemeId } from "./types";

export const PUBLIC_MIN_RESPONSES = 3;

export type PublicChoice = { label: string; count: number; share: number };
export type PublicQuestionTrend = {
  title: string;
  prompt: string;
  theme: ThemeId;
  themeLabel: string;
  /** Nombre de personnes ayant répondu à cette question. */
  answered: number;
  /** Choix les plus cités (hors « Je ne sais pas », « Aucune »…), du plus au moins cité. */
  top: PublicChoice[];
};
export type PublicHighlight = { question: string; label: string; count: number; share: number };
export type PublicDisagreement = { question: string; text: string };

export type PublicTrends =
  | { status: "waiting"; count: number; needed: number }
  | {
      status: "ready";
      count: number;
      questions: PublicQuestionTrend[];
      /** Points de consensus : au moins 2 personnes et 75 % des répondants de la question. */
      consensus: PublicHighlight[];
      /** Avis opposés exprimés par des personnes différentes. */
      disagreements: PublicDisagreement[];
      /** Les « non » et limites qui ressortent (au moins 2 personnes). */
      limits: PublicHighlight[];
      /**
       * Les doutes : là où les proches ne savent pas (« Je ne sais pas ») ou hésitent (matrice : « Ça dépend »),
       * au moins 25 % des répondants de la question, du plus incertain au moins incertain.
       */
      doubts: PublicDoubt[];
    };
/** `label` : la question (ou l'activité pour la matrice) ; `detail` : ce qui a été répondu. */
export type PublicDoubt = { question: string; label: string; detail: string; count: number; share: number };

type Input = { versions: QuestionnaireVersion[]; responses: ResponseEntry[] };

const TOP = 3;

export function publicTrends(data: Input, { minResponses = PUBLIC_MIN_RESPONSES }: { minResponses?: number } = {}): PublicTrends {
  // Anonymisation et poids égaux avant toute analyse : on ne garde que version et réponses aux choix.
  const responses: ResponseEntry[] = data.responses
    .filter((r) => r.submittedAt && !r.excluded)
    .map((r, i) => ({
      id: `r${i}`,
      version: r.version,
      name: "",
      step: 0,
      answers: Object.fromEntries(Object.entries(r.answers).map(([key, a]) => [key, { choices: [...a.choices], comment: "" }])),
      submittedAt: "envoyée",
      updatedAt: null,
      excluded: false,
      knowledge: null, // même poids pour tous
    }));
  const count = responses.length;
  if (count < minResponses) return { status: "waiting", count, needed: minResponses };

  const analysis = analyze({ versions: data.versions, responses, organizer: null });
  // Questions à choix uniquement (les questions libres n'ont que des commentaires, jamais montrés ici).
  const results = analysis.results.filter((r) => r.answered > 0 && Object.keys(r.labels).length > 0);

  const highlight = (r: QuestionResult, key: string): PublicHighlight => {
    const choice = r.choices.find((c) => c.key === key)!;
    return { question: r.question.title, label: r.labels[key], count: choice.count, share: choice.share };
  };

  const questions: PublicQuestionTrend[] = results.map((r) => ({
    title: r.question.title,
    prompt: r.question.prompt,
    theme: r.question.theme,
    themeLabel: themes[r.question.theme],
    answered: r.answered,
    top: r.signals.slice(0, TOP).map((key) => {
      const { label, count: n, share } = highlight(r, key);
      return { label, count: n, share };
    }),
  }));

  const consensus = results.flatMap((r) => r.agreements.map((key) => highlight(r, key))).sort((a, b) => b.share - a.share || b.count - a.count);

  const disagreements = results.flatMap((r) => r.divergences.map((text) => ({ question: r.question.title, text })));

  const refusal = (key: string) => key.endsWith("-" + REACTION.dejaNon) || key.endsWith("-" + REACTION.nonPense);
  const limits = results
    .flatMap((r) => {
      if (r.question.kind === "matrix") return r.signals.filter(refusal).map((key) => highlight(r, key));
      if (isVigilanceQuestion(r.question)) return r.signals.slice(0, TOP).map((key) => highlight(r, key));
      return [];
    })
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.share - a.share || b.count - a.count);

  const doubts: PublicDoubt[] = results
    .flatMap((r): PublicDoubt[] => {
      const share = (n: number) => n / r.answered;
      if (r.question.kind === "matrix") {
        // Une ligne par activité : « Je ne sais pas » + « Ça dépend de l'activité ».
        const rows = new Map<string, { unknown: number; depends: number }>();
        for (const c of r.choices) {
          const m = /^(\d+)-(\d+)$/.exec(c.key);
          if (!m || c.count === 0) continue;
          const reaction = Number(m[2]);
          if (reaction !== REACTION.inconnu && reaction !== REACTION.depend) continue;
          const row = rows.get(m[1]) ?? { unknown: 0, depends: 0 };
          if (reaction === REACTION.inconnu) row.unknown += c.count;
          else row.depends += c.count;
          rows.set(m[1], row);
        }
        return [...rows.entries()].map(([row, { unknown, depends }]) => {
          const label = (r.labels[`${row}-${REACTION.partant}`] ?? "").split(" · ")[0];
          const parts = [unknown && `${unknown} « je ne sais pas »`, depends && `${depends} « ça dépend »`].filter(Boolean);
          return { question: r.question.title, label, detail: parts.join(", "), count: unknown + depends, share: share(unknown + depends) };
        });
      }
      const unknown = r.choices.find((c) => c.key === "unknown")?.count ?? 0;
      if (!unknown) return [];
      return [{ question: themes[r.question.theme], label: r.question.title, detail: `${unknown} « je ne sais pas »`, count: unknown, share: share(unknown) }];
    })
    .filter((d) => d.share >= 0.25)
    .sort((a, b) => b.share - a.share || b.count - a.count);

  return { status: "ready", count, questions, consensus, disagreements, limits, doubts };
}
