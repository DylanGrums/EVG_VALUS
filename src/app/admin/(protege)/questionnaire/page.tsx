import Link from "next/link";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { Badge, Button, Card, Hero, Input, LinkButton, Select, Shell } from "@/components/ui";
import { analyze } from "@/lib/questionnaire/analysis";
import { STATUSES, filterResponses, parseFilters, statusLabels, statusOf } from "@/lib/questionnaire/filters";
import { formatDate } from "@/lib/questionnaire/format";
import { loadAdminData } from "@/lib/questionnaire/store";
import { listParticipants } from "@/lib/orga/participants";
import { KNOWLEDGE_LEVELS, knowledgeLabels, weightOf } from "@/lib/questionnaire/types";
import { AnalysisView, LevelBadge } from "./_components/analysis-view";
import { AutoRefresh, CopyLink, DeleteParticipationButton, KnowledgeSelect } from "./_components/client-bits";

export const metadata = { title: "Questionnaire" };

export default async function QuestionnaireDashboard({ searchParams }: PageProps<"/admin/questionnaire">) {
  if (!(await isAdmin())) throw new Error("Session organisateur requise.");
  const filters = parseFilters(await searchParams);
  const db = await getDb();
  const [data, people] = await Promise.all([loadAdminData(db), listParticipants(db, { includeInactive: true })]);
  const names = new Map(people.map((p) => [p.id, p.name]));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const publicUrl = `${proto}://${host}/questionnaire`;

  const analysis = analyze(data, { includeOrganizer: filters.avis, levels: filters.niveau ? [filters.niveau] : null });
  const rows = filterResponses(data.responses, filters);
  const completed = data.responses.filter((r) => r.submittedAt);
  const toRank = completed.filter((r) => !r.excluded && !r.knowledge).length;
  const drafts = data.responses.filter((r) => !r.submittedAt && !r.excluded).length;
  const lastActivity = data.responses.map((r) => r.submittedAt ?? r.updatedAt).filter(Boolean).sort().at(-1);
  const exportQuery = filters.avis ? "?avis=1" : "";
  const activeFilters = Boolean(filters.q || filters.statut || filters.niveau);

  return (
    <Shell wide>
      <AutoRefresh />
      <Hero kicker="Espace organisateurs" title="Questionnaire : profil de Val">
        Les résultats s’actualisent automatiquement toutes les 15 secondes. Le niveau de connaissance n’est visible que par vous.
      </Hero>

      <Card className="space-y-3">
        <h2 className="text-xl">Partager le questionnaire</h2>
        <CopyLink url={publicUrl} />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">Participations</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Réponses reçues", completed.length],
            ["Incluses dans les analyses", analysis.respondentCount],
            ["Brouillons en cours", drafts],
            ["À classer", toRank],
            ["Dernière participation", formatDate(lastActivity)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-paper p-3">
              <dd className="text-xl font-bold">{value}</dd>
              <dt className="text-xs text-muted">{label}</dt>
            </div>
          ))}
        </dl>

        <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input type="search" name="q" defaultValue={filters.q} placeholder="Rechercher un prénom" aria-label="Rechercher un prénom" />
          <Select name="statut" defaultValue={filters.statut ?? ""} aria-label="Filtrer par statut">
            <option value="">Tous les statuts</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
          <Select name="niveau" defaultValue={filters.niveau ?? ""} aria-label="Filtrer par niveau de connaissance (liste et analyses)">
            <option value="">Tous les niveaux</option>
            {KNOWLEDGE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {knowledgeLabels[level]}
              </option>
            ))}
            <option value="unranked">À classer (non classés)</option>
          </Select>
          <div className="flex items-center gap-2">
            {filters.avis && <input type="hidden" name="avis" value="1" />}
            <Button type="submit" variant="secondary">
              Filtrer
            </Button>
            {activeFilters && (
              <Link href={filters.avis ? "/admin/questionnaire?avis=1" : "/admin/questionnaire"} className="text-sm font-semibold text-brand underline">
                Réinitialiser
              </Link>
            )}
          </div>
        </form>
        {filters.niveau && (
          <p className="text-sm text-muted">
            Filtre actif : les analyses ci-dessous ne portent que sur « {filters.niveau === "unranked" ? "À classer" : knowledgeLabels[filters.niveau]} ».
          </p>
        )}

        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/questionnaire/reponse/${entry.id}`} className="font-semibold text-brand underline">
                    {entry.name || "Sans prénom"}
                  </Link>{" "}
                  <Badge tone={statusOf(entry) === "Terminée" ? "ok" : statusOf(entry) === "Exclue" ? "danger" : "neutral"}>{statusOf(entry)}</Badge>{" "}
                  {entry.submittedAt && <LevelBadge level={entry.knowledge} />}
                  <div className="text-xs text-muted">
                    {entry.participantId ? `↔ ${names.get(entry.participantId) ?? "?"} · ` : "Non rattachée · "}
                    Version {entry.version} · {formatDate(entry.submittedAt ?? entry.updatedAt)}
                    {entry.submittedAt && ` · poids ${weightOf(entry.knowledge)}`}
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {entry.submittedAt && <KnowledgeSelect id={entry.id} value={entry.knowledge} compact />}
                  <DeleteParticipationButton id={entry.id} name={entry.name} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{data.responses.length ? "Aucune participation pour ce filtre." : "Pas encore de participation : partage le lien ci-dessus."}</p>
        )}
      </Card>

      <AnalysisView analysis={analysis} />

      <Card className="space-y-3">
        <h2 className="text-xl">Avis de l’organisateur</h2>
        <p className="text-sm text-muted">Ton avis privé est facultatif : il reste hors des analyses et des exports tant que tu ne l’inclus pas (poids 2).</p>
        <div className="flex flex-wrap items-center gap-3">
          <LinkButton variant="secondary" href="/admin/questionnaire/avis">
            {data.organizer ? "Modifier ton avis privé" : "Ajouter ton avis privé"}
          </LinkButton>
          {data.organizer && (
            <Link
              className="text-sm font-semibold text-brand underline"
              href={{ pathname: "/admin/questionnaire", query: { ...(filters.q && { q: filters.q }), ...(filters.statut && { statut: filters.statut }), ...(filters.niveau && { niveau: filters.niveau }), ...(!filters.avis && { avis: "1" }) } }}
            >
              {filters.avis ? "Retirer ton avis des analyses et exports" : "Inclure ton avis dans les analyses et exports"}
            </Link>
          )}
        </div>
        {filters.avis && data.organizer && filters.niveau && (
          <p className="text-sm text-muted">L’avis de l’organisateur est écarté quand un filtre de niveau est actif.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">Exporter et modifier</h2>
        <p className="text-sm text-muted">Les exports contiennent les questionnaires terminés avec le niveau de connaissance ; les participations exclues sont signalées.</p>
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href={`/admin/questionnaire/export/csv${exportQuery}`} prefetch={false}>
            Exporter CSV
          </LinkButton>
          <LinkButton variant="secondary" href={`/admin/questionnaire/export/json${exportQuery}`} prefetch={false}>
            Exporter JSON
          </LinkButton>
          <LinkButton variant="secondary" href="/admin/questionnaire/editeur">
            Modifier le questionnaire (version {data.versions.at(-1)?.version})
          </LinkButton>
        </div>
      </Card>
    </Shell>
  );
}
