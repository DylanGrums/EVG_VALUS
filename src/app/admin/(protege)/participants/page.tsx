import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { Badge, Button, Card, Hero, Input, LinkButton, Shell } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { listParticipants } from "@/lib/orga/participants";
import { listMemberStats } from "@/lib/analytics/stats";
import { formatAgo, formatParis } from "@/lib/analytics/format";
import { OnlineDot } from "../stats/_components/bits";
import Link from "next/link";
import { ActionForm, ConfirmButton, CopyButton, SubmitButton } from "@/app/orga/_components/forms";
import { addParticipantAction, removeParticipantAction, renameParticipantAction, restoreParticipantAction, setAttendingAction } from "./actions";

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
  const db = await getDb();
  const now = new Date();
  const [people, activity] = await Promise.all([listParticipants(db, { includeInactive: true }), listMemberStats(db, now)]);
  const activityById = new Map(activity.map((a) => [a.participantId, a]));
  const active = people.filter((p) => p.active);
  const removed = people.filter((p) => !p.active);
  const attending = active.filter((p) => p.attending);
  const relatives = active.length - attending.length;
  const path = "/";
  const link = `${await origin()}${path}`;

  return (
    <Shell>
      <Hero kicker="Espace organisateurs" title="Participants">
        {attending.length} participant{attending.length > 1 ? "s" : ""} au week-end : c’est sur ce nombre qu’est calculé le prix par personne.
        {relatives > 0 && ` Plus ${relatives} proche${relatives > 1 ? "s" : ""} (famille, copine…) qui voi${relatives > 1 ? "ent" : "t"} tout mais ne compte${relatives > 1 ? "nt" : ""} pas.`}
      </Hero>

      <Card className="space-y-3">
        <h2 className="text-xl">🔗 Lien du groupe</h2>
        <p className="text-sm text-muted">
          À partager dans le groupe WhatsApp des participants, <strong>jamais à Valentin</strong>. Au premier passage, chacun entre son prénom et dit s’il vient au week-end (il s’ajoute à la liste ci-dessous) ; ensuite le téléphone s’en souvient. Le même prénom sert pour le questionnaire, l’orga et les idées. L’ancien lien /questionnaire marche toujours (identification d’abord). Vous pouvez aussi ajouter des prénoms à l’avance.
        </p>
        <p className="break-all rounded-xl bg-paper px-3.5 py-2.5 font-mono text-sm">{link}</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={link} />
          <LinkButton href={path} prefetch={false} variant="ghost">
            Ouvrir l’app des membres →
          </LinkButton>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">Liste des prénoms</h2>
        <p className="text-sm text-muted">Touche le statut (« Vient au week-end » / « Proche ») pour le changer.</p>
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
              <ActionForm action={setAttendingAction}>
                <input type="hidden" name="participantId" value={p.id} />
                <input type="hidden" name="attending" value={p.attending ? "non" : "oui"} />
                <SubmitButton
                  variant="ghost"
                  className="py-2"
                  title={p.attending ? "Passer en proche (ne compte plus dans le prix par personne)" : "Passer en participant au week-end"}
                >
                  {p.attending ? <Badge tone="ok">Vient au week-end</Badge> : <Badge>Proche</Badge>}
                </SubmitButton>
              </ActionForm>
              <ActionForm action={removeParticipantAction}>
                <input type="hidden" name="participantId" value={p.id} />
                <ConfirmButton message={`Retirer ${p.name} de la liste ?`} variant="danger" type="submit" className="py-2">
                  Retirer
                </ConfirmButton>
              </ActionForm>
              <Activity stats={activityById.get(p.id)} id={p.id} now={now} />
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
                <span className="flex flex-wrap items-center gap-2">
                  <Badge>{p.name}</Badge>
                  <Activity stats={activityById.get(p.id)} id={p.id} now={now} />
                </span>
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

/** Fréquentation d'un prénom (admin seulement) : en ligne, dernière connexion, nombre de connexions, lien vers le détail. */
function Activity({ stats, id, now }: { stats?: { online: boolean; lastSeenAt: Date | null; visits: number }; id: string; now: Date }) {
  const online = stats?.online ?? false;
  const visits = stats?.visits ?? 0;
  return (
    <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <OnlineDot online={online} />
      <span title={stats?.lastSeenAt ? formatParis(stats.lastSeenAt) : undefined}>
        {online ? <strong className="text-ok">En ligne</strong> : <>Dernière connexion : {formatAgo(stats?.lastSeenAt, now)}</>}
      </span>
      <span>
        · {visits} connexion{visits > 1 ? "s" : ""}
      </span>
      <Link href={`/admin/stats/${id}`} className="font-semibold text-brand underline">
        Détail
      </Link>
    </span>
  );
}
