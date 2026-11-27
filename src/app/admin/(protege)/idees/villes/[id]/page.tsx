import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Badge, Card, Shell, cx } from "@/components/ui";
import { ActionForm, Collapsible, ConfirmButton, SubmitButton } from "@/app/orga/_components/forms";
import { CategoryLabel, CityFields, EventFacts, EventFields, IdeaCommentList } from "@/app/idees/_components/views";
import { requireAdminPage } from "@/lib/orga/auth";
import { isUuid } from "@/lib/orga/validation";
import { loadCityView, sortEvents } from "@/lib/idees/ideas";
import {
  deleteCityAction,
  deleteEventAction,
  deleteIdeaCommentAction,
  setCityHiddenAction,
  setCityRetainedAction,
  setEventHiddenAction,
  updateCityAction,
  updateEventAction,
} from "../../actions";

export const metadata: Metadata = { title: "Ville (idées)" };

export default async function AdminCityPage({ params }: PageProps<"/admin/idees/villes/[id]">) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const view = await loadCityView(await getDb(), id, null, { forAdmin: true });
  if (!view) notFound();
  const { city } = view;
  const events = sortEvents(view.events, "votes", null);

  return (
    <Shell wide className="max-w-4xl">
      <Link href="/admin/idees" className="text-sm font-semibold text-brand">
        ← Idées
      </Link>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl">{city.name}</h1>
          <span className="text-muted">· {city.country}</span>
          {city.retained && <Badge tone="ok">✓ Retenue</Badge>}
          {city.hidden && <Badge tone="danger">Masquée</Badge>}
          <Badge>{city.source === "membre" ? `Proposée par ${view.proposedByName ?? "?"}` : "Import"}</Badge>
        </div>
        <p className="text-sm text-muted">👍 {view.voters.length ? view.voters.map((v) => v.name).join(", ") : "aucun"}</p>
        <div className="flex flex-wrap gap-2">
          <ActionForm action={setCityRetainedAction}>
            <input type="hidden" name="cityId" value={city.id} />
            <input type="hidden" name="retained" value={city.retained ? "0" : "1"} />
            <SubmitButton variant={city.retained ? "secondary" : "primary"}>{city.retained ? "Ne plus retenir" : "Retenir cette ville"}</SubmitButton>
          </ActionForm>
          <ActionForm action={setCityHiddenAction}>
            <input type="hidden" name="cityId" value={city.id} />
            <input type="hidden" name="hidden" value={city.hidden ? "0" : "1"} />
            <SubmitButton variant="secondary">{city.hidden ? "Afficher aux membres" : "Masquer aux membres"}</SubmitButton>
          </ActionForm>
          <Link href={`/idees/${city.id}`} className="self-center text-sm font-semibold text-brand">
            Voir côté membres →
          </Link>
        </div>
      </Card>

      <Collapsible summary="✏️ Modifier la ville">
        <ActionForm action={updateCityAction} className="space-y-4">
          <input type="hidden" name="cityId" value={city.id} />
          <CityFields city={city} />
          <p className="text-xs text-muted">Un réimport de la recherche écrasera les champs présents dans le fichier.</p>
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        </ActionForm>
      </Collapsible>

      <Card className="space-y-4">
        <h2 className="text-xl">Événements ({events.length})</h2>
        {events.length === 0 && <p className="text-muted">Aucun événement.</p>}
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className={cx("space-y-2 rounded-xl border border-line p-3", event.hidden && "bg-paper opacity-75")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CategoryLabel category={event.category} />
                  <p className="font-bold">
                    {event.name} {event.hidden && <Badge tone="danger">Masqué</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    👍 {event.voters.length ? event.voters.map((v) => v.name).join(", ") : "0"} · {event.comments.length} commentaire(s)
                    {event.source === "membre" && ` · proposé par ${event.proposedByName ?? "?"}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={setEventHiddenAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="hidden" value={event.hidden ? "0" : "1"} />
                    <SubmitButton variant="secondary" className="py-1.5">
                      {event.hidden ? "Afficher" : "Masquer"}
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={deleteEventAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <ConfirmButton type="submit" variant="danger" className="py-1.5" message={`Supprimer « ${event.name} », ses votes et ses commentaires ? C’est définitif.`}>
                      Supprimer
                    </ConfirmButton>
                  </ActionForm>
                </div>
              </div>
              <EventFacts event={event} />
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Modifier · commentaires</summary>
                <div className="mt-3 space-y-4">
                  <ActionForm action={updateEventAction} className="space-y-4">
                    <input type="hidden" name="eventId" value={event.id} />
                    <EventFields event={event} />
                    <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
                  </ActionForm>
                  <IdeaCommentList comments={event.comments} deleteAction={deleteIdeaCommentAction} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">Commentaires sur la ville</h2>
        <IdeaCommentList comments={view.comments} deleteAction={deleteIdeaCommentAction} />
      </Card>

      <ActionForm action={deleteCityAction}>
        <input type="hidden" name="cityId" value={city.id} />
        <input type="hidden" name="back" value="1" />
        <ConfirmButton type="submit" variant="danger" message={`Supprimer « ${city.name} » avec tous ses événements, votes et commentaires ? C’est définitif (« Masquer » est réversible).`}>
          Supprimer la ville
        </ConfirmButton>
      </ActionForm>
    </Shell>
  );
}
