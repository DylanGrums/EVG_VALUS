"use client";

/** Partie client de la navigation (onglet actif selon l'adresse). Voir app-nav.tsx. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: "🏠" },
  { href: "/resultats", label: "Résultats", icon: "📊" },
  { href: "/orga", label: "Orga", icon: "🗳️" },
  { href: "/idees", label: "Idées", icon: "💡" },
  { href: "/orga/sur-place", label: "Sur place", icon: "🧳" },
] as const;

/** Onglet actif : le préfixe le plus long qui correspond (« /orga/sur-place » l'emporte sur « /orga »). */
function activeHref(pathname: string) {
  const matches = NAV_ITEMS.filter((item) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

export function AppNavBar({ name, admin }: { name: string | null; admin: boolean }) {
  const pathname = usePathname() ?? "/";
  const active = activeHref(pathname);
  const chip = name ? (
    <Link
      href="/qui-es-tu"
      title="Changer de prénom"
      className="max-w-36 truncate rounded-full bg-brand-light px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand hover:text-white"
    >
      {name}
    </Link>
  ) : (
    <Link href="/qui-es-tu" className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white">
      Choisir mon prénom
    </Link>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-extrabold">
            <span className="grid size-9 place-items-center rounded-xl bg-night text-lg text-lime">V</span>
            <span className="hidden text-sm text-muted md:inline">Le carnet de l’EVG</span>
          </Link>
          {name && (
            <nav aria-label="Navigation principale" className="hidden items-center gap-1 text-sm sm:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active === item.href ? "page" : undefined}
                  className={cx(
                    "rounded-lg px-2.5 py-1.5 font-semibold",
                    active === item.href ? "bg-brand-light text-brand" : "text-muted hover:bg-brand-light hover:text-brand",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="flex min-w-0 items-center gap-2">
            {admin && (
              <Link href="/admin" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted hover:bg-brand-light hover:text-brand">
                Admin
              </Link>
            )}
            {chip}
          </div>
        </div>
      </header>

      {name && (
        <nav
          data-app-nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          <ul className="grid grid-cols-5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active === item.href ? "page" : undefined}
                  className={cx(
                    "flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold",
                    active === item.href ? "text-brand" : "text-muted",
                  )}
                >
                  <span aria-hidden className={cx("text-xl leading-none", active !== item.href && "grayscale-[60%]")}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
