import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { TOPIC_STATUSES } from "@/db/schema";
import { Badge, Button, Card, LinkButton, Shell, cx } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { STATUS_LABELS, TOPIC_TYPE_EMOJI } from "@/lib/orga/format";
import { loadTopicView, listTopics } from "@/lib/orga/topics";
import { isUuid } from "@/lib/orga/validation";
import { ActionForm, Collapsible, ConfirmButton, SubmitButton } from "@/app/orga/_components/forms";
import { CommentList, OptionFacts, OptionFields, PhaseBadge, PriceBlock } from "@/app/orga/_components/views";
import { createOptionAction, deleteCommentAction, deleteOptionAction, deleteTopicAction, setStatusAction, toggleSelectedAction, updateTopicAction } from "../../actions";
import { TopicFields } from "../../_components/topic-fields";

export const metadata: Metadata = { title: "Sujet" };

const STATUS_HELP = {
  brouillon: "Invisible des membres.",
  ouvert: "Visible, votes et propositions ouverts.",
  clos: "Visible, votes figés.",
  decide: "Option(s) retenue(s) : apparaît dans le carnet sur place.",
};

export default async function AdminSujet({ params }: PageProps<"/admin/orga/sujets/[id]">) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const [view, topics] = await Promise.all([loadTopicView(db, id, null, { forAdmin: true }), listTopics(db)]);
  if (!view) notFound();
  const { topic } = view;
  const selectedCount = view.options.filter((o) => o.selected).length;

  return (
    <Shell wide>
      <Link href="/admin/orga" className="text-sm font-semibold text-brand">
        ← Tous les sujets
      </Link>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl">
            {TOPIC_TYPE_EMOJI[topic.type]} {topic.title}
          </h1>
          {topic.status !== "brouillon" && <PhaseBadge phase={view.phase} />}
        </div>
        {view.locked && view.dependsOn && (
          <p className="rounded-xl bg-paper px-4 py-3 text-sm">
            🔒 Verrouillé pour les membres tant que « {view.dependsOn.title} » n’est pas décidé (affiché « à venir »).
          </p>
        )}
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Statut</h2>
          <div className="flex flex-wrap gap-2">
            {TOPIC_STATUSES.map((s) => (
              <ActionForm key={s} action={setStatusAction}>
                <input type="hidden" name="topicId" value={topic.id} />
                <input type="hidden" name="status" value={s} />
                <button
                  type="submit"
                  title={STATUS_HELP[s]}
                  disabled={s === "decide" && selectedCount === 0}
                  className={cx(
                    "rounded-xl border px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                    topic.status === s ? "border-brand bg-brand text-white" : "border-line bg-panel hover:border-brand",
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              </ActionForm>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {STATUS_HELP[topic.status]}
            {selectedCount === 0 && " Pour « Décidé », retenez d’abord au moins une option."}
          </p>
        </div>
        <p className="text-sm text-muted">
          {view.totalVoters} / {view.activeCount} participants ont voté.
        </p>
      </Card>

      <Collapsible summary="Modifier le sujet">
        <ActionForm action={updateTopicAction} className="space-y-4">
              <input type="hidden" name="topicId" value={topic.id} />
              <TopicFields topic={topic} topics={topics} />
              <div className="flex flex-wrap justify-between gap-2">
                <SubmitButton>
                  Enregistrer
                </SubmitButton>
              </div>
        </ActionForm>
      </Collapsible>

      <section className="space-y-3">
        <h2 className="text-2xl">Options ({view.options.length})</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {view.options.map((o) => (
            <Card key={o.id} className={cx("space-y-3 p-4", o.selected && "border-ok ring-2 ring-ok/30")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-lg">{o.title}</h3>
                {o.selected && <Badge tone="ok">✓ Retenue</Badge>}
              </div>
              <PriceBlock price={o.price} emphasize={topic.type === "logement"} />
              {o.description && <p className="whitespace-pre-line text-sm">{o.description}</p>}
              <OptionFacts option={o} type={topic.type} />
              <p className="text-xs text-muted">
                Proposée par {o.proposedByOrga ? "les orgas" : (o.proposedByName ?? "?")} · {o.voters.length} vote(s)
                {o.voters.length > 0 && ` : ${o.voters.map((v) => v.name).join(", ")}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={toggleSelectedAction}>
                  <input type="hidden" name="optionId" value={o.id} />
                  <input type="hidden" name="selected" value={o.selected ? "0" : "1"} />
                  <Button type="submit" variant={o.selected ? "secondary" : "primary"} className="py-1.5">
                    {o.selected ? "Ne plus retenir" : "★ Retenir"}
                  </Button>
                </ActionForm>
                <LinkButton href={`/admin/orga/options/${o.id}`} variant="secondary" className="py-1.5">
                  Modifier
                </LinkButton>
                <ActionForm action={deleteOptionAction}>
                  <input type="hidden" name="optionId" value={o.id} />
                  <ConfirmButton message={`Supprimer « ${o.title} » et ses votes ?`} variant="danger" className="py-1.5" type="submit">
                    Supprimer
                  </ConfirmButton>
                </ActionForm>
              </div>
              {o.comments.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-brand">{o.comments.length} commentaire(s)</summary>
                  <div className="mt-2">
                    <CommentList comments={o.comments} deleteAction={deleteCommentAction} />
                  </div>
                </details>
              )}
            </Card>
          ))}
        </div>
        <Collapsible summary="＋ Ajouter une option (orga)" defaultOpen={view.options.length === 0}>
          <ActionForm action={createOptionAction} resetOnSuccess className="space-y-4">
                <input type="hidden" name="topicId" value={topic.id} />
                <OptionFields type={topic.type} />
                <SubmitButton>
                  Ajouter
                </SubmitButton>
          </ActionForm>
        </Collapsible>
      </section>

      <Card className="space-y-3">
        <h2 className="text-xl">Commentaires sur le sujet</h2>
        <CommentList comments={view.comments} deleteAction={deleteCommentAction} />
      </Card>

      <Card className="border-danger/30">
        <ActionForm action={deleteTopicAction} className="flex flex-wrap items-center justify-between gap-3">
          <input type="hidden" name="topicId" value={topic.id} />
          <p className="text-sm text-muted">Supprimer le sujet efface aussi ses options, votes et commentaires.</p>
          <ConfirmButton message={`Supprimer définitivement « ${topic.title} » ?`} variant="danger" type="submit">
            Supprimer le sujet
          </ConfirmButton>
        </ActionForm>
      </Card>
    </Shell>
  );
}
