/**
 * Affichage des tendances anonymes du questionnaire (accueil et /resultats).
 * Ne reçoit QUE la sortie de publicTrends (src/lib/questionnaire/public-view.ts) : aucun prénom, commentaire,
 * niveau de connaissance ni pondération ne peut s'y glisser.
 */
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatPercent } from "@/lib/questionnaire/format";
import type {
  PublicChoice,
  PublicDispersed,
  PublicDoubt,
  PublicHighlight,
  PublicLimit,
  PublicMatrixRow,
  PublicQuestionTrend,
  PublicTrends,
} from "@/lib/questionnaire/public-view";

/** « 2 sur 3 » : avec peu de répondants, le pourcentage seul est trompeur. */
const outOf = (item: { count: number; answered: number }) => `${item.count} sur ${item.answered}`;

function Bar({ share, className = "bg-brand" }: { share: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-paper" aria-hidden>
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.round(share * 100)}%` }} />
    </div>
  );
}

function Score({ item }: { item: { count: number; answered: number; share: number } }) {
  return (
    <span className="shrink-0 tabular-nums">
      <span className="font-bold">{formatPercent(item.share)}</span> <span className="text-xs text-muted">({outOf(item)})</span>
    </span>
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
        <Score item={item} />
      </div>
      <Bar share={item.share} />
    </li>
  );
}

function LimitLine({ limit }: { limit: PublicLimit }) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          <span className="font-semibold">{limit.label}</span>
          {limit.unanimous && <Badge tone="danger" className="ml-2">quasi unanime</Badge>}
          <span className="block text-xs text-muted">
            {limit.question}
            {limit.detail && ` · ${limit.detail}`}
          </span>
        </span>
        <Score item={limit} />
      </div>
      <Bar share={limit.share} className="bg-danger" />
    </li>
  );
}

function DoubtLine({ doubt }: { doubt: PublicDoubt }) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{doubt.label}</span>
        <span className="shrink-0 tabular-nums text-muted">
          {formatPercent(doubt.share)} <span className="text-xs">({outOf(doubt)})</span>
        </span>
      </div>
      <Bar share={doubt.share} className="bg-muted/50" />
      <p className="text-xs text-muted">
        {doubt.question} · {doubt.detail}
      </p>
    </li>
  );
}

function DispersedLine({ item }: { item: PublicDispersed }) {
  return (
    <li className="rounded-xl bg-paper p-3 text-sm">
      <span className="font-semibold">{item.question}</span>
      <span className="block text-xs text-muted">
        {item.options} propositions citées, aucune ne dépasse {formatPercent(item.topShare)} ({item.answered} réponses) : l’orga devra trancher.
      </span>
    </li>
  );
}

const levels = {
  rouge: { text: "À éviter", dot: "bg-danger", badge: "bg-red-50 text-danger" },
  vert: { text: "Partant", dot: "bg-ok", badge: "bg-green-100 text-ok" },
  orange: { text: "Ça dépend", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-900" },
  gris: { text: "Incertain", dot: "bg-muted/50", badge: "bg-paper text-muted border border-line" },
} as const;

/** Feu tricolore d'une activité : couleur + répartition des réactions. */
function MatrixRowLine({ row }: { row: PublicMatrixRow }) {
  const level = levels[row.level];
  return (
    <li className="space-y-1.5 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <span className={`inline-block size-3 shrink-0 rounded-full ${level.dot}`} aria-hidden />
          {row.label}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${level.badge}`}>{level.text}</span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
        {row.cells
          .filter((c) => c.count > 0)
          .map((c, i) => (
            <li key={i}>
              {c.label} : <span className="font-semibold text-ink">{outOf(c)}</span>
            </li>
          ))}
      </ul>
    </li>
  );
}

/** Message quand aucun choix ne ressort : selon l'option spéciale la plus cochée. */
function emptyMessage(q: PublicQuestionTrend) {
  const main = [...q.specials].sort((a, b) => b.count - a.count)[0];
  if (!main) return "Pas encore de tendance.";
  if (main.label === "Peu importe") return "Surtout des « peu importe ».";
  if (main.label.startsWith("Aucune")) return "Surtout « aucune de ces propositions ».";
  return "Surtout des « je ne sais pas ».";
}

