"use server";

/**
 * Server actions de la page Idées (membres). Chaque action revérifie la session :
 * l'auteur d'un 👍, d'une proposition ou d'un commentaire est TOUJOURS le participant de la session signée.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireParticipant } from "@/lib/orga/auth";
import { OrgaError, toActionState, type ActionState } from "@/lib/orga/errors";
import { firstError, isUuid } from "@/lib/orga/validation";
import { addIdeaComment, proposeCity, proposeEvent, toggleCityVote, toggleEventVote } from "@/lib/idees/ideas";
import { ideaCommentSchema, parseCityForm, parseEventForm } from "@/lib/idees/validation";

function refresh() {
  revalidatePath("/idees", "layout");
  revalidatePath("/admin/idees", "layout");
}

function idFrom(form: FormData, key: string, message = "Élément introuvable.") {
  const value = form.get(key);
  if (!isUuid(value)) throw new OrgaError(message);
  return value;
}

export async function cityVoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  return toActionState(async () => {
    const participant = await requireParticipant();
    await toggleCityVote(await getDb(), participant.id, idFrom(form, "cityId", "Ville introuvable."));
    refresh();
  });
}

export async function eventVoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  return toActionState(async () => {
    const participant = await requireParticipant();
    await toggleEventVote(await getDb(), participant.id, idFrom(form, "eventId", "Événement introuvable."));
    refresh();
  });
}

/** Proposer une ville : redirige vers sa page en cas de succès. */
export async function proposeCityAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const participant = await requireParticipant();
    const parsed = parseCityForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    id = (await proposeCity(await getDb(), participant.id, parsed.data)).id;
  } catch (error) {
    if (error instanceof OrgaError) return { error: error.message };
    throw error;
  }
  refresh();
  redirect(`/idees/${id}`);
}

export async function proposeEventAction(_: ActionState, form: FormData): Promise<ActionState> {
  return toActionState(async () => {
    const participant = await requireParticipant();
    const cityId = idFrom(form, "cityId", "Ville introuvable.");
    const parsed = parseEventForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await proposeEvent(await getDb(), participant.id, cityId, parsed.data);
    refresh();
  }, "Merci, ta proposition est en ligne !");
}

export async function ideaCommentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return toActionState(async () => {
    const participant = await requireParticipant();
    const cityId = idFrom(form, "cityId", "Ville introuvable.");
    const eventId = form.get("eventId");
    if (eventId !== null && !isUuid(eventId)) throw new OrgaError("Événement introuvable.");
    const parsed = ideaCommentSchema.safeParse({ body: String(form.get("body") ?? "") });
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await addIdeaComment(await getDb(), participant.id, cityId, eventId, parsed.data.body);
    refresh();
  });
}
