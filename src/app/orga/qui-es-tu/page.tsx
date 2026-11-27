import { redirect } from "next/navigation";

/** Ancienne adresse : l'identification est désormais commune à toute l'app (/qui-es-tu). */
export default function AncienQuiEsTu() {
  redirect("/qui-es-tu");
}
