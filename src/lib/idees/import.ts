/**
 * Import JSON des résultats de la « recherche approfondie » (admin).
 * Format documenté dans docs/import-idees.md et sur /admin/idees/import.
 *
 * - Lecture tolérante : on ignore le texte autour du JSON (bloc ```json, phrase d'intro de l'IA).
 * - Erreurs rapportées avec le numéro de ligne et un chemin lisible (« Ville 2 « Porto » › événement 1 › lien »).
 * - Idempotent : une ville est reconnue par nom + pays normalisés, un événement par ville + nom normalisé.
 *   Un réimport met à jour les champs présents dans le fichier, sans toucher aux votes, commentaires,
 *   au masquage ni à « retenue », et sans créer de doublon.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { ideaCities, ideaEvents, type IdeaCategory } from "@/db/schema/idees";
import { DATE_ERROR, URL_ERROR, categoryFromText, cityKey, eventKey, isIsoDate, toHttpUrl } from "./common";

// --- Schéma zod ---

/** Texte obligatoire. */
const required = (max: number) =>
  z
    .string({ error: "Obligatoire (texte entre guillemets)" })
    .trim()
    .min(1, "Obligatoire")
    .max(max, `${max} caractères maximum`);

/**
 * Texte facultatif. `undefined` (champ absent) = « ne pas toucher » lors d'une mise à jour ;
 * `null` ou "" = vider le champ.
 */
const optional = (max: number) =>
  z
    .string({ error: "Texte attendu (entre guillemets) ou null" })
    .trim()
    .max(max, `${max} caractères maximum`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));

const optionalDate = z
  .string({ error: DATE_ERROR })
  .trim()
  .nullish()
  .refine((v) => !v || isIsoDate(v), DATE_ERROR)
  .transform((v) => (v === undefined ? undefined : v || null));

const optionalLink = z
  .string({ error: URL_ERROR })
  .max(2000, "Lien trop long")
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const url = toHttpUrl(v);
    if (url === false) {
      ctx.addIssue({ code: "custom", message: URL_ERROR });
      return z.NEVER;
    }
    return url;
  });

const CATEGORY_ERROR = "Catégorie inconnue : fête, culture, sport, gastronomie, nature, soirée ou autre";

const category = z
  .string({ error: CATEGORY_ERROR })
  .nullish()
  .transform((v, ctx): IdeaCategory | undefined => {
    if (v == null || v.trim() === "") return undefined;
    const key = categoryFromText(v);
    if (!key) {
      ctx.addIssue({ code: "custom", message: CATEGORY_ERROR });
      return z.NEVER;
    }
    return key;
  });

/** Prix minimum en euros : nombre (25, 12.5) ou chaîne numérique (« 25 », « 12,50 »). Stocké en centimes. */
const priceMin = z
  .union([z.number(), z.string()], { error: "Nombre attendu (en euros, ex. 25)" })
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v.replace(/[\s€]/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "Nombre positif attendu (en euros, ex. 25)" });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

export const importEventSchema = z
  .object({
    nom: required(140),
    categorie: category,
    description: optional(4000),
    pourquoi: optional(2000),
    date_debut: optionalDate,
    date_fin: optionalDate,
    dates_texte: optional(200),
    prix_texte: optional(200),
    prix_min_eur: priceMin,
    lien: optionalLink,
    adresse: optional(300),
  })
  .refine((e) => !e.date_debut || !e.date_fin || e.date_fin >= e.date_debut, { message: "date_fin doit être après date_debut", path: ["date_fin"] });

export const importCitySchema = z.object({
  nom: required(120),
  pays: required(80),
  resume: optional(4000),
  pourquoi: optional(2000),
  acces: optional(300),
  budget_indicatif: optional(300),
  lien: optionalLink,
  evenements: z.array(importEventSchema, { error: "Liste attendue : \"evenements\": [ … ]" }).max(200, "200 événements maximum par ville").default([]),
});

