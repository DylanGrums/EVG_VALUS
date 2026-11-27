import type { Metadata } from "next";
import { getDb } from "@/db";
import { AppNav } from "@/components/app-nav";
import { Card, Shell } from "@/components/ui";
import { IdentityPicker } from "@/app/orga/_components/identity";
import { currentMember } from "@/lib/orga/auth";
import { listParticipants } from "@/lib/orga/participants";
import { safeNext } from "@/lib/nav";

export const metadata: Metadata = { title: "Qui es-tu ?" };

/**
 * Identification unique de l'app (premier passage, retour, ou changement de prénom).
 * `?suite=/questionnaire` : où revenir après le choix du prénom (ancien lien du questionnaire, page protégée…).
 */
export default async function QuiEsTu({ searchParams }: PageProps<"/qui-es-tu">) {
  const { suite } = await searchParams;
  const next = safeNext(Array.isArray(suite) ? suite[0] : suite);
  const { participant } = await currentMember();
  const people = (await listParticipants(await getDb())).map((p) => ({ id: p.id, name: p.name }));
  const forQuestionnaire = next.startsWith("/questionnaire");

  return (
    <>
      <AppNav />
      <Shell>
        <Card className="space-y-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-brand">
              {forQuestionnaire ? "Questionnaire sur Val 📝" : "Le carnet de l’EVG 🎉"}
            </p>
            <h1 className="mt-1 text-3xl">Qui es-tu ?</h1>
            <p className="mt-2 text-muted">
              {participant
                ? "Tu peux changer de prénom ici."
                : forQuestionnaire
                  ? "Avant de répondre, dis-nous qui tu es : ton prénom servira pour le questionnaire et pour toute l’orga. Déjà venu ? Retrouve-le dans la liste."
                  : "Première visite ? Entre ton prénom, une seule fois pour tout le site. Déjà venu ? Retrouve-le dans la liste. On s’en souviendra sur ce téléphone."}
            </p>
          </div>
          {/* Pas de reprise automatique quand la personne vient volontairement changer de prénom. */}
          <IdentityPicker people={people} currentId={participant?.id} autoRestore={!participant} next={next} />
        </Card>
      </Shell>
    </>
  );
}
