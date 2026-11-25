import Link from "next/link";
import { SiteHeader } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";
import { RememberMe } from "../_components/identity";

/** Espace membres. Le layout vérifie l'accès, et chaque page le revérifie (les layouts ne protègent pas seuls). */
export default async function MembreLayout({ children }: LayoutProps<"/orga">) {
  const me = await requireMemberPage();
  const link = "rounded-lg px-2.5 py-1.5 font-semibold text-muted hover:bg-brand-light hover:text-brand";
  return (
    <>
      <SiteHeader href="/orga">
        <Link className={link} href="/orga">Préparation</Link>
        <Link className={link} href="/orga/sur-place">Sur place</Link>
        <Link className="rounded-full bg-brand-light px-3 py-1.5 font-semibold text-brand" href="/orga/qui-es-tu" title="Changer de prénom">
          {me.name}
        </Link>
      </SiteHeader>
      <RememberMe id={me.id} name={me.name} />
      {children}
    </>
  );
}
