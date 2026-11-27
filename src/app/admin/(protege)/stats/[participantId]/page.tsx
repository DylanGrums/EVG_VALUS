import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Badge, Card, Shell } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { formatAgo, formatDuration, formatParis, formatParisTime } from "@/lib/analytics/format";
import { getMemberDetail } from "@/lib/analytics/stats";
import { OnlineDot, Stat } from "../_components/bits";

export const metadata: Metadata = { title: "Fréquentation d’un membre" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function MemberStatsPage({ params }: PageProps<"/admin/stats/[participantId]">) {
  await requireAdminPage();
  const { participantId } = await params;
  if (!UUID_RE.test(participantId)) notFound();
  const now = new Date();
  const detail = await getMemberDetail(await getDb(), participantId, now);
  if (!detail) notFound();
  const { stats, topPages, visits } = detail;

  return (
    <Shell>
      <Link href="/admin/stats" className="text-sm font-semibold text-brand underline">
        ← Fréquentation
      </Link>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <OnlineDot online={stats.online} />
          <h1 className="text-2xl">{stats.name}</h1>
          {stats.online && <Badge tone="ok">En ligne</Badge>}
          {!stats.active && <Badge>Retiré</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Connexions" value={stats.visits} />
          <Stat label="Pages vues" value={stats.pageViews} />
          <Stat label="Première connexion" value={stats.firstVisitAt ? formatParis(stats.firstVisitAt) : "jamais"} />
          <Stat label="Dernière activité" value={stats.online ? "en ligne" : formatAgo(stats.lastSeenAt, now)} hint={stats.lastSeenAt ? formatParis(stats.lastSeenAt) : undefined} />
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">Pages les plus consultées</h2>
        {topPages.length === 0 ? (
          <p className="text-sm text-muted">Aucune page vue enregistrée.</p>
        ) : (
          <ol className="divide-y divide-line text-sm">
            {topPages.map((p) => (
              <li key={`${p.section}-${p.refId}`} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">{p.label}</span>
                <span className="font-semibold">{p.views}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">Historique des connexions</h2>
        {visits.length === 0 && <p className="text-sm text-muted">Aucune connexion enregistrée.</p>}
        <ul className="space-y-3">
          {visits.map((v) => (
            <li key={v.id} className="rounded-xl bg-paper px-4 py-3">
              <p className="text-sm font-semibold">
                {formatParis(v.startedAt)} · {formatDuration(v.lastSeenAt.getTime() - v.startedAt.getTime())} · {v.pageCount} page{v.pageCount > 1 ? "s" : ""}
              </p>
              {v.pages.length > 0 && (
                <ol className="mt-1 space-y-0.5 text-sm text-muted">
                  {v.pages.map((p, i) => (
                    <li key={i}>
                      <span className="tabular-nums">{formatParisTime(p.at)}</span> · {p.label}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
        {visits.length >= 50 && <p className="text-xs text-muted">Seules les 50 dernières connexions sont affichées.</p>}
      </Card>
    </Shell>
  );
}
