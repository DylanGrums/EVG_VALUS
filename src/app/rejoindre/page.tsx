import type { Metadata } from "next";
import { NeutralPage } from "@/app/orga/_components/views";
import { LinkButton } from "@/components/ui";
import { isAdmin, groupAccessCode } from "@/lib/session";

export const metadata: Metadata = { title: { absolute: "Lien invalide" } };

/** Page neutre (mauvais code, ou accès à /orga sans le lien). Un organisateur connecté y trouve son raccourci. */
export default async function Rejoindre() {
  const admin = await isAdmin();
  return (
    <NeutralPage>
      {admin && (
        <div className="pt-4">
          <LinkButton href={`/rejoindre/${encodeURIComponent(groupAccessCode())}`} prefetch={false}>
            Entrer dans l’espace membres
          </LinkButton>
        </div>
      )}
    </NeutralPage>
  );
}
