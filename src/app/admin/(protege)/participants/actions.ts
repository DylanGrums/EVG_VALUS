"use server";

/** Gestion de la liste des prénoms (organisateurs uniquement). */
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/orga/auth";
import { OrgaError, type ActionState } from "@/lib/orga/errors";
import { addParticipant, removeParticipant, renameParticipant, restoreParticipant, setParticipantAttending } from "@/lib/orga/participants";
import { isUuid } from "@/lib/orga/validation";

function refresh() {
  revalidatePath("/", "layout");
}

function idFrom(form: FormData) {
  const id = form.get("participantId");
  if (!isUuid(id)) throw new OrgaError("Participant introuvable.");
  return id;
}

async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    await requireAdmin();
    const message = await fn();
    refresh();
    return { ok: true, message: message || undefined };
  } catch (error) {
    if (error instanceof OrgaError) return { error: error.message };
    throw error;
  }
}

export async function addParticipantAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const p = await addParticipant(await getDb(), String(form.get("name") ?? ""));
    return `${p.name} a été ajouté·e.`;
  });
}

export async function renameParticipantAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await renameParticipant(await getDb(), idFrom(form), String(form.get("name") ?? ""));
  });
}

export async function removeParticipantAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const mode = await removeParticipant(await getDb(), idFrom(form));
    return mode === "desactive" ? "Retiré·e (ses votes et commentaires restent visibles)." : "Supprimé·e.";
  });
}

export async function restoreParticipantAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await restoreParticipant(await getDb(), idFrom(form));
  });
}

/** Vient au week-end (participant) ou proche : seul le premier compte dans le prix par personne. */
export async function setAttendingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const attending = form.get("attending");
    if (attending !== "oui" && attending !== "non") throw new OrgaError("Statut invalide.");
    await setParticipantAttending(await getDb(), idFrom(form), attending === "oui");
  });
}
