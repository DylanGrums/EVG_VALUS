import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { IDEA_CATEGORIES } from "@/db/schema";
import { Badge, Card, Shell, cx } from "@/components/ui";
import { ActionForm, Collapsible, SubmitButton } from "@/app/orga/_components/forms";
import { deleteIdeaCommentAction } from "@/app/admin/(protege)/idees/actions";
import { isAdmin } from "@/lib/session";
import { requireMemberPage } from "@/lib/orga/auth";
import { isUuid } from "@/lib/orga/validation";
import { CATEGORY_EMOJI, CATEGORY_LABELS, isCategory } from "@/lib/idees/common";
import { loadCityView, sortEvents, type EventSort, type EventView } from "@/lib/idees/ideas";
import { eventVoteAction, cityVoteAction, ideaCommentAction, proposeEventAction } from "../actions";
import { ThumbButton } from "../_components/thumb";
import { CategoryLabel, CityFacts, EventFacts, EventFields, IdeaCommentForm, IdeaCommentList } from "../_components/views";

export const metadata: Metadata = { title: "Idée" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CityPage({ params, searchParams }: PageProps<"/idees/[id]">) {
  const { id } = await params;
  const me = await requireMemberPage(`/idees/${encodeURIComponent(id)}`);
  if (!isUuid(id)) notFound();
  const view = await loadCityView(await getDb(), id, me.id);
  if (!view) notFound();
  const admin = await isAdmin();
  const query = await searchParams;
  const category = isCategory(first(query.cat)) ? first(query.cat) : null;
  const sort: EventSort = first(query.tri) === "date" ? "date" : "votes";
  const events = sortEvents(view.events, sort, category);
  const { city } = view;
  const presentCategories = IDEA_CATEGORIES.filter((c) => view.events.some((e) => e.category === c));
  const href = (o: { cat?: string | null; tri?: EventSort }) => {
    const p = new URLSearchParams();
    const cat = o.cat === undefined ? category : o.cat;
    const tri = o.tri ?? sort;
    if (cat) p.set("cat", cat);
    if (tri !== "votes") p.set("tri", tri);
    const s = p.toString();
    return `/idees/${city.id}${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    cx("rounded-full border px-3 py-1.5 text-sm font-semibold", active ? "border-brand bg-brand text-white" : "border-line bg-panel text-muted hover:border-brand");

  return (
    <Shell wide className="max-w-4xl">
      <Link href="/idees" className="text-sm font-semibold text-brand">
        ← Toutes les idées
      </Link>

      <Card className={cx("space-y-3", city.retained && "border-ok ring-2 ring-ok/30")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted">📍 {city.country}</span>
          {city.retained && <Badge tone="ok">✓ Retenue par les orgas</Badge>}
          {city.source === "membre" && <Badge>Proposée par {view.proposedByName ?? "un participant"}</Badge>}
        </div>
        <h1 className="text-3xl">{city.name}</h1>
        {city.summary && <p className="whitespace-pre-line">{city.summary}</p>}
        {city.why && (
          <p className="whitespace-pre-line rounded-xl bg-lime px-3 py-2 text-sm text-night">
            <strong>Pourquoi ça colle :</strong> {city.why}
          </p>
        )}
        <CityFacts city={city} />
        <div className="space-y-2 pt-1">
          <ThumbButton action={cityVoteAction} name="cityId" id={city.id} voted={view.voted} count={view.voters.length} />
          {view.voters.length > 0 && <p className="text-xs text-muted">👍 {view.voters.map((v) => v.name).join(", ")}</p>}
        </div>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl">Événements et activités</h2>
          {view.events.length > 1 && (
            <p className="flex gap-2 text-sm">
              Tri :
              <Link href={href({ tri: "votes" })} className={sort === "votes" ? "font-bold text-brand" : "text-muted underline"}>
                👍
              </Link>
              <Link href={href({ tri: "date" })} className={sort === "date" ? "font-bold text-brand" : "text-muted underline"}>
                date
              </Link>
            </p>
          )}
        </div>
        {presentCategories.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label="Catégories">
            <Link href={href({ cat: null })} className={chip(!category)}>
              Tout ({view.events.length})
            </Link>
            {presentCategories.map((c) => (
              <Link key={c} href={href({ cat: c })} className={chip(category === c)}>
                {CATEGORY_EMOJI[c]} {CATEGORY_LABELS[c]} ({view.events.filter((e) => e.category === c).length})
              </Link>
            ))}
          </nav>
        )}
        {events.length === 0 ? (
          <Card>
            <p className="text-muted">{view.events.length ? "Rien dans cette catégorie." : "Pas encore d’événement pour cette ville. Propose le premier !"}</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <EventCard key={event.id} event={event} cityId={city.id} admin={admin} />
            ))}
          </div>
        )}
      </section>

      <Collapsible summary="＋ Proposer un événement ou une activité">
        <ActionForm action={proposeEventAction} resetOnSuccess className="space-y-4">
          <input type="hidden" name="cityId" value={city.id} />
          <EventFields />
          <SubmitButton pendingLabel="Envoi…">Proposer</SubmitButton>
        </ActionForm>
      </Collapsible>

      <Card className="space-y-4">
        <h2 className="text-xl">💬 Discussion sur {city.name}</h2>
        <IdeaCommentList comments={view.comments} deleteAction={admin ? deleteIdeaCommentAction : undefined} />
        <IdeaCommentForm action={ideaCommentAction} cityId={city.id} />
      </Card>
    </Shell>
  );
}

function EventCard({ event, cityId, admin }: { event: EventView; cityId: string; admin: boolean }) {
  return (
    <article className={cx("flex flex-col gap-3 rounded-2xl border bg-panel p-4", event.voted ? "border-brand" : "border-line")}>
      <div className="space-y-1">
        <CategoryLabel category={event.category} />
        <h3 className="text-xl">{event.name}</h3>
      </div>
      <EventFacts event={event} />
      {event.description && <p className="whitespace-pre-line text-sm">{event.description}</p>}
      {event.why && (
        <p className="whitespace-pre-line text-sm text-muted">
          <strong className="text-ink">Pourquoi ça colle :</strong> {event.why}
        </p>
      )}
      {event.source === "membre" && <p className="text-xs text-muted">Proposé par {event.proposedByName ?? "un participant"}</p>}
      <div className="mt-auto space-y-2 pt-1">
        <ThumbButton action={eventVoteAction} name="eventId" id={event.id} voted={event.voted} count={event.voters.length} />
        {event.voters.length > 0 && <p className="text-xs text-muted">👍 {event.voters.map((v) => v.name).join(", ")}</p>}
      </div>
      <details className="rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-brand">
          💬 {event.comments.length > 0 ? `${event.comments.length} commentaire${event.comments.length > 1 ? "s" : ""}` : "Commenter"}
        </summary>
        <div className="mt-3 space-y-3">
          {event.comments.length > 0 && <IdeaCommentList comments={event.comments} deleteAction={admin ? deleteIdeaCommentAction : undefined} />}
          <IdeaCommentForm action={ideaCommentAction} cityId={cityId} eventId={event.id} placeholder={`Ton avis sur « ${event.name} »`} />
        </div>
      </details>
    </article>
  );
}
