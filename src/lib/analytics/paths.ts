/**
 * Normalisation des chemins suivis (liste blanche) : seules les pages membres connues sont enregistrées.
 * Tout le reste (admin, API, redirections, chemins inconnus) est ignoré.
 */

export const SECTIONS = [
  "accueil",
  "identification",
  "bienvenue",
  "questionnaire",
  "resultats",
  "orga",
  "sujet",
  "sur-place",
  "idees",
  "ville",
] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  accueil: "Accueil",
  identification: "Choix du prénom",
  bienvenue: "Bienvenue",
  questionnaire: "Questionnaire",
  resultats: "Résultats",
  orga: "Orga",
  sujet: "Sujet d’orga",
  "sur-place": "Sur place",
  idees: "Idées",
  ville: "Ville",
};

export type NormalizedPath = { path: string; section: Section; refId: string | null };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const STATIC: Record<string, Section> = {
  "/": "accueil",
  "/qui-es-tu": "identification",
  "/orga/qui-es-tu": "identification",
  "/bienvenue": "bienvenue",
  "/orga/bienvenue": "bienvenue",
  "/questionnaire": "questionnaire",
  "/resultats": "resultats",
  "/orga": "orga",
  "/orga/sur-place": "sur-place",
  "/idees": "idees",
};

const DYNAMIC: { re: RegExp; section: Section; prefix: string }[] = [
  { re: new RegExp(`^/orga/sujets/(${UUID})$`), section: "sujet", prefix: "/orga/sujets/" },
  { re: new RegExp(`^/idees/(${UUID})$`), section: "ville", prefix: "/idees/" },
];

/** « /orga/sujets/<id>?x=1 » → { path, section: "sujet", refId } ; null si la page n'est pas suivie. */
export function normalizePath(input: unknown): NormalizedPath | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 300) return null;
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\")) return null;
  let path = input.split(/[?#]/)[0].toLowerCase();
  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
  if (path === "/admin" || path.startsWith("/admin/")) return null;
  const section = STATIC[path];
  if (section) return { path, section, refId: null };
  for (const d of DYNAMIC) {
    const m = d.re.exec(path);
    if (m) return { path: d.prefix + m[1], section: d.section, refId: m[1] };
  }
  return null;
}
