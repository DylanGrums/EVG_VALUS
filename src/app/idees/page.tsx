import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { Badge, Button, Card, Hero, Input, Select, Shell, cx } from "@/components/ui";
import { ActionForm, Collapsible, SubmitButton } from "@/app/orga/_components/forms";
import { requireMemberPage } from "@/lib/orga/auth";
import { normalize } from "@/lib/questionnaire/format";
import { CITY_SORTS, listCitySummaries, sortAndFilterCities, type CitySort } from "@/lib/idees/ideas";
import { proposeCityAction } from "./actions";
import { CityFields } from "./_components/views";

export const metadata: Metadata = { title: "Idées" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function IdeesPage({ searchParams }: PageProps<"/idees">) {
  const me = await requireMemberPage("/idees");
  const params = await searchParams;
  const sort: CitySort = Object.hasOwn(CITY_SORTS, first(params.tri)) ? (first(params.tri) as CitySort) : "votes";
  const query = first(params.q).slice(0, 100);
  const all = await listCitySummaries(await getDb(), { participantId: me.id });
  const cities = sortAndFilterCities(all, sort, query, normalize);

  return (
    <Shell wide className="max-w-4xl">
      <Hero kicker="Idées" title="Où partir, et pour quoi faire ?">
        Les villes et les événements de mai 2027 qui collent au profil de Val. Mets un 👍 à tout ce qui te tente (autant que tu veux), commente, et propose tes idées.
      </Hero>

      {all.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-2" role="search">
          <label className="min-w-0 flex-1 basis-48">
            <span className="sr-only">Rechercher</span>
            <Input name="q" defaultValue={query} placeholder="Filtrer : Lisbonne, plage, Espagne…" />
          </label>
          <label>
            <span className="sr-only">Trier par</span>
            <Select name="tri" defaultValue={sort} className="w-auto">
              {Object.entries(CITY_SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  Tri : {label}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="secondary">
            OK
          </Button>
        </form>
      )}

      {all.length === 0 ? (
        <Card>
          <p className="text-muted">Pas encore d’idée : les orgas préparent une sélection. Tu peux déjà proposer la tienne !</p>
        </Card>
      ) : cities.length === 0 ? (
        <Card>
          <p className="text-muted">
            Aucune ville ne correspond à « {query} ».{" "}
            <Link href="/idees" className="font-semibold text-brand">
              Tout afficher
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cities.map((city) => (
            <Link
              key={city.id}
              href={`/idees/${city.id}`}
              className={cx(
                "flex flex-col gap-2 rounded-2xl border bg-panel p-4 transition hover:border-brand",
                city.retained ? "border-ok ring-2 ring-ok/30" : city.voted ? "border-brand" : "border-line",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl">{city.name}</h2>
                  <p className="text-sm text-muted">{city.country}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {city.retained && <Badge tone="ok">✓ Retenue</Badge>}
                  {city.source === "membre" && <Badge>Proposée par {city.proposedByName ?? "un participant"}</Badge>}
                </div>
              </div>
              {city.summary && <p className="line-clamp-3 text-sm">{city.summary}</p>}
              <div className="space-y-0.5 text-sm text-muted">
                {city.access && <p>✈️ {city.access}</p>}
                {city.budget && <p>💶 {city.budget}</p>}
              </div>
              <p className="mt-auto flex flex-wrap gap-3 pt-1 text-sm font-semibold">
                <span>🎯 {city.eventCount} événement{city.eventCount > 1 ? "s" : ""}</span>
                <span className={city.voted ? "text-brand" : ""}>
                  👍 {city.voteCount}
                  {city.voted && " · dont toi"}
                </span>
                <span>💬 {city.commentCount}</span>
              </p>
            </Link>
          ))}
        </div>
      )}

      <Collapsible summary="＋ Proposer une ville ou un lieu">
        <ActionForm action={proposeCityAction} className="space-y-4">
          <CityFields />
          <SubmitButton pendingLabel="Envoi…">Proposer</SubmitButton>
        </ActionForm>
      </Collapsible>
    </Shell>
  );
}