export const importSchema = z.object(
  {
    villes: z.array(importCitySchema, { error: "Liste attendue : \"villes\": [ … ]" }).min(1, "Au moins une ville").max(200, "200 villes maximum"),
  },
  { error: "Objet attendu : { \"villes\": [ … ] }" },
);

export type ImportCity = z.output<typeof importCitySchema>;
export type ImportEvent = z.output<typeof importEventSchema>;
export type ImportData = z.output<typeof importSchema>;

// --- Lecture du texte, numéros de ligne ---

export type ImportIssue = { line: number | null; where: string; message: string };
export type ParseResult = { ok: true; data: ImportData; warnings: string[] } | { ok: false; errors: ImportIssue[] };

const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));

/**
 * Associe chaque chemin (« villes.0.evenements.2.nom ») à sa ligne dans un JSON déjà validé par JSON.parse.
 * Mini-analyseur qui ne sert qu'à localiser les erreurs.
 */
export function locatePaths(text: string): Map<string, number> {
  const lines = new Map<string, number>();
  let i = 0;
  let line = 1;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) {
      if (text[i] === "\n") line++;
      i++;
    }
  };
  const readString = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (path: string) => {
    ws();
    if (!lines.has(path)) lines.set(path, line);
    const c = text[i];
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      i++;
      ws();
      if (text[i] === close) {
        i++;
        return;
      }
      for (let n = 0; i < text.length; n++) {
        ws();
        if (c === "{") {
          const keyLine = line;
          const key = readString();
          lines.set(join(path, key), keyLine);
          ws();
          i++; // « : »
          value(join(path, key));
        } else {
          value(join(path, n));
        }
        ws();
        if (text[i++] !== ",") return;
      }
    } else if (c === '"') {
      readString();
    } else {
      while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    }
  };
  value("");
  return lines;
}

/** Ligne (1-based) d'une position dans un texte. */
const lineAt = (text: string, position: number) => text.slice(0, position).split("\n").length;

/** Extrait le JSON d'un texte (ignore un éventuel bloc ```json et le texte autour). Renvoie aussi le décalage de lignes. */
function extractJson(raw: string) {
  const text = raw.replace(/^﻿/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) return null;
  return { json: text.slice(start, end + 1), lineOffset: lineAt(text, start) - 1 };
}

/** Chemin lisible pour l'orga : « Ville 2 « Porto » › événement 1 « Festa » › lien ». */
function describePath(path: PropertyKey[], raw: unknown) {
  const parts: string[] = [];
  let node: unknown = raw;
  for (let k = 0; k < path.length; k++) {
    const key = path[k];
    const child = node && typeof node === "object" ? (node as Record<PropertyKey, unknown>)[key as never] : undefined;
    const name = child && typeof child === "object" && typeof (child as { nom?: unknown }).nom === "string" ? ` « ${(child as { nom: string }).nom} »` : "";
    if (path[k - 1] === "villes" && typeof key === "number") parts.push(`Ville ${key + 1}${name}`);
    else if (path[k - 1] === "evenements" && typeof key === "number") parts.push(`événement ${key + 1}${name}`);
    else if (key !== "villes" && key !== "evenements") parts.push(String(key));
    node = child;
  }
  return parts.join(" › ") || "Fichier";
}

