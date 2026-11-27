import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { AppNav } from "@/components/app-nav";
import { Badge, Card, Hero, LinkButton, Shell, cx } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";
import { TOPIC_TYPE_EMOJI, formatDateTime } from "@/lib/orga/format";
import { listTopicSummaries } from "@/lib/orga/topics";
import { publicTrends } from "@/lib/questionnaire/public-view";
import { loadAdminData, resolveMemberParticipation } from "@/lib/questionnaire/store";
import { browserParticipationId } from "@/lib/questionnaire/token";
import { TrendsSummary } from "./_components/trends";

export const metadata: Metadata = { title: "Accueil" };

/**
 * Accueil de l'app (tous les membres identifiés, participants comme proches) :
 * questionnaire à faire, tendances anonymes, aperçu de l'orga. Sans prénom → identification.
 */
export default async function Accueil({ searchParams }: PageProps<"/">) {
  const me = await requireMemberPage("/");
  const { envoye } = await searchParams;
  const db = await getDb();
  const [mine, data, topics] = await Promise.all([
    resolveMemberParticipation(db, await browserParticipationId(), me),
    loadAdminData(db),
    listTopicSummaries(db, { participantId: me.id }),
  ]);
  // Réduit aussitôt aux tendances anonymes : rien d'autre de `data` n'est affiché ici.
  const trends = publicTrends(data);
  const open = topics.filter((t) => t.phase === "ouvert");
  const todo = open.filter((t) => !t.iVoted);
  const deadlines = open.filter((t) => t.deadline).sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));

  return (
    <>
      <AppNav />
      <Shell>
        <Hero kicker="Le carnet de l’EVG" title={`Salut ${me.name} 👋`}>
          {mine.submitted
            ? todo.length > 0
              ? `${todo.length === 1 ? "Un vote t’attend" : `${todo.length} votes t’attendent`} dans l’orga.`
              : "Merci pour ton questionnaire ! Voici où on en est."
            : "Première étape : le questionnaire sur Val, cinq minutes pour viser juste."}
        </Hero>

        {envoye && mine.submitted && (
          <p role="status" className="rounded-2xl bg-green-100 p-4 font-semibold text-ok">
            Merci, tes réponses sont bien envoyées ! 🎉
          </p>
        )}

        {!mine.submitted && (
          <Card className="space-y-3 border-2 border-brand">
            <div>
              <h2 className="text-xl">📝 {mine.draft ? "Ton questionnaire est en cours" : "Le questionnaire sur Val"}</h2>
              <p className="mt-1 text-muted">
                {mine.draft
                  ? `Tu en es à ${mine.draft.answered} question${mine.draft.answered > 1 ? "s" : ""} renseignée${mine.draft.answered > 1 ? "s" : ""}. Reprends là où tu t’étais arrêté.`
                  : "21 questions sur ses goûts, ses limites et ses envies. Seuls les orgas lisent tes réponses ; le groupe ne voit que des tendances anonymes."}
              </p>
            </div>
            <LinkButton href="/questionnaire" className="w-full sm:w-auto">
              {mine.draft ? "Reprendre mon brouillon" : "Répondre au questionnaire"}
            </LinkButton>
          </Card>
        )}

        <TrendsSummary trends={trends} />

        <Card className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl">🗳️ L’orga</h2>
            {open.length > 0 && (
              <span className="text-sm font-semibold text-muted">
                {open.length} sujet{open.length > 1 ? "s" : ""} ouvert{open.length > 1 ? "s" : ""} au vote
              </span>
            )}
          </div>
          {open.length === 0 ? (
            <p className="text-muted">{topics.length ? "Rien à voter pour l’instant." : "Les orgas préparent les premiers sujets. Repasse bientôt !"}</p>
          ) : (
            <ul className="space-y-2">
              {open.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/orga/sujets/${t.id}`}
                    className={cx("flex items-center gap-3 rounded-xl border bg-panel p-3 transition hover:border-brand", t.iVoted ? "border-line" : "border-brand/50")}
                  >
                    <span aria-hidden className="text-xl">
                      {TOPIC_TYPE_EMOJI[t.type]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{t.title}</span>
                      {t.deadline && <span className="block text-xs text-muted">jusqu’au {formatDateTime(t.deadline)}</span>}
                    </span>
                    {t.iVoted ? <Badge tone="ok">Voté</Badge> : <Badge tone="danger">À voter</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {deadlines.length > 0 && (
            <p className="text-sm text-muted">
              ⏰ Prochaine échéance : <strong>{deadlines[0].title}</strong>, le {formatDateTime(deadlines[0].deadline!)}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/orga" variant="secondary">
              Toute l’orga
            </LinkButton>
            <LinkButton href="/idees" variant="ghost">
              💡 Les idées
            </LinkButton>
            <LinkButton href="/orga/sur-place" variant="ghost">
              🧳 Le carnet sur place
            </LinkButton>
          </div>
        </Card>

        {mine.submitted && (
          <p className="text-center text-sm text-muted">✓ Ton questionnaire est envoyé. Merci !</p>
        )}
      </Shell>
    </>
  );
}
