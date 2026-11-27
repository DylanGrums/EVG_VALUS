import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { Badge, Card, Shell } from "@/components/ui";
import { optionsFor } from "@/lib/questionnaire/definition";
import { statusOf } from "@/lib/questionnaire/filters";
import { formatDate } from "@/lib/questionnaire/format";
import { getResponse, listVersions } from "@/lib/questionnaire/store";
import { themes, weightOf } from "@/lib/questionnaire/types";
import { LevelBadge } from "../../_components/analysis-view";
import { KnowledgeSelect, OwnerSelect, ParticipationActions } from "../../_components/client-bits";
import { listParticipants } from "@/lib/orga/participants";

export const metadata = { title: "Réponse individuelle" };

export default async function ResponsePage({ params }: PageProps<"/admin/questionnaire/reponse/[id]">) {
  if (!(await isAdmin())) throw new Error("Session organisateur requise.");
  const { id } = await params;
  if (!/^[a-f0-9]{64}$/.test(id)) notFound();
  const db = await getDb();
  const [entry, versions, people] = await Promise.all([getResponse(db, id), listVersions(db), listParticipants(db, { includeInactive: true })]);
  if (!entry) notFound();
  const definition = versions.find((v) => v.version === entry.version);
  const status = statusOf(entry);

  return (
    <Shell>
      <Link href="/admin/questionnaire" className="text-sm font-semibold text-brand underline">
        ← Retour au tableau de bord
      </Link>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl">{entry.name || "Sans prénom"}</h1>
          <Badge tone={status === "Terminée" ? "ok" : status === "Exclue" ? "danger" : "neutral"}>{status}</Badge>
          {entry.submittedAt && <LevelBadge level={entry.knowledge} />}
        </div>
        <p className="text-sm text-muted">
          Version {entry.version} · {formatDate(entry.submittedAt ?? entry.updatedAt)}
          {entry.submittedAt && ` · poids dans les analyses : ${weightOf(entry.knowledge)}`}
        </p>
        {entry.submittedAt ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold">Niveau de connaissance de Valentin</p>
            <KnowledgeSelect id={entry.id} value={entry.knowledge} />
            <p className="text-xs text-muted">Visible uniquement par les organisateurs. « À classer » compte comme « Le connaît bien ».</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Le niveau pourra être renseigné quand la réponse sera terminée.</p>
        )}
        <div className="space-y-1">
          <p className="text-sm font-semibold">Prénom rattaché</p>
          <OwnerSelect id={entry.id} value={entry.participantId ?? null} people={people.map((p) => ({ id: p.id, name: p.name, active: p.active }))} />
          <p className="text-xs text-muted">
            Relie cette réponse au prénom de la personne dans la liste du groupe : son accueil la considérera comme envoyée. Le prénom
            saisi dans la réponse ne change pas.
          </p>
        </div>
        <ParticipationActions id={entry.id} name={entry.name} excluded={entry.excluded} onDeleteRedirect />
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Réponses</h2>
        <ul className="divide-y divide-line">
          {definition?.questions
            .filter((q) => !q.hidden)
            .map((question) => {
              const answer = entry.answers[String(question.id)];
              if (!answer || (!answer.choices.length && !answer.comment)) return null;
              const labels = optionsFor(question);
              return (
                <li key={String(question.id)} className="py-3">
                  <p className="font-semibold">{question.title}</p>
                  <p className="text-xs text-muted">{themes[question.theme]}</p>
                  {answer.choices.length > 0 && <p className="mt-1 text-sm">{answer.choices.map((key) => labels[key] ?? key).join(" · ")}</p>}
                  {answer.comment && <p className="mt-1 border-l-2 border-line pl-3 text-sm whitespace-pre-wrap text-muted">{answer.comment}</p>}
                </li>
              );
            })}
        </ul>
      </Card>
    </Shell>
  );
}
