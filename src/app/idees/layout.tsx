import { AppNav } from "@/components/app-nav";

/**
 * Page Idées : navigation commune. L'accès est vérifié par CHAQUE page (requireMemberPage avec son adresse de retour),
 * les layouts ne protégeant pas seuls.
 */
export default function IdeesLayout({ children }: LayoutProps<"/idees">) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
