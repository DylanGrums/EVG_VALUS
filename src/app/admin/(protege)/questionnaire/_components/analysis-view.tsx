import Link from "next/link";
import { Badge } from "@/components/ui";
import type { Analysis, QuestionResult, SignalItem, ThemeSummary } from "@/lib/questionnaire/analysis";
import { formatPercent } from "@/lib/questionnaire/format";
import { knowledgeLabels, type KnowledgeLevel } from "@/lib/questionnaire/types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function LevelBadge({ level }: { level: KnowledgeLevel | null }) {
  return level ? <Badge tone="brand">{knowledgeLabels[level]}</Badge> : <Badge tone="lime">À classer</Badge>;
}

/** Pourcentage pondéré en principal, nombre brut de personnes en secondaire. */
function Signals({ items }: { items: SignalItem[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item, i) => (
        <li key={item.target + i}>
          <a className="font-medium text-brand underline" href={`#${item.target}`}>
            {item.label}
          </a>{" "}
          <strong>{formatPercent(item.share)}</strong> <span className="text-muted">({plural(item.count, "personne", "personnes")} sur {item.answered})</span>
        </li>
      ))}
    </ul>
  );
}

const topic: Record<string, string> = {
  ambiance: "Formats et ambiances évoqués",
  experiences: "Pistes d’activités et d’événements",
  destination: "Critères de destination et de logistique",
  limites: "Situations et limites signalées",
  surprises: "Idées de surprises et d’attentions",
};

