import type { Metadata } from "next";
import { getDb } from "@/db";
import { AppNav } from "@/components/app-nav";
import { Shell } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";
import { identifyHref } from "@/lib/nav";
import { loadPublicState, resolveMemberParticipation } from "@/lib/questionnaire/store";
import { browserParticipationId } from "@/lib/questionnaire/token";
import { saveAnswers, startAnother } from "../actions";
import { Survey } from "../survey";

export const metadata: Metadata = { title: "Questionnaire" };

/**
 * Questionnaire (lien déjà envoyé aux proches : /questionnaire).
 * Sans prénom : identification d'abord, puis retour ici. Le brouillon du navigateur (cookie de reprise) est retrouvé
 * et rattaché au prénom. Jamais de donnée d'autrui ni d'analyse.
 */
export default async function QuestionnairePage() {
  const participant = await requireMemberPage("/questionnaire");
  const db = await getDb();
  const mine = await resolveMemberParticipation(db, await browserParticipationId(), participant);
  const state = await loadPublicState(db, mine.currentId);
  return (
    <>
      <AppNav />
      <Shell>
        <Survey
          mode="public"
          version={state.version}
          questions={state.questions}
          initialDraft={state.draft}
          initialRevision={state.revision}
          initialSubmitted={state.submitted || mine.submitted}
          save={saveAnswers}
          startAnother={startAnother}
          memberName={participant.name}
          changeNameHref={identifyHref("/questionnaire")}
          doneHref="/?envoye=1"
        />
      </Shell>
    </>
  );
}
