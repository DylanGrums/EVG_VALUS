import { cookies } from "next/headers";
import { getDb } from "@/db";
import { currentMember } from "@/lib/orga/auth";
import { normalizePath } from "@/lib/analytics/paths";
import { isIgnoredRequest, recordActivity, VISIT_GAP_MS } from "@/lib/analytics/track";

/**
 * Fréquentation (admin seulement) : reçoit le signal du composant `ActivityBeacon` (page vue ou onglet toujours visible).
 * L'identité vient UNIQUEMENT du cookie signé du membre ; le corps ne contient que le chemin et le type.
 * Un visiteur sans prénom reçoit un cookie httpOnly aléatoire valable 30 min (= id de sa visite), rien d'autre.
 * Best effort : répond toujours 204, ne casse jamais la page.
 */
const VISIT_COOKIE = "evg_v";
const MAX_BODY = 1024;

export async function POST(request: Request) {
  try {
    if (isIgnoredRequest(request.headers)) return done();
    const text = await request.text();
    if (text.length > MAX_BODY) return done();
    const body = JSON.parse(text) as { t?: unknown; p?: unknown };
    const kind = body.t === "view" ? "view" : body.t === "ping" ? "ping" : null;
    const page = normalizePath(body.p);
    if (!kind || !page) return done();

    const { participant } = await currentMember();
    const jar = await cookies();
    const { visitId } = await recordActivity(await getDb(), {
      kind,
      page,
      participantId: participant?.id ?? null,
      anonymousVisitId: participant ? null : jar.get(VISIT_COOKIE)?.value,
    });
    if (participant) {
      if (jar.get(VISIT_COOKIE)) jar.delete(VISIT_COOKIE);
    } else {
      jar.set(VISIT_COOKIE, visitId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: VISIT_GAP_MS / 1000,
      });
    }
  } catch {
    // Best effort : une erreur de suivi ne doit jamais gêner la navigation.
  }
  return done();
}

function done() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
