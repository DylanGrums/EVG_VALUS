/**
 * Barre de navigation commune à toutes les pages membres (accueil, résultats, orga, idées, sur place, questionnaire).
 * Composant serveur : lit lui-même le prénom de la session et le statut admin, il suffit de le placer en haut de la page :
 *
 *   import { AppNav } from "@/components/app-nav";
 *   …
 *   <AppNav />
 *   <Shell>…</Shell>
 *
 * Mobile : en-tête + barre d'onglets fixée en bas. Desktop : tout dans l'en-tête.
 * Elle n'affiche rien de sensible : la protection d'accès reste à faire dans chaque page (requireMemberPage).
 */
import { currentMember } from "@/lib/orga/auth";
import { isAdmin } from "@/lib/session";
import { RememberMe } from "@/app/orga/_components/identity";
import { AppNavBar } from "./app-nav-bar";

export async function AppNav() {
  const [{ participant }, admin] = await Promise.all([currentMember(), isAdmin()]);
  return (
    <>
      <AppNavBar name={participant?.name ?? null} admin={admin} />
      {/* Garde le prénom mémorisé sur le téléphone (reconnaissance automatique au retour). */}
      {participant && <RememberMe id={participant.id} name={participant.name} />}
    </>
  );
}
