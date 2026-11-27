import { redirect } from "next/navigation";

/** Ancienne page « lien invalide » : l'app n'a plus de code d'accès, on renvoie vers l'accueil. */
export default function Rejoindre() {
  redirect("/");
}
