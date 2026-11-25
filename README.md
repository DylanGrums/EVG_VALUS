# Le carnet de l’EVG de Valentin

L’application propose quatre invitations individuelles, un questionnaire de 20 questions et un tableau de bord organisateur. Un invité peut reprendre son brouillon sur un autre appareil en ouvrant son lien. L’organisateur voit les réponses individuelles après leur envoi et peut saisir un avis de référence à part. L’inclusion de cet avis dans les analyses et les exports est facultative.

## Utilisation

1. Ouvre `/admin` et connecte-toi avec le compte ChatGPT configuré (ou les identifiants affichés dans le terminal pour le mode local).
2. Clique sur **Créer les quatre liens**, puis envoie un lien différent à chacun des quatre proches. L’ouverture ne consomme pas le lien. Chaque lien autorise un seul envoi final.
3. Clique sur **Actualiser** pour voir les nouveaux envois. Utilise **Ajouter ton avis privé** pour intégrer tes réponses historiques. Tu peux laisser les questions sans réponse lorsque la correspondance avec l’ancien questionnaire est incertaine.
4. Le CSV contient une ligne par personne et par question. Le JSON contient les définitions du questionnaire, les réponses exportées et les analyses. Les deux exports suivent la sélection **Inclure ton avis**.

Les quatre premières invitations sont identifiées par numéro dans le tableau de bord. Le lien donne accès au brouillon associé. Il est donc destiné à une seule personne.

## Source du questionnaire

Les questions 17 à 20 ont été reformulées à partir des réponses sources et du contexte accessible. Les questions 1 à 16 ont été reconstituées depuis la synthèse générale disponible. Les options expriment des pistes sans ordre de préférence et les commentaires permettent de préciser les conditions, les exceptions et les refus clairs. La question 19 distingue un motif de déplacement d’un simple complément. La question 20 porte sur des attentions indépendantes de la destination.

## Exécution locale

Avec Node.js 24 ou une version ultérieure, lance `npm start` depuis ce dossier. Le terminal donne l’adresse locale et les identifiants du tableau de bord. Par défaut, les données persistent dans `.evg-data/carnet.sqlite`. Cette instance est prévue pour l’aperçu sur cet ordinateur.

## Hébergement Sites

- `npm run build` produit le Worker dans `dist/server/index.js`. Le manifeste `.openai/hosting.json` demande un stockage D1. La migration SQL se trouve dans `drizzle/`.
- Renseigner `ADMIN_EMAIL` comme secret Sites avec l’adresse du compte organisateur. Renseigner `SITE_ORIGIN` avec l’origine HTTPS exacte du Site, sans barre finale.
- Le Site doit autoriser les visites publiques pour que les invités ouvrent le questionnaire sans compte. Les invitations restent nécessaires pour accéder au formulaire et l’authentification ChatGPT réserve le tableau de bord et ses données au compte organisateur. Si l’audience publique est indisponible, l’application requiert un hébergement qui fournisse une base D1 et une identité administrateur de confiance.

## Autre hébergement

Un serveur avec Node.js 24 peut héberger la version SQLite derrière un proxy HTTPS sur la même machine. Fixer `EVG_PUBLIC_ORIGIN` à l’adresse publique HTTPS, `EVG_LOCAL_PASSWORD` à un mot de passe unique d’au moins 20 caractères et `EVG_DB_PATH` à un fichier sur un volume persistant. Le dossier parent de ce fichier doit exister. Lancer `npm start` comme service et diriger le proxy HTTPS vers `127.0.0.1:4173`. Se connecter à `/admin` avec l’identifiant `organisateur` et ce mot de passe. Sauvegarder le volume SQLite avec les sauvegardes du serveur.

Les choix partagés sont des propositions cochées par au moins deux personnes. Les divergences affichées proviennent des choix opposés définis dans le questionnaire et du contraste entre « Aucune de ces propositions » et les choix retenus par d’autres répondants. « Je ne sais pas » est affiché séparément. Les commentaires restent lisibles dans la vue individuelle et sous chaque question.
