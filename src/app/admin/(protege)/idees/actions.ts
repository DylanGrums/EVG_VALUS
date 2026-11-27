"use server";

/** Server actions admin du module Idées. Chacune revérifie la session organisateur. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/orga/auth";
import { OrgaError, toActionState, type ActionState } from "@/lib/orga/errors";
import { firstError, isUuid } from "@/lib/orga/validation";
import { applyImport, parseImportText, previewImport, type ImportIssue, type ImportPreview } from "@/lib/idees/import";
import { deleteCity, deleteEvent, deleteIdeaComment, setCityHidden, setCityRetained, setEventHidden, updateCity, updateEvent } from "@/lib/idees/ideas";
import { parseCityForm, parseEventForm } from "@/lib/idees/validation";

function refresh() {
  revalidatePath("/idees", "layout");
  revalidatePath("/admin/idees", "layout");
}

function idFrom(form: FormData, key: string) {
  const value = form.get(key);
  if (!isUuid(value)) throw new OrgaError("Élément introuvable.");
  return value;
}

const flag = (form: FormData, key: string) => form.get(key) === "1";

async function run(fn: () => Promise<unknown>, message?: string): Promise<ActionState> {
  const state = await toActionState(async () => {
    await requireAdmin();
    await fn();
  }, message);
  refresh();
  return state;
}

// --- Villes ---

export async function setCityHiddenAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => setCityHidden(await getDb(), idFrom(form, "cityId"), flag(form, "hidden")));
}

export async function setCityRetainedAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => setCityRetained(await getDb(), idFrom(form, "cityId"), flag(form, "retained")));
}

export async function updateCityAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = parseCityForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await updateCity(await getDb(), idFrom(form, "cityId"), parsed.data);
  }, "Ville enregistrée.");
}

export async function deleteCityAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = form.get("cityId");
  if (!isUuid(id)) return { error: "Ville introuvable." };
  await deleteCity(await getDb(), id);
  refresh();
  if (form.get("back") === "1") redirect("/admin/idees");
  return { ok: true };
}

// --- Événements ---

export async function setEventHiddenAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => setEventHidden(await getDb(), idFrom(form, "eventId"), flag(form, "hidden")));
}

export async function updateEventAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const parsed = parseEventForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await updateEvent(await getDb(), idFrom(form, "eventId"), parsed.data);
  }, "Événement enregistré.");
}

export async function deleteEventAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => deleteEvent(await getDb(), idFrom(form, "eventId")));
}

export async function deleteIdeaCommentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => deleteIdeaComment(await getDb(), idFrom(form, "commentId")));
}

// --- Import ---

export type ImportState =
  | { step: "preview"; preview: ImportPreview; warnings: string[] }
  | { step: "done"; counts: ImportPreview["counts"]; warnings: string[] }
  | { step: "error"; errors: ImportIssue[] }
  | undefined;

/** Étape 1 : aperçu (rien n'est écrit). Étape 2 (`confirm=1`) : import. Le texte est revalidé à chaque fois. */
export async function importAction(_: ImportState, form: FormData): Promise<ImportState> {
  await requireAdmin();
  const text = String(form.get("json") ?? "");
  if (text.length > 1_000_000) return { step: "error", errors: [{ line: null, where: "Fichier", message: "Fichier trop gros (1 Mo maximum)." }] };
  const parsed = parseImportText(text);
  if (!parsed.ok) return { step: "error", errors: parsed.errors };
  const db = await getDb();
  if (form.get("confirm") === "1") {
    const counts = await applyImport(db, parsed.data);
    refresh();
    return { step: "done", counts, warnings: parsed.warnings };
  }
  return { step: "preview", preview: await previewImport(db, parsed.data), warnings: parsed.warnings };
}
