"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { currentMember } from "@/lib/orga/auth";
import { isDeleted, resolveMemberParticipation, saveParticipation } from "@/lib/questionnaire/store";
import { PARTICIPATION_COOKIE, hashToken, isToken, newToken } from "@/lib/questionnaire/token";
import type { SaveResult } from "@/lib/questionnaire/types";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Enregistre le brouillon ou l'envoi final du membre identifié.
 * - L'identité vient du cookie signé (prénom choisi), jamais du formulaire : le prénom de la liste est imposé
 *   et la participation lui est rattachée.
 * - Le jeton de reprise vit dans un cookie httpOnly ; il est créé à la première sauvegarde réelle. Un jeton qui
 *   désigne la participation de quelqu'un d'autre (navigateur partagé, changement de prénom) est remplacé.
 */
export async function saveAnswers(draft: unknown, revision: number, submit: boolean): Promise<SaveResult> {
  const { participant } = await currentMember();
  if (!participant) return { ok: false, code: "forbidden", message: "Choisis d’abord ton prénom (recharge la page)." };

  const jar = await cookies();
  const db = await getDb();
  const existing = jar.get(PARTICIPATION_COOKIE)?.value;
  const tokenId = isToken(existing) ? hashToken(existing) : null;

  // Participation supprimée par un organisateur : un onglet qui avait déjà du contenu est averti
  // plutôt que de ressusciter la participation ; un navigateur reparti de zéro obtient un nouveau jeton.
  if (tokenId && revision > 0 && (await isDeleted(db, tokenId))) {
    jar.delete(PARTICIPATION_COOKIE);
    return { ok: false, code: "deleted", message: "Cette participation a été supprimée. Commence un nouveau questionnaire." };
  }

  const state = await resolveMemberParticipation(db, tokenId, participant);
  if (!state.currentId) {
    if (state.submitted) return { ok: false, code: "conflict", message: "Tu as déjà envoyé tes réponses, merci !" };
    if (revision > 0) return { ok: false, code: "conflict", message: "Ce brouillon n’est plus le tien (prénom changé ?). Recharge la page." };
  }
  const token = state.currentId && isToken(existing) ? existing : newToken();

  const result = await saveParticipation(db, hashToken(token), {
    draft,
    revision,
    submit,
    owner: { participantId: participant.id, name: participant.name },
  });
  if (result.ok && result.revision > 0 && token !== existing) {
    jar.set(PARTICIPATION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ONE_YEAR });
  }
  if (result.ok && result.submitted) revalidatePath("/", "layout");
  return result;
}

/** Après une suppression par un organisateur : oublie le jeton courant, la prochaine participation repart de zéro. */
export async function startAnother(): Promise<void> {
  (await cookies()).delete(PARTICIPATION_COOKIE);
}