function Synthesis({ theme }: { theme: ThemeSummary }) {
  const h3 = "mt-4 mb-1 text-sm font-extrabold uppercase tracking-wide text-muted";
  return (
    <details className="rounded-xl border border-line bg-panel p-4">
      <summary className="cursor-pointer font-semibold">{theme.name}</summary>
      <div className="mt-2">
        {theme.agreements.length > 0 && (
          <>
            <h3 className={h3}>Préférences convergentes</h3>
            <Signals items={theme.agreements} />
          </>
        )}
        {theme.signals.length > 0 && (
          <>
            <h3 className={h3}>{topic[theme.id]}</h3>
            <Signals items={theme.signals} />
          </>
        )}
        {theme.limits.length > 0 && (
          <>
            <h3 className={h3}>À éviter</h3>
            <ul className="space-y-1 text-sm">
              {theme.limits.map((item, i) => (
                <li key={item.target + i}>
                  <a className="font-medium text-brand underline" href={`#${item.target}`}>
                    {item.label}
                  </a>{" "}
                  <strong>{formatPercent(item.share)}</strong> <span className="text-muted">({plural(item.count, "personne", "personnes")} sur {item.answered})</span>
                  {item.detail && <span className="text-muted"> · {item.detail}</span>}
                  {item.unanimous && <Badge tone="danger" className="ml-1">quasi unanime</Badge>}
                  {item.strict && <Badge className="ml-1">refus connu</Badge>}
                </li>
              ))}
            </ul>
          </>
        )}
        {theme.divergences.length > 0 && (
          <>
            <h3 className={h3}>Avis divergents</h3>
            <ul className="space-y-1 text-sm">
              {theme.divergences.map((item, i) => (
                <li key={i}>
                  <a className="text-brand underline" href={`#${item.target}`}>
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        {theme.uncertain.length > 0 && (
          <>
            <h3 className={h3}>À vérifier</h3>
            <ul className="space-y-1 text-sm">
              {theme.uncertain.map((item) => (
                <li key={item.target}>
                  <a className="text-brand underline" href={`#${item.target}`}>
                    {item.title}
                  </a>{" "}
                  <span className="text-muted">{item.answered ? `${plural(item.count, "réponse incertaine", "réponses incertaines")}` : "aucune réponse"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {!theme.signals.length && !theme.uncertain.length && !theme.limits.length &&<p className="text-sm text-muted">Aucun choix enregistré dans ce thème.</p>}
      </div>
    </details>
  );
}

function Distribution({ result }: { result: QuestionResult }) {
  const { question, answered, choices: all, divergences, individuals, versions, rows } = result;
  // Matrice : les cellules sont affichées par activité (base = répondants de l'activité) ; restent les options globales.
  const choices = rows.length ? all.filter((c) => c.special) : all;
  return (
    <details id={result.key} className="scroll-mt-4 rounded-xl border border-line bg-panel p-4">
      <summary className="cursor-pointer font-semibold">
        {question.title} <Badge className="ml-1">{plural(answered, "personne", "personnes")}</Badge>
      </summary>
      <p className="mt-2 text-sm text-muted">{question.prompt}</p>
      <p className="text-xs text-muted">Version(s) analysée(s) : {versions.join(", ")}</p>
      {rows.length > 0 && (
        <div className="mt-3 space-y-3">
          {rows.map((row) => (
            <div key={row.index} className="rounded-lg border border-line p-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <strong>{row.label}</strong>
                <span className="text-xs text-muted">
                  {plural(row.answered, "personne", "personnes")} · {row.level}
                </span>
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                {row.cells.map((cell) => (
                  <li key={cell.reaction}>
                    {cell.label} : <strong className="text-ink">{formatPercent(cell.share, row.weightedAnswered > 0)}</strong> ({cell.count} sur {row.answered})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-2.5">
        {choices.map((choice) => (
          <div key={choice.key} className={choice.special ? "text-muted" : undefined}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{choice.label}</span>
              <span className="shrink-0">
                <strong>{formatPercent(choice.share, result.weightedAnswered > 0)}</strong>{" "}
                <span className="text-xs text-muted">
                  · {plural(choice.count, "personne", "personnes")} sur {choice.answered}
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(choice.share * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      {divergences.length > 0 && (
        <p className="mt-3 text-sm">
          <strong>Avis divergents : </strong>
          {divergences.join(" · ")}
        </p>
      )}
      {individuals.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand">Réponses individuelles et commentaires</summary>
          <div className="mt-2 space-y-2">
            {individuals.map((entry) => (
              <div key={entry.id} className="border-l-2 border-line pl-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.id === "organisateur" ? (
                    <span className="font-semibold">{entry.name}</span>
                  ) : (
                    <Link className="font-semibold text-brand underline" href={`/admin/questionnaire/reponse/${entry.id}`}>
                      {entry.name}
                    </Link>
                  )}
                  {entry.id !== "organisateur" && <LevelBadge level={entry.knowledge} />}
                </div>
                {entry.choices.length > 0 && <div>{entry.choices.map((key) => result.labels[key] ?? key).join(" · ")}</div>}
                {entry.comment && <div className="whitespace-pre-wrap text-muted">{entry.comment}</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </details>
  );
}

export function AnalysisView({ analysis }: { analysis: Analysis }) {
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-xl">Synthèse des avis</h2>
        <p className="text-sm text-muted">
          Les pourcentages sont pondérés par le niveau de connaissance (à peine ×1, bien ×2, très bien ×3, non classé ×2) ; le nombre de personnes reste indiqué. Une préférence est convergente à partir de deux sélections et de 75 % du poids des répondants à la question. Ces avis donnent des pistes à confirmer avec Valentin.
        </p>
        <div className="space-y-2">
          {analysis.byTheme.map((theme) => (
            <Synthesis key={theme.id} theme={theme} />
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl">Résultats par question</h2>
        <p className="text-sm text-muted">
          Chaque pourcentage est calculé sur les personnes ayant répondu à la question (commentaire seul inclus), avec pondération. Avec plusieurs choix possibles, la somme peut dépasser 100 %. Les brouillons et les participations exclues ne comptent pas. Une question modifiée entre deux versions a ses propres résultats.
        </p>
        <div className="space-y-2">
          {analysis.results.map((result) => (
            <Distribution key={result.key} result={result} />
          ))}
        </div>
      </section>
    </>
  );
}
