import { redirect } from "next/navigation";

/** La racine renvoie vers le questionnaire (lien direct : /questionnaire). */
export default function Home() {
  redirect("/questionnaire");
}
