import { redirect } from "next/navigation";

/** Ancienne page « lien invalide » : l'orga n'a plus de code d'accès. */
export default function Rejoindre() {
  redirect("/orga");
}
