/**
 * Vue publique des réponses au questionnaire : tendances agrégées et ANONYMES, partagées au groupe sur l'accueil.
 *
 * Règles (décidées le 2026-11-27) :
 * - jamais de prénom, de commentaire libre, de vue par répondant ni d'identifiant de participation ;
 * - jamais de pondération : tous les répondants pèsent pareil ici (le niveau de connaissance reste réservé aux admins) ;
 * - seules les réponses envoyées, non exclues et non supprimées comptent (brouillons et avis de l'organisateur exclus) ;
 * - rien n'est montré sous PUBLIC_MIN_RESPONSES réponses, ni pour une question (ou une activité de la matrice)
 *   qui en a moins, pour éviter de deviner qui a répondu quoi ;
 * - une question présente dans plusieurs versions n'apparaît qu'une fois (la version la plus récente assez remplie).
 *
 * Fonction pure : elle ne renvoie que des libellés de questions/choix, des nombres et des pourcentages.
 */
import { analyze, isNotableLimit, parseCell, type MatrixLevel, type QuestionResult } from "./analysis";
import { isVigilanceQuestion, REACTION, themes, type QuestionnaireVersion, type ResponseEntry, type ThemeId } from "./types";

export const PUBLIC_MIN_RESPONSES = 3;

/** Libellés de thème côté public (Q6 « à l'aise » est dans le thème limites : on ne la range pas sous « Limites »). */
export const publicThemeLabels: Record<ThemeId, string> = { ...themes, limites: "Limites, confort et vigilance" };

/** `count` personnes sur `answered` (base du pourcentage). */
export type PublicChoice = { label: string; count: number; answered: number; share: number };
/** Une activité de la matrice, en « feu tricolore » : une cellule par réaction (partant, ça dépend, ne pense pas, déjà non, je ne sais pas). */
export type PublicMatrixRow = { label: string; answered: number; level: MatrixLevel; cells: PublicChoice[] };
export type PublicQuestionTrend = {
  title: string;
  prompt: string;
  theme: ThemeId;
  themeLabel: string;
  /** Nombre de personnes ayant répondu à cette question. */
  answered: number;
  /** Choix les plus cités (hors « Je ne sais pas », « Aucune »…), du plus au moins cité. Vide pour la matrice. */
  top: PublicChoice[];
  /** Options spéciales cochées (« Je ne sais pas », « Aucune », « Peu importe »). */
  specials: PublicChoice[];
  /** Matrice uniquement : une ligne par activité ayant assez de répondants. */
  rows?: PublicMatrixRow[];
};
export type PublicHighlight = { question: string; label: string; count: number; answered: number; share: number };
/** `detail` : pour une activité, « 1 a déjà dit non, 1 ne pense pas » ; `unanimous` : refus ou risque quasi unanime (≥ 75 %). */
export type PublicLimit = PublicHighlight & { detail: string; unanimous: boolean };
export type PublicDisagreement = { question: string; text: string };
/** `label` : la question (ou l'activité pour la matrice) ; `detail` : ce qui a été répondu. */
export type PublicDoubt = { question: string; label: string; detail: string; count: number; answered: number; share: number };
/** Question où les avis partent dans tous les sens : au moins 4 options citées, aucune à 40 %. */
export type PublicDispersed = { question: string; options: number; topShare: number; answered: number };

