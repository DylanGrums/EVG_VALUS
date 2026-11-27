import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Badge, Card, Shell, cx } from "@/components/ui";
import { isAdmin } from "@/lib/session";
import { requireMemberPage } from "@/lib/orga/auth";
import { TOPIC_TYPE_EMOJI, TOPIC_TYPE_LABELS, formatDateTime } from "@/lib/orga/format";
import { isUuid } from "@/lib/orga/validation";
import { loadTopicView, type OptionView, type TopicView } from "@/lib/orga/topics";
import { deleteCommentAction } from "@/app/admin/(protege)/orga/actions";
import { commentAction, proposeAction, voteAction } from "../../../actions";
import { ActionForm, Collapsible, VoteButton, SubmitButton } from "../../../_components/forms";
import { CommentForm, CommentList, OptionFacts, OptionFields, PhaseBadge, PriceBlock } from "../../../_components/views";

export const metadata: Metadata = { title: "Sujet" };

export default async function SujetPage({ params }: PageProps<"/orga/sujets/[id]">) {
  const { id } = await params;
  const me = await requireMemberPage(isUuid(id) ? `/orga/sujets/${id}` : "/orga");
  if (!isUuid(id)) notFound();
  const view = await loadTopicView(await getDb(), id, me.id);
  if (!view) notFound();
  const admin = await isAdmin();
  const { topic, phase } = view;

  const maxVotes = Math.max(0, ...view.options.map((o) => o.voters.length));
  const options = phase === "decide" ? [...view.options].sort((a, b) => Number(b.selected) - Number(a.selected)) : view.options;
  const selected = view.options.filter((o) => o.selected);

  return (
    <Shell wide className="max-w-4xl">
      <Link href="/orga" className="text-sm font-semibold text-brand">
        ← Préparation
      </Link>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted">
            {TOPIC_TYPE_EMOJI[topic.type]} {TOPIC_TYPE_LABELS[topic.type]}
          </span>
          <PhaseBadge phase={phase} />
        </div>
        <h1 className="text-3xl">{topic.title}</h1>
        {topic.description && <p className="whitespace-pre-line text-muted">{topic.description}</p>}
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge>{topic.voteMode === "unique" ? "Un seul choix" : "Plusieurs choix possibles"}</Badge>
          {topic.deadline && phase !== "decide" && <Badge>Vote jusqu’au {formatDateTime(topic.deadline)}</Badge>}
          {phase !== "a_venir" && (
            <Badge tone="brand">
              {view.totalVoters} / {view.activeCount} ont voté
            </Badge>
          )}
        </div>
      </Card>

      <PhaseNotice view={view} selected={selected} />

      {options.length === 0 ? (
        <Card>
          <p className="text-muted">Aucune option pour l’instant.{view.canPropose ? " Lance-toi, propose la première !" : ""}</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {options.map((option) => (
            <OptionCard key={option.id} option={option} view={view} leading={phase === "ouvert" && maxVotes > 0 && option.voters.length === maxVotes} admin={admin} />
          ))}
        </div>
      )}

      {view.canPropose && (
        <Collapsible summary="＋ Proposer une option">
          <ActionForm action={proposeAction} resetOnSuccess className="space-y-4">
                <input type="hidden" name="topicId" value={topic.id} />
                <OptionFields type={topic.type} />
                <SubmitButton pendingLabel="Envoi…">Proposer</SubmitButton>
          </ActionForm>
        </Collapsible>
      )}

      {phase !== "a_venir" && (
        <Card className="space-y-4">
          <h2 className="text-xl">💬 Discussion</h2>
          <CommentList comments={view.comments} deleteAction={admin ? deleteCommentAction : undefined} />
          <CommentForm action={commentAction} topicId={topic.id} />
        </Card>
      )}
    </Shell>
  );
}

function PhaseNotice({ view, selected }: { view: TopicView; selected: OptionView[] }) {
  const box = "rounded-2xl px-5 py-4 text-sm font-semibold";
  switch (view.phase) {
    case "a_venir":
      return (
        <p className={cx(box, "bg-paper text-muted")}>
          ⏳ À venir{view.dependsOn ? ` : ce sujet s’ouvrira quand « ${view.dependsOn.title} » sera décidé.` : " : les orgas n’ont pas encore ouvert ce sujet."}
        </p>
      );
    case "decide":
      return <p className={cx(box, "bg-green-100 text-ok")}>🎉 C’est décidé : {selected.map((o) => o.title).join(", ")}</p>;
    case "clos":
    case "vote_termine":
      return <p className={cx(box, "bg-brand-light text-brand")}>🗳️ Les votes sont terminés, les orgas vont trancher.</p>;
    default:
      return null;
  }
}

function OptionCard({ option, view, leading, admin }: { option: OptionView; view: TopicView; leading: boolean; admin: boolean }) {
  const voted = view.myVotes.includes(option.id);
  const type = view.topic.type;
  const dimmed = view.phase === "decide" && !option.selected;
  return (
    <article className={cx("flex flex-col overflow-hidden rounded-2xl border bg-panel", option.selected ? "border-ok ring-2 ring-ok/30" : voted ? "border-brand" : "border-line", dimmed && "opacity-60")}>
      {option.imageUrl && (
        // Images externes arbitraires (annonces) : <img> simple plutôt que next/image (pas de domaines à déclarer).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full bg-paper object-cover" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-xl">{option.title}</h3>
          <div className="flex flex-wrap gap-1.5">
            {option.selected && <Badge tone="ok">✓ Retenu</Badge>}
            {leading && <Badge tone="lime">En tête</Badge>}
          </div>
        </div>
        <PriceBlock price={option.price} emphasize={type === "logement"} />
        {option.description && <p className="whitespace-pre-line text-sm">{option.description}</p>}
        <OptionFacts option={option} type={type} />
        <p className="text-xs text-muted">Proposé par {option.proposedByOrga ? "les orgas" : (option.proposedByName ?? "un participant")}</p>

        <div className="mt-auto space-y-2 pt-1">
          {view.canVote ? (
            <VoteButton action={voteAction} optionId={option.id} voted={voted} count={option.voters.length} />
          ) : (
            <p className="text-sm font-semibold">
              {option.voters.length} vote{option.voters.length > 1 ? "s" : ""}
              {voted && <span className="text-brand"> · dont le tien</span>}
            </p>
          )}
          {option.voters.length > 0 && <p className="text-xs text-muted">🙋 {option.voters.map((v) => v.name).join(", ")}</p>}
        </div>

        {view.phase !== "a_venir" && (
          <details className="rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-brand">
              💬 {option.comments.length > 0 ? `${option.comments.length} commentaire${option.comments.length > 1 ? "s" : ""}` : "Commenter"}
            </summary>
            <div className="mt-3 space-y-3">
              {option.comments.length > 0 && <CommentList comments={option.comments} deleteAction={admin ? deleteCommentAction : undefined} />}
              <CommentForm action={commentAction} topicId={view.topic.id} optionId={option.id} placeholder={`Ton avis sur « ${option.title} »`} />
            </div>
          </details>
        )}
      </div>
    </article>
  );
}
