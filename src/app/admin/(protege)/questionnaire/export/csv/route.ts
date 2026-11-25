import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { exportCsv } from "@/lib/questionnaire/analysis";
import { loadAdminData } from "@/lib/questionnaire/store";

/** Export CSV (questionnaires terminés). Revérifie la session : le layout ne protège pas les route handlers. */
export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response("Connexion organisateur requise.", { status: 401 });
  const includeOrganizer = new URL(request.url).searchParams.get("avis") === "1";
  const csv = exportCsv(await loadAdminData(await getDb()), includeOrganizer);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="evg-valentin.csv"',
      "cache-control": "no-store",
    },
  });
}
