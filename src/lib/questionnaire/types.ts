/** Types et constantes du questionnaire (module pur : utilisable côté client comme côté serveur). */

export const themes = {
  ambiance: "Ambiance et soirées",
  experiences: "Activités et centres d’intérêt",
  destination: "Destination et logistique",
  limites: "Limites et points de vigilance",
  surprises: "Surprises et attentions",
} as const;
export type ThemeId = keyof typeof themes;

/**
 * Questions du thème « limites » formulées en POSITIF (où Val serait à l'aise) : leurs réponses sont
 * des choses à privilégier, pas des points de vigilance. Q6 « Place de Valentin dans le groupe ».
 */
const COMFORT_QUESTION_IDS = new Set<number | string>([6]);

/** Vrai si les choix de la question sont des risques ou des refus (et non des situations confortables). */
export function isVigilanceQuestion(q: { id: number | string; theme: ThemeId; kind?: string }) {
  return q.theme === "limites" && q.kind !== "matrix" && !COMFORT_QUESTION_IDS.has(q.id);
}
export const isTheme = (value: unknown): value is ThemeId => typeof value === "string" && Object.hasOwn(themes, value);

/** Options exclusives communes à toutes les questions à choix. */
export const special = { none: "Aucune de ces propositions", unknown: "Je ne sais pas" } as const;

/** Réactions de la matrice (question 5). L'ordre compte : voir REACTION. */
export const reactions = [
  "Il serait partant",
  "Ça dépend de l’activité",
  "Je ne pense pas",
  "Il a déjà dit non à ce type d’activité",
  "Je ne sais pas",
] as const;
export const REACTION = { partant: 0, depend: 1, nonPense: 2, dejaNon: 3, inconnu: 4 } as const;

export type Question = {
  /** Nombre pour les questions d'origine, « q-<uuid> » pour les questions ajoutées dans l'éditeur. */
  id: number | string;
  theme: ThemeId;
  title: string;
  prompt: string;
  hint: string;
  /** Choix : c1, c2… ou, pour une matrice, « ligne-réaction ». */
  options: Record<string, string>;
  /** Paires de choix contradictoires (signal de divergence). */
  opposite: [string, string][];
  kind?: "matrix";
  hidden?: boolean;
  /** Question libre facultative (sans choix). */
  optional?: boolean;
  /** Matrice : ajoute « Aucune »/« Je ne sais pas » globaux. */
  globalSpecial?: boolean;
  /** Options exclusives propres à la question (ex. « Peu importe »). */
  extraSpecial?: Record<string, string>;
};

export type QuestionnaireVersion = { version: number; questions: Question[]; publishedAt?: string | null };

export type Answer = { choices: string[]; comment: string };
export type AnswerSet = Record<string, Answer>;
export type Draft = { version: number; name: string; step: number; answers: AnswerSet };

/** Résultat d'un enregistrement public ou organisateur. */
export type SaveResult =
  | { ok: true; revision: number; submitted: boolean }
  | { ok: false; code: "invalid" | "conflict" | "stale" | "deleted" | "forbidden"; message: string };

// --- Niveau de connaissance (administrateurs uniquement) ---

export const KNOWLEDGE_LEVELS = ["barely", "well", "very"] as const;
export type KnowledgeLevel = (typeof KNOWLEDGE_LEVELS)[number];
export const knowledgeLabels: Record<KnowledgeLevel, string> = {
  barely: "Le connaît à peine",
  well: "Le connaît bien",
  very: "Le connaît très bien",
};
export const knowledgeWeights: Record<KnowledgeLevel, number> = { barely: 1, well: 2, very: 3 };
/** Poids d'un répondant non classé. */
export const DEFAULT_WEIGHT = 2;
export const isKnowledge = (value: unknown): value is KnowledgeLevel =>
  typeof value === "string" && (KNOWLEDGE_LEVELS as readonly string[]).includes(value);
export const weightOf = (level: KnowledgeLevel | null | undefined) => (level ? knowledgeWeights[level] : DEFAULT_WEIGHT);

/** Filtre de niveau dans le tableau de bord. */
export type LevelFilter = KnowledgeLevel | "unranked";
export const LEVEL_FILTERS = [...KNOWLEDGE_LEVELS, "unranked"] as const;
export const isLevelFilter = (value: unknown): value is LevelFilter =>
  typeof value === "string" && (LEVEL_FILTERS as readonly string[]).includes(value);

/** Participation telle que vue par les organisateurs. */
export type ResponseEntry = {
  id: string;
  version: number;
  name: string;
  step: number;
  answers: AnswerSet;
  submittedAt: string | null;
  updatedAt: string | null;
  excluded: boolean;
  knowledge: KnowledgeLevel | null;
  /** Prénom du groupe auquel la réponse est rattachée (admin uniquement). */
  participantId?: string | null;
};
export type OrganizerEntry = {
  version: number;
  name: string;
  step: number;
  answers: AnswerSet;
  updatedAt: string | null;
};
export type AdminData = { versions: QuestionnaireVersion[]; responses: ResponseEntry[]; organizer: OrganizerEntry | null };
