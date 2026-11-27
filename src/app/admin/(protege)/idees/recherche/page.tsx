import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { Card, Hero, LinkButton, Shell, Textarea } from "@/components/ui";
import { CopyButton } from "@/app/orga/_components/forms";
import { requireAdminPage } from "@/lib/orga/auth";
import { countActiveParticipants } from "@/lib/orga/participants";
import { loadAdminData } from "@/lib/questionnaire/store";
import { buildResearchMarkdown, buildResearchPrompt } from "@/lib/idees/research";

export const metadata: Metadata = { title: "Recherche d’idées" };

export default async function RecherchePage() {
  await requireAdminPage();
  const db = await getDb();
  const [data, participantCount] = await Promise.all([loadAdminData(db), countActiveParticipants(db)]);
  const prompt = buildResearchPrompt({ participantCount: participantCount || null });
  const markdown = buildResearchMarkdown(data, { participantCount: participantCount || null });
  const answered = data.responses.filter((r) => r.submittedAt && !r.excluded).length;

  return (
    <Shell wide className="max-w-4xl">
      <Link href="/admin/idees" className="text-sm font-semibold text-brand">
        ← Idées
      </Link>
      <Hero kicker="Idées · étape 1" title="Préparer la recherche approfondie">
        Téléchargez la synthèse du questionnaire, donnez-la avec le prompt ci-dessous à un outil de recherche approfondie (IA), puis importez le JSON qu’il renvoie.
      </Hero>

      <Card className="space-y-3">
        <h2 className="text-xl">1. Synthèse du questionnaire</h2>
        <p className="text-sm text-muted">
          Fichier Markdown : pour chaque question, effectifs et pourcentages pondérés et bruts, commentaires anonymisés (prénoms des répondants retirés), limites et « non » forts, critères de recherche.
          {" "}
          {answered} réponse(s) terminée(s) prise(s) en compte (les exclues sont écartées).
        </p>
        <p className="rounded-xl bg-brand-light px-3 py-2 text-sm text-brand">
          🔒 Contient la pondération par niveau de connaissance : ne pas le partager avec le groupe.
        </p>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/admin/idees/recherche/synthese" prefetch={false}>
            ⬇️ Télécharger la synthèse (.md)
          </LinkButton>
          <LinkButton href="/admin/idees/recherche/synthese?avis=1" prefetch={false} variant="secondary">
            Avec l’avis de l’organisation
          </LinkButton>
          <LinkButton href="/admin/questionnaire/export/json" prefetch={false} variant="ghost">
            Export JSON complet
          </LinkButton>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">2. Prompt de recherche</h2>
        <p className="text-sm text-muted">
          À coller dans l’outil de recherche, avec la synthèse en pièce jointe. Ou bien « Copier prompt + synthèse » pour tout coller d’un coup. Il demande exactement le{" "}
          <Link href="/admin/idees/import" className="font-semibold text-brand underline">
            format d’import
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={prompt} label="📋 Copier le prompt" />
          <CopyButton text={`${prompt}\n---\n\n${markdown}`} label="📋 Copier prompt + synthèse" />
        </div>
        <Textarea readOnly value={prompt} rows={16} className="font-mono text-xs" aria-label="Prompt de recherche" />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl">3. Importer le résultat</h2>
        <p className="text-sm text-muted">Collez le JSON renvoyé par l’IA : un aperçu montre ce qui sera créé ou mis à jour avant d’importer.</p>
        <LinkButton href="/admin/idees/import">📥 Importer</LinkButton>
      </Card>
    </Shell>
  );
}
