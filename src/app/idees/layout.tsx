import Link from "next/link";
import { SiteHeader } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";
import { RememberMe } from "@/app/orga/_components/identity";

/**
 * Page Idées : réservée aux membres identifiés (même accès que /orga, Valentin n'a pas le lien).
 * Le layout vérifie l'accès, et chaque page le revérifie (les layouts ne protègent pas seuls).
 */
export default async function IdeesLayout({ children }: LayoutProps<"/idees">) {
  const me = await requireMemberPage();
  return (
    <>
      <SiteHeader href="/orga">
        <Link className="rounded-full bg-brand-light px-3 py-1.5 font-semibold text-brand" href="/orga/qui-es-tu" title="Changer de prénom">
          {me.name}
        </Link>
      </SiteHeader>
      <RememberMe id={me.id} name={me.name} />
      {children}
    </>
  );
}
