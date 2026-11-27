/**
 * Contrôle d'accès du module orga, à appeler dans CHAQUE page et server action.
 * L'identité du participant vient toujours de la session signée, jamais du formulaire.
 */
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { identifyHref } from "@/lib/nav";
import { getMember, isAdmin } from "@/lib/session";
import { OrgaError } from "./errors";
import { getActiveParticipant } from "./participants";

/** Membre courant : `participant` = prénom choisi et toujours actif. */
export async function currentMember() {
  const member = await getMember();
  const participant = await getActiveParticipant(await getDb(), member.participantId);
  return { member, participant };
}

/** Pour les server actions des membres : renvoie le participant de la session ou lève une erreur. */
export async function requireParticipant() {
  const { participant } = await currentMember();
  if (!participant) throw new OrgaError("Session expirée : choisis ton prénom sur l’accueil.");
  return participant;
}

/** Pour les server actions admin. */
export async function requireAdmin() {
  if (!(await isAdmin())) throw new OrgaError("Accès réservé aux organisateurs.");
}

/**
 * Pour les pages membres (accueil, /orga/**, /idees/**… : le layout ne suffit pas, chaque page revérifie).
 * Prénom non choisi (ou retiré) → « Qui es-tu ? », puis retour vers `next` (chemin interne) si fourni.
 */
export async function requireMemberPage(next?: string) {
  const { participant } = await currentMember();
  if (!participant) redirect(identifyHref(next));
  return participant;
}

/** Pour les pages admin (en plus du layout protégé). */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/admin/connexion");
}
