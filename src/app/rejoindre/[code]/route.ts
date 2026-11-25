import { redirect } from "next/navigation";

/** Anciens liens /rejoindre/<code> : le code n'est plus demandé, on renvoie vers l'orga. */
export async function GET() {
  redirect("/orga");
}
