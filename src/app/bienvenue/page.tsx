import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import { Card, Hero, LinkButton, Shell } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";

export const metadata: Metadata = { title: "Bienvenue" };

/** Écran affiché juste après la première inscription : répondre au questionnaire sur Val, ou passer. */
export default async function Bienvenue() {
  const me = await requireMemberPage("/bienvenue");
  return (
    <>
      <AppNav />
      <Shell>
        <Hero kicker="Bienvenue 🎉" title={`Salut ${me.name} !`}>
          Avant d’aller voter : tu as cinq minutes pour nous aider à cerner ce qui plairait à Val ?
        </Hero>
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl">Le questionnaire sur Val</h2>
            <p className="mt-1 text-muted">
              21 questions sur ses goûts, ses limites et ses envies. Seuls les orgas lisent tes réponses ; le groupe ne voit que des
              tendances anonymes. Tu pourras aussi y revenir plus tard depuis l’accueil.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <LinkButton href="/questionnaire" className="sm:flex-1">
              Répondre au questionnaire
            </LinkButton>
            <LinkButton href="/" variant="secondary" className="sm:flex-1">
              Passer pour l’instant
            </LinkButton>
          </div>
        </Card>
      </Shell>
    </>
  );
}
