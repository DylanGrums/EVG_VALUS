import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { Shell } from "@/components/ui";
import { Survey } from "@/app/(questionnaire)/survey";
import { getOrganizer, listVersions, toPublicQuestions } from "@/lib/questionnaire/store";
import { saveOrganizerAction } from "../actions";

export const metadata = { title: "Ton avis privé" };

/** Avis privé de l'organisateur : même parcours que le public, mais enregistré à part et jamais exposé au public. */
export default async function OrganizerOpinion() {
  if (!(await isAdmin())) throw new Error("Session organisateur requise.");
  const db = await getDb();
  const [versions, organizer] = await Promise.all([listVersions(db), getOrganizer(db)]);
  const definition = versions.find((v) => v.version === organizer?.version) ?? versions.at(-1)!;
  return (
    <Shell>
      <Survey
        mode="organizer"
        version={definition.version}
        questions={toPublicQuestions(definition)}
        initialDraft={organizer ? { version: organizer.version, name: organizer.name, step: organizer.step, answers: organizer.answers } : null}
        initialRevision={0}
        initialSubmitted={false}
        save={saveOrganizerAction}
        backHref="/admin/questionnaire"
      />
    </Shell>
  );
}
