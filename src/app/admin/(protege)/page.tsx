import { Card, Hero, LinkButton, Shell } from "@/components/ui";

export const metadata = { title: "Organisateurs" };

export default function AdminHome() {
  return (
    <Shell wide>
      <Hero kicker="Espace organisateurs" title="Tableau de bord" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <h2 className="mb-2 text-xl">Questionnaire</h2>
          <p className="mb-4 text-muted">Réponses des proches, analyses, exports et édition des questions.</p>
          <LinkButton href="/admin/questionnaire">Ouvrir</LinkButton>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl">Idées</h2>
          <p className="mb-4 text-muted">Recherche de villes et d’événements (export, IA, import), votes du groupe.</p>
          <LinkButton href="/admin/idees">Ouvrir</LinkButton>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl">Organisation</h2>
          <p className="mb-4 text-muted">Destination, logement, activités, transport : votes et validations.</p>
          <LinkButton href="/admin/orga">Ouvrir</LinkButton>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl">Participants</h2>
          <p className="mb-4 text-muted">Liste des prénoms du groupe et lien d’accès.</p>
          <LinkButton href="/admin/participants">Ouvrir</LinkButton>
        </Card>
        <Card>
          <h2 className="mb-2 text-xl">Fréquentation</h2>
          <p className="mb-4 text-muted">Qui est en ligne, connexions et pages vues par prénom (invisible des membres).</p>
          <LinkButton href="/admin/stats">Ouvrir</LinkButton>
        </Card>
      </div>
    </Shell>
  );
}
