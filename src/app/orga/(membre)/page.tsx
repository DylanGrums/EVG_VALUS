import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { Badge, Card, Hero, LinkButton, Shell, cx } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";
import { TOPIC_TYPE_EMOJI, TOPIC_TYPE_LABELS, formatDateTime } from "@/lib/orga/format";
import { listTopicSummaries, type TopicSummary } from "@/lib/orga/topics";
import { PhaseBadge } from "../_components/views";

export const metadata: Metadata = { title: "Préparation" };

export default async function OrgaHome() {
  const me = await requireMemberPage("/orga");
  const topics = await listTopicSummaries(await getDb(), { participantId: me.id });
  const decided = topics.filter((t) => t.phase === "decide").length;
  const open = topics.filter((t) => t.phase === "ouvert");
  const todo = open.filter((t) => !t.iVoted);

  return (
    <Shell>
      <Hero kicker="L’orga de l’EVG" title={`Salut ${me.name} 👋`}>
        {topics.length === 0
          ? "Les orgas préparent les premiers sujets. Repasse bientôt !"
          : todo.length > 0
            ? `${todo.length === 1 ? "Un vote t’attend" : `${todo.length} votes t’attendent`} : à toi de jouer !`
            : open.length > 0
              ? "Tu as voté partout, merci ! On attend les autres."
              : "Rien à voter pour l’instant."}
      </Hero>

      {topics.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg">Avancement</h2>
            <span className="text-sm font-semibold text-muted">
              {decided} / {topics.length} décidé{decided > 1 ? "s" : ""}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={topics.length} aria-valuenow={decided}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(decided / topics.length) * 100}%` }} />
          </div>
        </Card>
      )}

      <ol className="space-y-3">
        {topics.map((t, i) => (
          <li key={t.id}>
            <TopicStep topic={t} index={i + 1} last={i === topics.length - 1} />
          </li>
        ))}
      </ol>

      <Card className="flex flex-col gap-3 bg-night text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg">🧳 Le carnet sur place</h2>
          <p className="text-sm text-[#e1d7ee]">Adresse, planning, billets et infos utiles : tout ce qui est validé, au même endroit.</p>
        </div>
        <LinkButton href="/orga/sur-place" className="bg-lime text-night hover:bg-white">
          Ouvrir le carnet
        </LinkButton>
      </Card>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg">📝 Le questionnaire sur Val</h2>
          <p className="text-sm text-muted">Pas encore répondu ? Cinq minutes pour nous aider à viser juste.</p>
        </div>
        <LinkButton href="/questionnaire" variant="secondary">
          Répondre
        </LinkButton>
      </Card>
    </Shell>
  );
}

function TopicStep({ topic, index, last }: { topic: TopicSummary; index: number; last: boolean }) {
  const upcoming = topic.phase === "a_venir";
  const done = topic.phase === "decide";
  return (
    <Link
      href={`/orga/sujets/${topic.id}`}
      className={cx(
        "relative flex gap-4 rounded-2xl border bg-panel p-4 transition hover:border-brand",
        topic.phase === "ouvert" ? "border-brand/50 shadow-sm" : "border-line",
        upcoming && "opacity-75",
      )}
    >
      <div className="flex flex-col items-center">
        <span
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-full text-lg font-bold",
            done ? "bg-ok text-white" : topic.phase === "ouvert" ? "bg-lime text-night" : "bg-paper text-muted",
          )}
          aria-hidden
        >
          {done ? "✓" : upcoming ? index : TOPIC_TYPE_EMOJI[topic.type]}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-line" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg">{topic.title}</h3>
          <PhaseBadge phase={topic.phase} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{TOPIC_TYPE_LABELS[topic.type]}</p>
        {done && topic.selectedTitles.length > 0 && <p className="font-semibold text-ok">→ {topic.selectedTitles.join(", ")}</p>}
        {upcoming && topic.dependsOnTitle && <p className="text-sm text-muted">Se débloque quand « {topic.dependsOnTitle} » sera décidé.</p>}
        {topic.phase === "ouvert" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {topic.iVoted ? <Badge tone="ok">Tu as voté</Badge> : <Badge tone="danger">Pas encore voté</Badge>}
            {topic.deadline && <span className="text-muted">jusqu’au {formatDateTime(topic.deadline)}</span>}
          </div>
        )}
        {!upcoming && (
          <p className="text-xs text-muted">
            {topic.optionCount} option{topic.optionCount > 1 ? "s" : ""} · {topic.voterCount} votant{topic.voterCount > 1 ? "s" : ""} · {topic.commentCount} commentaire{topic.commentCount > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}
