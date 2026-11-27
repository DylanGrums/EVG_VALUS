import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/session";
import { SiteHeader } from "@/components/ui";
import { logout } from "../actions";

/** Toutes les pages sous /admin (sauf /admin/connexion) exigent la session organisateur. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  if (!(await isAdmin())) redirect("/admin/connexion");
  const link = "rounded-lg px-3 py-1.5 font-semibold text-muted hover:bg-brand-light hover:text-brand";
  return (
    <>
      <SiteHeader href="/admin">
        <Link className={link} href="/" title="Retour à l’app des membres">← L’app</Link>
        <Link className={link} href="/admin/questionnaire">Questionnaire</Link>
        <Link className={link} href="/admin/idees">Idées</Link>
        <Link className={link} href="/admin/orga">Orga</Link>
        <Link className={link} href="/admin/participants">Participants</Link>
        <Link className={link} href="/admin/stats">Stats</Link>
        <form action={logout}>
          <button className={link} type="submit">Déconnexion</button>
        </form>
      </SiteHeader>
      {children}
    </>
  );
}
