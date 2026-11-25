/** Validation (zod) des formulaires du module orga. Toutes les entrées viennent de FormData. */
import { z } from "zod";
import { INFO_CATEGORIES, TOPIC_TYPES, VOTE_MODES } from "@/db/schema";
import { parseEuros } from "./format";

/** Texte facultatif : espaces retirés, vide → null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .transform((v) => (v === "" ? null : v));

/** Lien http(s) uniquement (pas de javascript: dans un href). */
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v === "" ? null : /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Lien invalide (il doit commencer par https://)");

/** Date/heure d'un <input type="datetime-local"> → « YYYY-MM-DD HH:mm:00 » ou null. */
const optionalDateTime = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v), "Date invalide")
  .transform((v) => (v === "" ? null : `${v.slice(0, 10)} ${v.slice(11, 16)}:00`));

const euros = z
  .string()
  .transform((v) => parseEuros(v))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 100_000_000), "Montant invalide (ex. 1250 ou 89,90)");

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label} obligatoire`).max(max, `${max} caractères maximum`);

export const participantNameSchema = requiredText("Prénom", 40);

export const topicSchema = z.object({
  type: z.enum(TOPIC_TYPES),
  title: requiredText("Titre", 120),
  description: z.string().trim().max(4000),
  voteMode: z.enum(VOTE_MODES),
  deadline: optionalDateTime,
  dependsOnId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.uuid().nullable()),
  allowProposals: checkbox,
});
export type TopicInput = z.output<typeof topicSchema>;

export const optionSchema = z
  .object({
    title: requiredText("Titre", 140),
    description: z.string().trim().max(4000),
    url: optionalUrl,
    imageUrl: optionalUrl,
    address: optionalText(300),
    priceTotal: euros,
    pricePerPerson: euros,
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    openingHours: optionalText(300),
    practicalNotes: optionalText(2000),
  })
  .refine((o) => !o.startsAt || !o.endsAt || o.endsAt >= o.startsAt, { message: "La fin doit être après le début", path: ["endsAt"] })
  .transform(({ priceTotal, pricePerPerson, ...rest }) => ({ ...rest, priceTotalCents: priceTotal, pricePerPersonCents: pricePerPerson }));
export type OptionInput = z.output<typeof optionSchema>;

export const commentSchema = z.object({ body: requiredText("Message", 2000) });

export const infoSchema = z.object({
  title: requiredText("Titre", 140),
  category: z.enum(INFO_CATEGORIES),
  body: z.string().trim().max(4000),
  address: optionalText(300),
  url: optionalUrl,
  phone: optionalText(40),
  at: optionalDateTime,
});
export type InfoInput = z.output<typeof infoSchema>;

/** FormData → objet de chaînes (les champs absents deviennent ""), sauf cases à cocher absentes. */
export function formFields(form: FormData, keys: readonly string[], checkboxes: readonly string[] = []) {
  const out: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = form.get(key);
    out[key] = typeof value === "string" ? value : checkboxes.includes(key) ? undefined : "";
  }
  return out;
}

export const TOPIC_FIELDS = ["type", "title", "description", "voteMode", "deadline", "dependsOnId", "allowProposals"] as const;
export const OPTION_FIELDS = ["title", "description", "url", "imageUrl", "address", "priceTotal", "pricePerPerson", "startsAt", "endsAt", "openingHours", "practicalNotes"] as const;
export const INFO_FIELDS = ["title", "category", "body", "address", "url", "phone", "at"] as const;

export function parseTopicForm(form: FormData) {
  return topicSchema.safeParse(formFields(form, TOPIC_FIELDS, ["allowProposals"]));
}
export function parseOptionForm(form: FormData) {
  return optionSchema.safeParse(formFields(form, OPTION_FIELDS));
}
export function parseInfoForm(form: FormData) {
  return infoSchema.safeParse(formFields(form, INFO_FIELDS));
}

/** Premier message d'erreur lisible. */
export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Formulaire invalide";
}

export const uuidSchema = z.uuid();
export function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}
