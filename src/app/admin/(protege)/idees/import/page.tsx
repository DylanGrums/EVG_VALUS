import type { Metadata } from "next";
import Link from "next/link";
import { Card, Hero, Shell } from "@/components/ui";
import { requireAdminPage } from "@/lib/orga/auth";
import { IMPORT_EXAMPLE } from "@/lib/idees/import";
import { IMPORT_FORMAT_RULES } from "@/lib/idees/research";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importer des idées" };

const FIELDS: [string, string][] = [
  ["nom, pays", "Obligatoires. Servent à reconnaître la ville lors d’un réimport (accents et majuscules ignorés)."],
  ["resume, pourquoi", "Description de la ville et pourquoi elle colle au profil de Val."],
  ["acces", "Ex. « 1 h 30 de vol direct depuis Paris »."],
  ["budget_indicatif", "Texte libre, ex. « 300 € / pers. hors vols »."],
  ["lien", "Facultatif, https://…"],
  ["evenements[].nom", "Obligatoire. Reconnu par ville + nom lors d’un réimport."],
  ["evenements[].categorie", "fête, culture, sport, gastronomie, nature, soirée ou autre (accents facultatifs)."],
  ["evenements[].description, pourquoi", "Texte libre."],
  ["evenements[].date_debut, date_fin", "AAAA-MM-JJ, uniquement si les dates sont annoncées (mai 2027)."],
  ["evenements[].dates_texte", "Si pas de date précise : « chaque année mi-mai, dates 2027 non confirmées »."],
  ["evenements[].prix_texte, prix_min_eur", "Prix lisible et prix minimum en euros (nombre)."],
  ["evenements[].lien, adresse", "Source vérifiable (https://…) et adresse."],
];

export default async function ImportPage() {
  await requireAdminPage();
  return (
    <Shell wide className="max-w-4xl">
      <Link href="/admin/idees" className="text-sm font-semibold text-brand">
        ← Idées
      </Link>
      <Hero kicker="Idées · étape 2" title="Importer les résultats de la recherche">
        Collez le JSON renvoyé par l’IA (le texte autour et les blocs ```json sont ignorés) ou choisissez un fichier. Réimporter le même fichier ne crée aucun doublon.
      </Hero>

      <Card>
        <ImportForm />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">Format attendu</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {IMPORT_FORMAT_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3">Champ</th>
                <th className="py-2">Contenu</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(([field, text]) => (
                <tr key={field} className="border-b border-line align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{field}</td>
                  <td className="py-2">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          Un champ absent du fichier n’est pas modifié lors d’un réimport ; un champ à <code>null</code> est vidé. Les votes, commentaires, masquages et villes retenues sont conservés. Documentation complète : <code>docs/import-idees.md</code>.
        </p>
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-brand">Exemple complet</summary>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-paper p-3 text-xs">{JSON.stringify(IMPORT_EXAMPLE, null, 2)}</pre>
        </details>
      </Card>
    </Shell>
  );
}
