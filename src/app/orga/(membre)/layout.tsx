import { AppNav } from "@/components/app-nav";

/**
 * Espace orga : navigation commune. L'accès est vérifié par CHAQUE page (requireMemberPage avec son adresse de retour),
 * les layouts ne protégeant pas seuls.
 */
export default function MembreLayout({ children }: LayoutProps<"/orga">) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
