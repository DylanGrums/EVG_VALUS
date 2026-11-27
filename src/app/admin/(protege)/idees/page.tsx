import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { Badge, Card, Hero, LinkButton, Shell } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "@/app/orga/_components/forms";
import { requireAdminPage } from "@/lib/orga/auth";
import { normalize } from "@/lib/questionnaire/format";
import { listCitySummaries, sortAndFilterCities } from "@/lib/idees/ideas";
import { deleteCityAction, setCityHiddenAction, setCityRetainedAction } from "./actions";

export const metadata: Metadata = { title: "Idées" };

export default async function AdminIdees() {
  await requireAdminPage();
  const cities = sortAndFilterCities(await listCitySummaries(await getDb(), { forAdmin: true }), "votes", "", normalize);

  return (
    <Shell wide>
      <Hero kicker="Espace organisateurs" title="Idées : villes et événements">
        Exportez le questionnaire, lancez la recherche approfondie avec une IA, réimportez ses résultats : le groupe vote sur <code>/idees</code>.
      </Hero>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/admin/idees/recherche">🔎 1. Préparer la recherche</LinkButton>
        <LinkButton href="/admin/idees/import" variant="secondary">
          📥 2. Importer les résultats
        </LinkButton>
        <LinkButton href="/idees" variant="ghost">
          Voir la page des membres →
        </LinkButton>
      </div>

      <Card className="space-y-4">
        <h2 className="text-xl">Villes ({cities.length})</h2>
        {cities.length === 0 && <p className="text-muted">Aucune ville : importez les résultats de la recherche, ou attendez les propositions du groupe.</p>}
        <ul className="divide-y divide-line">
          {cities.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`/admin/idees/villes/${c.id}`} className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold hover:text-brand">
                    {c.name} <span className="font-normal text-muted">· {c.country}</span>
                  </span>
                  {c.retained && <Badge tone="ok">✓ Retenue</Badge>}
                  {c.hidden && <Badge tone="danger">Masquée</Badge>}
                  {c.source === "membre" && <Badge>Proposée par {c.proposedByName ?? "?"}</Badge>}
                </span>
                <span className="block text-xs text-muted">
                  👍 {c.voteCount} · {c.eventCount} événement(s) · {c.commentCount} commentaire(s)
                </span>
              </Link>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={setCityRetainedAction}>
                  <input type="hidden" name="cityId" value={c.id} />
                  <input type="hidden" name="retained" value={c.retained ? "0" : "1"} />
                  <SubmitButton variant={c.retained ? "secondary" : "primary"} className="py-1.5">
                    {c.retained ? "Ne plus retenir" : "Retenir cette ville"}
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={setCityHiddenAction}>
                  <input type="hidden" name="cityId" value={c.id} />
                  <input type="hidden" name="hidden" value={c.hidden ? "0" : "1"} />
                  <SubmitButton variant="secondary" className="py-1.5">
                    {c.hidden ? "Afficher" : "Masquer"}
                  </SubmitButton>
                </ActionForm>
                <LinkButton href={`/admin/idees/villes/${c.id}`} variant="secondary" className="py-1.5">
                  Modifier
                </LinkButton>
                <ActionForm action={deleteCityAction}>
                  <input type="hidden" name="cityId" value={c.id} />
                  <ConfirmButton
                    type="submit"
                    variant="danger"
                    className="py-1.5"
                    message={`Supprimer « ${c.name} » avec ses ${c.eventCount} événement(s), ses votes et ses commentaires ? C’est définitif (« Masquer » est réversible).`}
                  >
                    Supprimer
                  </ConfirmButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
