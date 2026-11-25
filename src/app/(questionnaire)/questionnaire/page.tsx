import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { loadPublicState } from "@/lib/questionnaire/store";
import { PARTICIPATION_COOKIE, hashToken, isToken } from "@/lib/questionnaire/token";
import { currentMember } from "@/lib/orga/auth";
import { Shell } from "@/components/ui";
import { saveAnswers, startAnother } from "../actions";
import { Survey } from "../survey";

export const metadata: Metadata = { title: "Questionnaire" };

/**
 * Questionnaire public : lien direct à partager aux proches (/questionnaire).
 * Jamais de donnée d'autrui ni d'analyse : seulement la reprise du brouillon du navigateur.
 * Si la personne est aussi membre du groupe EVG, son prénom est pré-rempli et un lien ramène à l'orga.
 */
export default async function QuestionnairePage() {
  const token = (await cookies()).get(PARTICIPATION_COOKIE)?.value;
  const [state, { participant }] = await Promise.all([
    getDb().then((db) => loadPublicState(db, isToken(token) ? hashToken(token) : null)),
    currentMember(),
  ]);
  return (
    <Shell>
      <Survey
        mode="public"
        version={state.version}
        questions={state.questions}
        initialDraft={state.draft}
        initialRevision={state.revision}
        initialSubmitted={state.submitted}
        save={saveAnswers}
        startAnother={startAnother}
        initialName={participant?.name}
        orgaHref={participant ? "/orga" : undefined}
      />
    </Shell>
  );
}
