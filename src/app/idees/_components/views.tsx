/** Composants (serveur) du module Idées, partagés entre l'espace membres et l'admin. */
import type { ReactNode } from "react";
import { IDEA_CATEGORIES, type IdeaCity, type IdeaEvent } from "@/db/schema";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "@/app/orga/_components/forms";
import { ExternalLink, MapsLink } from "@/app/orga/_components/views";
import type { ActionState } from "@/lib/orga/errors";
import { formatCommentDate, formatEuros } from "@/lib/orga/format";
import { CATEGORY_EMOJI, CATEGORY_LABELS, formatEventDates } from "@/lib/idees/common";
import type { IdeaCommentView } from "@/lib/idees/ideas";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** Infos pratiques d'une ville (accès, budget, lien). */
export function CityFacts({ city }: { city: IdeaCity }) {
  const rows: ReactNode[] = [];
  if (city.access) rows.push(<span key="a">✈️ {city.access}</span>);
  if (city.budget) rows.push(<span key="b">💶 {city.budget}</span>);
  if (city.url) rows.push(<span key="u">🔗 <ExternalLink href={city.url} /></span>);
  if (!rows.length) return null;
  return <div className="space-y-1 text-sm text-muted [&>span]:block">{rows}</div>;
}

/** Infos pratiques d'un événement (dates, prix, adresse, lien). */
export function EventFacts({ event }: { event: IdeaEvent }) {
  const rows: ReactNode[] = [];
  const dates = formatEventDates(event);
  if (dates) rows.push(<span key="d">📅 {dates}</span>);
  if (event.priceText || event.priceMinCents != null) {
    rows.push(
      <span key="p">
        💶 {event.priceText ?? ""}
        {event.priceMinCents != null && !event.priceText ? `à partir de ${formatEuros(event.priceMinCents)}` : ""}
      </span>,
    );
  }
  if (event.address) rows.push(<span key="a">📍 <MapsLink address={event.address} /></span>);
  if (event.url) rows.push(<span key="u">🔗 <ExternalLink href={event.url} /></span>);
  if (!rows.length) return null;
  return <div className="space-y-1 text-sm text-muted [&>span]:block">{rows}</div>;
}

export function CategoryLabel({ category }: { category: IdeaEvent["category"] }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
      {CATEGORY_EMOJI[category]} {CATEGORY_LABELS[category]}
    </span>
  );
}

export function IdeaCommentList({ comments, deleteAction }: { comments: IdeaCommentView[]; deleteAction?: Action }) {
  if (!comments.length) return <p className="text-sm text-muted">Pas encore de commentaire.</p>;
  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className="rounded-xl bg-paper px-3.5 py-2.5">
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
            <span>
              <strong className="text-ink">{c.authorName ?? "Quelqu’un"}</strong> · {formatCommentDate(c.createdAt)}
            </span>
            {deleteAction && (
              <ActionForm action={deleteAction}>
                <input type="hidden" name="commentId" value={c.id} />
                <ConfirmButton message="Supprimer ce commentaire ?" variant="ghost" className="px-2 py-1 text-xs" type="submit">
                  Supprimer
                </ConfirmButton>
              </ActionForm>
            )}
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-sm">{c.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function IdeaCommentForm({ action, cityId, eventId, placeholder = "Ton avis, une question, une vanne…" }: { action: Action; cityId: string; eventId?: string; placeholder?: string }) {
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-2">
      <input type="hidden" name="cityId" value={cityId} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <Textarea name="body" required maxLength={2000} rows={2} placeholder={placeholder} className="min-h-16" aria-label="Commentaire" />
      <SubmitButton pendingLabel="Envoi…">Commenter</SubmitButton>
    </ActionForm>
  );
}

const centsToInput = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toString().replace(".", ","));

/** Champs d'une ville (proposition membre et édition admin). */
export function CityFields({ city }: { city?: IdeaCity }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ville ou lieu">
          <Input name="name" required maxLength={120} defaultValue={city?.name} placeholder="Porto" />
        </Field>
        <Field label="Pays">
          <Input name="country" required maxLength={80} defaultValue={city?.country} placeholder="Portugal" />
        </Field>
      </div>
      <Field label="Description" hint="Ce qu’on y fait, l’ambiance…">
        <Textarea name="summary" maxLength={4000} defaultValue={city?.summary} rows={3} />
      </Field>
      <Field label="Pourquoi ça plairait à Val">
        <Textarea name="why" maxLength={2000} defaultValue={city?.why} rows={2} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Accès" hint="Ex. 2 h de vol direct depuis Paris">
          <Input name="access" maxLength={300} defaultValue={city?.access ?? ""} />
        </Field>
        <Field label="Budget indicatif" hint="Ex. 300 € / pers. hors vols">
          <Input name="budget" maxLength={300} defaultValue={city?.budget ?? ""} />
        </Field>
      </div>
      <Field label="Lien">
        <Input name="url" inputMode="url" autoCapitalize="none" defaultValue={city?.url ?? ""} placeholder="https://" />
      </Field>
    </div>
  );
}

/** Champs d'un événement (proposition membre et édition admin). */
export function EventFields({ event }: { event?: IdeaEvent }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Nom">
          <Input name="name" required maxLength={140} defaultValue={event?.name} placeholder="Festival, match, visite, resto…" />
        </Field>
        <Field label="Catégorie">
          <Select name="category" defaultValue={event?.category ?? "autre"}>
            {IDEA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_EMOJI[c]} {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <Textarea name="description" maxLength={4000} defaultValue={event?.description} rows={3} />
      </Field>
      <Field label="Pourquoi ça plairait à Val">
        <Textarea name="why" maxLength={2000} defaultValue={event?.why} rows={2} />
      </Field>
      <Field label="Lien" hint="Site officiel, billetterie…">
        <Input name="url" inputMode="url" autoCapitalize="none" defaultValue={event?.url ?? ""} placeholder="https://" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prix (texte)" hint="Ex. 25 à 40 € / pers.">
          <Input name="priceText" maxLength={200} defaultValue={event?.priceText ?? ""} />
        </Field>
        <Field label="Prix minimum (€)">
          <Input name="priceMin" inputMode="decimal" defaultValue={centsToInput(event?.priceMinCents)} placeholder="25" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de début">
          <Input name="startsOn" type="date" min="2027-01-01" defaultValue={event?.startsOn ?? ""} />
        </Field>
        <Field label="Date de fin">
          <Input name="endsOn" type="date" min="2027-01-01" defaultValue={event?.endsOn ?? ""} />
        </Field>
      </div>
      <Field label="Dates (texte)" hint="Si pas de date précise : « tous les samedis », « mi-mai »…">
        <Input name="datesText" maxLength={200} defaultValue={event?.datesText ?? ""} />
      </Field>
      <Field label="Adresse">
        <Input name="address" maxLength={300} defaultValue={event?.address ?? ""} autoComplete="off" />
      </Field>
    </div>
  );
}
