import { getDb } from "@/db";
import { isAdmin } from "@/lib/session";
import { countActiveParticipants } from "@/lib/orga/participants";
import { loadAdminData } from "@/lib/questionnaire/store";
import { buildResearchMarkdown } from "@/lib/idees/research";

/**
 * Synthèse Markdown du questionnaire pour la recherche (pondérée : réservée aux admins).
 * Revérifie la session : le layout ne protège pas les route handlers.
 */
export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response("Connexion organisateur requise.", { status: 401 });
  const includeOrganizer = new URL(request.url).searchParams.get("avis") === "1";
  const db = await getDb();
  const [data, participantCount] = await Promise.all([loadAdminData(db), countActiveParticipants(db)]);
  const body = buildResearchMarkdown(data, { includeOrganizer, participantCount: participantCount || null });
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'attachment; filename="evg-valentin-synthese.md"',
      "cache-control": "no-store",
    },
  });
}
