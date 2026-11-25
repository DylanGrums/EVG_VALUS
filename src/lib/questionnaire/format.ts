/** Mise en forme française (dates, pourcentages, recherche sans accents). */

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso)) : "—";

export const formatPercent = (ratio: number, has = true) =>
  has ? new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(ratio) : "—";

export const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
