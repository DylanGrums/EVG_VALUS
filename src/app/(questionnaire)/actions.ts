"use server";

import { cookies } from "next/headers";
import { getDb } from "@/db";
import { isDeleted, saveParticipation } from "@/lib/questionnaire/store";
import { PARTICIPATION_COOKIE, hashToken, isToken, newToken } from "@/lib/questionnaire/token";
import type { SaveResult } from "@/lib/questionnaire/types";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Enregistre le brouillon ou l'envoi final du répondant courant.
 * Le jeton de reprise vit dans un cookie httpOnly ; il est créé à la première sauvegarde réelle.
 */
export async function saveAnswers(draft: unknown, revision: number, submit: boolean): Promise<SaveResult> {
  const jar = await cookies();
  const db = await getDb();
  const existing = jar.get(PARTICIPATION_COOKIE)?.value;
  let token = isToken(existing) ? existing : newToken();

  // Participation supprimée par un organisateur : un navigateur reparti de zéro obtient un nouveau jeton,
  // mais un onglet qui avait déjà du contenu est averti plutôt que de ressusciter la participation.
  if (isToken(existing) && (await isDeleted(db, hashToken(existing)))) {
    if (revision > 0) {
      jar.delete(PARTICIPATION_COOKIE);
      return { ok: false, code: "deleted", message: "Cette participation a été supprimée. Commence un nouveau questionnaire." };
    }
    token = newToken();
  }

  const result = await saveParticipation(db, hashToken(token), { draft, revision, submit });
  if (result.ok && result.revision > 0 && token !== existing) {
    jar.set(PARTICIPATION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ONE_YEAR });
  }
  return result;
}

/** « Répondre pour une autre personne » : oublie le jeton courant, la prochaine participation est indépendante. */
export async function startAnother(): Promise<void> {
  (await cookies()).delete(PARTICIPATION_COOKIE);
}
