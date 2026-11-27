import { redirect } from "next/navigation";

/** Ancienne adresse : l'écran « répondre au questionnaire ou passer » est désormais /bienvenue. */
export default function AncienBienvenue() {
  redirect("/bienvenue");
}
