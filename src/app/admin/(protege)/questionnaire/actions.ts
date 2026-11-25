"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { publishVersion, removeParticipation, saveOrganizer, setExcluded, setKnowledge } from "@/lib/questionnaire/store";
import { isKnowledge, type SaveResult } from "@/lib/questionnaire/types";

/** Chaque action revérifie la session organisateur : le layout seul ne suffit pas pour une server action. */
async function guard() {
  if (!(await isAdmin())) throw new Error("Session organisateur requise.");
}

const refresh = () => revalidatePath("/admin/questionnaire", "layout");
const isId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

type Outcome = { ok: boolean; message?: string };

/** Niveau de connaissance : « barely » | « well » | « very » | null (non classé). */
export async function setKnowledgeAction(id: string, level: string | null): Promise<Outcome> {
  await guard();
  if (!isId(id) || (level !== null && !isKnowledge(level))) return { ok: false, message: "Niveau invalide." };
  const ok = await setKnowledge(await getDb(), id, level as never);
  refresh();
  return ok ? { ok } : { ok, message: "Seules les réponses terminées peuvent être classées." };
}

export async function setExcludedAction(id: string, excluded: boolean): Promise<Outcome> {
  await guard();
  if (!isId(id) || typeof excluded !== "boolean") return { ok: false, message: "Demande invalide." };
  const ok = await setExcluded(await getDb(), id, excluded);
  refresh();
  return ok ? { ok } : { ok, message: "Participation introuvable." };
}

/** Suppression définitive (la confirmation est demandée côté interface). */
export async function deleteParticipationAction(id: string, redirectToList = false): Promise<Outcome> {
  await guard();
  if (!isId(id)) return { ok: false, message: "Demande invalide." };
  const ok = await removeParticipation(await getDb(), id);
  refresh();
  if (ok && redirectToList) redirect("/admin/questionnaire");
  return ok ? { ok } : { ok, message: "Participation introuvable." };
}

export async function publishAction(version: number, questions: unknown): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  await guard();
  const result = await publishVersion(await getDb(), version, questions);
  refresh();
  revalidatePath("/questionnaire");
  return result.ok ? result : { ok: false, message: result.message };
}

/** Enregistre l'avis privé de l'organisateur (la révision n'est pas utilisée : une seule ligne). */
export async function saveOrganizerAction(draft: unknown): Promise<SaveResult> {
  if (!(await isAdmin())) return { ok: false, code: "forbidden", message: "Session organisateur requise." };
  const result = await saveOrganizer(await getDb(), draft);
  refresh();
  return result;
}
