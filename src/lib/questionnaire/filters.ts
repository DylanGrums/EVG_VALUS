/** Filtres du tableau de bord (lus dans l'URL) : recherche, statut, niveau de connaissance, avis de l'organisateur. */
import { normalize } from "./format";
import { isLevelFilter, type LevelFilter, type ResponseEntry } from "./types";

export const STATUSES = ["terminees", "en-cours", "exclues"] as const;
export type Status = (typeof STATUSES)[number];
export const statusLabels: Record<Status, string> = { terminees: "Terminées", "en-cours": "En cours", exclues: "Exclues" };

export type Filters = { q: string; statut: Status | null; niveau: LevelFilter | null; avis: boolean };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseFilters(params: Record<string, string | string[] | undefined>): Filters {
  const statut = first(params.statut);
  const niveau = first(params.niveau);
  return {
    q: (first(params.q) ?? "").slice(0, 60),
    statut: (STATUSES as readonly string[]).includes(statut ?? "") ? (statut as Status) : null,
    niveau: isLevelFilter(niveau) ? niveau : null,
    avis: first(params.avis) === "1",
  };
}

export const statusOf = (entry: ResponseEntry): "Exclue" | "Terminée" | "En cours" =>
  entry.excluded ? "Exclue" : entry.submittedAt ? "Terminée" : "En cours";

export function filterResponses(responses: ResponseEntry[], filters: Filters): ResponseEntry[] {
  const needle = normalize(filters.q.trim());
  return responses.filter((entry) => {
    if (needle && !normalize(entry.name).includes(needle)) return false;
    if (filters.statut === "terminees" && !(entry.submittedAt && !entry.excluded)) return false;
    if (filters.statut === "en-cours" && !(!entry.submittedAt && !entry.excluded)) return false;
    if (filters.statut === "exclues" && !entry.excluded) return false;
    if (filters.niveau && !(entry.submittedAt && (entry.knowledge ?? "unranked") === filters.niveau)) return false;
    return true;
  });
}
