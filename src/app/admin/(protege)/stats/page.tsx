import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { Badge, Card, Hero, Shell, cx } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { formatAgo, formatDayShort, formatParis } from "@/lib/analytics/format";
import { getOverview, listMemberStats, MEMBER_SORTS, sortMemberStats, type MemberSort } from "@/lib/analytics/stats";
import { OnlineDot, Stat } from "./_components/bits";

export const metadata: Metadata = { title: "Fréquentation" };

const SORT_LABELS: Record<MemberSort, string> = {
  derniere: "Dernière connexion",
  premiere: "Première connexion",
  connexions: "Connexions",
  pages: "Pages vues",
  prenom: "Prénom",
};

export default async function StatsPage({ searchParams }: PageProps<"/admin/stats">) {
  await requireAdminPage();
  const raw = (await searchParams).tri;
  const sort: MemberSort = MEMBER_SORTS.includes(raw as MemberSort) ? (raw as MemberSort) : "derniere";
  const db = await getDb();
  const now = new Date();
  const [overview, members] = await Promise.all([getOverview(db, now), listMemberStats(db, now)]);
  const rows = sortMemberStats(members, sort);
  const maxDay = Math.max(1, ...overview.days.map((d) => d.pageViews));
  const onlineTotal = overview.onlineMembers.length + overview.onlineAnonymous;
  const sortHref = (s: MemberSort) => (s === "derniere" ? "/admin/stats" : `/admin/stats?tri=${s}`);
  const th = "px-2 py-2 font-semibold whitespace-nowrap";

  return (
    <Shell wide>
      <Hero kicker="Espace organisateurs" title="Fréquentation">
        Qui vient sur l’app, quand et sur quelles pages. Réservé aux organisateurs : les membres ne voient rien de tout ça. Une connexion = une visite (nouvelle après
        30 min sans activité) ; « en ligne » = actif dans les 5 dernières minutes. La navigation dans l’admin n’est pas comptée.
      </Hero>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl">
            <OnlineDot online={onlineTotal > 0} /> En ligne maintenant : {onlineTotal}
          </h2>
          {overview.onlineMembers.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {overview.onlineMembers.map((m) => (
                <li key={m.participantId}>
                  <Link href={`/admin/stats/${m.participantId}`}>
                    <Badge tone="ok">{m.name}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucun membre identifié en ligne.</p>
          )}
          {overview.onlineAnonymous > 0 && (
            <p className="text-sm text-muted">
              + {overview.onlineAnonymous} visiteur{overview.onlineAnonymous > 1 ? "s" : ""} sans prénom
            </p>
          )}
        </Card>
        <Card className="grid grid-cols-2 gap-3 lg:col-span-2 sm:grid-cols-4">
          <Stat label="Connexions" value={overview.totals.visits} />
          <Stat label="Pages vues" value={overview.totals.pageViews} />
          <Stat label="Visites anonymes" value={overview.totals.anonymousVisits} hint="sans prénom choisi" />
          <Stat label="Pages vues anonymes" value={overview.totals.anonymousPageViews} />
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-xl">14 derniers jours</h2>
        <p className="text-sm text-muted">Barre = pages vues ; chiffre du dessous = connexions (heure de Paris).</p>
        <div className="flex h-40 items-end gap-1 sm:gap-2" role="list">
          {overview.days.map((d) => (
            <div key={d.day} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${formatDayShort(d.day)} : ${d.visits} connexion(s), ${d.pageViews} page(s) vue(s)`}>
              <span className="text-[10px] text-muted">{d.pageViews || ""}</span>
              <div className="w-full rounded-t bg-brand" style={{ height: `${(d.pageViews / maxDay) * 100}%`, minHeight: d.pageViews ? 2 : 0 }} />
              <span className="text-xs font-semibold text-ink">{d.visits}</span>
              <span className="text-[10px] text-muted">{formatDayShort(d.day)}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-xl">Pages les plus vues</h2>
          {overview.topPages.length === 0 ? (
            <p className="text-sm text-muted">Rien pour l’instant.</p>
          ) : (
            <ol className="divide-y divide-line text-sm">
              {overview.topPages.map((p) => (
                <li key={`${p.section}-${p.refId}`} className="flex justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{p.label}</span>
                  <span className="font-semibold">{p.views}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="mb-2 text-xl">Jamais venus ({overview.neverCame.length})</h2>
            <p className="mb-2 text-xs text-muted">Aucune connexion enregistrée depuis la mise en place du suivi (le 27/11/2026).</p>
            <NameList people={overview.neverCame} empty="Tout le monde est passé au moins une fois." />
          </div>
          <div>
            <h2 className="mb-2 text-xl">Jamais revenus ({overview.neverReturned.length})</h2>
            <p className="mb-2 text-xs text-muted">Une seule connexion depuis la mise en place du suivi.</p>
            <NameList people={overview.neverReturned} empty="Personne." />
          </div>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-xl">Par prénom</h2>
        <p className="text-sm text-muted">Trier par : touche un titre de colonne. Heures de Paris.</p>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                {(["prenom", "derniere", "connexions", "pages", "premiere"] as const).map((s) => (
                  <th key={s} className={th}>
                    <Link href={sortHref(s)} className={cx("hover:text-brand", sort === s && "text-brand underline")}>
                      {SORT_LABELS[s]}
                      {sort === s && " ▾"}
                    </Link>
                  </th>
                ))}
                <th className={th}>Pages préférées</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => (
                <tr key={m.participantId} className={cx(!m.active && "opacity-60")}>
                  <td className="px-2 py-2">
                    <Link href={`/admin/stats/${m.participantId}`} className="flex items-center gap-2 font-semibold text-brand underline">
                      <OnlineDot online={m.online} />
                      {m.name}
                    </Link>
                    {!m.active && <span className="text-xs text-muted">retiré</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap" title={m.lastSeenAt ? formatParis(m.lastSeenAt) : undefined}>
                    {m.online ? <span className="font-semibold text-ok">en ligne</span> : formatAgo(m.lastSeenAt, now)}
                  </td>
                  <td className="px-2 py-2">{m.visits}</td>
                  <td className="px-2 py-2">{m.pageViews}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatParis(m.firstVisitAt)}</td>
                  <td className="px-2 py-2 text-muted">{m.topSections.map((s) => `${s.label} (${s.views})`).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}

function NameList({ people, empty }: { people: { participantId: string; name: string }[]; empty: string }) {
  if (!people.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {people.map((p) => (
        <li key={p.participantId}>
          <Link href={`/admin/stats/${p.participantId}`}>
            <Badge>{p.name}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
