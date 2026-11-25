import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { Badge, Button, Card, Hero, Input, LinkButton, Shell } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { listParticipants } from "@/lib/orga/participants";
import { groupAccessCode } from "@/lib/session";
import { ActionForm, ConfirmButton, CopyButton, SubmitButton } from "@/app/orga/_components/forms";
import { addParticipantAction, removeParticipantAction, renameParticipantAction, restoreParticipantAction } from "./actions";

export const metadata: Metadata = { title: "Participants" };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function Participants() {
  await requireAdminPage();
  const people = await listParticipants(await getDb(), { includeInactive: true });
  const active = people.filter((p) => p.active);
  const removed = people.filter((p) => !p.active);
  const path = `/rejoindre/${encodeURIComponent(groupAccessCode())}`;
  const link = `${await origin()}${path}`;

  return (
    <Shell>
      <Hero kicker="Espace organisateurs" title="Participants">
        {active.length} participant{active.length > 1 ? "s" : ""} : c’est sur ce nombre qu’est calculé le prix par personne.
      </Hero>

      <Card className="space-y-3">
        <h2 className="text-xl">🔗 Lien secret du groupe</h2>
        <p className="text-sm text-muted">
          À partager dans le groupe WhatsApp des participants, <strong>jamais à Valentin</strong>. Au premier passage, chacun entre son prénom (il s’ajoute à la liste ci-dessous) ; ensuite le téléphone s’en souvient. Vous pouvez aussi ajouter des prénoms à l’avance.
        </p>
        <p className="break-all rounded-xl bg-paper px-3.5 py-2.5 font-mono text-sm">{link}</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={link} />
          <LinkButton href={path} prefetch={false} variant="ghost">
            Entrer dans l’espace membres →
          </LinkButton>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">Liste des prénoms</h2>
        <ActionForm action={addParticipantAction} resetOnSuccess className="space-y-1">
            <div className="flex gap-2">
              <Input name="name" required maxLength={40} placeholder="Prénom à ajouter" aria-label="Prénom" autoComplete="off" />
              <SubmitButton className="shrink-0">
                Ajouter
              </SubmitButton>
            </div>
        </ActionForm>
        {active.length === 0 && <p className="text-sm text-muted">Personne pour l’instant.</p>}
        <ul className="divide-y divide-line">
          {active.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-2 py-2.5">
              <ActionForm action={renameParticipantAction} className="min-w-0 flex-1">
                  <div className="flex gap-2">
                    <input type="hidden" name="participantId" value={p.id} />
                    <Input name="name" required maxLength={40} defaultValue={p.name} aria-label={`Renommer ${p.name}`} className="py-2" />
                    <SubmitButton variant="secondary" className="shrink-0 py-2">
                      Renommer
                    </SubmitButton>
                  </div>
              </ActionForm>
              <ActionForm action={removeParticipantAction}>
                <input type="hidden" name="participantId" value={p.id} />
                <ConfirmButton message={`Retirer ${p.name} de la liste ?`} variant="danger" type="submit" className="py-2">
                  Retirer
                </ConfirmButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Card>

      {removed.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-lg">Retirés</h2>
          <p className="text-sm text-muted">Ils ne comptent plus dans les participants, mais leurs votes et commentaires restent affichés.</p>
          <ul className="space-y-2">
            {removed.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <Badge>{p.name}</Badge>
                <ActionForm action={restoreParticipantAction}>
                  <input type="hidden" name="participantId" value={p.id} />
                  <Button type="submit" variant="ghost" className="py-1.5">
                    Réintégrer
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}
