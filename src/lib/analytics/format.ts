/** Mises en forme (français, heure de Paris) des statistiques de fréquentation. */
import { ORGA_TIMEZONE } from "@/lib/orga/rules";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: ORGA_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("fr-FR", { timeZone: ORGA_TIMEZONE, hour: "2-digit", minute: "2-digit" });

/** « jeu. 27 nov., 14:05 » ; « jamais » si nul. */
export function formatParis(date: Date | null | undefined) {
  return date ? dateTime.format(date) : "jamais";
}

/** « 14:05 » */
export function formatParisTime(date: Date) {
  return time.format(date);
}

/** « à l’instant », « il y a 12 min », « il y a 3 h », « il y a 2 j », puis la date ; « jamais » si nul. */
export function formatAgo(date: Date | null | undefined, now = new Date()) {
  if (!date) return "jamais";
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return `le ${formatParis(date)}`;
}

/** Durée d'une visite : « moins d’1 min », « 12 min », « 1 h 05 ». */
export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "moins d’1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** « 2026-11-27 » → « 27/11 » */
export function formatDayShort(day: string) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}
