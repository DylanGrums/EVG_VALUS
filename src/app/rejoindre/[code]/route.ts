import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getMember, groupAccessCode, safeEqual, setMember } from "@/lib/session";
import { getActiveParticipant } from "@/lib/orga/participants";

/**
 * Lien secret partagé dans le groupe WhatsApp : /rejoindre/<GROUP_ACCESS_CODE>.
 * Route Handler (et non page) car on pose le cookie membre, impossible pendant le rendu d'une page.
 * Bon code → cookie membre (on garde le prénom déjà choisi s'il est toujours valide) → /orga ou « Qui es-tu ? ».
 * Mauvais code → page neutre, sans rien révéler.
 */
export async function GET(_request: Request, ctx: RouteContext<"/rejoindre/[code]">) {
  const { code } = await ctx.params;
  const expected = groupAccessCode();
  if (!safeEqual(code, expected) && !safeEqual(safeDecode(code), expected)) redirect("/rejoindre");

  const previous = await getMember();
  const participant = await getActiveParticipant(await getDb(), previous?.participantId);
  await setMember(participant?.id);
  redirect(participant ? "/orga" : "/orga/qui-es-tu");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