export type PublicTrends =
  | { status: "waiting"; count: number; needed: number }
  | {
      status: "ready";
      count: number;
      questions: PublicQuestionTrend[];
      /** Points de consensus positifs : au moins 2 personnes et 75 % des répondants (hors vigilance et refus). */
      consensus: PublicHighlight[];
      /** Avis opposés exprimés par des personnes différentes. */
      disagreements: PublicDisagreement[];
      /** À éviter : activités refusées (au moins un « déjà non » ou 2 refus) et risques (2 personnes et un tiers). */
      limits: PublicLimit[];
      /**
       * Les doutes : « Je ne sais pas », « Ça dépend » (matrice) et « Je ne pense pas » minoritaire (matrice, hors limites),
       * au moins 25 % des répondants, du plus incertain au moins incertain.
       */
      doubts: PublicDoubt[];
      /** Avis dispersés : l'orga devra trancher. */
      dispersed: PublicDispersed[];
    };

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
  // Questions à choix uniquement (les questions libres n'ont que des commentaires, jamais montrés ici), assez remplies,
  // une seule fois par question (les résultats sont dans l'ordre des versions, de la plus récente à la plus ancienne).
  const seen = new Set<string>();
  const results = analysis.results.filter((r) => {
    if (r.answered < minResponses || !Object.keys(r.labels).length) return false;
    const id = String(r.question.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const visibleRow = (r: QuestionResult, row: number | null | undefined) =>
    row === null || row === undefined || (r.rows.find((x) => x.index === row)?.answered ?? 0) >= minResponses;
  const isMatrix = (r: QuestionResult) => r.question.kind === "matrix";

  const choice = (r: QuestionResult, key: string): PublicChoice => {
    const c = r.choices.find((x) => x.key === key)!;
    const cell = isMatrix(r) ? parseCell(key) : null;
    const row = cell && r.rows.find((x) => x.index === cell.row);
    const label = row && cell.reaction === REACTION.partant ? `${row.name} : il serait partant` : c.label;
    return { label, count: c.count, answered: c.answered, share: c.share };
  };
  const highlight = (r: QuestionResult, key: string): PublicHighlight => ({ question: r.question.title, ...choice(r, key) });
  const bySize = <T extends { share: number; count: number }>(a: T, b: T) => b.share - a.share || b.count - a.count;

  const questions: PublicQuestionTrend[] = results.map((r) => ({
    title: r.question.title,
    prompt: r.question.prompt,
    theme: r.question.theme,
    themeLabel: publicThemeLabels[r.question.theme],
    answered: r.answered,
    top: isMatrix(r) ? [] : r.signals.slice(0, TOP).map((key) => choice(r, key)),
    specials: r.choices.filter((c) => c.special && c.count > 0).map((c) => ({ label: c.label, count: c.count, answered: c.answered, share: c.share })),
    ...(isMatrix(r)
      ? {
          rows: r.rows
            .filter((row) => row.answered >= minResponses)
            .map((row) => ({
              label: row.name,
              answered: row.answered,
              level: row.level,
              cells: row.cells.map((c) => ({ label: c.label, count: c.count, answered: row.answered, share: c.share })),
            })),
        }
      : {}),
  }));

  const consensus = results
    .flatMap((r) => r.agreements.filter((key) => visibleRow(r, parseCell(key)?.row)).map((key) => highlight(r, key)))
    .sort(bySize);

  const disagreements = results.flatMap((r) => r.divergenceItems.filter((d) => visibleRow(r, d.row)).map((d) => ({ question: r.question.title, text: d.text })));

  const limits: PublicLimit[] = results
    .flatMap((r) =>
      r.limits
        .filter((l) => isNotableLimit(l) && visibleRow(r, l.row))
        .map((l) => ({ question: r.question.title, label: l.label, detail: l.detail, count: l.count, answered: l.answered, share: l.share, unanimous: l.unanimous })),
    )
    .sort(bySize);

  const doubts: PublicDoubt[] = results
    .flatMap((r): PublicDoubt[] => {
      if (isMatrix(r)) {
        return r.rows
          .filter((row) => row.answered >= minResponses)
          .flatMap((row) => {
            const unknown = row.cells[REACTION.inconnu].count;
            const depends = row.cells[REACTION.depend].count;
            const limit = r.limits.find((l) => l.row === row.index);
            // « Je ne pense pas » : simple réserve s'il est minoritaire, sans « déjà non », et pas déjà dans les limites.
            const nonPenseCell = row.cells[REACTION.nonPense];
            const reserve = row.cells[REACTION.dejaNon].count === 0 && nonPenseCell.share < 0.5 && !(limit && isNotableLimit(limit)) ? nonPenseCell.count : 0;
            const total = unknown + depends + reserve;
            if (!total) return [];
            const parts = [unknown && `${unknown} « je ne sais pas »`, depends && `${depends} « ça dépend »`, reserve && `${reserve} « je ne pense pas »`].filter(Boolean);
            return [{ question: r.question.title, label: row.name, detail: parts.join(", "), count: total, answered: row.answered, share: total / row.answered }];
          });
      }
      const unknown = r.choices.find((c) => c.key === "unknown")?.count ?? 0;
      if (!unknown) return [];
      return [{ question: publicThemeLabels[r.question.theme], label: r.question.title, detail: `${unknown} « je ne sais pas »`, count: unknown, answered: r.answered, share: unknown / r.answered }];
    })
    .filter((d) => d.share >= 0.25)
    .sort(bySize);

  const dispersed: PublicDispersed[] = results
    .filter((r) => !isMatrix(r) && !isVigilanceQuestion(r.question))
    .flatMap((r) => {
      const cited = r.choices.filter((c) => !c.special && c.count > 0);
      const topShare = Math.max(0, ...cited.map((c) => c.share));
      return cited.length >= 4 && topShare < 0.4 ? [{ question: r.question.title, options: cited.length, topShare, answered: r.answered }] : [];
    });

  return { status: "ready", count, questions, consensus, disagreements, limits, doubts, dispersed };
}
