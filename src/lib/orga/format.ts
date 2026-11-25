/** Libellés et mises en forme (français) du module orga. */
import type { InfoCategory, TopicStatus, TopicType, VoteMode } from "@/db/schema";

export const TOPIC_TYPE_LABELS: Record<TopicType, string> = {
  destination: "Destination",
  logement: "Logement",
  activites: "Activités",
  transport: "Transport",
  autre: "Autre",
};

export const TOPIC_TYPE_EMOJI: Record<TopicType, string> = {
  destination: "📍",
  logement: "🏠",
  activites: "🎯",
  transport: "🚆",
  autre: "✨",
};

export const STATUS_LABELS: Record<TopicStatus, string> = {
  brouillon: "Brouillon",
  ouvert: "Ouvert au vote",
  clos: "Clos",
  decide: "Décidé",
};

export const VOTE_MODE_LABELS: Record<VoteMode, string> = {
  unique: "Un seul choix",
  multiple: "Plusieurs choix",
};

export const INFO_CATEGORY_LABELS: Record<InfoCategory, string> = {
  contact: "Contacts",
  logement: "Logement",
  transport: "Transport",
  resto: "Restos & bars",
  sante: "Santé & urgences",
  argent: "Argent",
  autre: "Divers",
};

const euroFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const euroRound = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** 12345 → « 123,45 € » ; les montants ronds sans décimales. */
export function formatEuros(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents % 100 === 0 ? euroRound : euroFormat).format(cents / 100);
}

/** « 1 250,50 », « 1250.5 », « 80 € » → centimes. Vide → null. Invalide → NaN. */
export function parseEuros(input: string): number | null {
  const cleaned = input.replace(/[\s €]/g, "").replace(",", ".");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100);
}

/** Découpe une date locale « YYYY-MM-DD HH:mm[:ss] » ou « YYYY-MM-DDTHH:mm » sans passer par un fuseau. */
function parts(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return { y, mo, d, h, mi };
}

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Clé de jour « YYYY-MM-DD ». */
export function dayKey(value: string) {
  return value.slice(0, 10);
}

/** « samedi 15 mai » */
export function formatDay(value: string) {
  const p = parts(value.length === 10 ? `${value} 00:00` : value);
  if (!p) return value;
  const weekday = DAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  return `${weekday} ${p.d === 1 ? "1er" : p.d} ${MONTHS[p.mo - 1]}`;
}

/** « 15h », « 15h30 » */
export function formatTime(value: string) {
  const p = parts(value);
  if (!p) return "";
  return `${p.h}h${p.mi ? String(p.mi).padStart(2, "0") : ""}`;
}

/** « samedi 15 mai à 15h30 » */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return `${formatDay(value)} à ${formatTime(value)}`;
}

/** Valeur pour un <input type="datetime-local">. */
export function toDateTimeInput(value: string | null | undefined) {
  return value ? value.replace(" ", "T").slice(0, 16) : "";
}

/** « 25/11 à 14h05 » pour les commentaires (horodatage avec fuseau). */
export function formatCommentDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Nom de domaine lisible d'un lien (« airbnb.fr »). */
export function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Lien";
  }
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