function Specials({ specials }: { specials: PublicChoice[] }) {
  if (!specials.length) return null;
  return <p className="text-xs text-muted">{specials.map((s) => `${s.label} : ${outOf(s)}`).join(" · ")}</p>;
}

export function TrendsWaiting({ count, needed }: { count: number; needed: number }) {
  const sent = count === 0 ? "Aucune réponse envoyée pour l’instant." : `${count} réponse${count > 1 ? "s" : ""} envoyée${count > 1 ? "s" : ""} pour l’instant.`;
  return (
    <p className="rounded-xl bg-paper p-4 text-muted">
      {sent} Les tendances anonymes s’afficheront à partir de {needed} réponses, pour que personne ne puisse deviner qui a répondu quoi.
    </p>
  );
}

const CONSENSUS_TITLE = "Ce qui fait consensus (≥ 75 %)";

/** Résumé pour l'accueil : quelques points saillants et un lien vers le détail. */
export function TrendsSummary({ trends }: { trends: PublicTrends }) {
  const activities = trends.status === "ready" ? trends.questions.flatMap((q) => q.rows ?? []) : [];
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
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-ok">{CONSENSUS_TITLE}</h3>
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
                  <LimitLine key={i} limit={h} />
                ))}
              </ul>
            </div>
          )}
          {activities.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-muted">Les activités en un coup d’œil</h3>
              <ul className="flex flex-wrap gap-2">
                {activities.map((row, i) => (
                  <li key={i} className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${levels[row.level].badge}`}>
                    <span className={`inline-block size-2 rounded-full ${levels[row.level].dot}`} aria-hidden />
                    {row.label} : {levels[row.level].text.toLocaleLowerCase("fr")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {trends.doubts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-muted">Là où on doute</h3>
              <ul className="space-y-3">
                {trends.doubts.slice(0, 3).map((d, i) => (
                  <DoubtLine key={i} doubt={d} />
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
          <h2 className="text-xl">✅ {CONSENSUS_TITLE}</h2>
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
          <h2 className="text-xl">🚫 À éviter</h2>
          <p className="text-sm text-muted">Activités avec un « il a déjà dit non » ou au moins deux réserves, risques cités par au moins deux personnes et un tiers des réponses.</p>
          {trends.limits.length ? (
            <ul className="space-y-3">
              {trends.limits.map((h, i) => (
                <LimitLine key={i} limit={h} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune limite nette pour l’instant.</p>
          )}
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-xl">🤔 Là où on doute</h2>
        <p className="text-sm text-muted">
          Les sujets où au moins un quart des proches ont répondu « je ne sais pas » (ou, pour les activités, « ça dépend » ou un « je ne pense pas » isolé) : à creuser avant de trancher.
        </p>
        {trends.doubts.length ? (
          <ul className="space-y-3">
            {trends.doubts.map((d, i) => (
              <DoubtLine key={i} doubt={d} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Pas de doute marqué pour l’instant.</p>
        )}
      </Card>

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

      {trends.dispersed.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-xl">🧭 Avis dispersés</h2>
          <p className="text-sm text-muted">Aucune proposition ne se détache : l’orga devra trancher.</p>
          <ul className="space-y-2">
            {trends.dispersed.map((d, i) => (
              <DispersedLine key={i} item={d} />
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
                {q.rows ? (
                  q.rows.length ? (
                    <ul className="space-y-2">
                      {q.rows.map((row, j) => (
                        <MatrixRowLine key={j} row={row} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Pas assez de réponses par activité pour l’instant.</p>
                  )
                ) : q.top.length ? (
                  <ul className="space-y-2.5">
                    {q.top.map((c, j) => (
                      <ChoiceLine key={j} item={c} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{emptyMessage(q)}</p>
                )}
                <Specials specials={q.specials} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