/** Lit et valide le texte collé ou le fichier choisi. Les doublons internes au fichier sont fusionnés (avertissement). */
export function parseImportText(raw: string): ParseResult {
  if (!raw.trim()) return { ok: false, errors: [{ line: null, where: "Fichier", message: "Rien à importer : colle le JSON ou choisis un fichier." }] };
  const extracted = extractJson(raw);
  if (!extracted) return { ok: false, errors: [{ line: null, where: "Fichier", message: "Aucun objet JSON trouvé (il doit commencer par { et finir par })." }] };
  const { json, lineOffset } = extracted;

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lineMatch = /line (\d+)/i.exec(message);
    const posMatch = /position (\d+)/i.exec(message);
    const line = lineMatch ? Number(lineMatch[1]) : posMatch ? lineAt(json, Number(posMatch[1])) : null;
    return {
      ok: false,
      errors: [{ line: line == null ? null : line + lineOffset, where: "Syntaxe JSON", message: `JSON invalide : ${message}. Vérifie les virgules, guillemets et accolades.` }],
    };
  }

  const parsed = importSchema.safeParse(value);
  if (!parsed.success) {
    const lines = locatePaths(json);
    const errors = parsed.error.issues.map((issue) => {
      let line: number | undefined;
      for (let k = issue.path.length; k >= 0 && line === undefined; k--) line = lines.get(issue.path.slice(0, k).map(String).join("."));
      return { line: line === undefined ? null : line + lineOffset, where: describePath(issue.path, value), message: issue.message };
    });
    errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    return { ok: false, errors };
  }

  // Fusion des doublons internes au fichier.
  const warnings: string[] = [];
  const cities = new Map<string, ImportCity>();
  for (const city of parsed.data.villes) {
    const key = cityKey(city.nom, city.pays);
    const previous = cities.get(key);
    if (previous) {
      warnings.push(`« ${city.nom} (${city.pays}) » apparaît plusieurs fois : les entrées sont fusionnées.`);
      cities.set(key, { ...previous, ...definedOnly(city), evenements: [...previous.evenements, ...city.evenements] });
    } else {
      cities.set(key, city);
    }
  }
  const villes = [...cities.values()].map((city) => {
    const events = new Map<string, ImportEvent>();
    for (const event of city.evenements) {
      const key = eventKey(event.nom);
      const previous = events.get(key);
      if (previous) warnings.push(`« ${event.nom} » apparaît plusieurs fois pour ${city.nom} : les entrées sont fusionnées.`);
      events.set(key, previous ? { ...previous, ...definedOnly(event) } : event);
    }
    return { ...city, evenements: [...events.values()] };
  });
  return { ok: true, data: { villes }, warnings };
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// --- Aperçu et import ---

export type ImportPreview = {
  cities: {
    name: string;
    country: string;
    status: "nouvelle" | "existante";
    events: { name: string; status: "nouveau" | "existant" }[];
  }[];
  counts: { newCities: number; existingCities: number; newEvents: number; existingEvents: number };
};

async function existingState(db: DB, data: ImportData) {
  const keys = data.villes.map((c) => cityKey(c.nom, c.pays));
  const cities = await db.select({ id: ideaCities.id, key: ideaCities.key }).from(ideaCities).where(inArray(ideaCities.key, keys));
  const cityIds = new Map(cities.map((c) => [c.key, c.id]));
  const events = cities.length
    ? await db
        .select({ id: ideaEvents.id, cityId: ideaEvents.cityId, key: ideaEvents.key })
        .from(ideaEvents)
        .where(inArray(ideaEvents.cityId, [...cityIds.values()]))
    : [];
  const eventIds = new Map(events.map((e) => [`${e.cityId}/${e.key}`, e.id]));
  return { cityIds, eventIds };
}

/** Ce que l'import va créer ou mettre à jour, sans rien écrire. */
export async function previewImport(db: DB, data: ImportData): Promise<ImportPreview> {
  const { cityIds, eventIds } = await existingState(db, data);
  const counts = { newCities: 0, existingCities: 0, newEvents: 0, existingEvents: 0 };
  const cities = data.villes.map((city) => {
    const id = cityIds.get(cityKey(city.nom, city.pays));
    counts[id ? "existingCities" : "newCities"]++;
    const events = city.evenements.map((event) => {
      const exists = id !== undefined && eventIds.has(`${id}/${eventKey(event.nom)}`);
      counts[exists ? "existingEvents" : "newEvents"]++;
      return { name: event.nom, status: exists ? ("existant" as const) : ("nouveau" as const) };
    });
    return { name: city.nom, country: city.pays, status: id ? ("existante" as const) : ("nouvelle" as const), events };
  });
  return { cities, counts };
}

