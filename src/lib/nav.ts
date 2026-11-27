/** Navigation de l'app membres : adresses communes et validation des redirections. */

/** Page d'identification (prénom), commune à toute l'app. */
export const IDENTIFY_PATH = "/qui-es-tu";

/** Chemin de retour sûr : uniquement une adresse interne (« /… », jamais « //… » ni une URL externe). */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value.slice(0, 200);
}

/** Adresse de la page d'identification, avec retour éventuel vers `next` après le choix du prénom. */
export function identifyHref(next?: string) {
  const target = next ? safeNext(next) : "/";
  return target === "/" ? IDENTIFY_PATH : `${IDENTIFY_PATH}?suite=${encodeURIComponent(target)}`;
}
