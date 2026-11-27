/** Module « Idées » : clés normalisées, catégories et briques de validation partagées (import et formulaires). */
import { z } from "zod";
import { IDEA_CATEGORIES, type IdeaCategory } from "@/db/schema/idees";

/** « Lisbonne », « lisbonne » et « LISBONNE ! » donnent la même clé (accents, casse, ponctuation ignorés). */
export function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Clé d'une ville : nom + pays normalisés. */
export const cityKey = (name: string, country: string) => `${normalizeKey(name)}|${normalizeKey(country)}`;
/** Clé d'un événement, unique au sein de sa ville. */
export const eventKey = (name: string) => normalizeKey(name);

export const CATEGORY_LABELS: Record<IdeaCategory, string> = {
  fete: "Fête",
  culture: "Culture",
  sport: "Sport",
  gastronomie: "Gastronomie",
  nature: "Nature",
  soiree: "Soirée",
  autre: "Autre",
};

export const CATEGORY_EMOJI: Record<IdeaCategory, string> = {
  fete: "🎉",
  culture: "🏛️",
  sport: "⚽",
  gastronomie: "🍽️",
  nature: "🌿",
  soiree: "🌙",
  autre: "✨",
};

/** « fête », « Fete », « soirée »… → clé de catégorie ; null si inconnue. */
export function categoryFromText(value: string): IdeaCategory | null {
  const key = normalizeKey(value);
  return (IDEA_CATEGORIES as readonly string[]).includes(key) ? (key as IdeaCategory) : null;
}

export const isCategory = (value: unknown): value is IdeaCategory => typeof value === "string" && (IDEA_CATEGORIES as readonly string[]).includes(value);

/** Lien http(s) uniquement (pas de javascript: dans un href) ; « exemple.com » devient « https://exemple.com ». */
export function toHttpUrl(value: string): string | null | false {
  const v = value.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? withScheme : false;
  } catch {
    return false;
  }
}

/** Date « AAAA-MM-JJ » réelle (pas de 31 février). */
export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const URL_ERROR = "Lien invalide (il doit commencer par https://)";
export const DATE_ERROR = "Date invalide (format AAAA-MM-JJ, ex. 2027-05-15)";

/** Lien facultatif pour zod : vide → null. */
export const optionalUrlSchema = z
  .string()
  .max(2000, "Lien trop long")
  .transform((v, ctx) => {
    const url = toHttpUrl(v);
    if (url === false) {
      ctx.addIssue({ code: "custom", message: URL_ERROR });
      return z.NEVER;
    }
    return url;
  });

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 2027-05-15 » → « sam. 15 mai 2027 » (sans fuseau). */
export function formatIsoDate(value: string) {
  if (!isIsoDate(value)) return value;
  const [y, m, d] = value.split("-").map(Number);
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`;
}

/** Dates d'un événement en clair : plage précise si connue, sinon texte libre. */
export function formatEventDates(e: { startsOn: string | null; endsOn: string | null; datesText: string | null }) {
  if (e.startsOn && e.endsOn && e.endsOn !== e.startsOn) return `du ${formatIsoDate(e.startsOn)} au ${formatIsoDate(e.endsOn)}`;
  if (e.startsOn) return formatIsoDate(e.startsOn) + (e.datesText ? ` (${e.datesText})` : "");
  return e.datesText ?? "";
}
