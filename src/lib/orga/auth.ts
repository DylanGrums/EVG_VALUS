/**
 * Contrôle d'accès du module orga, à appeler dans CHAQUE page et server action.
 * L'identité du participant vient toujours de la session signée, jamais du formulaire.
 */
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getMember, isAdmin } from "@/lib/session";
import { OrgaError } from "./errors";
import { getActiveParticipant } from "./participants";

/** Membre courant : `member` = a utilisé le lien secret ; `participant` = prénom choisi et toujours actif. */
export async function currentMember() {
  const member = await getMember();
  if (!member) return { member: null, participant: null };
  const participant = await getActiveParticipant(await getDb(), member.participantId);
  return { member, participant };
}

/** Pour les server actions des membres : renvoie le participant de la session ou lève une erreur. */
export async function requireParticipant() {
  const { participant } = await currentMember();
  if (!participant) throw new OrgaError("Session expirée : rouvre le lien du groupe et choisis ton prénom.");
  return participant;
}

/** Pour les server actions admin. */
export async function requireAdmin() {
  if (!(await isAdmin())) throw new OrgaError("Accès réservé aux organisateurs.");
}

/**
 * Pour les pages /orga/** (le layout ne suffit pas : chaque page revérifie).
 * Sans lien secret → page neutre ; lien OK mais prénom non choisi (ou retiré) → « Qui es-tu ? ».
 */
export async function requireMemberPage() {
  const { member, participant } = await currentMember();
  if (!member) redirect("/rejoindre");
  if (!participant) redirect("/orga/qui-es-tu");
  return participant;
}

/** Pour les pages admin (en plus du layout protégé). */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/admin/connexion");
}
