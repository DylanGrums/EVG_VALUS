/**
 * Affichage des tendances anonymes du questionnaire (accueil et /resultats).
 * Ne reçoit QUE la sortie de publicTrends (src/lib/questionnaire/public-view.ts) : aucun prénom, commentaire,
 * niveau de connaissance ni pondération ne peut s'y glisser.
 */
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatPercent } from "@/lib/questionnaire/format";
import type { PublicChoice, PublicHighlight, PublicTrends } from "@/lib/questionnaire/public-view";

function Bar({ share }: { share: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-paper" aria-hidden>
      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(share * 100)}%` }} />
    </div>
  );
}

function ChoiceLine({ item, question }: { item: PublicChoice | PublicHighlight; question?: string }) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          <span className="font-semibold">{item.label}</span>
          {question && <span className="block text-xs text-muted">{question}</span>}
        </span>
        <span className="shrink-0 font-bold tabular-nums">{formatPercent(item.share)}</span>
      </div>
      <Bar share={item.share} />
    </li>
  );
}

export function TrendsWaiting({ count, needed }: { count: number; needed: number }) {
  const sent = count === 0 ? "Aucune réponse envoyée pour l’instant." : `${count} réponse${count > 1 ? "s" : ""} envoyée${count > 1 ? "s" : ""} pour l’instant.`;
  return (
    <p className="rounded-xl bg-paper p-4 text-muted">
      {sent} Les tendances anonymes s’afficheront à partir de {needed} réponses, pour que personne ne puisse deviner qui a répondu quoi.
    </p>
  );
}

/** Résumé pour l'accueil : quelques points saillants et un lien vers le détail. */
export function TrendsSummary({ trends }: { trends: PublicTrends }) {
  return (
    <Card className="space-y-4" id="resultats">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">📊 Ce qui ressort du questionnaire</h2>
        {trends.status === "ready" && <Badge tone="brand">{trends.count} réponses</Badge>}
      </div>
      {trends.status === "waiting" ? (
        <TrendsWaiting count={trends.count} needed={trends.needed} />
      ) : (
        <>
          {trends.consensus.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-ok">Ça fait l’unanimité</h3>
              <ul className="space-y-3">
                {trends.consensus.slice(0, 4).map((h, i) => (
                  <ChoiceLine key={i} item={h} question={h.question} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">Pas encore de consensus net : les avis sont partagés.</p>
          )}
          {trends.limits.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-danger">À éviter, points de vigilance</h3>
              <ul className="space-y-3">
                {trends.limits.slice(0, 3).map((h, i) => (
                  <ChoiceLine key={i} item={h} question={h.question} />
                ))}
              </ul>
            </div>
          )}
          <Link href="/resultats" className="inline-block text-sm font-semibold text-brand underline">
            Voir toutes les tendances →
          </Link>
        </>
      )}
    </Card>
  );
}

/** Détail complet (page /resultats). */
export function TrendsFull({ trends }: { trends: Extract<PublicTrends, { status: "ready" }> }) {
  const byTheme = new Map<string, typeof trends.questions>();
  for (const q of trends.questions) byTheme.set(q.themeLabel, [...(byTheme.get(q.themeLabel) ?? []), q]);

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-xl">✅ Points de consensus</h2>
          {trends.consensus.length ? (
            <ul className="space-y-3">
              {trends.consensus.map((h, i) => (
                <ChoiceLine key={i} item={h} question={h.question} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Pas de consensus net (au moins 75 % des répondants) pour l’instant.</p>
          )}
        </Card>
        <Card className="space-y-3">
          <h2 className="text-xl">🚫 Les « non » et limites</h2>
          {trends.limits.length ? (
            <ul className="space-y-3">
              {trends.limits.map((h, i) => (
                <ChoiceLine key={i} item={h} question={h.question} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune limite citée par au moins deux personnes.</p>
          )}
        </Card>
      </div>

      {trends.disagreements.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-xl">⚖️ Points de désaccord</h2>
          <p className="text-sm text-muted">Des réponses opposées ont été données par des personnes différentes.</p>
          <ul className="space-y-2">
            {trends.disagreements.map((d, i) => (
              <li key={i} className="rounded-xl bg-paper p-3 text-sm">
                <span className="font-semibold">{d.text}</span>
                <span className="block text-xs text-muted">{d.question}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {[...byTheme.entries()].map(([theme, questions]) => (
        <Card key={theme} className="space-y-4">
          <h2 className="text-xl">{theme}</h2>
          <ul className="space-y-5">
            {questions.map((q, i) => (
              <li key={i} className="space-y-2">
                <div>
                  <h3 className="text-base">{q.title}</h3>
                  <p className="text-xs text-muted">
                    {q.prompt} · {q.answered} réponse{q.answered > 1 ? "s" : ""}
                  </p>
                </div>
                {q.top.length ? (
                  <ul className="space-y-2.5">
                    {q.top.map((c, j) => (
                      <ChoiceLine key={j} item={c} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Surtout des « je ne sais pas ».</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
