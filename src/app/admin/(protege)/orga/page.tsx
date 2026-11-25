import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { Badge, Card, Hero, LinkButton, Shell } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { STATUS_LABELS, TOPIC_TYPE_EMOJI, TOPIC_TYPE_LABELS, formatCommentDate } from "@/lib/orga/format";
import { listRecentComments, listTopicSummaries, listTopics } from "@/lib/orga/topics";
import { groupAccessCode } from "@/lib/session";
import { ActionForm, Collapsible, ConfirmButton, SubmitButton } from "@/app/orga/_components/forms";
import { PhaseBadge } from "@/app/orga/_components/views";
import { createTopicAction, deleteCommentAction, moveTopicAction } from "./actions";
import { TopicFields } from "./_components/topic-fields";

export const metadata: Metadata = { title: "Orga" };

const STATUS_TONES = { brouillon: "neutral", ouvert: "lime", clos: "brand", decide: "ok" } as const;

export default async function AdminOrga() {
  await requireAdminPage();
  const db = await getDb();
  const [summaries, topics, comments] = await Promise.all([listTopicSummaries(db, { forAdmin: true }), listTopics(db), listRecentComments(db, 15)]);

  return (
    <Shell wide>
      <Hero kicker="Espace organisateurs" title="Organisation de l’EVG">
        Créez les sujets, ouvrez les votes, retenez les options : le carnet sur place se remplit tout seul.
      </Hero>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/admin/orga/infos" variant="secondary">ℹ️ Infos pratiques du carnet</LinkButton>
        <LinkButton href="/admin/participants" variant="secondary">👥 Participants</LinkButton>
        <LinkButton href={`/rejoindre/${encodeURIComponent(groupAccessCode())}`} prefetch={false} variant="ghost">
          Voir l’espace membres →
        </LinkButton>
      </div>

      <Card className="space-y-4">
        <h2 className="text-xl">Sujets de décision</h2>
        {summaries.length === 0 && <p className="text-muted">Aucun sujet. Commencez par « Destination » !</p>}
        <ol className="divide-y divide-line">
          {summaries.map((t, i) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex flex-col">
                <ActionForm action={moveTopicAction}>
                  <input type="hidden" name="topicId" value={t.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" disabled={i === 0} className="px-2 text-muted hover:text-brand disabled:opacity-20" aria-label="Monter">
                    ▲
                  </button>
                </ActionForm>
                <ActionForm action={moveTopicAction}>
                  <input type="hidden" name="topicId" value={t.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button type="submit" disabled={i === summaries.length - 1} className="px-2 text-muted hover:text-brand disabled:opacity-20" aria-label="Descendre">
                    ▼
                  </button>
                </ActionForm>
              </div>
              <Link href={`/admin/orga/sujets/${t.id}`} className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold hover:text-brand">
                    {TOPIC_TYPE_EMOJI[t.type]} {t.title}
                  </span>
                  <Badge tone={STATUS_TONES[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                  {t.status !== "brouillon" && <PhaseBadge phase={t.phase} />}
                </span>
                <span className="block text-xs text-muted">
                  {TOPIC_TYPE_LABELS[t.type]} · {t.optionCount} option(s) · {t.voterCount} votant(s) · {t.commentCount} commentaire(s)
                  {t.dependsOnTitle && ` · dépend de « ${t.dependsOnTitle} »`}
                  {t.selectedTitles.length > 0 && ` · retenu : ${t.selectedTitles.join(", ")}`}
                </span>
              </Link>
              <LinkButton href={`/admin/orga/sujets/${t.id}`} variant="secondary" className="py-1.5">
                Gérer
              </LinkButton>
            </li>
          ))}
        </ol>
        <Collapsible summary="＋ Nouveau sujet" defaultOpen={summaries.length === 0}>
          <ActionForm action={createTopicAction} className="space-y-4">
                <TopicFields topics={topics} />
                <p className="text-xs text-muted">Le sujet est créé en brouillon (invisible des membres) : ouvrez-le quand il est prêt.</p>
                <SubmitButton>
                  Créer le sujet
                </SubmitButton>
          </ActionForm>
        </Collapsible>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">Derniers commentaires</h2>
        {comments.length === 0 ? (
          <p className="text-muted">Rien pour l’instant.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl bg-paper px-3.5 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-muted">
                    <strong className="text-ink">{c.authorName ?? "?"}</strong> sur{" "}
                    <Link className="text-brand underline" href={`/admin/orga/sujets/${c.topicId}`}>
                      {c.topicTitle}
                    </Link>{" "}
                    · {formatCommentDate(c.createdAt)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line break-words">{c.body}</p>
                </div>
                <ActionForm action={deleteCommentAction}>
                  <input type="hidden" name="commentId" value={c.id} />
                  <ConfirmButton message="Supprimer ce commentaire ?" variant="ghost" className="px-2 py-1 text-xs" type="submit">
                    Supprimer
                  </ConfirmButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
