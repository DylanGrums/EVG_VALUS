import Link from "next/link";
import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { Shell } from "@/components/ui";
import { toEditorQuestions } from "@/lib/questionnaire/definition";
import { listVersions } from "@/lib/questionnaire/store";
import { QuestionEditor } from "./editor";

export const metadata = { title: "Modifier le questionnaire" };

export default async function EditorPage() {
  if (!(await isAdmin())) throw new Error("Session organisateur requise.");
  const latest = (await listVersions(await getDb())).at(-1)!;
  return (
    <Shell>
      <Link href="/admin/questionnaire" className="text-sm font-semibold text-brand underline">
        ← Retour au tableau de bord
      </Link>
      {/* key : repart d'un éditeur neuf après chaque publication */}
      <QuestionEditor key={latest.version} version={latest.version} initial={toEditorQuestions(latest)} />
    </Shell>
  );
}
