# Import des idées (villes et événements)

Page : `/admin/idees/import` (organisateurs). On colle le JSON renvoyé par l'IA (ou on choisit un fichier),
on clique sur « Aperçu » (rien n'est écrit), puis sur « Importer ».

Le prompt de `/admin/idees/recherche` demande exactement ce format. La validation est faite par zod
(`src/lib/idees/import.ts`) ; les erreurs sont affichées avec le numéro de ligne et un chemin lisible
(« Ville 2 « Porto » › événement 1 › lien »). Le texte autour du JSON (phrase d'intro, bloc ```json) est ignoré.

## Format

```json
{
  "villes": [
    {
      "nom": "Porto",
      "pays": "Portugal",
      "resume": "Ville animée au bord du Douro…",
      "pourquoi": "Pourquoi ça colle au profil de Val",
      "acces": "2 h de vol direct depuis Paris",
      "budget_indicatif": "250 à 400 € / pers. hors vols",
      "lien": "https://www.visitporto.travel",
      "evenements": [
        {
          "nom": "Festival de musique",
          "categorie": "fête",
          "description": "Festival en plein air avec plusieurs scènes.",
          "pourquoi": "Concert ou musique live plébiscité.",
          "date_debut": "2027-05-14",
          "date_fin": "2027-05-16",
          "dates_texte": null,
          "prix_texte": "Pass 1 jour ≈ 60 €",
          "prix_min_eur": 60,
          "lien": "https://exemple.com/festival",
          "adresse": "Parque da Cidade, Porto"
        }
      ]
    }
  ]
}
```

| Champ | Obligatoire | Contenu |
| --- | --- | --- |
| `villes[].nom`, `pays` | oui | Reconnaissance de la ville au réimport (accents, casse et ponctuation ignorés). |
| `resume`, `pourquoi` | non | Texte libre (4000 / 2000 caractères max.). |
| `acces` | non | Ex. « 1 h 30 de vol direct depuis Paris ». |
| `budget_indicatif` | non | Texte libre. |
| `lien` | non | `https://…` (un lien sans schéma reçoit `https://`, tout autre schéma est refusé). |
| `evenements[].nom` | oui | Reconnaissance de l'événement au réimport (ville + nom normalisé). |
| `categorie` | non (défaut « autre ») | `fête`, `culture`, `sport`, `gastronomie`, `nature`, `soirée`, `autre` (accents et majuscules facultatifs). |
| `description`, `pourquoi` | non | Texte libre. |
| `date_debut`, `date_fin` | non | `AAAA-MM-JJ`, date réelle ; `date_fin` ≥ `date_debut`. |
| `dates_texte` | non | Si pas de date précise : « chaque année mi-mai, dates 2027 non confirmées ». |
| `prix_texte` | non | Ex. « 25 à 40 € / pers. ». |
| `prix_min_eur` | non | Nombre en euros (`25`, `12.5` ou `"12,50"`), stocké en centimes. |
| `lien`, `adresse` | non | Source vérifiable et adresse. |

Les clés inconnues sont ignorées. Limites : 200 villes, 200 événements par ville, 1 Mo.

## Réimport (idempotent)

- Une ville déjà présente (même nom + pays normalisés) est **mise à jour**, un nouvel événement est ajouté,
  un événement déjà présent (même ville + nom normalisé) est mis à jour. Rien n'est dupliqué.
- Seuls les champs **présents** dans le fichier sont modifiés ; un champ à `null` est vidé ; un champ absent reste tel quel.
- Les votes 👍, commentaires, villes/événements masqués et la ville retenue ne sont jamais touchés.
  Les villes et événements absents du fichier ne sont pas supprimés.
- Une ville ou un événement proposé par un membre peut être enrichi par l'import (il reste « proposé par … »).
- Si le fichier contient deux fois la même ville (ou le même événement), les entrées sont fusionnées avec un avertissement.
