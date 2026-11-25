import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { exportJson } from "@/lib/questionnaire/analysis";
import { loadAdminData } from "@/lib/questionnaire/store";

/** Export JSON (versions, réponses terminées avec niveau et poids, analyses pondérées). */
export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response("Connexion organisateur requise.", { status: 401 });
  const includeOrganizer = new URL(request.url).searchParams.get("avis") === "1";
  const body = JSON.stringify(exportJson(await loadAdminData(await getDb()), includeOrganizer), null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="evg-valentin.json"',
      "cache-control": "no-store",
    },
  });
}