/** Champs de ville issus de l'import (undefined = absent du fichier → inchangé). */
function cityFields(city: ImportCity) {
  return definedOnly({
    name: city.nom,
    country: city.pays,
    summary: city.resume === undefined ? undefined : (city.resume ?? ""),
    why: city.pourquoi === undefined ? undefined : (city.pourquoi ?? ""),
    access: city.acces,
    budget: city.budget_indicatif,
    url: city.lien,
  });
}

function eventFields(event: ImportEvent) {
  return definedOnly({
    name: event.nom,
    category: event.categorie,
    description: event.description === undefined ? undefined : (event.description ?? ""),
    why: event.pourquoi === undefined ? undefined : (event.pourquoi ?? ""),
    startsOn: event.date_debut,
    endsOn: event.date_fin,
    datesText: event.dates_texte,
    priceText: event.prix_texte,
    priceMinCents: event.prix_min_eur,
    url: event.lien,
    address: event.adresse,
  });
}

/** Applique l'import (une transaction). Renvoie les compteurs de l'aperçu. */
export async function applyImport(db: DB, data: ImportData, now = new Date()) {
  const preview = await previewImport(db, data);
  await db.transaction(async (tx) => {
    const { cityIds, eventIds } = await existingState(tx as unknown as DB, data);
    for (const city of data.villes) {
      const key = cityKey(city.nom, city.pays);
      let cityId = cityIds.get(key);
      if (cityId) {
        await tx.update(ideaCities).set({ ...cityFields(city), updatedAt: now }).where(eq(ideaCities.id, cityId));
      } else {
        const [row] = await tx
          .insert(ideaCities)
          .values({ ...cityFields(city), name: city.nom, country: city.pays, key, source: "import", createdAt: now, updatedAt: now })
          .returning({ id: ideaCities.id });
        cityId = row.id;
      }
      for (const event of city.evenements) {
        const ekey = eventKey(event.nom);
        const eventId = eventIds.get(`${cityId}/${ekey}`);
        if (eventId) {
          await tx
            .update(ideaEvents)
            .set({ ...eventFields(event), updatedAt: now })
            .where(and(eq(ideaEvents.id, eventId), eq(ideaEvents.cityId, cityId)));
        } else {
          await tx.insert(ideaEvents).values({ ...eventFields(event), name: event.nom, cityId, key: ekey, source: "import", createdAt: now, updatedAt: now });
        }
      }
    }
  });
  return preview.counts;
}

/** Exemple affiché dans la page d'import et la documentation. */
export const IMPORT_EXAMPLE = {
  villes: [
    {
      nom: "Porto",
      pays: "Portugal",
      resume: "Ville animée au bord du Douro, caves de porto, ruelles et vie nocturne dans la Baixa.",
      pourquoi: "Grande ville facile à parcourir à pied, soleil probable en mai, mélange de culture et de soirées.",
      acces: "2 h de vol direct depuis Paris, Lyon, Nantes…",
      budget_indicatif: "250 à 400 € / pers. hors vols pour 2 nuits",
      lien: "https://www.visitporto.travel",
      evenements: [
        {
          nom: "Dégustation dans une cave de Vila Nova de Gaia",
          categorie: "gastronomie",
          description: "Visite guidée d'une cave historique suivie d'une dégustation de plusieurs portos.",
          pourquoi: "Les répondants citent souvent la gastronomie et les dégustations.",
          dates_texte: "Tous les jours, sur réservation",
          prix_texte: "20 à 35 € / pers.",
          prix_min_eur: 20,
          lien: "https://exemple.com/cave",
          adresse: "Vila Nova de Gaia, Portugal",
        },
        {
          nom: "Festival de musique (exemple)",
          categorie: "fête",
          description: "Festival en plein air avec plusieurs scènes.",
          pourquoi: "Concert ou musique live plébiscité pour les soirées.",
          date_debut: "2027-05-14",
          date_fin: "2027-05-16",
          prix_texte: "Pass 1 jour ≈ 60 €",
          prix_min_eur: 60,
          lien: "https://exemple.com/festival",
        },
      ],
    },
  ],
};
