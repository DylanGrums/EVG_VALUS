"use server";

/**
 * Server actions de l'espace membres. Chaque action revérifie la session :
 * l'auteur d'un vote, d'une proposition ou d'un commentaire est TOUJOURS le participant de la session.
 */
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { setMember } from "@/lib/session";
import { requireParticipant } from "@/lib/orga/auth";
import { OrgaError, toActionState, type ActionState } from "@/lib/orga/errors";
import { getActiveParticipant, NameTakenError, registerSelf } from "@/lib/orga/participants";
import { addComment, proposeOption } from "@/lib/orga/topics";
import { commentSchema, firstError, isUuid, parseOptionForm } from "@/lib/orga/validation";
import { toggleVote } from "@/lib/orga/votes";

function refresh() {
  revalidatePath("/orga", "layout");
  revalidatePath("/admin/orga", "layout");
}

/** Résultat d'une action d'identification : le client mémorise ce prénom dans le localStorage. */
export type IdentityState =
  | { ok: true; participant: { id: string; name: string } }
  | { ok?: false; error: string; taken?: { id: string; name: string } }
  | undefined;

async function identify(id: unknown): Promise<IdentityState> {
  const participant = isUuid(id) ? await getActiveParticipant(await getDb(), id) : null;
  if (!participant) return { error: "Ce prénom n’est plus dans la liste. Choisis-en un autre ou inscris-toi." };
  await setMember(participant.id);
  refresh();
  return { ok: true, participant: { id: participant.id, name: participant.name } };
}

/**
 * « J'ai déjà renseigné mon prénom » : choix dans la liste. Avec la reprise automatique, seul cas
 * où l'identifiant vient du client : il est validé contre la liste des participants actifs.
 */
export async function chooseParticipantAction(_: IdentityState, form: FormData): Promise<IdentityState> {
  return identify(form.get("participantId"));
}

/** Reprise automatique depuis le prénom mémorisé dans le localStorage du téléphone. */
export async function restoreParticipantAction(participantId: string): Promise<IdentityState> {
  return identify(participantId);
}

/** Premier passage : la personne entre son prénom, on l'ajoute à la liste du groupe. */
export async function registerAction(_: IdentityState, form: FormData): Promise<IdentityState> {
  try {
    const participant = await registerSelf(await getDb(), String(form.get("name") ?? ""));
    await setMember(participant.id);
    refresh();
    revalidatePath("/admin/participants");
    return { ok: true, participant: { id: participant.id, name: participant.name } };
  } catch (error) {
    if (error instanceof NameTakenError) return { error: error.message, taken: error.existing };
    if (error instanceof OrgaError) return { error: error.message };
    throw error;
  }
}

export async function voteAction(_: ActionState, form: FormData): Promise<ActionState> {
  return toActionState(async () => {
    const participant = await requireParticipant();
    const optionId = form.get("optionId");
    if (!isUuid(optionId)) throw new OrgaError("Option introuvable.");
    await toggleVote(await getDb(), participant.id, optionId);
    refresh();
  });
}

export async function proposeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return toActionState(async () => {
    const participant = await requireParticipant();
    const topicId = form.get("topicId");
    if (!isUuid(topicId)) throw new OrgaError("Sujet introuvable.");
    const parsed = parseOptionForm(form);
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await proposeOption(await getDb(), participant.id, topicId, parsed.data);
    refresh();
  }, "Merci, ta proposition est en ligne !");
}

export async function commentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return toActionState(async () => {
    const participant = await requireParticipant();
    const topicId = form.get("topicId");
    const optionId = form.get("optionId");
    if (!isUuid(topicId)) throw new OrgaError("Sujet introuvable.");
    if (optionId !== null && !isUuid(optionId)) throw new OrgaError("Option introuvable.");
    const parsed = commentSchema.safeParse({ body: String(form.get("body") ?? "") });
    if (!parsed.success) throw new OrgaError(firstError(parsed.error));
    await addComment(await getDb(), participant.id, topicId, optionId, parsed.data.body);
    refresh();
  });
}
