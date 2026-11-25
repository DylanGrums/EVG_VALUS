import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { Card, Shell, SiteHeader } from "@/components/ui";
import { currentMember } from "@/lib/orga/auth";
import { listParticipants } from "@/lib/orga/participants";
import { IdentityPicker } from "../_components/identity";

export const metadata: Metadata = { title: "Qui es-tu ?" };

/** Identification (premier passage, retour, ou changement de prénom). Exige d'être entré par le lien secret. */
export default async function QuiEsTu() {
  const { member, participant } = await currentMember();
  if (!member) redirect("/rejoindre");
  const people = (await listParticipants(await getDb())).map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <SiteHeader href={participant ? "/orga" : "/orga/qui-es-tu"} />
      <Shell>
        <Card className="space-y-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Bienvenue dans l’orga 🎉</p>
            <h1 className="mt-1 text-3xl">Qui es-tu ?</h1>
            <p className="mt-2 text-muted">
              {participant
                ? "Tu peux changer de prénom ici."
                : "Première visite ? Entre ton prénom. Déjà venu ? Retrouve-le dans la liste. On s’en souviendra sur ce téléphone."}
            </p>
          </div>
          {/* Pas de reprise automatique quand la personne vient volontairement changer de prénom. */}
          <IdentityPicker people={people} currentId={participant?.id} autoRestore={!participant} />
        </Card>
      </Shell>
    </>
  );
}
