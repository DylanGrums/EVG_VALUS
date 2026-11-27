/** Validation (zod) des formulaires du module Idées. Toutes les entrées viennent de FormData. */
import { z } from "zod";
import { IDEA_CATEGORIES } from "@/db/schema/idees";
import { parseEuros } from "@/lib/orga/format";
import { formFields } from "@/lib/orga/validation";
import { DATE_ERROR, isIsoDate, optionalUrlSchema } from "./common";

const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label} obligatoire`).max(max, `${max} caractères maximum`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .transform((v) => (v === "" ? null : v));
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || isIsoDate(v), DATE_ERROR)
  .transform((v) => (v === "" ? null : v));

export const cityFormSchema = z.object({
  name: requiredText("Nom", 120),
  country: requiredText("Pays", 80),
  summary: z.string().trim().max(4000, "4000 caractères maximum"),
  why: z.string().trim().max(2000, "2000 caractères maximum"),
  access: optionalText(300),
  budget: optionalText(300),
  url: optionalUrlSchema,
});
export type CityInput = z.output<typeof cityFormSchema>;

export const eventFormSchema = z
  .object({
    name: requiredText("Nom", 140),
    category: z.enum(IDEA_CATEGORIES, { error: "Catégorie inconnue" }),
    description: z.string().trim().max(4000, "4000 caractères maximum"),
    why: z.string().trim().max(2000, "2000 caractères maximum"),
    startsOn: optionalDate,
    endsOn: optionalDate,
    datesText: optionalText(200),
    priceText: optionalText(200),
    priceMin: z
      .string()
      .transform((v) => parseEuros(v))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 100_000_000), "Montant invalide (ex. 25 ou 12,50)"),
    url: optionalUrlSchema,
    address: optionalText(300),
  })
  .refine((e) => !e.startsOn || !e.endsOn || e.endsOn >= e.startsOn, { message: "La fin doit être après le début", path: ["endsOn"] })
  .transform(({ priceMin, ...rest }) => ({ ...rest, priceMinCents: priceMin }));
export type EventInput = z.output<typeof eventFormSchema>;

export const ideaCommentSchema = z.object({ body: requiredText("Message", 2000) });

export const CITY_FIELDS = ["name", "country", "summary", "why", "access", "budget", "url"] as const;
export const EVENT_FIELDS = ["name", "category", "description", "why", "startsOn", "endsOn", "datesText", "priceText", "priceMin", "url", "address"] as const;

export function parseCityForm(form: FormData) {
  return cityFormSchema.safeParse(formFields(form, CITY_FIELDS));
}
export function parseEventForm(form: FormData) {
  return eventFormSchema.safeParse(formFields(form, EVENT_FIELDS));
}
