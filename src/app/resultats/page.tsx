import type { Metadata } from "next";
import { getDb } from "@/db";
import { AppNav } from "@/components/app-nav";
import { Card, Hero, Shell } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";
import { publicTrends } from "@/lib/questionnaire/public-view";
import { loadAdminData } from "@/lib/questionnaire/store";
import { TrendsFull, TrendsWaiting } from "../_components/trends";

export const metadata: Metadata = { title: "Résultats du questionnaire" };

/**
 * Tendances anonymes du questionnaire, pour tous les membres identifiés.
 * Les données brutes sont chargées côté serveur puis réduites par publicTrends : seuls des libellés et des
 * pourcentages non pondérés arrivent dans la page. Le détail par répondant reste dans l'admin.
 */
export default async function Resultats() {
  await requireMemberPage("/resultats");
  const trends = publicTrends(await loadAdminData(await getDb()));

  return (
    <>
      <AppNav />
      <Shell wide>
        <Hero kicker="Questionnaire sur Val" title="Ce qui ressort 📊">
          {trends.status === "ready"
            ? `D’après ${trends.count} réponses envoyées. Tendances anonymes : pas de prénoms ni de commentaires, chaque avis compte pareil.`
            : "Les tendances anonymes arrivent bientôt."}
        </Hero>
        {trends.status === "waiting" ? (
          <Card>
            <TrendsWaiting count={trends.count} needed={trends.needed} />
          </Card>
        ) : (
          <TrendsFull trends={trends} />
        )}
      </Shell>
    </>
  );
}
